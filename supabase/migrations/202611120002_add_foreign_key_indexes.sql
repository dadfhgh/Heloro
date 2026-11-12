-- Add covering indexes for foreign-key lookup and cascade operations.
create index if not exists conversations_created_by_idx
  on public.conversations (created_by);

create index if not exists messages_sender_id_idx
  on public.messages (sender_id);
