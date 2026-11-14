-- Correct outer-row qualification in the private channel-media Storage policies.
-- The subqueries join tables that also contain a column named "name".
-- Explicitly reference storage.objects.name to avoid resolving to c.name / r.name.

drop policy if exists "Authenticated users read channel media" on storage.objects;
create policy "Authenticated users read channel media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-media'
    and (
      (
        (storage.foldername(storage.objects.name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(storage.objects.name))[2]
        )
      )
      or
      (
        (storage.foldername(storage.objects.name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(storage.objects.name))[2]
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
    and (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
    and (
      (
        (storage.foldername(storage.objects.name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(storage.objects.name))[2]
        )
        and (
          private.has_heloro_role('owner')
          or private.has_heloro_role('admin')
        )
      )
      or
      (
        (storage.foldername(storage.objects.name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(storage.objects.name))[2]
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
        (storage.foldername(storage.objects.name))[1] = 'official'
        and exists (
          select 1 from public.heloro_channels c
          where c.id::text = (storage.foldername(storage.objects.name))[2]
        )
        and (
          private.has_heloro_role('owner')
          or private.has_heloro_role('admin')
        )
      )
      or
      (
        (storage.foldername(storage.objects.name))[1] = 'community'
        and exists (
          select 1 from public.community_rooms r
          where r.id::text = (storage.foldername(storage.objects.name))[2]
            and private.is_community_member(r.id)
            and (
              (
                r.kind = 'group'
                and (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
              )
              or
              (
                r.kind = 'channel'
                and (
                  (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
                  or private.has_community_permission(r.id, 'post_messages')
                )
              )
            )
        )
      )
    )
  );
