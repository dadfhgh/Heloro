-- HELORO user-created groups and channels.
-- Additive only: preserves existing direct conversations and official Heloro New data.
create table if not exists public.community_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group', 'channel')),
  name text not null check (char_length(trim(name)) between 2 and 64),
  description text not null default '' check (char_length(description) <= 500),
  avatar_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_channel_visibility check (kind <> 'group' or is_public = false)
);
create index if not exists community_rooms_kind_updated_idx on public.community_rooms(kind, updated_at desc);
create table if not exists public.community_room_members (
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists community_room_members_user_idx on public.community_room_members(user_id, room_id);
create table if not exists public.community_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists community_room_messages_room_created_idx on public.community_room_messages(room_id, created_at desc);

create or replace function private.is_community_member(target_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_room_members m where m.room_id = target_room_id and m.user_id = (select auth.uid()));
$$;
create or replace function private.can_manage_community_room(target_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_room_members m where m.room_id = target_room_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin'));
$$;
create or replace function private.can_send_community_message(target_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_room_members m join public.community_rooms r on r.id = m.room_id
    where m.room_id = target_room_id and m.user_id = (select auth.uid())
      and (r.kind = 'group' or m.role in ('owner', 'admin'))
  );
$$;
revoke all on function private.is_community_member(uuid) from public, anon;
revoke all on function private.can_manage_community_room(uuid) from public, anon;
revoke all on function private.can_send_community_message(uuid) from public, anon;
grant execute on function private.is_community_member(uuid) to authenticated;
grant execute on function private.can_manage_community_room(uuid) to authenticated;
grant execute on function private.can_send_community_message(uuid) to authenticated;

create or replace function private.create_community_room(p_kind text, p_name text, p_description text default '', p_member_ids uuid[] default array[]::uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  new_room_id uuid;
  requested_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  valid_count integer;
  requested_count integer;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_kind not in ('group', 'channel') then raise exception 'Invalid room type' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(p_name)) > 64 then raise exception 'Name must contain 2 to 64 characters' using errcode = '22023'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Description is too long' using errcode = '22023'; end if;
  if cardinality(requested_ids) > 99 then raise exception 'A group can include up to 100 people' using errcode = '22023'; end if;
  if p_kind = 'channel' and cardinality(requested_ids) > 0 then raise exception 'Channels use subscriptions, not invited members' using errcode = '22023'; end if;
  select count(distinct u.id)::integer into valid_count
  from unnest(requested_ids) as requested(user_id)
  join auth.users u on u.id = requested.user_id
  where requested.user_id <> caller_id;
  select count(distinct requested.user_id)::integer into requested_count
  from unnest(requested_ids) as requested(user_id)
  where requested.user_id <> caller_id;
  if valid_count <> requested_count then raise exception 'One or more selected members do not exist' using errcode = '22023'; end if;

  insert into public.community_rooms(kind, name, description, created_by, is_public)
  values (p_kind, trim(p_name), trim(coalesce(p_description, '')), caller_id, p_kind = 'channel')
  returning id into new_room_id;
  insert into public.community_room_members(room_id, user_id, role) values (new_room_id, caller_id, 'owner');
  if p_kind = 'group' then
    insert into public.community_room_members(room_id, user_id, role)
    select new_room_id, requested.user_id, 'member'
    from (select distinct x as user_id from unnest(requested_ids) x where x <> caller_id) requested
    on conflict (room_id, user_id) do nothing;
  end if;
  return new_room_id;
end;
$$;
create or replace function public.create_community_room(p_kind text, p_name text, p_description text default '', p_member_ids uuid[] default array[]::uuid[])
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_community_room(p_kind, p_name, p_description, p_member_ids);
$$;
revoke all on function private.create_community_room(text, text, text, uuid[]) from public, anon;
grant execute on function private.create_community_room(text, text, text, uuid[]) to authenticated;
revoke all on function public.create_community_room(text, text, text, uuid[]) from public, anon;
grant execute on function public.create_community_room(text, text, text, uuid[]) to authenticated;

create or replace function private.join_community_channel(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.community_rooms r where r.id = target_room_id and r.kind = 'channel' and r.is_public = true) then
    raise exception 'Channel not found or is private' using errcode = 'P0002';
  end if;
  insert into public.community_room_members(room_id, user_id, role) values (target_room_id, caller_id, 'member')
  on conflict (room_id, user_id) do nothing;
end;
$$;
create or replace function public.join_community_channel(target_room_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.join_community_channel(target_room_id); $$;
revoke all on function private.join_community_channel(uuid) from public, anon;
grant execute on function private.join_community_channel(uuid) to authenticated;
revoke all on function public.join_community_channel(uuid) from public, anon;
grant execute on function public.join_community_channel(uuid) to authenticated;

alter table public.community_rooms enable row level security;
alter table public.community_room_members enable row level security;
alter table public.community_room_messages enable row level security;
revoke all on table public.community_rooms, public.community_room_members, public.community_room_messages from anon, authenticated;
grant select, update (name, description, avatar_url, updated_at) on public.community_rooms to authenticated;
grant select on public.community_room_members to authenticated;
grant select, insert, delete on public.community_room_messages to authenticated;

drop policy if exists "Members and public channels can read community rooms" on public.community_rooms;
create policy "Members and public channels can read community rooms" on public.community_rooms for select to authenticated
using (is_public or private.is_community_member(id));
drop policy if exists "Room owners and admins update community rooms" on public.community_rooms;
create policy "Room owners and admins update community rooms" on public.community_rooms for update to authenticated
using (private.can_manage_community_room(id)) with check (private.can_manage_community_room(id));
drop policy if exists "Members read community room memberships" on public.community_room_members;
create policy "Members read community room memberships" on public.community_room_members for select to authenticated
using (private.is_community_member(room_id));
drop policy if exists "Members read community room messages" on public.community_room_messages;
create policy "Members read community room messages" on public.community_room_messages for select to authenticated
using (private.is_community_member(room_id));
drop policy if exists "Members send permitted community messages" on public.community_room_messages;
create policy "Members send permitted community messages" on public.community_room_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and private.can_send_community_message(room_id));
drop policy if exists "Authors and room managers delete community messages" on public.community_room_messages;
create policy "Authors and room managers delete community messages" on public.community_room_messages for delete to authenticated
using (sender_id = (select auth.uid()) or private.can_manage_community_room(room_id));

create or replace function private.touch_community_room_after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.community_rooms set updated_at = new.created_at where id = new.room_id; return new; end;
$$;
revoke all on function private.touch_community_room_after_message() from public, anon, authenticated, service_role;
drop trigger if exists on_community_room_message_created on public.community_room_messages;
create trigger on_community_room_message_created after insert on public.community_room_messages
for each row execute procedure private.touch_community_room_after_message();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists "Community room managers upload room avatars" on storage.objects;
create policy "Community room managers upload room avatars" on storage.objects for insert to authenticated
with check (bucket_id = 'community-avatars' and private.can_manage_community_room(((storage.foldername(name))[1])::uuid));
drop policy if exists "Community room managers delete room avatars" on storage.objects;
create policy "Community room managers delete room avatars" on storage.objects for delete to authenticated
using (bucket_id = 'community-avatars' and private.can_manage_community_room(((storage.foldername(name))[1])::uuid));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_room_messages') then
    execute 'alter publication supabase_realtime add table public.community_room_messages';
  end if;
end;
$$;
