-- Add the one-of-one Epic Sans creator badge without changing existing badge holders.
alter table public.verification_badges
  drop constraint if exists verification_badges_badge_type_check;

alter table public.verification_badges
  add constraint verification_badges_badge_type_check
  check (badge_type in ('blue', 'gold', 'creator', 'epic_sans'));

-- The Epic Sans mark is a single exclusive status across HELORO.
create unique index if not exists verification_badges_epic_sans_single_holder_idx
  on public.verification_badges (badge_type)
  where badge_type = 'epic_sans';

-- Only the HELORO Owner may issue this special badge. Standard badges remain
-- grantable by Owners and Admins as before.
drop policy if exists "Owner and admin grant verification badges"
  on public.verification_badges;

create policy "Owner and admin grant verification badges"
  on public.verification_badges for insert to authenticated
  with check (
    granted_by = (select auth.uid())
    and (
      (badge_type = 'epic_sans' and private.has_heloro_role('owner'))
      or (
        badge_type <> 'epic_sans'
        and (
          private.has_heloro_role('owner')
          or private.has_heloro_role('admin')
        )
      )
    )
  );

-- Epic Sans can be revoked only by the Owner. Admins retain revoke rights
-- for ordinary blue, gold, and creator badges.
drop policy if exists "Owner and admin revoke verification badges"
  on public.verification_badges;

create policy "Owner and admin revoke verification badges"
  on public.verification_badges for delete to authenticated
  using (
    (
      badge_type = 'epic_sans'
      and private.has_heloro_role('owner')
    )
    or (
      badge_type <> 'epic_sans'
      and (
        private.has_heloro_role('owner')
        or private.has_heloro_role('admin')
      )
    )
  );

-- Serialize grants and check the global holder before replacing the target's
-- existing badge. A failed duplicate grant leaves the target's old badge intact.
-- SECURITY INVOKER is sufficient: authenticated Owners already hold the
-- required RLS-governed SELECT / DELETE / INSERT privileges.
create or replace function public.heloro_admin_grant_epic_sans_badge(
  p_target_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.has_heloro_role('owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('heloro:epic_sans_badge', 0)
  );

  if exists (
    select 1
    from public.verification_badges
    where badge_type = 'epic_sans'
      and user_id <> p_target_user_id
  ) then
    raise exception 'epic_sans_badge_already_assigned' using errcode = '23505';
  end if;

  delete from public.verification_badges
  where user_id = p_target_user_id;

  insert into public.verification_badges (user_id, badge_type, granted_by)
  values (p_target_user_id, 'epic_sans', actor);
end;
$$;

revoke all on function public.heloro_admin_grant_epic_sans_badge(uuid)
  from anon, service_role, public;
grant execute on function public.heloro_admin_grant_epic_sans_badge(uuid)
  to authenticated;
