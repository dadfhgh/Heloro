-- HELORO direct-message reactions.
-- This migration is additive. Apply only after review and explicit approval.

begin;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🎉')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_conversation_message_idx
  on public.message_reactions (conversation_id, message_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;
grant select, insert, delete on table public.message_reactions to authenticated;
grant update (emoji) on table public.message_reactions to authenticated;

drop policy if exists "Members read direct message reactions" on public.message_reactions;
create policy "Members read direct message reactions"
  on public.message_reactions for select to authenticated
  using (
    private.is_conversation_member(message_reactions.conversation_id)
    and exists (select 1 from public.messages as m where m.id = message_reactions.message_id and m.conversation_id = message_reactions.conversation_id)
  );

drop policy if exists "Members add their own direct message reactions" on public.message_reactions;
create policy "Members add their own direct message reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_conversation_member(message_reactions.conversation_id)
    and exists (select 1 from public.messages as m where m.id = message_reactions.message_id and m.conversation_id = message_reactions.conversation_id)
  );

drop policy if exists "Members update their own direct message reactions" on public.message_reactions;
create policy "Members update their own direct message reactions"
  on public.message_reactions for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_conversation_member(message_reactions.conversation_id)
    and exists (select 1 from public.messages as m where m.id = message_reactions.message_id and m.conversation_id = message_reactions.conversation_id)
  )
  with check (
    user_id = (select auth.uid())
    and private.is_conversation_member(message_reactions.conversation_id)
    and exists (select 1 from public.messages as m where m.id = message_reactions.message_id and m.conversation_id = message_reactions.conversation_id)
  );

drop policy if exists "Members remove their own direct message reactions" on public.message_reactions;
create policy "Members remove their own direct message reactions"
  on public.message_reactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_conversation_member(message_reactions.conversation_id)
    and exists (select 1 from public.messages as m where m.id = message_reactions.message_id and m.conversation_id = message_reactions.conversation_id)
  );

-- Realtime keeps reaction changes synchronized between conversation participants.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
     ) then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end;
$$;

commit;
