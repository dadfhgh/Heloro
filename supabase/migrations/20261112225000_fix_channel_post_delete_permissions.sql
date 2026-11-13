-- Restore authenticated DELETE privileges for channel content; RLS remains the authority.
grant delete on table public.channel_posts, public.channel_comments, public.channel_discussion_messages to authenticated;

-- Authors may remove their own channel publications; staff may remove any publication.
drop policy if exists "Owners and admins delete channel posts" on public.channel_posts;
create policy "Authors and staff delete channel posts"
on public.channel_posts for delete to authenticated
using (
  author_id = (select auth.uid())
  or private.has_heloro_role('owner')
  or private.has_heloro_role('admin')
);
