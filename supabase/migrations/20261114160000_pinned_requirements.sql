-- Complete the pinned HELORO community features.
-- Community badges use only the existing standard badge families (blue/gold/creator).
-- Epic Sans remains a user-only exclusive verification mark.
begin;

create table if not exists public.community_verification_badges (
  room_id uuid primary key references public.community_rooms(id) on delete cascade,
  badge_type text not null check (badge_type in ('blue', 'gold', 'creator')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now()
);

alter table public.community_verification_badges enable row level security;
revoke all on public.community_verification_badges from anon, authenticated;
grant select, insert, update, delete on public.community_verification_badges to authenticated;

drop policy if exists "Authenticated users read community verification badges" on public.community_verification_badges;
create policy "Authenticated users read community verification badges"
  on public.community_verification_badges for select to authenticated
  using (true);

drop policy if exists "Owner grants community verification badges" on public.community_verification_badges;
create policy "Owner grants community verification badges"
  on public.community_verification_badges for insert to authenticated
  with check (
    private.has_heloro_role('owner')
    and granted_by = (select auth.uid())
  );

drop policy if exists "Owner updates community verification badges" on public.community_verification_badges;
create policy "Owner updates community verification badges"
  on public.community_verification_badges for update to authenticated
  using (private.has_heloro_role('owner'))
  with check (
    private.has_heloro_role('owner')
    and granted_by = (select auth.uid())
  );

drop policy if exists "Owner revokes community verification badges" on public.community_verification_badges;
create policy "Owner revokes community verification badges"
  on public.community_verification_badges for delete to authenticated
  using (private.has_heloro_role('owner'));

drop policy if exists "HELORO active account gate" on public.community_verification_badges;
create policy "HELORO active account gate"
  on public.community_verification_badges as restrictive for all to authenticated
  using (private.is_current_user_account_active())
  with check (private.is_current_user_account_active());

create table if not exists public.profile_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_type text not null check (gift_type in ('fat_epic_sans')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, gift_type)
);

create index if not exists profile_gifts_user_id_idx on public.profile_gifts(user_id);

alter table public.profile_gifts enable row level security;
revoke all on public.profile_gifts from anon, authenticated;
grant select, insert, update, delete on public.profile_gifts to authenticated;

drop policy if exists "Authenticated users read profile gifts" on public.profile_gifts;
create policy "Authenticated users read profile gifts"
  on public.profile_gifts for select to authenticated
  using (true);

drop policy if exists "Owner grants profile gifts" on public.profile_gifts;
create policy "Owner grants profile gifts"
  on public.profile_gifts for insert to authenticated
  with check (
    private.has_heloro_role('owner')
    and granted_by = (select auth.uid())
  );

drop policy if exists "Owner updates profile gifts" on public.profile_gifts;
create policy "Owner updates profile gifts"
  on public.profile_gifts for update to authenticated
  using (private.has_heloro_role('owner'))
  with check (
    private.has_heloro_role('owner')
    and granted_by = (select auth.uid())
  );

drop policy if exists "Owner revokes profile gifts" on public.profile_gifts;
create policy "Owner revokes profile gifts"
  on public.profile_gifts for delete to authenticated
  using (private.has_heloro_role('owner'));

drop policy if exists "HELORO active account gate" on public.profile_gifts;
create policy "HELORO active account gate"
  on public.profile_gifts as restrictive for all to authenticated
  using (private.is_current_user_account_active())
  with check (private.is_current_user_account_active());

-- Group photos and channel photos share the private channel-media bucket.
-- Reads are limited to members of the specific group/channel.
drop policy if exists "Authenticated users read channel media" on storage.objects;
create policy "Authenticated users read channel media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-media'
    and (
      (
        (storage.foldername(name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(name))[2]
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.kind in ('group', 'channel')
            and private.is_community_member(r.id)
        )
      )
    )
  );

drop policy if exists "Channel publishers upload channel media" on storage.objects;
create policy "Channel publishers upload channel media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-media'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (
      (
        (storage.foldername(name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(name))[2]
        )
        and (
          private.has_heloro_role('owner')
          or private.has_heloro_role('admin')
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and (
              (r.kind = 'group' and private.can_send_community_message(r.id))
              or
              (r.kind = 'channel' and private.has_community_permission(r.id, 'post_messages'))
            )
        )
      )
    )
  );

drop policy if exists "Channel publishers delete channel media" on storage.objects;
create policy "Channel publishers delete channel media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channel-media'
    and (
      (
        (storage.foldername(name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(name))[2]
        )
        and (
          private.has_heloro_role('owner')
          or private.has_heloro_role('admin')
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and private.is_community_member(r.id)
            and (
              (
                r.kind = 'group'
                and (storage.foldername(name))[3] = (select auth.uid())::text
              )
              or
              (
                r.kind = 'channel'
                and (
                  (storage.foldername(name))[3] = (select auth.uid())::text
                  or private.has_community_permission(r.id, 'post_messages')
                )
              )
            )
        )
      )
    )
  );

commit;
