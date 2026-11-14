-- HELORO Bot Studio: owner-only Lua drafts, publish snapshots and authenticated runtime RPCs.
-- This migration is intentionally committed to the task branch only. It has NOT been applied to the live Supabase project.

create table public.bot_scripts (
  bot_id uuid primary key references public.bots(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_code text not null default '' check (octet_length(source_code) <= 16000),
  draft_version integer not null default 1 check (draft_version > 0),
  published_source text,
  published_version integer,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint bot_scripts_published_state check (
    (is_published = false and published_source is null and published_version is null)
    or (is_published = true and published_source is not null and published_version is not null)
  )
);

create table public.bot_script_versions (
  bot_id uuid not null references public.bots(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  source_code text not null check (octet_length(source_code) <= 16000),
  created_at timestamptz not null default now(),
  primary key (bot_id, version)
);

create index bot_script_versions_owner_idx
  on public.bot_script_versions(owner_id, bot_id, version desc);

alter table public.bot_scripts enable row level security;
alter table public.bot_script_versions enable row level security;

create policy "Bot owners read their scripts" on public.bot_scripts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Bot owners read script history" on public.bot_script_versions
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.bot_scripts from anon, authenticated;
revoke all on public.bot_script_versions from anon, authenticated;
grant select on public.bot_scripts to authenticated;
grant select on public.bot_script_versions to authenticated;

create or replace function private.save_bot_script(
  p_bot_id uuid,
  p_source_code text,
  p_publish boolean default false
)
returns table(draft_version integer, published_version integer, is_published boolean, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  script_row public.bot_scripts%rowtype;
  next_version integer;
  normalized_source text := coalesce(p_source_code, '');
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if octet_length(normalized_source) not between 1 and 16000 then
    raise exception 'Script must contain 1 to 16000 bytes' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.bots b where b.id = p_bot_id and b.owner_id = caller_id
  ) then
    raise exception 'Only the bot owner can edit its script' using errcode = '42501';
  end if;

  select * into script_row
  from public.bot_scripts s
  where s.bot_id = p_bot_id and s.owner_id = caller_id
  for update;

  if not found then
    next_version := 1;
    insert into public.bot_scripts(bot_id, owner_id, source_code, draft_version, published_source, published_version, is_published, published_at)
    values (
      p_bot_id, caller_id, normalized_source, next_version,
      case when coalesce(p_publish, false) then normalized_source else null end,
      case when coalesce(p_publish, false) then next_version else null end,
      coalesce(p_publish, false),
      case when coalesce(p_publish, false) then now() else null end
    );
    insert into public.bot_script_versions(bot_id, owner_id, version, source_code)
    values (p_bot_id, caller_id, next_version, normalized_source);
  else
    next_version := script_row.draft_version;
    if script_row.source_code is distinct from normalized_source then
      next_version := script_row.draft_version + 1;
      insert into public.bot_script_versions(bot_id, owner_id, version, source_code)
      values (p_bot_id, caller_id, next_version, normalized_source);
    end if;
    update public.bot_scripts s
    set source_code = normalized_source,
        draft_version = next_version,
        is_published = case when coalesce(p_publish, false) then true else s.is_published end,
        published_source = case when coalesce(p_publish, false) then normalized_source else s.published_source end,
        published_version = case when coalesce(p_publish, false) then next_version else s.published_version end,
        published_at = case when coalesce(p_publish, false) then now() else s.published_at end,
        updated_at = now()
    where s.bot_id = p_bot_id and s.owner_id = caller_id;
  end if;

  return query
    select s.draft_version, s.published_version, s.is_published, s.published_at
    from public.bot_scripts s where s.bot_id = p_bot_id and s.owner_id = caller_id;
end;
$function$;

create or replace function public.save_bot_script(
  p_bot_id uuid,
  p_source_code text,
  p_publish boolean default false
)
returns table(draft_version integer, published_version integer, is_published boolean, published_at timestamptz)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.save_bot_script(p_bot_id, p_source_code, p_publish);
$function$;

create or replace function private.prepare_bot_lua_message(p_chat_id uuid, p_body text)
returns table(
  use_legacy boolean,
  bot_id uuid,
  bot_username text,
  source_code text,
  user_message_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  chat_row public.bot_chats%rowtype;
  bot_row public.bots%rowtype;
  script_row public.bot_scripts%rowtype;
  message_body text := trim(coalesce(p_body, ''));
  recent_count integer;
  inserted_message_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(message_body) not between 1 and 4000 then
    raise exception 'Message must contain 1 to 4000 characters' using errcode = '22023';
  end if;

  select * into chat_row
  from public.bot_chats c
  where c.id = p_chat_id and c.user_id = caller_id
  for update;
  if not found then
    raise exception 'Bot chat not found' using errcode = '42501';
  end if;

  select * into bot_row
  from public.bots b
  where b.id = chat_row.bot_id and b.is_active;
  if not found then
    raise exception 'Bot is unavailable' using errcode = '22023';
  end if;

  select * into script_row
  from public.bot_scripts s
  where s.bot_id = bot_row.id and s.owner_id = bot_row.owner_id;

  if not found or not script_row.is_published or script_row.published_source is null then
    return query select true, bot_row.id, bot_row.username, null::text, null::uuid;
    return;
  end if;

  select count(*)::integer into recent_count
  from public.bot_messages m
  where m.chat_id = p_chat_id
    and m.sender_kind = 'user'
    and m.created_at > now() - interval '10 seconds';
  if recent_count >= 8 then
    raise exception 'Too many messages. Please wait a moment.' using errcode = 'P0001';
  end if;

  insert into public.bot_messages(chat_id, sender_kind, sender_user_id, body)
  values (p_chat_id, 'user', caller_id, message_body)
  returning id into inserted_message_id;

  update public.bot_chats set updated_at = now()
  where id = p_chat_id and user_id = caller_id;

  return query select false, bot_row.id, bot_row.username, script_row.published_source, inserted_message_id;
end;
$function$;

create or replace function public.prepare_bot_lua_message(p_chat_id uuid, p_body text)
returns table(use_legacy boolean, bot_id uuid, bot_username text, source_code text, user_message_id uuid)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.prepare_bot_lua_message(p_chat_id, p_body);
$function$;

create or replace function private.finish_bot_lua_message(
  p_chat_id uuid,
  p_user_message_id uuid,
  p_replies jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  reply_text text;
  reply_count integer := 0;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.bot_chats c
    join public.bots b on b.id = c.bot_id
    join public.bot_scripts s on s.bot_id = b.id and s.owner_id = b.owner_id and s.is_published
    where c.id = p_chat_id and c.user_id = caller_id and b.is_active
  ) then
    raise exception 'Bot chat or published script is unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.bot_messages m
    where m.id = p_user_message_id and m.chat_id = p_chat_id
      and m.sender_kind = 'user' and m.sender_user_id = caller_id
  ) then
    raise exception 'Message does not belong to this chat' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_replies, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_replies, '[]'::jsonb)) > 5 then
    raise exception 'A script can send at most five replies per message' using errcode = '22023';
  end if;

  for reply_text in select value from jsonb_array_elements_text(coalesce(p_replies, '[]'::jsonb))
  loop
    reply_count := reply_count + 1;
    if char_length(reply_text) not between 1 and 1000 then
      raise exception 'Each reply must contain 1 to 1000 characters' using errcode = '22023';
    end if;
    insert into public.bot_messages(chat_id, sender_kind, sender_user_id, body)
    values (p_chat_id, 'bot', null, reply_text);
  end loop;

  update public.bot_chats set updated_at = now()
  where id = p_chat_id and user_id = caller_id;
end;
$function$;

create or replace function public.finish_bot_lua_message(
  p_chat_id uuid,
  p_user_message_id uuid,
  p_replies jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.finish_bot_lua_message(p_chat_id, p_user_message_id, p_replies);
$function$;

revoke all on function private.save_bot_script(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.prepare_bot_lua_message(uuid, text) from public, anon, authenticated;
revoke all on function private.finish_bot_lua_message(uuid, uuid, jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.save_bot_script(uuid, text, boolean) to authenticated;
grant execute on function private.prepare_bot_lua_message(uuid, text) to authenticated;
grant execute on function private.finish_bot_lua_message(uuid, uuid, jsonb) to authenticated;

revoke all on function public.save_bot_script(uuid, text, boolean) from public, anon;
revoke all on function public.prepare_bot_lua_message(uuid, text) from public, anon;
revoke all on function public.finish_bot_lua_message(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_bot_script(uuid, text, boolean) to authenticated;
grant execute on function public.prepare_bot_lua_message(uuid, text) to authenticated;
grant execute on function public.finish_bot_lua_message(uuid, uuid, jsonb) to authenticated;
