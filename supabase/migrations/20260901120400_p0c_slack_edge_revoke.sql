-- P0-C Contract／Harden：Slack 三表 Edge-only；撤銷 client 直讀寫（部署階段三）

revoke all on table public.slack_oauth_states from public, anon, authenticated;
revoke all on table public.user_slack_meta from public, anon, authenticated;
revoke all on table public.user_slack_credentials from public, anon, authenticated;

drop policy if exists "user_slack_meta_select_own" on public.user_slack_meta;
drop policy if exists "user_slack_meta_delete_own" on public.user_slack_meta;
