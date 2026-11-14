-- Revoke default Data API access for anonymous users on HELORO admin-only tables.
revoke all privileges on table public.account_restrictions from anon;
revoke all privileges on table public.user_report_decisions from anon;
revoke all privileges on table public.heloro_settings from anon;
