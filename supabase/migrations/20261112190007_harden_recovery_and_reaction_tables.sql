-- Deny direct client access to internal recovery and audit records.
create policy "No direct client access to account recovery codes"
  on public.account_recovery_codes for all to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client access to admin action logs"
  on public.admin_action_logs for all to anon, authenticated
  using (false)
  with check (false);

create index if not exists message_reactions_user_id_idx
  on public.message_reactions(user_id);
create index if not exists account_recovery_codes_created_by_idx
  on public.account_recovery_codes(created_by);
create index if not exists admin_action_logs_actor_id_idx
  on public.admin_action_logs(actor_id);
create index if not exists admin_action_logs_target_user_id_idx
  on public.admin_action_logs(target_user_id);
