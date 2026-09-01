-- P0-C Expand：Slack meta 讀取 RPC（部署階段一；尚未 revoke client table grants）

create or replace function public.get_own_slack_meta()
returns table (user_id uuid, slack_user_id text, slack_team_id text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.user_id, m.slack_user_id, m.slack_team_id
  from public.user_slack_meta m
  where m.user_id = auth.uid();
$$;

revoke all on function public.get_own_slack_meta() from public, anon;
grant execute on function public.get_own_slack_meta() to authenticated;

comment on function public.get_own_slack_meta() is
  '回傳目前登入者的 Slack meta（不含 token）；僅 auth.uid() 本人；anon 不可執行。';
