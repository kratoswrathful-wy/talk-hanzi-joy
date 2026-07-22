-- 工項 4：completed→in_progress 一律擋（除非 p_allow_downgrade）
-- 對齊 cat-tool/js/wf-assignment-sync-policy.js
-- 反向路徑仍允許 completed→assigned（stage 已非 completed）；in_progress 例外收緊
-- idempotent REPLACE；upsert 簽名不變

CREATE OR REPLACE FUNCTION public.cat_resolve_effective_upsert_workflow_status(
  p_stage_status text,
  p_existing_status text,
  p_requested_status text,
  p_allow_downgrade boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_existing text := coalesce(nullif(trim(p_existing_status), ''), '');
  v_requested text := coalesce(nullif(trim(p_requested_status), ''), 'assigned');
  v_stage text := coalesce(nullif(trim(p_stage_status), ''), '');
  v_allow boolean := coalesce(p_allow_downgrade, false);
BEGIN
  -- 2026-07-14：stage 仍 completed 時禁止洗回
  IF v_existing = 'completed'
     AND v_requested IS DISTINCT FROM 'completed'
     AND v_stage = 'completed'
     AND NOT v_allow THEN
    RETURN 'completed';
  END IF;

  -- 工項 4：completed→in_progress 一律擋（即使 stage 已非 completed）
  IF v_existing = 'completed'
     AND v_requested = 'in_progress'
     AND NOT v_allow THEN
    RETURN 'completed';
  END IF;

  -- 等級防降級；反向路徑：stage 已非 completed 時允許自 completed 降回 assigned
  IF public.cat_wf_status_rank(v_requested) < public.cat_wf_status_rank(v_existing)
     AND NOT v_allow THEN
    IF v_existing = 'completed' AND v_stage IS DISTINCT FROM 'completed' THEN
      RETURN v_requested;
    END IF;
    RETURN v_existing;
  END IF;

  RETURN v_requested;
END;
$$;

COMMENT ON FUNCTION public.cat_resolve_effective_upsert_workflow_status IS
  '工項4：completed→in_progress 無 allow_downgrade 一律擋；反向路徑仍允許 completed→assigned';
;