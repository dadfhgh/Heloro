create index if not exists community_rooms_created_by_idx on public.community_rooms(created_by);
create index if not exists community_room_messages_sender_id_idx on public.community_room_messages(sender_id);
