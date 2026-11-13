-- Remove the message reactions feature from HELORO.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime drop table public.message_reactions;
  end if;
end
$$;

drop table if exists public.message_reactions cascade;
