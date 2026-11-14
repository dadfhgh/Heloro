-- HELORO channel photo attachments (official News + community channels).
-- Files stay private. Authorization is enforced in Storage RLS, not in client code.

update public.heloro_channels
set name = 'News'
where slug = 'heloro-new'
  and name is distinct from 'News';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'channel-media',
  'channel-media',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users read channel media" on storage.objects;
create policy "Authenticated users read channel media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-media'
    and (
      (
        (storage.foldername(name))[1] = 'official'
        and exists (
          select 1
          from public.heloro_channels c
          where c.id::text = (storage.foldername(name))[2]
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'community'
        and exists (
          select 1
          from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.kind = 'channel'
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
          select 1
          from public.heloro_channels c
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
          select 1
          from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.kind = 'channel'
            and private.has_community_permission(r.id, 'post_messages')
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
          select 1
          from public.heloro_channels c
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
          select 1
          from public.community_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.kind = 'channel'
            and private.is_community_member(r.id)
            and (
              (storage.foldername(name))[3] = (select auth.uid())::text
              or private.has_community_permission(r.id, 'post_messages')
            )
        )
      )
    )
  );
