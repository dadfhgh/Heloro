-- Message reactions and private media for HELORO direct conversations.
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','🔥','😮','👏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_idx
  on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;
grant select, insert, delete on table public.message_reactions to authenticated;

create policy "Conversation members read message reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

create policy "Members add their own message reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

create policy "Members remove their own message reactions"
  on public.message_reactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media',
  'message-media',
  false,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

create policy "Conversation members view private message media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] is not null
    and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

create policy "Members upload their own conversation media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] is not null
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

create policy "Members delete their own conversation media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] is not null
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

create table if not exists public.account_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  created_at timestamptz not null default now()
);
create index if not exists account_recovery_codes_user_created_idx
  on public.account_recovery_codes(user_id, created_at desc);

alter table public.account_recovery_codes enable row level security;
revoke all on table public.account_recovery_codes from public, anon, authenticated;

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('account_recovery_issued','account_recovery_completed')),
  created_at timestamptz not null default now()
);
alter table public.admin_action_logs enable row level security;
revoke all on table public.admin_action_logs from public, anon, authenticated;

create or replace function private.consume_account_recovery_code(
  target_user_id uuid,
  target_code_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovery_row public.account_recovery_codes%rowtype;
begin
  select * into recovery_row
  from public.account_recovery_codes
  where user_id = target_user_id
    and used_at is null
    and expires_at > now()
    and failed_attempts < 5
  order by created_at desc
  limit 1
  for update;

  if not found then return null; end if;

  if recovery_row.code_hash <> target_code_hash then
    update public.account_recovery_codes
      set failed_attempts = least(failed_attempts + 1, 5)
      where id = recovery_row.id;
    return null;
  end if;

  update public.account_recovery_codes
    set used_at = now()
    where id = recovery_row.id
      and used_at is null;

  return recovery_row.user_id;
end;
$$;

revoke all on function private.consume_account_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function private.consume_account_recovery_code(uuid, text) to service_role;
