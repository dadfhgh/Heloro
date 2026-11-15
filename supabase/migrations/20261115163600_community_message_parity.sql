-- Shared message parity for HELORO groups and channels:
-- same-room replies, author-only editing, and member-scoped pinned messages.

begin;

alter table public.community_room_messages
  add column if not exists reply_to uuid
    references public.community_room_messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

create index if not exists community_room_messages_reply_to_idx
  on public.community_room_messages(reply_to)
  where reply_to is not null;

create or replace function private.validate_community_message_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and (
    new.room_id is distinct from old.room_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'community_message_identity_is_immutable'
      using errcode = '23514';
  end if;

  if new.reply_to is not null and not exists (
    select 1
    from public.community_room_messages original
    where original.id = new.reply_to
      and original.room_id = new.room_id
  ) then
    raise exception 'community_reply_must_belong_to_same_room'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_community_message_scope() from public, anon, authenticated;

drop trigger if exists validate_community_message_scope on public.community_room_messages;
create trigger validate_community_message_scope
before insert or update of reply_to, room_id, sender_id, created_at
on public.community_room_messages
for each row
execute function private.validate_community_message_scope();

-- Add a narrowly-scoped pin permission while keeping the existing admin checks intact.
create or replace function private.has_community_permission(target_room_id uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.community_room_members m
    where m.room_id = target_room_id
      and m.user_id = (select auth.uid())
      and (
        m.role = 'owner'
        or (
          m.role = 'admin'
          and target_permission in ('change_info', 'delete_messages', 'pin_messages', 'post_messages', 'manage_admins')
          and coalesce((m.admin_permissions ->> target_permission)::boolean, false)
        )
      )
  );
$function$;

revoke all on function private.has_community_permission(uuid, text) from public, anon;
grant execute on function private.has_community_permission(uuid, text) to authenticated;

-- An author may edit only their own message, and only while still a room member.
grant update on public.community_room_messages to authenticated;
drop policy if exists "Authors edit own community messages" on public.community_room_messages;
create policy "Authors edit own community messages"
  on public.community_room_messages
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and private.is_community_member(room_id)
  )
  with check (
    sender_id = (select auth.uid())
    and private.is_community_member(room_id)
  );

create table if not exists public.community_pinned_messages (
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  message_id uuid not null references public.community_room_messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (room_id, message_id)
);

create index if not exists community_pinned_messages_room_time_idx
  on public.community_pinned_messages(room_id, pinned_at desc);
create index if not exists community_pinned_messages_message_id_idx
  on public.community_pinned_messages(message_id);
create index if not exists community_pinned_messages_pinned_by_idx
  on public.community_pinned_messages(pinned_by);

alter table public.community_pinned_messages enable row level security;
revoke all on public.community_pinned_messages from anon, authenticated;
grant select, insert, delete on public.community_pinned_messages to authenticated;

drop policy if exists "Community members read pinned messages" on public.community_pinned_messages;
create policy "Community members read pinned messages"
  on public.community_pinned_messages
  for select
  to authenticated
  using (private.is_community_member(room_id));

drop policy if exists "Community admins pin messages" on public.community_pinned_messages;
create policy "Community admins pin messages"
  on public.community_pinned_messages
  for insert
  to authenticated
  with check (
    pinned_by = (select auth.uid())
    and private.has_community_permission(room_id, 'pin_messages')
    and exists (
      select 1
      from public.community_room_messages target
      where target.id = community_pinned_messages.message_id
        and target.room_id = community_pinned_messages.room_id
    )
  );

drop policy if exists "Community admins unpin messages" on public.community_pinned_messages;
create policy "Community admins unpin messages"
  on public.community_pinned_messages
  for delete
  to authenticated
  using (private.has_community_permission(room_id, 'pin_messages'));

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'community_pinned_messages'
     ) then
    alter publication supabase_realtime add table public.community_pinned_messages;
  end if;
end;
$publication$;

commit;
