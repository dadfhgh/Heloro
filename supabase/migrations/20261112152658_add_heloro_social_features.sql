-- HELORO social features: official news, channel comments, discussion chat, private support, reports and verification badges.
-- All tables are protected by RLS and have explicit minimal Data API grants.

create or replace function private.has_heloro_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
      and ur.role = required_role
  );
$$;

revoke all on function private.has_heloro_role(text) from public, anon;
grant execute on function private.has_heloro_role(text) to authenticated;

create table if not exists public.heloro_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.heloro_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists channel_posts_channel_created_idx
  on public.channel_posts(channel_id, created_at desc);

create table if not exists public.channel_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.channel_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists channel_comments_post_created_idx
  on public.channel_comments(post_id, created_at asc);

create table if not exists public.channel_discussion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists channel_discussion_created_idx
  on public.channel_discussion_messages(created_at desc);

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_thread_created_idx
  on public.support_messages(thread_id, created_at asc);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'scam', 'inappropriate', 'other')),
  details text not null default '' check (char_length(details) <= 1500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists user_reports_status_created_idx
  on public.user_reports(status, created_at desc);

create table if not exists public.verification_badges (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  badge_type text not null check (badge_type in ('blue', 'gold', 'creator')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);

alter table public.heloro_channels enable row level security;
alter table public.channel_posts enable row level security;
alter table public.channel_comments enable row level security;
alter table public.channel_discussion_messages enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.user_reports enable row level security;
alter table public.verification_badges enable row level security;

revoke all on table public.heloro_channels, public.channel_posts, public.channel_comments,
  public.channel_discussion_messages, public.support_threads, public.support_messages,
  public.user_reports, public.verification_badges from anon, authenticated;

grant select on public.heloro_channels, public.channel_posts, public.channel_comments,
  public.channel_discussion_messages, public.verification_badges to authenticated;
grant insert on public.channel_comments, public.channel_discussion_messages to authenticated;
grant select, insert on public.support_threads to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert on public.user_reports to authenticated;
grant update (status) on public.user_reports to authenticated;
grant insert, delete on public.verification_badges to authenticated;
grant select, insert on public.channel_posts to authenticated;

create policy "Signed-in users can read official channels"
  on public.heloro_channels for select to authenticated
  using (true);

create policy "Signed-in users can read channel posts"
  on public.channel_posts for select to authenticated
  using (true);
create policy "Only owner and admin publish channel posts"
  on public.channel_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      private.has_heloro_role('owner')
      or private.has_heloro_role('admin')
    )
  );

create policy "Signed-in users can read channel comments"
  on public.channel_comments for select to authenticated
  using (true);
create policy "Users create their own channel comments"
  on public.channel_comments for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Signed-in users can read discussion messages"
  on public.channel_discussion_messages for select to authenticated
  using (true);
create policy "Users send their own discussion messages"
  on public.channel_discussion_messages for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users and staff read permitted support threads"
  on public.support_threads for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );
create policy "Users open their own support thread"
  on public.support_threads for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users and staff read permitted support messages"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_threads as st
      where st.id = thread_id and st.user_id = (select auth.uid())
    )
    or private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );
create policy "Users and staff reply to permitted support threads"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      exists (
        select 1 from public.support_threads as st
        where st.id = thread_id and st.user_id = (select auth.uid())
      )
      or private.has_heloro_role('owner')
      or private.has_heloro_role('admin')
      or private.has_heloro_role('moderator')
    )
  );

create policy "Users and staff read reports by permission"
  on public.user_reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );
create policy "Users can submit reports about other users"
  on public.user_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reported_user_id <> (select auth.uid())
  );
create policy "Staff can update report status"
  on public.user_reports for update to authenticated
  using (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  )
  with check (
    private.has_heloro_role('owner')
    or private.has_heloro_role('admin')
    or private.has_heloro_role('moderator')
  );

create policy "Signed-in users can see public verification badges"
  on public.verification_badges for select to authenticated
  using (true);
create policy "Owner and admin grant verification badges"
  on public.verification_badges for insert to authenticated
  with check (
    granted_by = (select auth.uid())
    and (private.has_heloro_role('owner') or private.has_heloro_role('admin'))
  );
create policy "Owner and admin revoke verification badges"
  on public.verification_badges for delete to authenticated
  using (
    private.has_heloro_role('owner') or private.has_heloro_role('admin')
  );

insert into public.heloro_channels (slug, name, description)
values ('heloro-new', 'Heloro New', 'Официальные новости и обновления HELORO')
on conflict (slug) do update
set name = excluded.name, description = excluded.description;

create or replace function private.touch_support_thread_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads
  set updated_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$$;
revoke all on function private.touch_support_thread_after_message() from public, anon, authenticated, service_role;
drop trigger if exists on_heloro_support_message_created on public.support_messages;
create trigger on_heloro_support_message_created
  after insert on public.support_messages
  for each row execute procedure private.touch_support_thread_after_message();

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'channel_posts',
    'channel_comments',
    'channel_discussion_messages',
    'support_messages'
  ] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = target_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;
