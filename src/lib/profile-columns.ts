/**
 * Canonical `profiles` column names and SELECT list for Supabase queries.
 * Use these instead of `select("*")` so PostgREST never relies on a stale schema
 * and typos like `receive_translator_case_reply_slack_cms` cannot slip into app code.
 */
export const PROFILE_COLUMN_RECEIVE_TRANSLATOR_CASE_REPLY_SLACK_DMS =
  "receive_translator_case_reply_slack_dms" as const;

/** All columns the app reads from `profiles` (matches DB migration / types). */
export const PROFILE_SELECT_COLUMNS = [
  "id",
  "email",
  "display_name",
  "avatar_url",
  "timezone",
  "status_message",
  "phone",
  "mobile",
  "bio",
  PROFILE_COLUMN_RECEIVE_TRANSLATOR_CASE_REPLY_SLACK_DMS,
  "slack_message_defaults",
  "created_at",
  "updated_at",
].join(", ");
