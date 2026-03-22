-- Translator-editable suffixes for automatic Slack case-reply DMs (accept / decline line 1).
-- Full message = Slack mrkdwn case link + suffix; null key = use app default on client.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_message_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.slack_message_defaults IS
  'JSON: optional accept_suffix, decline_line1_suffix (strings). Empty object uses app defaults.';
