-- HELORO S admin and moderation foundations.
-- Prepared for the HELORO development branch. Do not apply to the shared database
-- until the migration is reviewed and the Preview branch has been accepted.

begin;

alter table public.admin_action_logs
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists reason text not null default '',
  add column if not exists details jsonb not null default '{}'::jsonb;

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
    'verification_revoked'
  ));

alter table public.support_threads
  add column if not exists status text not null default 'open',
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

alter table public.support_threads
  drop constraint if exists support_threads_status_check;
alter table public.support_threads
  add constraint support_threads_status_check
  check (status in ('open', 'in_progress', 'resolved', 'closed'));

alter table public.user_reports
  add column if not exists target_type text not null default 'user',
  add column if not exists target_id uuid,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;
alter table public.user_reports alter column reported_user_id drop not null;

alter table public.user_reports
  drop constraint if exists user_reports_target_type_check;
alter table public.user_reports
  add constraint user_reports_target_type_check
  check (
    target_type in ('user', 'message', 'group', 'channel')
    and (
      (target_type = 'user' and reported_user_id is not null)
      or (target_type <> 'user' and target_id is not null)
    )
  );

create table if not exists public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restriction_type text not null check (restriction_type in ('warning', 'temporary_ban', 'freeze', 'ban')),
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoke_reason text
);

create index if not exists account_restrictions_user_active_idx
  on public.account_restrictions(user_id, created_at desc)
  where revoked_at is null;

create table if not exists public.user_report_decisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.user_reports(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  previous_status text,
  next_status text not null check (next_status in ('open', 'reviewing', 'resolved', 'dismissed')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists user_report_decisions_report_created_idx
  on public.user_report_decisions(report_id, created_at desc);

create table if not exists public.heloro_settings (
  setting_key text primary key check (setting_key in (
    'maintenance_mode',
    'registrations_enabled',
    'public_groups_enabled',
    'public_channels_enabled'
  )),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.heloro_settings(setting_key, value)
values
  ('maintenance_mode', 'false'::jsonb),
  ('registrations_enabled', 'true'::jsonb),
  ('public_groups_enabled', 'true'::jsonb),
  ('public_channels_enabled', 'true'::jsonb)
on conflict (setting_key) do nothing;

alter table public.account_restrictions enable row level security;
alter table public.user_report_decisions enable row level security;
alter table public.heloro_settings enable row level security;

drop policy if exists "Staff and subject can read restrictions" on public.account_restrictions;
create policy "Staff and subject can read restrictions"
  on public.account_restrictions for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );

drop policy if exists "Staff can read report decision history" on public.user_report_decisions;
create policy "Staff can read report decision history"
  on public.user_report_decisions for select to authenticated
  using (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );

drop policy if exists "Owner can read HELORO settings" on public.heloro_settings;
create policy "Owner can read HELORO settings"
  on public.heloro_settings for select to authenticated
  using (private.has_heloro_role('owner'));

drop policy if exists "Staff can read admin action logs" on public.admin_action_logs;
create policy "Staff can read admin action logs"
  on public.admin_action_logs for select to authenticated
  using (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );

revoke insert, update, delete on public.admin_action_logs from anon, authenticated;
revoke insert, update, delete on public.account_restrictions from anon, authenticated;
revoke insert, update, delete on public.user_report_decisions from anon, authenticated;
revoke insert, update, delete on public.heloro_settings from anon, authenticated;
revoke update on public.user_reports from anon, authenticated;
revoke update on public.support_threads from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;

grant select on public.admin_action_logs to authenticated;
grant select on public.account_restrictions to authenticated;
grant select on public.user_report_decisions to authenticated;
grant select on public.heloro_settings to authenticated;

drop policy if exists "Staff can update report status" on public.user_reports;

create or replace function private.is_current_user_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.account_restrictions r
    where r.user_id = (select auth.uid())
      and r.revoked_at is null
      and r.restriction_type in ('temporary_ban', 'freeze', 'ban')
      and (r.expires_at is null or r.expires_at > now())
  );
$$;

revoke all on function private.is_current_user_account_active() from public, anon;
grant execute on function private.is_current_user_account_active() to authenticated;

create or replace function public.heloro_current_account_restriction()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'restriction_type', r.restriction_type,
    'reason', r.reason,
    'created_at', r.created_at,
    'expires_at', r.expires_at
  )
  from public.account_restrictions r
  where r.user_id = (select auth.uid())
    and r.revoked_at is null
    and r.restriction_type in ('temporary_ban', 'freeze', 'ban')
    and (r.expires_at is null or r.expires_at > now())
  order by r.created_at desc
  limit 1;
