-- HELORO official News and Support avatar storage.
-- This migration is staged in GitHub only and is not applied to shared Supabase.

begin;

create table if not exists public.official_branding (
  kind text primary key check (kind in ('news', 'support')),
  avatar_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.official_branding enable row level security;
revoke all on table public.official_branding from anon, authenticated;
grant select, insert, update on table public.official_branding to authenticated;

drop policy if exists "Authenticated users read official branding" on public.official_branding;
create policy "Authenticated users read official branding"
  on public.official_branding for select to authenticated
  using (true);

drop policy if exists "Only owner creates official branding" on public.official_branding;
create policy "Only owner creates official branding"
  on public.official_branding for insert to authenticated
  with check (private.is_heloro_owner());

drop policy if exists "Only owner updates official branding" on public.official_branding;
create policy "Only owner updates official branding"
  on public.official_branding for update to authenticated
  using (private.is_heloro_owner())
  with check (private.is_heloro_owner());

insert into public.official_branding (kind)
values ('news'), ('support')
on conflict (kind) do nothing;

drop policy if exists "Authenticated users read official branding avatars" on storage.objects;
create policy "Authenticated users read official branding avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-media'
    and (storage.foldername(storage.objects.name))[1] = 'branding'
  );

drop policy if exists "Only owner uploads official branding avatars" on storage.objects;
create policy "Only owner uploads official branding avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-media'
    and (storage.foldername(storage.objects.name))[1] = 'branding'
    and (storage.foldername(storage.objects.name))[2] = (select auth.uid())::text
    and private.is_heloro_owner()
  );

drop policy if exists "Only owner deletes official branding avatars" on storage.objects;
create policy "Only owner deletes official branding avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channel-media'
    and (storage.foldername(storage.objects.name))[1] = 'branding'
    and private.is_heloro_owner()
  );

commit;
