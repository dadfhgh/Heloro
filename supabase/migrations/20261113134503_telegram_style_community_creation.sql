-- Telegram-style group/channel creation with explicit visibility and optional invited members.
-- Keeps the existing create_community_room RPC intact for older clients.

create or replace function private.create_community_room_v2(
  p_kind text,
  p_name text,
  p_username text,
  p_description text default '',
  p_member_ids uuid[] default array[]::uuid[],
  p_is_public boolean default false
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
  requested_count integer;
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
    raise exception 'Invalid internal or public community username' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.community_rooms r
    where lower(r.username) = normalized_username
  ) then
    raise exception 'Community username is already taken' using errcode = '23505';
  end if;

  if cardinality(requested_ids) > 99 then
    raise exception 'A community can include up to 100 people' using errcode = '22023';
  end if;

  select count(distinct u.id)::integer into valid_count
  from unnest(requested_ids) as requested(user_id)
  join auth.users u on u.id = requested.user_id
  where requested.user_id <> caller_id;

  select count(distinct requested.user_id)::integer into requested_count
  from unnest(requested_ids) as requested(user_id)
  where requested.user_id <> caller_id;

  if valid_count <> requested_count then
    raise exception 'One or more selected members do not exist' using errcode = '22023';
  end if;

  insert into public.community_rooms(kind, name, username, description, created_by, is_public)
  values (
    p_kind,
    trim(p_name),
    normalized_username,
    trim(coalesce(p_description, '')),
    caller_id,
    coalesce(p_is_public, false)
  )
  returning id into new_room_id;

  -- The creator is always the owner and first member/subscriber.
  insert into public.community_room_members(room_id, user_id, role)
  values (new_room_id, caller_id, 'owner');

  -- For groups these are initial members; for channels these are initial subscribers.
  if cardinality(requested_ids) > 0 then
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

create or replace function public.create_community_room_v2(
  p_kind text,
  p_name text,
  p_username text,
  p_description text default '',
  p_member_ids uuid[] default array[]::uuid[],
  p_is_public boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_community_room_v2(
    p_kind,
    p_name,
    p_username,
    p_description,
    p_member_ids,
    p_is_public
  );
$function$;

revoke all on function private.create_community_room_v2(text, text, text, text, uuid[], boolean) from public, anon;
grant execute on function private.create_community_room_v2(text, text, text, text, uuid[], boolean) to authenticated;
revoke all on function public.create_community_room_v2(text, text, text, text, uuid[], boolean) from public, anon;
grant execute on function public.create_community_room_v2(text, text, text, text, uuid[], boolean) to authenticated;