$$;

create or replace function public.heloro_submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reported_user_id uuid,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $report$
declare
  reporter uuid := auth.uid();
  report_id uuid;
  owner_id uuid;
begin
  if reporter is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_target_type is null or p_reason is null
    or p_target_type not in ('user', 'message', 'group', 'channel')
    or p_reason not in ('spam', 'harassment', 'scam', 'inappropriate', 'other')
    or char_length(trim(coalesce(p_details, ''))) > 1500 then
    raise exception 'Invalid report details' using errcode = '22023';
  end if;

  if p_target_type = 'user' then
    if p_reported_user_id is null or p_reported_user_id = reporter
      or not exists (select 1 from public.profiles p where p.id = p_reported_user_id) then
      raise exception 'Invalid user report target' using errcode = '22023';
    end if;
  else
    if p_target_id is null then
      raise exception 'Report target is required' using errcode = '22023';
    end if;
    if p_target_type = 'message' then
      select m.sender_id into owner_id from public.messages m
      where m.id = p_target_id and private.is_conversation_member(m.conversation_id);
      if owner_id is null then
        select cm.sender_id into owner_id from public.community_room_messages cm
        where cm.id = p_target_id and private.is_community_member(cm.room_id);
      end if;
      if owner_id is null then
        select dm.user_id into owner_id from public.channel_discussion_messages dm
        where dm.id = p_target_id;
      end if;
      if owner_id is null then raise exception 'Message not found or not accessible' using errcode = 'P0002'; end if;
    elsif p_target_type = 'group' then
      select r.created_by into owner_id from public.community_rooms r
      where r.id = p_target_id and (r.is_public or private.is_community_member(r.id));
      if owner_id is null then raise exception 'Group not found or not accessible' using errcode = 'P0002'; end if;
    elsif p_target_type = 'channel' then
      select cp.author_id into owner_id from public.channel_posts cp where cp.id = p_target_id;
      if owner_id is null then
        select cc.user_id into owner_id
        from public.channel_comments cc
        join public.channel_posts cp on cp.id = cc.post_id
        where cc.id = p_target_id;
      end if;
      if owner_id is null and not exists (select 1 from public.heloro_channels c where c.id = p_target_id) then
        raise exception 'Channel or channel content not found' using errcode = 'P0002';
      end if;
    end if;
    p_reported_user_id := owner_id;
  end if;

  insert into public.user_reports(reporter_id, reported_user_id, reason, details, target_type, target_id)
  values (reporter, p_reported_user_id, p_reason, left(trim(coalesce(p_details, '')), 1500), p_target_type, p_target_id)
  returning id into report_id;
  return report_id;
end;
$report$;

create or replace function public.heloro_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  ) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'registrations_24h', (select count(*) from auth.users where created_at >= now() - interval '24 hours'),
    'active_users_24h', (select count(*) from auth.users where last_sign_in_at >= now() - interval '24 hours'),
    'messages_total',
      (select count(*) from public.messages)
      + (select count(*) from public.community_room_messages)
      + (select count(*) from public.channel_discussion_messages)
      + (select count(*) from public.support_messages)
      + (select count(*) from public.channel_comments)
      + (select count(*) from public.channel_posts),
    'messages_24h',
      (select count(*) from public.messages where created_at >= now() - interval '24 hours')
      + (select count(*) from public.community_room_messages where created_at >= now() - interval '24 hours')
      + (select count(*) from public.channel_discussion_messages where created_at >= now() - interval '24 hours')
      + (select count(*) from public.support_messages where created_at >= now() - interval '24 hours')
      + (select count(*) from public.channel_comments where created_at >= now() - interval '24 hours')
      + (select count(*) from public.channel_posts where created_at >= now() - interval '24 hours'),
    'reports_open', (select count(*) from public.user_reports where status in ('open', 'reviewing')),
    'support_open', (select count(*) from public.support_threads where status in ('open', 'in_progress')),
    'admins_total', (select count(*) from public.user_roles where role = 'admin'),
    'moderators_total', (select count(*) from public.user_roles where role = 'moderator')
  );
