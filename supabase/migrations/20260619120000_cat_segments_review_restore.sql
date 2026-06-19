-- B-7g：審稿確認回溯快照與中間態旗標
ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS wf_review_restore_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS wf_review_revoked_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cat_segments.wf_review_restore_snapshot IS 'B-7g: 審稿確認當下快照（targetCanonical、wf_*、confirmation_role）';
COMMENT ON COLUMN public.cat_segments.wf_review_revoked_pending IS 'B-7g: 審稿確認後譯者再編輯中間態';
