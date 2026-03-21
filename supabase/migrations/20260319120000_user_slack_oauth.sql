-- Slack User OAuth: tokens (service role only) + public meta for UI
CREATE TABLE public.user_slack_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  slack_user_id text NOT NULL,
  slack_team_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_slack_credentials ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_slack_credentials IS 'Slack OAuth tokens; only Edge Functions (service role) may read/write.';

CREATE TABLE public.user_slack_meta (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL,
  slack_team_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_slack_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_slack_meta_select_own"
  ON public.user_slack_meta FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_slack_meta_delete_own"
  ON public.user_slack_meta FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- OAuth CSRF state (one-time); Edge Functions only
CREATE TABLE public.slack_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX slack_oauth_states_expires_idx ON public.slack_oauth_states (expires_at);

ALTER TABLE public.slack_oauth_states ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.slack_oauth_states IS 'Temporary Slack OAuth state; Edge Functions only.';
