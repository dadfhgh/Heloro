-- HELORO community admin permissions and shared direct-message deletion.
-- Source-only migration for the feature branch. Do not apply to the shared database
-- until a separate non-production environment is approved.

alter table public.community_room_members
  add column if not exists admin_permissions jsonb not null default '{}'::jsonb,
  add column if not exists promoted_by uuid references auth.users(id) on delete set null,
  add column if not exists promoted_at timestamptz;

alter table public.community_room_members
  drop constraint if exists community_room_members_admin_permissions_check;
alter table public.community_room_members
  add constraint community_room_members_admin_permissions_check
  check (
    jsonb_typeof(admin_permissions) = 'object'
    and (admin_permissions - array['change_info', 'delete_messages', 'post_messages', 'manage_admins']::text[]) = '{}'::jsonb
    and (not (admin_permissions ? 'change_info') or jsonb_typeof(admin_permissions -> 'change_info') = 'boolean')
    and (not (admin_permissions ? 'delete_messages') or jsonb_typeof(admin_permissions -> 'delete_messages') = 'boolean')
    and (not (admin_permissions ? 'post_messages') or jsonb_typeof(admin_permissions -> 'post_messages') = 'boolean')
    and (not (admin_permissions ? 'manage_admins') or jsonb_typeof(admin_permissions -> 'manage_admins') = 'boolean')
  );

create index if not exists community_room_members_admins_idx
  on public.community_room_members(room_id, role, promoted_at desc);

create or replace function private.has_community_permission(
  target_room_id uuid,
  target_permission text
)
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
      and (
        m.role = 'owner'
        or (
          m.role = 'admin'
          and target_permission in ('change_info', 'delete_messages', 'post_messages', 'manage_admins')
          and coalesce((m.admin_permissions ->> target_permission)::boolean, false)
        )
      )
  );
$$;

create or replace function private.can_manage_community_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_community_permission(target_room_id, 'change_info');
$$;

create or replace function private.can_send_community_message(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_room_members m
    join public.community_rooms r on r.id = m.room_id
    where m.room_id = target_room_id
      and m.user_id = (select auth.uid())
      and (
        r.kind = 'group'
        or private.has_community_permission(target_room_id, 'post_messages')
      )
  );
$$;

create or replace function private.can_manage_community_admins(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_community_permission(target_room_id, 'manage_admins');
$$;

revoke all on function private.has_community_permission(uuid, text) from public, anon;
revoke all on function private.can_manage_community_room(uuid) from public, anon;
revoke all on function private.can_send_community_message(uuid) from public, anon;
revoke all on function private.can_manage_community_admins(uuid) from public, anon;
grant execute on function private.has_community_permission(uuid, text) to authenticated;
grant execute on function private.can_manage_community_room(uuid) to authenticated;
grant execute on function private.can_send_community_message(uuid) to authenticated;
grant execute on function private.can_manage_community_admins(uuid) to authenticated;

create table if not exists public.community_admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('promoted', 'permissions_updated', 'demoted')),
  previous_role text,
  next_role text not null check (next_role in ('admin', 'member')),
  previous_permissions jsonb not null default '{}'::jsonb,
  next_permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists community_admin_action_logs_room_created_idx
  on public.community_admin_action_logs(room_id, created_at desc);

alter table public.community_admin_action_logs enable row level security;
revoke all on table public.community_admin_action_logs from anon, authenticated;
grant select on table public.community_admin_action_logs to authenticated;

drop policy if exists "Community managers read admin audit history" on public.community_admin_action_logs;
create policy "Community managers read admin audit history"
on public.community_admin_action_logs
for select
to authenticated
using (private.can_manage_community_admins(room_id));