end;
$$;

create or replace function public.heloro_admin_list_staff()
returns table(user_id uuid, role text, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  ) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  return query
    select ur.user_id, ur.role, ur.granted_at
    from public.user_roles ur
    where ur.role in ('owner', 'admin', 'moderator')
    order by case ur.role when 'owner' then 0 when 'admin' then 1 else 2 end, ur.granted_at;
end;
$$;

create or replace function public.heloro_admin_set_role(
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.has_heloro_role('owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = actor then
    raise exception 'You cannot change your own role' using errcode = '22023';
  end if;
  if p_role is not null and p_role not in ('admin', 'moderator') then
    raise exception 'Only Admin and Moderator can be assigned here' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = p_target_user_id and ur.role = 'owner') then
    raise exception 'Owner role is protected' using errcode = '42501';
  end if;

  delete from public.user_roles
  where user_id = p_target_user_id and role in ('admin', 'moderator');

  if p_role is not null then
    insert into public.user_roles(user_id, role) values (p_target_user_id, p_role);
  end if;

  insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason)
  values (actor, p_target_user_id, 'user', p_target_user_id,
    case when p_role is null then 'staff_role_revoked' else 'staff_role_granted' end,
    case when p_role is null then 'Staff role removed' else 'Assigned role: ' || p_role end);
end;
$$;

create or replace function public.heloro_admin_apply_restriction(
  p_target_user_id uuid,
  p_restriction_type text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created_id uuid;
  is_owner boolean := private.has_heloro_role('owner');
  is_admin boolean := private.has_heloro_role('admin');
  is_moderator boolean := private.has_heloro_role('moderator');
begin
  if actor is null or not (is_owner or is_admin or is_moderator) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = actor then
    raise exception 'Invalid moderation target' using errcode = '22023';
  end if;
  if p_restriction_type not in ('warning', 'temporary_ban', 'freeze', 'ban') then
    raise exception 'Unsupported moderation action' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = p_target_user_id and ur.role = 'owner') then
    raise exception 'Owner account cannot be moderated here' using errcode = '42501';
  end if;
  if is_moderator and not (is_owner or is_admin) then
    if p_restriction_type not in ('warning', 'temporary_ban') then
      raise exception 'Moderator cannot issue this restriction type' using errcode = '42501';
    end if;
    if exists (select 1 from public.user_roles ur where ur.user_id = p_target_user_id and ur.role in ('admin', 'moderator')) then
      raise exception 'Moderator cannot moderate staff accounts' using errcode = '42501';
    end if;
    if p_restriction_type = 'temporary_ban'
      and (p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '24 hours') then
      raise exception 'Moderator temporary restrictions are limited to 24 hours' using errcode = '22023';
    end if;
  elsif p_restriction_type = 'temporary_ban'
    and (p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days') then
    raise exception 'Temporary restriction expiry must be within 30 days' using errcode = '22023';
  end if;
  if p_restriction_type <> 'temporary_ban' and p_expires_at is not null then
    raise exception 'Expiry is only valid for temporary restrictions' using errcode = '22023';
  end if;

  insert into public.account_restrictions(user_id, restriction_type, reason, created_by, expires_at)
  values (p_target_user_id, p_restriction_type, trim(p_reason), actor, p_expires_at)
  returning id into created_id;

  insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason, details)
  values (actor, p_target_user_id, 'user', p_target_user_id, 'moderation_' || p_restriction_type,
    trim(p_reason), jsonb_build_object('restriction_id', created_id, 'expires_at', p_expires_at));

  return created_id;
