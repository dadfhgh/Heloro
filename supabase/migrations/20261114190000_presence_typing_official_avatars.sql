-- HELORO direct-chat presence/typing and official account avatars.
-- Staged in GitHub only. This migration is not applied to shared Supabase.

begin;

alter table public.user_preferences
  add column if not exists last_seen_at timestamptz;

create or replace function private.can_view_heloro_presence(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or exists (
      select 1 from public.user_preferences as target_preferences
      where target_preferences.user_id = target_user_id
        and target_preferences.last_seen_visibility = 'everyone'
    )
    or exists (
      select 1
      from public.user_preferences as target_preferences
      join public.conversation_members as target_member
        on target_member.user_id = target_preferences.user_id
      join public.conversation_members as viewer_member
        on viewer_member.conversation_id = target_member.conversation_id
      where target_preferences.user_id = target_user_id
        and target_preferences.last_seen_visibility = 'contacts'
        and viewer_member.user_id = (select auth.uid())
    );
$$;
revoke all on function private.can_view_heloro_presence(uuid) from public, anon;
grant execute on function private.can_view_heloro_presence(uuid) to authenticated;

create or replace function public.get_inbox_with_presence()
returns table (
  conversation_id uuid,
  updated_at timestamptz,
  other_user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz,
  other_last_seen_at timestamptz,
  other_last_seen_hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id as conversation_id,
    c.updated_at,
    other_member.user_id as other_user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    latest.body as last_message,
    latest.created_at as last_message_at,
    case
      when coalesce(preferences.last_seen_visibility, 'everyone') = 'nobody' then null
      else preferences.last_seen_at
    end as other_last_seen_at,
    coalesce(preferences.last_seen_visibility, 'everyone') = 'nobody' as other_last_seen_hidden
  from public.conversations as c
  join public.conversation_members as my_membership
    on my_membership.conversation_id = c.id
   and my_membership.user_id = (select auth.uid())
  join public.conversation_members as other_member
    on other_member.conversation_id = c.id
   and other_member.user_id <> (select auth.uid())
  join public.profiles as p on p.id = other_member.user_id
  left join public.user_preferences as preferences
    on preferences.user_id = other_member.user_id
  left join lateral (
    select m.body, m.created_at
    from public.messages as m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) as latest on true
  order by coalesce(latest.created_at, c.updated_at) desc;
$$;
revoke all on function public.get_inbox_with_presence() from public, anon;
grant execute on function public.get_inbox_with_presence() to authenticated;

drop policy if exists "HELORO visible user presence read" on realtime.messages;
create policy "HELORO visible user presence read"
  on realtime.messages for select to authenticated
  using (
    (
      realtime.topic() ~ '^heloro:user-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and private.can_view_heloro_presence(split_part(realtime.topic(), ':', 3)::uuid)
    )
    or
    (
      realtime.topic() ~ '^heloro:dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and private.is_conversation_member(split_part(realtime.topic(), ':', 3)::uuid)
    )
  );

drop policy if exists "HELORO users publish own presence and DM typing" on realtime.messages;
create policy "HELORO users publish own presence and DM typing"
  on realtime.messages for insert to authenticated
  with check (
    (
      realtime.topic() ~ '^heloro:user-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and split_part(realtime.topic(), ':', 3)::uuid = (select auth.uid())
    )
    or
    (
      realtime.topic() ~ '^heloro:dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and private.is_conversation_member(split_part(realtime.topic(), ':', 3)::uuid)
    )
  );

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
  on public.official_branding for select to authenticated using (true);
drop policy if exists "Only owner creates official branding" on public.official_branding;
create policy "Only owner creates official branding"
  on public.official_branding for insert to authenticated with check (private.is_heloro_owner());
drop policy if exists "Only owner updates official branding" on public.official_branding;
create policy "Only owner updates official branding"
  on public.official_branding for update to authenticated
  using (private.is_heloro_owner()) with check (private.is_heloro_owner());

insert into public.official_branding (kind)
values ('news'), ('support')
on conflict (kind) do nothing;

drop policy if exists "Authenticated users read official branding avatars" on storage.objects;
create policy "Authenticated users read official branding avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'channel-media' and (storage.foldername(storage.objects.name))[1] = 'branding');
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
