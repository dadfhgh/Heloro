-- Allow only the original owner to permanently delete their own group or channel.
-- Deleting the room cascades to its members and community messages through existing FKs.

create or replace function private.is_community_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_room_members m
    where m.room_id = target_room_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function private.is_community_owner(uuid) from public, anon;
grant execute on function private.is_community_owner(uuid) to authenticated;

grant delete on table public.community_rooms to authenticated;

drop policy if exists "Owners delete their own communities" on public.community_rooms;
create policy "Owners delete their own communities"
on public.community_rooms
for delete
to authenticated
using (
  created_by = (select auth.uid())
  and private.is_community_owner(id)
);
