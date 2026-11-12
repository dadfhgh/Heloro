-- Role storage is not writable from the client.
create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists "Users can read their own roles" on public.user_roles;
create policy "Users can read their own roles"
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

-- A zero-argument helper can only answer for the currently authenticated user.
create or replace function private.is_heloro_owner()
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
      and ur.role = 'owner'
  );
$$;

revoke all on function private.is_heloro_owner() from public, anon;
grant execute on function private.is_heloro_owner() to authenticated;

-- Initial owner grants are intentionally applied only in the private live database
-- after confirming the Auth user ID. Never commit user IDs or grant by email here.
