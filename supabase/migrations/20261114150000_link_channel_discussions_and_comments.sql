-- Link official and user-created channels to discussion groups.
-- Adds per-post comments for community channels and owner-level channel controls.
begin;

alter table public.heloro_channels
  add column if not exists discussion_room_id uuid
  references public.community_rooms(id) on delete set null;

alter table public.community_rooms
  add column if not exists discussion_room_id uuid
  references public.community_rooms(id) on delete set null;

create index if not exists community_rooms_discussion_room_idx
  on public.community_rooms(discussion_room_id)
  where discussion_room_id is not null;

-- A dedicated private group backs the public News discussion entry point.
do $$
declare
  owner_id uuid;
  discussion_id uuid;
begin
  select user_id into owner_id
  from public.user_roles
  where role = 'owner'
  order by granted_at asc
  limit 1;

  if owner_id is null then
    raise exception 'HELORO owner account is required to seed the News discussion group';
  end if;

  select id into discussion_id
  from public.community_rooms
  where username = 'heloro_news_discussion'
  limit 1;

  if discussion_id is null then
    insert into public.community_rooms(kind, name, username, description, created_by, is_public)
    values (
      'group',
      'News Discussion',
      'heloro_news_discussion',
      'Обсуждение публикаций официального канала HELORO News / Discuss official HELORO News posts',
      owner_id,
      false
    )
    returning id into discussion_id;
  else
    update public.community_rooms
    set name = 'News Discussion',
        description = 'Обсуждение публикаций официального канала HELORO News / Discuss official HELORO News posts',
        updated_at = now()
    where id = discussion_id and kind = 'group';
  end if;

  insert into public.community_room_members(room_id, user_id, role)
  values (discussion_id, owner_id, 'owner')
  on conflict (room_id, user_id) do update set role = 'owner';

  update public.heloro_channels
  set discussion_room_id = discussion_id
  where slug = 'heloro-new';
end;
$$;

-- The caller may join only a discussion group already attached to an official or public community channel.
create or replace function public.join_channel_discussion(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  discussion_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select r.discussion_room_id into discussion_id
  from public.community_rooms r
  where r.id = p_channel_id
    and r.kind = 'channel'
    and r.is_public = true;

  if discussion_id is null then
    select c.discussion_room_id into discussion_id
    from public.heloro_channels c
    where c.id = p_channel_id;
  end if;

  if discussion_id is null or not exists (
    select 1 from public.community_rooms g
    where g.id = discussion_id and g.kind = 'group'
  ) then
    raise exception 'No discussion group is linked to this channel' using errcode = 'P0002';
  end if;

  insert into public.community_room_members(room_id, user_id, role)
  values (discussion_id, caller_id, 'member')
  on conflict (room_id, user_id) do nothing;

  return discussion_id;
end;
$$;

revoke all on function public.join_channel_discussion(uuid) from public, anon;
grant execute on function public.join_channel_discussion(uuid) to authenticated;

-- Give each community-channel post its own comment thread.
create table if not exists public.community_message_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  message_id uuid not null references public.community_room_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists community_message_comments_message_created_idx
  on public.community_message_comments(message_id, created_at asc);
create index if not exists community_message_comments_room_idx
  on public.community_message_comments(room_id, created_at desc);

alter table public.community_message_comments enable row level security;
revoke all on table public.community_message_comments from anon, authenticated;
grant select, insert, delete on table public.community_message_comments to authenticated;

drop policy if exists "Members read channel post comments" on public.community_message_comments;
create policy "Members read channel post comments"
on public.community_message_comments for select to authenticated
using ((select private.is_community_member(room_id)));

drop policy if exists "Members comment on channel posts" on public.community_message_comments;
create policy "Members comment on channel posts"
on public.community_message_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or exists (
      select 1
      from public.community_rooms r
      join public.community_room_members m on m.room_id = r.id
      join public.community_room_messages p on p.room_id = r.id
      where r.id = community_message_comments.room_id
        and r.kind = 'channel'
        and m.user_id = (select auth.uid())
        and p.id = community_message_comments.message_id
    )
  )
);

drop policy if exists "Authors and channel managers delete post comments" on public.community_message_comments;
create policy "Authors and channel managers delete post comments"
on public.community_message_comments for delete to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_heloro_role('owner'))
  or (select private.has_heloro_role('admin'))
  or (select private.has_heloro_role('moderator'))
  or (select private.has_community_permission(room_id, 'delete_messages'))
);

drop policy if exists "Authors and room managers delete community messages" on public.community_room_messages;
drop policy if exists "Authors and permitted admins delete community messages" on public.community_room_messages;
create policy "Authors and HELORO staff delete community messages"
on public.community_room_messages for delete to authenticated
using (
  sender_id = (select auth.uid())
  or private.has_heloro_role('owner')
  or private.has_heloro_role('admin')
  or private.has_community_permission(room_id, 'delete_messages')
);

-- HELORO owners/admins can manage community spaces without being separately added to every room.
create or replace function private.is_community_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or exists (
      select 1
      from public.community_room_members m
      where m.room_id = target_room_id
        and m.user_id = (select auth.uid())
    );
$$;

create or replace function private.can_manage_community_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or exists (
      select 1
      from public.community_room_members m
      where m.room_id = target_room_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    );
$$;

create or replace function private.can_send_community_message(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or exists (
      select 1
      from public.community_room_members m
      join public.community_rooms r on r.id = m.room_id
      where m.room_id = target_room_id
        and m.user_id = (select auth.uid())
        and (r.kind = 'group' or m.role in ('owner', 'admin'))
    );
$$;

-- Room deletion goes through a permission-checked RPC (the UI must not rely on direct DELETE RLS).
create or replace function public.delete_community_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.community_rooms%rowtype;
  is_room_owner boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into target
  from public.community_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.community_room_members m
    where m.room_id = target.id
      and m.user_id = actor_id
      and m.role = 'owner'
  ) into is_room_owner;

  if not (
    (target.created_by = actor_id and is_room_owner)
    or private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
  ) then
    raise exception 'Community owner or HELORO staff access required' using errcode = '42501';
  end if;

  delete from public.community_rooms where id = target.id;
end;
$$;

revoke all on function public.delete_community_room(uuid) from public, anon;
grant execute on function public.delete_community_room(uuid) to authenticated;

-- Ensure the global Owner can edit the official channel profile in HELORO News.
grant update (name, description, discussion_room_id) on public.heloro_channels to authenticated;
drop policy if exists "HELORO owners update official channels" on public.heloro_channels;
create policy "HELORO owners update official channels"
on public.heloro_channels for update to authenticated
using ((select private.has_heloro_role('owner')))
with check ((select private.has_heloro_role('owner')));

-- Allow only community managers / global staff to change the discussion link.
grant update (discussion_room_id) on public.community_rooms to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'community_message_comments'
     ) then
    execute 'alter publication supabase_realtime add table public.community_message_comments';
  end if;
end;
$$;

commit;
