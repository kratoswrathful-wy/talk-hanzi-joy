/**
 * Canonical `profiles` column names and SELECT list for Supabase queries.
 * Use these instead of `select("*")` so PostgREST never relies on a stale schema
 * and typos like `receive_translator_case_reply_slack_cms` cannot slip into app code.
 */
export const PROFILE_COLUMN_RECEIVE_TRANSLATOR_CASE_REPLY_SLACK_DMS =
  "receive_translator_case_reply_slack_dms" as const;

/**
 * All columns the app reads from `profiles` (matches DB migration / types).
 * 保持為字面量常數（非 array.join() 動態組出的一般 string）：Supabase-js 只有在
 * .select() 收到字面量型別字串時才能從 Database 型別精確推導 Row 形狀，
 * 動態 string 會退回 GenericStringError，逼呼叫端用 as unknown as 繞過。
 */
export const PROFILE_SELECT_COLUMNS =
  `id, email, display_name, avatar_url, timezone, status_message, phone, mobile, bio, ${PROFILE_COLUMN_RECEIVE_TRANSLATOR_CASE_REPLY_SLACK_DMS}, slack_message_defaults, is_test, created_at, updated_at` as const;
