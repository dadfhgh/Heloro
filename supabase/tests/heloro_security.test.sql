begin;

select plan(13);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'conversations', 'conversations table exists');
select has_table('public', 'conversation_members', 'conversation membership table exists');
select has_table('public', 'messages', 'messages table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'RLS is enabled on conversations');
select ok((select relrowsecurity from pg_class where oid = 'public.conversation_members'::regclass), 'RLS is enabled on conversation_members');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'RLS is enabled on messages');

select ok(not has_table_privilege('anon', 'public.messages', 'select'), 'anonymous users cannot read messages');
select ok(has_table_privilege('authenticated', 'public.messages', 'insert'), 'authenticated role has the message insert grant');
select ok(not has_function_privilege('anon', 'public.create_direct_conversation(text)', 'execute'), 'anonymous users cannot create conversations');
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'anonymous users cannot execute the user trigger function');
select ok(not has_function_privilege('anon', 'public.touch_conversation_after_message()', 'execute'), 'anonymous users cannot execute the message trigger function');

select * from finish();
rollback;
