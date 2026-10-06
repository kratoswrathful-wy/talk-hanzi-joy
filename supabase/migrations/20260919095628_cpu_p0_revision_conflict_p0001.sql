-- CPU-P0：十個 private impl 的人為版本衝突 RAISE，errcode 40001 → P0001。
-- 訊息 case_revision_conflict 不變。不改 wrapper／ACL／版本比較／owner／GRANT。
-- 僅允許用精確簽名限定的這十個函式；禁止整庫全域替換。
-- 已套用則略過（兩處已是 P0001）。與正式定義不符則中止。

DO $patch$
DECLARE
  r record;
  olddef text;
  newdef text;
  compact_old constant text := $c$errcode='40001', message='case_revision_conflict'$c$;
  compact_new constant text := $c$errcode='P0001', message='case_revision_conflict'$c$;
  spaced_old constant text := $s$errcode = '40001', message = 'case_revision_conflict'$s$;
  spaced_new constant text := $s$errcode = 'P0001', message = 'case_revision_conflict'$s$;
  n_compact int;
  n_spaced int;
  n_p0001 int;
  n_total int;
  patched int := 0;
  skipped int := 0;
BEGIN
  PERFORM set_config('statement_timeout', '30s', true);

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname IN (
        'accept_inquiry_collab_row_impl',
        'accept_public_inquiry_case_impl',
        'complete_case_collab_row_impl',
        'complete_case_review_row_impl',
        'complete_case_translation_impl',
        'decline_public_inquiry_case_impl',
        'pm_complete_case_translation_impl',
        'revoke_case_participant_access_impl',
        'update_case_credentials_impl',
        'update_case_permitted_fields_impl'
      )
    ORDER BY p.proname
  LOOP
    olddef := pg_get_functiondef(r.oid);
    n_compact := (length(olddef) - length(replace(olddef, compact_old, ''))) / length(compact_old);
    n_spaced := (length(olddef) - length(replace(olddef, spaced_old, ''))) / length(spaced_old);
    n_p0001 :=
      (length(olddef) - length(replace(olddef, compact_new, ''))) / length(compact_new)
      + (length(olddef) - length(replace(olddef, spaced_new, ''))) / length(spaced_new);
    n_total := n_compact + n_spaced;

    IF n_total = 0 AND n_p0001 = 2 THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF n_total <> 2 THEN
      RAISE EXCEPTION 'cpu_p0_p0001: %.%(%) has % 40001 revision-conflict sites, expected 2',
        'private', r.proname, r.identity_args, n_total;
    END IF;

    newdef := replace(replace(olddef, compact_old, compact_new), spaced_old, spaced_new);

    IF newdef = olddef
       OR position(compact_old in newdef) > 0
       OR position(spaced_old in newdef) > 0 THEN
      RAISE EXCEPTION 'cpu_p0_p0001: % replace failed', r.proname;
    END IF;

    IF (length(newdef) - length(replace(newdef, compact_new, ''))) / length(compact_new)
       + (length(newdef) - length(replace(newdef, spaced_new, ''))) / length(spaced_new)
       <> 2 THEN
      RAISE EXCEPTION 'cpu_p0_p0001: % does not have exactly 2 P0001 sites after replace', r.proname;
    END IF;

    EXECUTE newdef;
    patched := patched + 1;
  END LOOP;

  IF patched + skipped <> 10 THEN
    RAISE EXCEPTION 'cpu_p0_p0001: touched % functions, expected 10', patched + skipped;
  END IF;
END
$patch$;
