-- 工項 2：回填 review 指派 collab_row_id＋依 CAT 回寫 review_rows.taskCompleted
-- idempotent；無新表／新欄
-- 條件：cases.review_rows 非空，且同檔 review 指派 collab_row_id IS NULL

-- 1) 補 collab_row_id（優先同檔 linkedCatFileId；否則取該案第一列 id）
UPDATE public.cat_stage_assignments a
SET collab_row_id = sub.suggested_id
FROM (
  SELECT
    a2.id AS assignment_id,
    coalesce(
      (
        SELECT nullif(trim(r->>'id'), '')
        FROM public.cases c2
        CROSS JOIN LATERAL jsonb_array_elements(c2.review_rows) AS t(r)
        WHERE c2.id = f.related_lms_case_id
          AND nullif(trim(r->>'linkedCatFileId'), '') = f.id::text
        LIMIT 1
      ),
      (
        SELECT nullif(trim(r->>'id'), '')
        FROM public.cases c3
        CROSS JOIN LATERAL jsonb_array_elements(c3.review_rows) WITH ORDINALITY AS t(r, ord)
        WHERE c3.id = f.related_lms_case_id
        ORDER BY t.ord
        LIMIT 1
      )
    ) AS suggested_id
  FROM public.cat_stage_assignments a2
  JOIN public.cat_file_workflow_stages s
    ON s.id = a2.file_workflow_stage_id AND s.stage_kind = 'review'
  JOIN public.cat_files f ON f.id = a2.file_id
  JOIN public.cases c ON c.id = f.related_lms_case_id
  WHERE a2.collab_row_id IS NULL
    AND jsonb_typeof(c.review_rows) = 'array'
    AND jsonb_array_length(c.review_rows) > 0
) AS sub
WHERE a.id = sub.assignment_id
  AND sub.suggested_id IS NOT NULL
  AND a.collab_row_id IS NULL;

-- 2) 以 CAT review assignment／stage completed 回寫 review_rows[].taskCompleted
UPDATE public.cases c
SET review_rows = sub.new_rows
FROM (
  SELECT
    c2.id AS case_id,
    (
      SELECT jsonb_agg(patched.r ORDER BY patched.ord)
      FROM (
        SELECT
          elem.ord,
          CASE
            WHEN nullif(trim(elem.r->>'id'), '') IS NULL THEN elem.r
            ELSE jsonb_set(
              elem.r,
              '{taskCompleted}',
              to_jsonb(
                EXISTS (
                  SELECT 1
                  FROM public.cat_files f
                  JOIN public.cat_file_workflow_stages s
                    ON s.file_id = f.id AND s.stage_kind = 'review'
                  JOIN public.cat_stage_assignments a
                    ON a.file_id = f.id
                   AND a.file_workflow_stage_id = s.id
                   AND a.collab_row_id = nullif(trim(elem.r->>'id'), '')
                  WHERE f.related_lms_case_id = c2.id
                    AND (
                      a.workflow_status = 'completed'
                      OR s.status = 'completed'
                    )
                    AND (
                      nullif(trim(elem.r->>'linkedCatFileId'), '') IS NULL
                      OR nullif(trim(elem.r->>'linkedCatFileId'), '') = f.id::text
                    )
                )
              ),
              true
            )
          END AS r
        FROM jsonb_array_elements(c2.review_rows) WITH ORDINALITY AS elem(r, ord)
      ) AS patched
    ) AS new_rows
  FROM public.cases c2
  WHERE jsonb_typeof(c2.review_rows) = 'array'
    AND jsonb_array_length(c2.review_rows) > 0
) AS sub
WHERE c.id = sub.case_id
  AND sub.new_rows IS NOT NULL
  AND c.review_rows IS DISTINCT FROM sub.new_rows;
