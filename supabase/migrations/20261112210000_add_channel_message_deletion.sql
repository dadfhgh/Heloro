-- Allow delete-for-everyone in the official channel and its discussion.
-- Authors can delete their own messages/comments. Moderators can remove others'
-- discussion content. Only owners/admins can remove channel posts.

drop policy if exists "Authors and moderators delete discussion messages" on public.channel_discussion_messages;
create policy "Authors and moderators delete discussion messages"
on public.channel_discussion_messages for delete to authenticated
using (
  user_id = (select auth.uid())
  or private.has_heloro_role('owner')
  or private.has_heloro_role('admin')
  or private.has_heloro_role('moderator')
);

drop policy if exists "Authors and moderators delete channel comments" on public.channel_comments;
create policy "Authors and moderators delete channel comments"
on public.channel_comments for delete to authenticated
using (
  user_id = (select auth.uid())
  or private.has_heloro_role('owner')
  or private.has_heloro_role('admin')
  or private.has_heloro_role('moderator')
);

drop policy if exists "Owners and admins delete channel posts" on public.channel_posts;
create policy "Owners and admins delete channel posts"
on public.channel_posts for delete to authenticated
using (
  private.has_heloro_role('owner')
  or private.has_heloro_role('admin')
);
