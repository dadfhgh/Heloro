-- HELORO last-seen privacy, online presence, and direct-chat typing signals.
-- The profile table remains free of private activity timestamps.

alter table public.user_preferences
  add column if not exists last_seen_at timestamptz;

create or replace function private.can_view_user_presence(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  viewer_id uuid := auth.uid();
  target_visibility text := 'everyone';
  viewer_visibility text := 'everyone';
begin
  if viewer_id is null or target_user_id is null then
    return false;
  end if;

  if viewer_id = target_user_id then
    return true;
  end if;

  select coalesce(p.last_seen_visibility, 'everyone')
    into target_visibility
  from public.user_preferences p
  where p.user_id = target_user_id;

  select coalesce(p.last_seen_visibility, 'everyone')
    into viewer_visibility
  from public.user_preferences p
  where p.user_id = viewer_id;

  if target_visibility = 'nobody' or viewer_visibility = 'nobody' then
    return false;
  end if;

  if target_visibility = 'contacts' or viewer_visibility = 'contacts' then
    return exists (
      select 1
      from public.conversation_members mine
      join public.conversation_members peer
        on peer.conversation_id = mine.conversation_id
      where mine.user_id = viewer_id
        and peer.user_id = target_user_id
        and (
          select count(*)
          from public.conversation_members members
          where members.conversation_id = mine.conversation_id
        ) = 2
    );
  end if;

  return true;
end;
$function$;

revoke all on function private.can_view_user_presence(uuid) from public, anon;
grant execute on function private.can_view_user_presence(uuid) to authenticated;

create or replace function public.get_visible_last_seen(target_user_ids uuid[])
returns table(user_id uuid, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct prefs.user_id, prefs.last_seen_at
  from unnest(coalesce(target_user_ids, '{}'::uuid[])) as requested(user_id)
  join public.user_preferences prefs on prefs.user_id = requested.user_id
  where prefs.last_seen_at is not null
    and private.can_view_user_presence(prefs.user_id)
  limit 100;
$function$;

revoke all on function public.get_visible_last_seen(uuid[]) from public, anon;
grant execute on function public.get_visible_last_seen(uuid[]) to authenticated;

create or replace function public.touch_user_last_seen()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.user_preferences
  set last_seen_at = statement_timestamp()
  where user_id = current_user_id;

  if not found then
    insert into public.user_preferences (user_id, last_seen_at)
    values (current_user_id, statement_timestamp());
  end if;
end;
$function$;

revoke all on function public.touch_user_last_seen() from public, anon;
grant execute on function public.touch_user_last_seen() to authenticated;

-- Each account can publish presence only to its own private topic.
drop policy if exists "HELORO users listen to visible presence" on realtime.messages;
create policy "HELORO users listen to visible presence"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and exists (
    select 1
    from public.profiles target
    where realtime.topic() = 'heloro:presence:' || target.id::text
      and private.can_view_user_presence(target.id)
  )
);

drop policy if exists "HELORO users publish own presence" on realtime.messages;
create policy "HELORO users publish own presence"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and realtime.topic() = 'heloro:presence:' || (select auth.uid())::text
);

-- Typing is ephemeral broadcast state, scoped to existing one-to-one conversations.
drop policy if exists "HELORO direct chat members receive typing" on realtime.messages;
create policy "HELORO direct chat members receive typing"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.conversation_members mine
    where mine.user_id = (select auth.uid())
      and realtime.topic() = 'heloro:typing:' || mine.conversation_id::text
      and (
        select count(*)
        from public.conversation_members members
        where members.conversation_id = mine.conversation_id
      ) = 2
  )
);

drop policy if exists "HELORO direct chat members send typing" on realtime.messages;
create policy "HELORO direct chat members send typing"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.conversation_members mine
    where mine.user_id = (select auth.uid())
      and realtime.topic() = 'heloro:typing:' || mine.conversation_id::text
      and (
        select count(*)
        from public.conversation_members members
        where members.conversation_id = mine.conversation_id
      ) = 2
  )
);
