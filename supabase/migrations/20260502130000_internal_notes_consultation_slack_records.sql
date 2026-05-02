-- Track which user_ids have been sent a "note reminder" Slack DM for this note (same idea as cases.inquiry_slack_records).
ALTER TABLE public.internal_notes
ADD COLUMN IF NOT EXISTS consultation_slack_records jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.internal_notes.consultation_slack_records IS 'Array of profile user_ids (UUID strings) who received a note reminder Slack DM for this note.';
