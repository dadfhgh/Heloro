-- HELORO Early Access: owner-managed grants for selected accounts.
-- Source-only migration. Do not apply to the shared Supabase project without approval.

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
    'community_deleted',
    'early_access_granted',
    'early_access_revoked'
  ));

create table if not exists public.early_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);

create index if not exists early_access_grants_granted_at_idx
  on public.early_access_grants(granted_at desc);

alter table public.early_access_grants enable row level security;

-- No direct client table access. All reads/writes go through narrowly scoped RPCs.
revoke all on table public.early_access_grants from anon, authenticated;

create or replace function public.heloro_admin_list_early_access()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  granted_at timestamptz,
  granted_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not private.has_heloro_role('owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  return query
    select
      grants.user_id,
      profiles.username,
      profiles.display_name,
      profiles.avatar_url,
      grants.granted_at,
      grants.granted_by
    from public.early_access_grants as grants
    left join public.profiles as profiles on profiles.id = grants.user_id
    order by grants.granted_at desc;
end;
$$;

create or replace function public.heloro_admin_set_early_access(
  p_target_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected_rows integer := 0;
  next_action text;
begin
  if actor is null or not private.has_heloro_role('owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_enabled is null then
    raise exception 'Target user and access state are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles as profiles
    where profiles.id = p_target_user_id
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  if p_enabled then
    insert into public.early_access_grants(user_id, granted_by)
    values (p_target_user_id, actor)
    on conflict (user_id) do nothing;
    get diagnostics affected_rows = row_count;
    next_action := 'early_access_granted';
  else
    delete from public.early_access_grants
    where user_id = p_target_user_id;
    get diagnostics affected_rows = row_count;
    next_action := 'early_access_revoked';
  end if;

  if affected_rows > 0 then
    insert into public.admin_action_logs(
      actor_id, target_user_id, action, reason, details
    ) values (
      actor,
      p_target_user_id,
      next_action,
      case when p_enabled then 'Early Access granted by HELORO Owner'
        else 'Early Access revoked by HELORO Owner' end,
      jsonb_build_object('enabled', p_enabled)
    );
  end if;
end;
$$;

create or replace function public.heloro_has_early_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      private.has_heloro_role('owner')
      or exists (
        select 1
        from public.early_access_grants as grants
        where grants.user_id = (select auth.uid())
      )
    ),
    false
  );
$$;

revoke all on function public.heloro_admin_list_early_access() from public, anon;
revoke all on function public.heloro_admin_set_early_access(uuid, boolean) from public, anon;
revoke all on function public.heloro_has_early_access() from public, anon;

grant execute on function public.heloro_admin_list_early_access() to authenticated;
grant execute on function public.heloro_admin_set_early_access(uuid, boolean) to authenticated;
grant execute on function public.heloro_has_early_access() to authenticated;

commit;