end;
$$;

create or replace function public.heloro_admin_revoke_restriction(
  p_restriction_id uuid,
  p_reason text default 'Restriction revoked by staff'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.account_restrictions%rowtype;
begin
  if actor is null or not (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  ) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into item from public.account_restrictions r
  where r.id = p_restriction_id and r.revoked_at is null
  for update;
  if not found then
    raise exception 'Restriction not found or already revoked' using errcode = 'P0002';
  end if;
  if private.has_heloro_role('moderator')
    and not (private.has_heloro_role('owner') or private.has_heloro_role('admin'))
    and item.created_by <> actor then
    raise exception 'Moderator can revoke only own moderation actions' using errcode = '42501';
  end if;

  update public.account_restrictions
  set revoked_by = actor, revoked_at = now(), revoke_reason = left(trim(coalesce(p_reason, '')), 1000)
  where id = p_restriction_id;

  insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason, details)
  values (actor, item.user_id, 'user', item.user_id, 'moderation_restriction_revoked',
    left(trim(coalesce(p_reason, '')), 1000), jsonb_build_object('restriction_id', p_restriction_id));
end;
$$;

create or replace function public.heloro_admin_update_report(
  p_report_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  old_report public.user_reports%rowtype;
begin
  if actor is null or not (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  ) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;

  select * into old_report from public.user_reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  update public.user_reports
  set status = p_status,
      review_note = left(trim(coalesce(p_note, '')), 1000),
      reviewed_by = actor,
      reviewed_at = now()
  where id = p_report_id;

end;
$$;

create or replace function public.heloro_admin_update_support(
  p_thread_id uuid,
  p_status text,
  p_assigned_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  thread_user uuid;
begin
  if actor is null or not (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  ) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid support status' using errcode = '22023';
  end if;
  if private.has_heloro_role('moderator')
    and not (private.has_heloro_role('owner') or private.has_heloro_role('admin'))
    and p_assigned_to is not null and p_assigned_to <> actor then
    raise exception 'Moderator may assign support only to self' using errcode = '42501';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_assigned_to and ur.role in ('owner', 'admin', 'moderator')
  ) then
    raise exception 'Assignee must be a staff member' using errcode = '22023';
  end if;

  update public.support_threads
  set status = p_status, assigned_to = p_assigned_to, updated_at = now()
  where id = p_thread_id
  returning user_id into thread_user;
  if not found then
    raise exception 'Support thread not found' using errcode = 'P0002';
  end if;

end;
$$;

create or replace function public.heloro_admin_set_setting(
  p_setting_key text,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.has_heloro_role('owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_setting_key not in ('maintenance_mode', 'registrations_enabled', 'public_groups_enabled', 'public_channels_enabled')
    or jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'Unsupported setting or value' using errcode = '22023';
  end if;

  insert into public.heloro_settings(setting_key, value, updated_at, updated_by)
  values (p_setting_key, p_value, now(), actor)
  on conflict (setting_key) do update
    set value = excluded.value, updated_at = now(), updated_by = actor;

  insert into public.admin_action_logs(actor_id, action, reason, details)
  values (actor, 'system_setting_changed', 'Updated ' || p_setting_key,
    jsonb_build_object('setting_key', p_setting_key, 'value', p_value));
end;
$$;

create or replace function public.audit_heloro_badge_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  subject uuid;
  action_name text;
  badge text;
begin
  if TG_OP = 'INSERT' then
    subject := NEW.user_id;
    badge := NEW.badge_type;
    action_name := 'verification_granted';
  else
    subject := OLD.user_id;
    badge := OLD.badge_type;
    action_name := 'verification_revoked';
  end if;

  if actor is not null then
    insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason, details)
    values (actor, subject, 'user', subject, action_name, 'Verification badge changed',
      jsonb_build_object('badge_type', badge));
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists audit_heloro_badge_change on public.verification_badges;
create trigger audit_heloro_badge_change
after insert or delete on public.verification_badges
for each row execute function public.audit_heloro_badge_change();

create or replace function public.audit_heloro_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is not null and (OLD.status is distinct from NEW.status or OLD.review_note is distinct from NEW.review_note) then
    insert into public.user_report_decisions(report_id, actor_id, previous_status, next_status, note)
    values (NEW.id, actor, OLD.status, NEW.status, coalesce(NEW.review_note, ''));

    insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason, details)
    values (actor, NEW.reported_user_id, NEW.target_type, coalesce(NEW.target_id, NEW.reported_user_id),
      'report_' || NEW.status, coalesce(NEW.review_note, ''),
      jsonb_build_object('report_id', NEW.id));
  end if;
  return NEW;
end;
$$;

drop trigger if exists audit_heloro_report_update on public.user_reports;
create trigger audit_heloro_report_update
after update of status, review_note on public.user_reports
for each row execute function public.audit_heloro_report_update();

create or replace function public.audit_heloro_support_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is not null and (OLD.status is distinct from NEW.status or OLD.assigned_to is distinct from NEW.assigned_to) then
    insert into public.admin_action_logs(actor_id, target_user_id, target_type, target_id, action, reason, details)
    values (actor, NEW.user_id, 'support_thread', NEW.id, 'support_thread_updated',
      'Support status or assignment changed',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'assigned_to', NEW.assigned_to));
  end if;
  return NEW;
