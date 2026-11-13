begin;

select plan(28);

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
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_room_messages' and policyname = 'Authors and room managers delete community messages' and cmd = 'DELETE'), 'community messages have an author and manager delete policy');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Conversation participants delete direct messages' and cmd = 'DELETE' and qual like '%is_one_to_one_conversation_member%'), 'only one-to-one participants can delete any direct message');
select has_column('public', 'community_room_members', 'admin_permissions', 'community admins have individual permission storage');
select has_column('public', 'community_room_members', 'promoted_by', 'community admin promoter is recorded');
select has_column('public', 'community_room_members', 'promoted_at', 'community admin promotion time is recorded');
select has_function('private', 'has_community_permission', array['uuid', 'text'], 'community permission helper exists');
select has_function('public', 'set_community_admin_permissions', array['uuid', 'uuid', 'jsonb'], 'secure admin promotion and permission RPC exists');
select has_function('public', 'remove_community_admin', array['uuid', 'uuid'], 'secure admin demotion RPC exists');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_room_messages' and policyname = 'Authors and permitted admins delete community messages' and cmd = 'DELETE' and qual like '%has_community_permission%'), 'community message moderation is permission-gated');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Participants delete one-to-one conversation media' and cmd = 'DELETE'), 'one-to-one participants can clean up shared message media');

select * from finish();
rollback;
