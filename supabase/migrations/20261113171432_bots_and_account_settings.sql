-- HELORO bot accounts, configurable commands, private bot chats and account preferences.
-- Applied to Supabase project wdzycxunhqbrwxjtarad as migration 20261113171432.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_notifications boolean not null default true,
  group_notifications boolean not null default true,
  sound_enabled boolean not null default true,
  preview_enabled boolean not null default true,
  last_seen_visibility text not null default 'everyone' check (last_seen_visibility in ('everyone','contacts','nobody')),
  profile_photo_visibility text not null default 'everyone' check (profile_photo_visibility in ('everyone','contacts','nobody')),
  allow_group_invites boolean not null default true,
  auto_download_media text not null default 'wifi' check (auto_download_media in ('never','wifi','always')),
  updated_at timestamptz not null default now()
);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null check (char_length(trim(display_name)) between 2 and 64),
  description text not null default '' check (char_length(description) <= 255),
  welcome_message text not null default '' check (char_length(welcome_message) <= 1000),
  avatar_url text,
  allow_groups boolean not null default true,
  privacy_mode boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bots_username_format check (
    char_length(username) between 5 and 32 and username ~ '^[a-z][a-z0-9_]*bot$'
  )
);
create unique index bots_username_lower_uidx on public.bots (lower(username));
create index bots_owner_created_idx on public.bots (owner_id, created_at desc);

create table public.bot_commands (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  command_name text not null,
  description text not null default '' check (char_length(description) <= 100),
  response_text text not null default '' check (char_length(response_text) <= 4000),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_commands_name_format check (command_name ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint bot_commands_unique_name unique (bot_id, command_name)
);

create table public.bot_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_chats_user_bot_unique unique (user_id, bot_id)
);
create index bot_chats_user_updated_idx on public.bot_chats (user_id, updated_at desc);

create table public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.bot_chats(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('user','bot')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint bot_message_sender_shape check (
    (sender_kind = 'user' and sender_user_id is not null)
    or (sender_kind = 'bot' and sender_user_id is null)
  )
);
create index bot_messages_chat_created_idx on public.bot_messages (chat_id, created_at);

alter table public.user_preferences enable row level security;
alter table public.bots enable row level security;
alter table public.bot_commands enable row level security;
alter table public.bot_chats enable row level security;
alter table public.bot_messages enable row level security;

create policy "Users read own preferences" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users insert own preferences" on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own preferences" on public.user_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users discover active bots and read own bots" on public.bots
  for select to authenticated using (is_active or owner_id = (select auth.uid()));
create policy "Bot owners update their bots" on public.bots
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Users read commands for active bots or own bots" on public.bot_commands
  for select to authenticated using (
    exists (select 1 from public.bots b where b.id = bot_id and (b.is_active or b.owner_id = (select auth.uid())))
  );
create policy "Bot owners create commands" on public.bot_commands
  for insert to authenticated with check (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = (select auth.uid()))
  );
create policy "Bot owners update commands" on public.bot_commands
  for update to authenticated using (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = (select auth.uid()))
  );
create policy "Bot owners delete commands" on public.bot_commands
  for delete to authenticated using (
    exists (select 1 from public.bots b where b.id = bot_id and b.owner_id = (select auth.uid()))
  );

create policy "Users read own bot chats" on public.bot_chats
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users start chats with active bots" on public.bot_chats
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.bots b where b.id = bot_id and b.is_active and b.owner_id <> (select auth.uid()))
  );
create policy "Users read messages in own bot chats" on public.bot_messages
  for select to authenticated using (
    exists (select 1 from public.bot_chats c where c.id = chat_id and c.user_id = (select auth.uid()))
  );

grant select, insert, update on public.user_preferences to authenticated;
grant select, update on public.bots to authenticated;
grant select, insert, update, delete on public.bot_commands to authenticated;
grant select, insert on public.bot_chats to authenticated;
grant select on public.bot_messages to authenticated;

insert into public.user_preferences(user_id)
select id from auth.users on conflict (user_id) do nothing;

