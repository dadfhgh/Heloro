-- Profile avatar uploads and owner-only direct-message deletion.
-- Public avatar reads are intentional; writes remain restricted to each user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists "Users upload their own HELORO profile avatars" on storage.objects;
create policy "Users upload their own HELORO profile avatars" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own HELORO profile avatars" on storage.objects;
create policy "Users delete their own HELORO profile avatars" on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant delete on table public.messages to authenticated;
drop policy if exists "Members delete their own direct messages" on public.messages;
create policy "Members delete their own direct messages" on public.messages for delete to authenticated
using (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));
