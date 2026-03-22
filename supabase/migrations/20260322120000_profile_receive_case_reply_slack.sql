-- PM/Executive: opt out of automatic Slack DMs when translators (or others) accept/decline cases
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS receive_translator_case_reply_slack_dms boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.receive_translator_case_reply_slack_dms IS
  'If true (default), PM/Executive receive case accept/decline Slack DMs. Only meaningful for pm/executive roles.';