create or replace function private.handle_new_user_preferences()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  insert into public.user_preferences(user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
revoke all on function private.handle_new_user_preferences() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_preferences on auth.users;
create trigger on_auth_user_created_preferences
after insert on auth.users for each row execute function private.handle_new_user_preferences();

create or replace function private.create_user_bot(
  p_display_name text, p_username text, p_description text default '', p_welcome_message text default ''
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  new_bot_id uuid;
  normalized_username text := lower(trim(regexp_replace(coalesce(p_username, ''), '^@', '')));
  normalized_name text := trim(coalesce(p_display_name, ''));
  normalized_description text := trim(coalesce(p_description, ''));
  normalized_welcome text := trim(coalesce(p_welcome_message, ''));
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if char_length(normalized_name) not between 2 and 64 then raise exception 'Bot name must contain 2 to 64 characters' using errcode = '22023'; end if;
  if char_length(normalized_description) > 255 or char_length(normalized_welcome) > 1000 then raise exception 'Bot description or welcome message is too long' using errcode = '22023'; end if;
  if char_length(normalized_username) not between 5 and 32 or normalized_username !~ '^[a-z][a-z0-9_]*bot$' then
    raise exception 'Bot username must be 5 to 32 characters and end in bot' using errcode = '22023';
  end if;
  if exists (select 1 from public.bots b where lower(b.username) = normalized_username) then
    raise exception 'Bot username is already taken' using errcode = '23505';
  end if;
  insert into public.bots(owner_id, username, display_name, description, welcome_message)
  values (caller_id, normalized_username, normalized_name, normalized_description, normalized_welcome)
  returning id into new_bot_id;
  insert into public.bot_commands(bot_id, command_name, description, response_text, sort_order)
  values
    (new_bot_id, 'start', 'Начать работу с ботом', '', 0),
    (new_bot_id, 'help', 'Список доступных команд', '', 1);
  return new_bot_id;
end;
$function$;

create or replace function public.create_user_bot(
  p_display_name text, p_username text, p_description text default '', p_welcome_message text default ''
)
returns uuid language sql security invoker set search_path = ''
as $function$
  select private.create_user_bot(p_display_name, p_username, p_description, p_welcome_message);
$function$;
revoke all on function private.create_user_bot(text, text, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_user_bot(text, text, text, text) to authenticated;
revoke all on function public.create_user_bot(text, text, text, text) from public, anon;
grant execute on function public.create_user_bot(text, text, text, text) to authenticated;

create or replace function private.send_bot_message(p_chat_id uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  chat_row public.bot_chats%rowtype;
  bot_row public.bots%rowtype;
  message_body text := trim(coalesce(p_body, ''));
  command_token text;
  command_name text;
  reply_text text;
  help_text text;
  recent_count integer;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if char_length(message_body) not between 1 and 4000 then raise exception 'Message must contain 1 to 4000 characters' using errcode = '22023'; end if;
  select * into chat_row from public.bot_chats c where c.id = p_chat_id and c.user_id = caller_id for update;
  if not found then raise exception 'Bot chat not found' using errcode = '42501'; end if;
  select * into bot_row from public.bots b where b.id = chat_row.bot_id and b.is_active;
  if not found then raise exception 'Bot is unavailable' using errcode = '22023'; end if;
  select count(*)::integer into recent_count from public.bot_messages m
    where m.chat_id = p_chat_id and m.sender_kind = 'user' and m.created_at > now() - interval '10 seconds';
  if recent_count >= 8 then raise exception 'Too many messages. Please wait a moment.' using errcode = 'P0001'; end if;
  insert into public.bot_messages(chat_id, sender_kind, sender_user_id, body)
  values (p_chat_id, 'user', caller_id, message_body);
  command_token := split_part(message_body, ' ', 1);
  if left(command_token, 1) = '/' then
    command_name := split_part(lower(substr(command_token, 2)), '@', 1);
    if command_name = 'start' then
      reply_text := nullif(bot_row.welcome_message, '');
      if reply_text is null then reply_text := 'Привет! Я бот HELORO. Отправь /help, чтобы посмотреть команды.'; end if;
    elsif command_name = 'help' then
      select string_agg('/' || c.command_name || case when c.description <> '' then ' — ' || c.description else '' end, E'\\n' order by c.sort_order, c.command_name)
      into help_text from public.bot_commands c where c.bot_id = bot_row.id and c.enabled;
      reply_text := coalesce(help_text, 'Нет доступных команд.');
    else
      select c.response_text into reply_text from public.bot_commands c
      where c.bot_id = bot_row.id and c.enabled and c.command_name = command_name limit 1;
      if reply_text is null then reply_text := 'Неизвестная команда. Отправь /help.'; end if;
    end if;
  else
    reply_text := 'Я отвечаю на команды. Отправь /help, чтобы посмотреть список.';
  end if;
  if reply_text is not null and char_length(reply_text) > 0 then
    insert into public.bot_messages(chat_id, sender_kind, sender_user_id, body)
    values (p_chat_id, 'bot', null, left(reply_text, 4000));
  end if;
  update public.bot_chats set updated_at = now() where id = p_chat_id and user_id = caller_id;
end;
$function$;

create or replace function public.send_bot_message(p_chat_id uuid, p_body text)
returns void language sql security invoker set search_path = ''
as $function$
  select private.send_bot_message(p_chat_id, p_body);
$function$;
revoke all on function private.send_bot_message(uuid, text) from public, anon;
grant execute on function private.send_bot_message(uuid, text) to authenticated;
revoke all on function public.send_bot_message(uuid, text) from public, anon;
grant execute on function public.send_bot_message(uuid, text) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bot_messages'
     ) then
    alter publication supabase_realtime add table public.bot_messages;
  end if;
end;
$publication$;
