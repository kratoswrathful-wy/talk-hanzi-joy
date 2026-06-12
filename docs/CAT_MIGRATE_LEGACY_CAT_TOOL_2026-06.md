# 自研工具 → 1UP CAT 遷移（速查）

> **完整規格、歷程、第一批套用結果與暫停決策**見 Cursor 大計畫 **`1up_ux_與遷移`** §7，或 Git 摘要 [`CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md`](./CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md)。

## 現況（2026-06-11）

- **第一批已套用**：24 案移除自研工具列；4 案新寫入 `cat_files` 連結
- **暫停**：其餘 41 案待人工／下一批
- 事後報告（本機）：`scripts/.cache/migrate-case-tools-report-2026-06-11T23-55-31-874Z.*`

## 指令

```powershell
npm run migrate:case-cat-links              # dry-run
npm run migrate:case-cat-links:apply        # 需 SUPABASE_SERVICE_ROLE_KEY
node scripts/generate-migrate-apply-sql.mjs scripts/.cache/migrate-case-tools-report-<timestamp>.json
node scripts/apply-migrate-case-tools-report.mjs scripts/.cache/migrate-case-tools-report-<timestamp>.json
```

## 腳本

| 檔案 | 用途 |
|------|------|
| `scripts/migrate-case-tools-to-cat-links.mjs` | 掃描 + dry-run / `--apply` |
| `scripts/compose-migrate-prefetch.mjs` | 離線 prefetch |
| `scripts/generate-migrate-apply-sql.mjs` | 由報告產 SQL |
| `scripts/apply-migrate-case-tools-report.mjs` | 依報告套用 |

環境變數：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（見 `scripts/backfill-cat-original-files.mjs` 說明）。
