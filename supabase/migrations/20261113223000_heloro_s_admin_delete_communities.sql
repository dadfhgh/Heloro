-- HELORO S: privileged deletion of community groups and channels.
-- Source-only migration. Apply only to an approved non-production Supabase project.

begin;

alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in (
    'account_recovery_issued',
    'account_recovery_completed',
    'staff_role_granted',
    'staff_role_revoked',
    'moderation_warning',
    'moderation_temporary_ban',
    'moderation_freeze',
    'moderation_ban',
    'moderation_restriction_revoked',
    'report_open',
    'report_reviewing',
    'report_resolved',
    'report_dismissed',
    'support_thread_updated',
    'system_setting_changed',
    'verification_granted',
    'verification_revoked',
    'community_deleted'
  ));

create or replace function public.heloro_admin_list_communities()
returns table (
  id uuid,
  name text,
  username text,
  kind text,
  created_at timestamptz,
  created_by uuid,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_heloro_role('owner') or private.has_heloro_role('admin')) then
    raise exception 'Owner or Admin access required' using errcode = '42501';
  end if;

  return query
    select r.id, r.name, r.username, r.kind, r.created_at, r.created_by,
      (select count(*) from public.community_room_members m where m.room_id = r.id)
    from public.community_rooms r
    where r.kind in ('group', 'channel')
    order by r.created_at desc;
end;
$$;

create or replace function public.heloro_admin_delete_community(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_rooms%rowtype;
  member_total bigint;
  message_total bigint;
begin
  if actor is null or not (private.has_heloro_role('owner') or private.has_heloro_role('admin')) then
    raise exception 'Owner or Admin access required' using errcode = '42501';
  end if;
  if p_room_id is null then
    raise exception 'Community id is required' using errcode = '22023';
  end if;

  select * into target
  from public.community_rooms
  where id = p_room_id
  for update;

  if not found or target.kind not in ('group', 'channel') then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  select count(*) into member_total
  from public.community_room_members where room_id = target.id;
  select count(*) into message_total
  from public.community_room_messages where room_id = target.id;

  insert into public.admin_action_logs(
    actor_id, target_type, target_id, action, reason, details
  ) values (
    actor, target.kind, target.id, 'community_deleted',
    'Community deleted by HELORO S',
    jsonb_build_object(
      'name', target.name,
      'username', target.username,
      'kind', target.kind,
      'member_count', member_total,
      'message_count', message_total,
      'created_by', target.created_by
    )
  );

  delete from public.community_rooms where id = target.id;
end;
$$;

revoke all on function public.heloro_admin_list_communities() from public, anon;
revoke all on function public.heloro_admin_delete_community(uuid) from public, anon;
grant execute on function public.heloro_admin_list_communities() to authenticated;
grant execute on function public.heloro_admin_delete_community(uuid) to authenticated;

commit;
