-- Direct-chat replies and pinned messages.
-- Source-only until explicitly approved for the live HELORO Supabase project.

begin;

alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages(reply_to)
  where reply_to is not null;

create or replace function private.validate_message_reply_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.reply_to is not null and not exists (
    select 1
    from public.messages original
    where original.id = new.reply_to
      and original.conversation_id = new.conversation_id
  ) then
    raise exception 'reply_message_must_belong_to_same_conversation'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function private.validate_message_reply_scope() from public, anon, authenticated;

drop trigger if exists validate_message_reply_scope on public.messages;
create trigger validate_message_reply_scope
before insert or update of reply_to, conversation_id
on public.messages
for each row
execute function private.validate_message_reply_scope();

create table if not exists public.pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create index if not exists pinned_messages_conversation_time_idx
  on public.pinned_messages(conversation_id, pinned_at desc);

create index if not exists pinned_messages_message_id_idx
  on public.pinned_messages(message_id);

create index if not exists pinned_messages_pinned_by_idx
  on public.pinned_messages(pinned_by);

alter table public.pinned_messages enable row level security;
revoke all on public.pinned_messages from anon, authenticated;
grant select, insert, delete on public.pinned_messages to authenticated;

drop policy if exists "Conversation members read pinned messages" on public.pinned_messages;
create policy "Conversation members read pinned messages"
  on public.pinned_messages for select to authenticated
  using (private.is_conversation_member(conversation_id));

drop policy if exists "Conversation members pin messages" on public.pinned_messages;
create policy "Conversation members pin messages"
  on public.pinned_messages for insert to authenticated
  with check (
    pinned_by = (select auth.uid())
    and private.is_conversation_member(conversation_id)
    and exists (
      select 1
      from public.messages target
      where target.id = pinned_messages.message_id
        and target.conversation_id = pinned_messages.conversation_id
    )
  );

drop policy if exists "Conversation members unpin messages" on public.pinned_messages;
create policy "Conversation members unpin messages"
  on public.pinned_messages for delete to authenticated
  using (private.is_conversation_member(conversation_id));

commit;
