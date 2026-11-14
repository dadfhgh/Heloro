begin;

select plan(50);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'conversations', 'conversations table exists');
select has_table('public', 'conversation_members', 'conversation membership table exists');
select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'community_rooms', 'community rooms table exists');
select has_table('public', 'community_room_messages', 'community room messages table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'RLS is enabled on conversations');
select ok((select relrowsecurity from pg_class where oid = 'public.conversation_members'::regclass), 'RLS is enabled on conversation_members');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'RLS is enabled on messages');

select ok(not has_table_privilege('anon', 'public.messages', 'select'), 'anonymous users cannot read messages');
select ok(has_table_privilege('authenticated', 'public.messages', 'insert'), 'authenticated role has the message insert grant');
select ok(not has_function_privilege('anon', 'public.create_direct_conversation(text)', 'execute'), 'anonymous users cannot create conversations');
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'anonymous users cannot execute the user trigger function');
select ok(not has_function_privilege('anon', 'public.touch_conversation_after_message()', 'execute'), 'anonymous users cannot execute the message trigger function');
select ok(has_table_privilege('authenticated', 'public.community_rooms', 'delete'), 'authenticated role has the community deletion grant');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_rooms' and policyname = 'Owners delete their own communities' and cmd = 'DELETE'), 'community deletion is protected by the owner-only policy');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_room_messages' and policyname = 'Authors and HELORO staff delete community messages' and cmd = 'DELETE'), 'community messages can be deleted only under the named author/staff policy');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Conversation participants delete direct messages' and cmd = 'DELETE' and qual like '%is_one_to_one_conversation_member%'), 'only one-to-one participants can delete any direct message');
select has_table('public', 'community_admin_action_logs', 'community admin audit table exists');
select has_function('private', 'is_one_to_one_conversation_member', array['uuid'], 'direct deletion is limited to one-to-one conversations');
select has_column('public', 'community_room_members', 'admin_permissions', 'community admins have individual permission storage');
select has_column('public', 'community_room_members', 'promoted_by', 'community admin promoter is recorded');
select has_column('public', 'community_room_members', 'promoted_at', 'community admin promotion time is recorded');
select has_function('private', 'has_community_permission', array['uuid', 'text'], 'community permission helper exists');
select has_function('private', 'can_manage_specific_community_admin', array['uuid', 'uuid'], 'admin hierarchy helper exists');
select has_function('public', 'set_community_admin_permissions', array['uuid', 'uuid', 'jsonb'], 'secure admin promotion and permission RPC exists');
select has_function('public', 'remove_community_admin', array['uuid', 'uuid'], 'secure admin demotion RPC exists');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_room_messages' and policyname = 'Authors and HELORO staff delete community messages' and cmd = 'DELETE' and qual like '%has_community_permission%' and qual like '%has_heloro_role%'), 'community message deletion checks per-community permissions and global staff roles');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Participants delete one-to-one conversation media' and cmd = 'DELETE'), 'one-to-one participants can clean up shared message media');

select has_function('public', 'heloro_admin_list_communities', array[]::text[], 'HELORO S community list RPC exists');
select has_function('public', 'heloro_admin_delete_community', array['uuid'], 'HELORO S community deletion RPC exists');
select ok(has_function_privilege('authenticated', 'public.heloro_admin_delete_community(uuid)', 'execute') and not has_function_privilege('anon', 'public.heloro_admin_delete_community(uuid)', 'execute'), 'community deletion RPC is restricted to authenticated users');

-- Additional baseline security assertions for all application tables and RPCs.
select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  'RLS is enabled on every public application table'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'RLS is enabled on Storage objects'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous users cannot access the private schema'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ),
  'public SECURITY DEFINER functions pin an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anonymous users cannot execute public SECURITY DEFINER functions'
);

select ok(not has_table_privilege('anon', 'public.user_roles', 'select'), 'anonymous users cannot read HELORO staff roles');
select ok(not has_table_privilege('anon', 'public.admin_action_logs', 'select'), 'anonymous users cannot read HELORO admin audit logs');
select ok(not has_table_privilege('authenticated', 'public.admin_action_logs', 'insert'), 'signed-in users cannot directly insert admin audit logs');
select ok(not has_table_privilege('authenticated', 'public.admin_action_logs', 'update'), 'signed-in users cannot directly update admin audit logs');
select ok(not has_table_privilege('authenticated', 'public.admin_action_logs', 'delete'), 'signed-in users cannot directly delete admin audit logs');
select ok(
  not has_table_privilege('authenticated', 'public.user_roles', 'insert')
  and not has_table_privilege('authenticated', 'public.user_roles', 'update')
  and not has_table_privilege('authenticated', 'public.user_roles', 'delete'),
  'signed-in users cannot directly change HELORO staff roles'
);

select ok(has_function_privilege('authenticated', 'public.save_bot_script(uuid,text,boolean)', 'execute'), 'bot owners can call the guarded script-save RPC');
select ok(has_function_privilege('authenticated', 'public.prepare_bot_lua_message(uuid,text)', 'execute'), 'authenticated users can call the guarded bot-message prepare RPC');
select ok(has_function_privilege('authenticated', 'public.finish_bot_lua_message(uuid,uuid,jsonb)', 'execute'), 'authenticated users can call the guarded bot-message finish RPC');
select ok(not has_function_privilege('anon', 'public.save_bot_script(uuid,text,boolean)', 'execute'), 'anonymous users cannot save Lua bot scripts');
select ok(not has_function_privilege('anon', 'public.prepare_bot_lua_message(uuid,text)', 'execute'), 'anonymous users cannot prepare Lua bot messages');
select ok(not has_function_privilege('anon', 'public.finish_bot_lua_message(uuid,uuid,jsonb)', 'execute'), 'anonymous users cannot finish Lua bot messages');

select * from finish();
rollback;
