alter table public.user_preferences
  add column if not exists theme_preference text not null default 'system'
    check (theme_preference in ('system','light','dark')),
  add column if not exists interface_language text not null default 'ru'
    check (interface_language in ('ru','en')),
  add column if not exists account_settings_initialized boolean not null default false;
grant select, insert, update on public.user_preferences to authenticated;