create or replace function public.set_community_admin_permissions(
  p_room_id uuid,
  p_user_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_permissions jsonb;
  target_role text;
  target_permissions jsonb;
  target_promoted_by uuid;
  permission_name text;
  action_name text;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = caller_id then
    raise exception 'You cannot promote or edit your own administrator role' using errcode = '42501';
  end if;
  if p_permissions is null
    or jsonb_typeof(p_permissions) <> 'object'
    or (p_permissions - array['change_info', 'delete_messages', 'post_messages', 'manage_admins']::text[]) <> '{}'::jsonb
    or exists (
      select 1 from jsonb_each(p_permissions) as item(key, value)
      where jsonb_typeof(item.value) <> 'boolean'
    ) then
    raise exception 'Invalid administrator permissions' using errcode = '22023';
  end if;

  select m.role, m.admin_permissions
    into caller_role, caller_permissions
  from public.community_room_members m
  where m.room_id = p_room_id and m.user_id = caller_id;

  if caller_role is null then
    raise exception 'You are not a member of this community' using errcode = '42501';
  end if;
  if caller_role <> 'owner'
    and not coalesce((caller_permissions ->> 'manage_admins')::boolean, false) then
    raise exception 'You do not have permission to manage administrators' using errcode = '42501';
  end if;

  select m.role, m.admin_permissions, m.promoted_by
    into target_role, target_permissions, target_promoted_by
  from public.community_room_members m
  where m.room_id = p_room_id and m.user_id = p_user_id;

  if target_role is null then
    raise exception 'Only existing community members can be promoted' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'The community owner cannot be changed here' using errcode = '42501';
  end if;
  if caller_role <> 'owner' and target_role = 'admin' then
    raise exception 'Delegated administrators cannot edit another administrator' using errcode = '42501';
  end if;

  if caller_role <> 'owner' then
    if coalesce((p_permissions ->> 'manage_admins')::boolean, false) then
      raise exception 'Only the owner can grant administrator-management rights' using errcode = '42501';
    end if;
    for permission_name in select jsonb_object_keys(p_permissions)
    loop
      if coalesce((p_permissions ->> permission_name)::boolean, false)
        and not coalesce((caller_permissions ->> permission_name)::boolean, false) then
        raise exception 'You cannot grant a permission you do not have' using errcode = '42501';
      end if;
    end loop;
  end if;

  action_name := case when target_role = 'admin' then 'permissions_updated' else 'promoted' end;

  update public.community_room_members
  set role = 'admin',
      admin_permissions = p_permissions,
      promoted_by = case when target_role = 'admin' then target_promoted_by else caller_id end,
      promoted_at = case when target_role = 'admin' then coalesce(promoted_at, now()) else now() end
  where room_id = p_room_id and user_id = p_user_id;

  insert into public.community_admin_action_logs(
    room_id, actor_id, target_user_id, action, previous_role, next_role,
    previous_permissions, next_permissions
  )
  values (
    p_room_id, caller_id, p_user_id, action_name, target_role, 'admin',
    coalesce(target_permissions, '{}'::jsonb), p_permissions
  );
end;
$$;

create or replace function public.remove_community_admin(
  p_room_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_permissions jsonb;
  target_role text;
  target_permissions jsonb;
  target_promoted_by uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = caller_id then
    raise exception 'You cannot remove your own administrator role here' using errcode = '42501';
  end if;

  select m.role, m.admin_permissions
    into caller_role, caller_permissions
  from public.community_room_members m
  where m.room_id = p_room_id and m.user_id = caller_id;

  if caller_role is null then
    raise exception 'You are not a member of this community' using errcode = '42501';
  end if;
  if caller_role <> 'owner'
    and not coalesce((caller_permissions ->> 'manage_admins')::boolean, false) then
    raise exception 'You do not have permission to manage administrators' using errcode = '42501';
  end if;

  select m.role, m.admin_permissions, m.promoted_by
    into target_role, target_permissions, target_promoted_by
  from public.community_room_members m
  where m.room_id = p_room_id and m.user_id = p_user_id;

  if target_role is distinct from 'admin' then
    raise exception 'Target user is not an administrator' using errcode = 'P0002';
  end if;
  if caller_role <> 'owner' and (
    target_promoted_by is distinct from caller_id
    or coalesce((target_permissions ->> 'manage_admins')::boolean, false)
  ) then
    raise exception 'You cannot remove an administrator with equal or higher authority' using errcode = '42501';
  end if;

  update public.community_room_members
  set role = 'member',
      admin_permissions = '{}'::jsonb,
      promoted_by = null,
      promoted_at = null
  where room_id = p_room_id and user_id = p_user_id;

  insert into public.community_admin_action_logs(
    room_id, actor_id, target_user_id, action, previous_role, next_role,
    previous_permissions, next_permissions
  )
  values (
    p_room_id, caller_id, p_user_id, 'demoted', 'admin', 'member',
    coalesce(target_permissions, '{}'::jsonb), '{}'::jsonb
  );
end;
$$;

revoke all on function public.set_community_admin_permissions(uuid, uuid, jsonb) from public, anon;
revoke all on function public.remove_community_admin(uuid, uuid) from public, anon;
grant execute on function public.set_community_admin_permissions(uuid, uuid, jsonb) to authenticated;
grant execute on function public.remove_community_admin(uuid, uuid) to authenticated;

drop policy if exists "Authors and room managers delete community messages" on public.community_room_messages;
create policy "Authors and permitted admins delete community messages"
on public.community_room_messages
for delete
to authenticated
using (
  sender_id = (select auth.uid())
  or private.has_community_permission(room_id, 'delete_messages')
);

create or replace function private.is_one_to_one_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = target_conversation_id
        and cm.user_id = (select auth.uid())
    )
    and (
      select count(*)
      from public.conversation_members cm
      where cm.conversation_id = target_conversation_id
    ) = 2;
$$;

revoke all on function private.is_one_to_one_conversation_member(uuid) from public, anon;
grant execute on function private.is_one_to_one_conversation_member(uuid) to authenticated;

grant delete on table public.messages to authenticated;
drop policy if exists "Members delete their own direct messages" on public.messages;
drop policy if exists "Conversation participants delete direct messages" on public.messages;
create policy "Conversation participants delete direct messages"
on public.messages
for delete
to authenticated
using (
  private.is_conversation_member(conversation_id)
  and (
    sender_id = (select auth.uid())
    or private.is_one_to_one_conversation_member(conversation_id)
  )
);

drop policy if exists "Members delete their own conversation media" on storage.objects;
drop policy if exists "Participants delete one-to-one conversation media" on storage.objects;
create policy "Participants delete one-to-one conversation media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-media'
  and (storage.foldername(name))[1] is not null
  and private.is_one_to_one_conversation_member(((storage.foldername(name))[1])::uuid)
);
