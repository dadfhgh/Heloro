-- Make newly created handle-based communities discoverable by @username.
-- The existing joined-room visibility rules remain unchanged for private rooms.

create or replace function private.create_community_room(
  p_kind text,
  p_name text,
  p_username text,
  p_description text default '',
  p_member_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  new_room_id uuid;
  requested_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  normalized_username text := lower(trim(coalesce(p_username, '')));
  valid_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_kind not in ('group', 'channel') then
    raise exception 'Invalid room type' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(p_name)) > 64 then
    raise exception 'Name must contain 2 to 64 characters' using errcode = '22023';
  end if;

  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'Description is too long' using errcode = '22023';
  end if;

  if normalized_username !~ '^[a-z][a-z0-9_]{4,31}$' then
    raise exception 'Community username must be 5 to 32 lowercase letters, digits or underscores and start with a letter'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.community_rooms r
    where lower(r.username) = normalized_username
  ) then
    raise exception 'Community username is already taken' using errcode = '23505';
  end if;

  if cardinality(requested_ids) > 99 then
    raise exception 'A group can include up to 100 people' using errcode = '22023';
  end if;

  if p_kind = 'channel' and cardinality(requested_ids) > 0 then
    raise exception 'Channels use subscriptions, not invited members' using errcode = '22023';
  end if;

  select count(distinct u.id)::integer into valid_count
  from unnest(requested_ids) as requested(user_id)
  join auth.users u on u.id = requested.user_id
  where requested.user_id <> caller_id;

  if valid_count <> (
    select count(distinct x)
    from unnest(requested_ids) x
    where x <> caller_id
  ) then
    raise exception 'One or more selected members do not exist' using errcode = '22023';
  end if;

  insert into public.community_rooms(kind, name, username, description, created_by, is_public)
  values (p_kind, trim(p_name), normalized_username, trim(coalesce(p_description, '')), caller_id, true)
  returning id into new_room_id;

  -- The creator is always the owner and the first room member.
  insert into public.community_room_members(room_id, user_id, role)
  values (new_room_id, caller_id, 'owner');

  if p_kind = 'group' and cardinality(requested_ids) > 0 then
    insert into public.community_room_members(room_id, user_id, role)
    select new_room_id, distinct_ids.user_id, 'member'
    from (
      select distinct x as user_id
      from unnest(requested_ids) x
      where x <> caller_id
    ) distinct_ids
    on conflict (room_id, user_id) do nothing;
  end if;

  return new_room_id;
end;
$function$;

create or replace function private.join_public_community_room(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.community_rooms r
    where r.id = target_room_id and r.is_public = true
      and r.kind in ('group', 'channel')
  ) then
    raise exception 'Public community not found' using errcode = 'P0002';
  end if;

  insert into public.community_room_members(room_id, user_id, role)
  values (target_room_id, caller_id, 'member')
  on conflict (room_id, user_id) do nothing;
end;
$function$;

create or replace function public.join_public_community_room(target_room_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.join_public_community_room(target_room_id);
$function$;

revoke all on function private.create_community_room(text, text, text, text, uuid[]) from public, anon;
grant execute on function private.create_community_room(text, text, text, text, uuid[]) to authenticated;

revoke all on function private.join_public_community_room(uuid) from public, anon;
grant execute on function private.join_public_community_room(uuid) to authenticated;

revoke all on function public.join_public_community_room(uuid) from public, anon;
grant execute on function public.join_public_community_room(uuid) to authenticated;
