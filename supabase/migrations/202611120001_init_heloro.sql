-- HELORO initial schema.
-- Apply this migration only to the dedicated HELORO Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  )
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_id_idx
  on public.conversation_members (user_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(body) between 1 and 4000)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- Private membership helper avoids recursive RLS policies on the membership table.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members as cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_conversation_member(uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke all on table public.profiles, public.conversations, public.conversation_members, public.messages
  from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (username, display_name, avatar_url, updated_at) on table public.profiles to authenticated;
grant select on table public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on table public.messages to authenticated;

drop policy if exists "Authenticated users can discover public profiles" on public.profiles;
create policy "Authenticated users can discover public profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Members read their conversations" on public.conversations;
create policy "Members read their conversations"
  on public.conversations for select to authenticated
  using (private.is_conversation_member(id));

drop policy if exists "Members read conversation membership" on public.conversation_members;
create policy "Members read conversation membership"
  on public.conversation_members for select to authenticated
  using (private.is_conversation_member(conversation_id));

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select to authenticated
  using (private.is_conversation_member(conversation_id));

drop policy if exists "Members send messages as themselves" on public.messages;
create policy "Members send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  );

-- Profile row is created by the trusted auth trigger; clients cannot insert arbitrary profile IDs.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_heloro on auth.users;
create trigger on_auth_user_created_heloro
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- These functions are trigger-only; never expose them as callable Data API functions.
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_heloro_message_created on public.messages;
create trigger on_heloro_message_created
  after insert on public.messages
  for each row execute procedure public.touch_conversation_after_message();

revoke all on function public.touch_conversation_after_message() from public, anon, authenticated, service_role;

create or replace function public.create_direct_conversation(target_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_user_id uuid;
  existing_conversation_id uuid;
  new_conversation_id uuid;
  pair_lock bigint;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.id into target_user_id
  from public.profiles as p
  where lower(p.username) = lower(trim(target_username))
  limit 1;

  if target_user_id is null then
    raise exception 'Username not found' using errcode = 'P0002';
  end if;

  if target_user_id = caller_id then
    raise exception 'You cannot start a conversation with yourself' using errcode = '22023';
  end if;

  pair_lock := hashtextextended(
    least(caller_id::text, target_user_id::text) || ':' ||
    greatest(caller_id::text, target_user_id::text),
    0
  );
  perform pg_advisory_xact_lock(pair_lock);

  select c.id into existing_conversation_id
  from public.conversations as c
  where exists (
    select 1 from public.conversation_members as a
    where a.conversation_id = c.id and a.user_id = caller_id
  )
  and exists (
    select 1 from public.conversation_members as b
    where b.conversation_id = c.id and b.user_id = target_user_id
  )
  and (
    select count(*) from public.conversation_members as all_members
    where all_members.conversation_id = c.id
  ) = 2
  limit 1;

  if existing_conversation_id is not null then
    return existing_conversation_id;
  end if;

  insert into public.conversations (created_by)
  values (caller_id)
  returning id into new_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_conversation_id, caller_id), (new_conversation_id, target_user_id);

  return new_conversation_id;
end;
$$;

revoke all on function public.create_direct_conversation(text) from public, anon;
grant execute on function public.create_direct_conversation(text) to authenticated;

create or replace function public.get_inbox()
returns table (
  conversation_id uuid,
  updated_at timestamptz,
  other_user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz
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
    latest.created_at as last_message_at
  from public.conversations as c
  join public.conversation_members as my_membership
    on my_membership.conversation_id = c.id
   and my_membership.user_id = (select auth.uid())
  join public.conversation_members as other_member
    on other_member.conversation_id = c.id
   and other_member.user_id <> (select auth.uid())
  join public.profiles as p on p.id = other_member.user_id
  left join lateral (
    select m.body, m.created_at
    from public.messages as m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) as latest on true
  order by coalesce(latest.created_at, c.updated_at) desc;
$$;

revoke all on function public.get_inbox() from public, anon;
grant execute on function public.get_inbox() to authenticated;

-- Realtime Postgres Changes for the messages table. Add only when not already present.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