end;
$$;

drop trigger if exists audit_heloro_support_update on public.support_threads;
create trigger audit_heloro_support_update
after update of status, assigned_to on public.support_threads
for each row execute function public.audit_heloro_support_update();


-- Restrictive policies add an account-status gate without widening existing table access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'conversations',
    'conversation_members',
    'messages',
    'community_rooms',
    'community_room_members',
    'community_room_messages',
    'channel_posts',
    'channel_comments',
    'channel_discussion_messages',
    'support_threads',
    'support_messages',
    'user_reports'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'HELORO active account gate', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.is_current_user_account_active()) with check (private.is_current_user_account_active())',
      'HELORO active account gate', table_name
    );
  end loop;
end $$;

revoke all on function public.heloro_current_account_restriction() from public, anon;
revoke all on function public.heloro_submit_report(text, uuid, uuid, text, text) from public, anon;
revoke all on function public.heloro_admin_overview() from public, anon;
revoke all on function public.heloro_admin_list_staff() from public, anon;
revoke all on function public.heloro_admin_set_role(uuid, text) from public, anon;
revoke all on function public.heloro_admin_apply_restriction(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.heloro_admin_revoke_restriction(uuid, text) from public, anon;
revoke all on function public.heloro_admin_update_report(uuid, text, text) from public, anon;
revoke all on function public.heloro_admin_update_support(uuid, text, uuid) from public, anon;
revoke all on function public.heloro_admin_set_setting(text, jsonb) from public, anon;
revoke all on function public.audit_heloro_badge_change() from public, anon, authenticated;
revoke all on function public.audit_heloro_report_update() from public, anon, authenticated;
revoke all on function public.audit_heloro_support_update() from public, anon, authenticated;

grant execute on function public.heloro_current_account_restriction() to authenticated;
grant execute on function public.heloro_submit_report(text, uuid, uuid, text, text) to authenticated;
grant execute on function public.heloro_admin_overview() to authenticated;
grant execute on function public.heloro_admin_list_staff() to authenticated;
grant execute on function public.heloro_admin_set_role(uuid, text) to authenticated;
grant execute on function public.heloro_admin_apply_restriction(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.heloro_admin_revoke_restriction(uuid, text) to authenticated;
grant execute on function public.heloro_admin_update_report(uuid, text, text) to authenticated;
grant execute on function public.heloro_admin_update_support(uuid, text, uuid) to authenticated;
grant execute on function public.heloro_admin_set_setting(text, jsonb) to authenticated;

commit;
