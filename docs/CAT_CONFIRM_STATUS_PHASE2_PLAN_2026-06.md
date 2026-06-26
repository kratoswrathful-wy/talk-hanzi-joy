# CAT 確認狀態 Phase 2 — 顯示統一、存量修復與完整驗收（2026-06）

> **狀態**：**2.1／2.2 已實作**；§2.3–2.4 待產品驗收  
> **前置**：Phase 1 已落地並初步驗收（[`CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md`](./CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md) `9ef343b`）  
> **關聯 bug-report**：[`bug-report_segment-confirm-status-wf-inconsistency_2026-06.md`](./bug-report_segment-confirm-status-wf-inconsistency_2026-06.md)

---

## 1. Phase 1 與 Phase 2 邊界

| Phase | 已完成 | Phase 2 補強 |
|-------|--------|--------------|
| 1 | 阻止新矛盾（file-update、遠端撤銷、開檔靜默修正） | — |
| 1 | 篩選改走顯示狀態 | 套色／memoQ 符號仍讀 `status` → **2.1 統一** |
| 1 | 批次確認 UX | 單句 Ctrl+Enter 仍走舊路徑 → **2.5 可選** |
| — | — | DB 存量矛盾列 → **2.2 backfill** |
| — | — | 更新作業檔／Team 雙人 → **2.3–2.4 驗收** |

---

## 2. 實作項目

### 2.1 顯示邏輯統一（方案 A）

**目標**：套色、memoQ  overlay 與篩選／進度條讀同一套「顯示狀態」規則。

**程式**（[`cat-tool/app.js`](../cat-tool/app.js)）— **已實作**：

- `_segShowsConfirmedRowStyle(seg)` — `orig_confirmed`、`trans_confirmed`、`review_confirmed`、`post_review_trans` 套綠底
- `_segShowsMqOverlay(seg)` — 同上四態 + `orig_confirmed` 顯示 memoQ 符號（mqxliff）
- `syncRowConfirmedStateClass`、`buildStatusCellHtml` 已改呼叫上述 helper

### 2.2 DB 存量 backfill

**腳本**：[`scripts/reconcile-cat-segment-wf-status.mjs`](../scripts/reconcile-cat-segment-wf-status.mjs) — **已實作**（需 `--apply` 於維運環境執行）

**條件**（與 bug-report §2.3 一致）：

```sql
status = 'unconfirmed'
AND wf_trans_confirmed_at IS NOT NULL
AND COALESCE(wf_review_revoked_pending, false) = false
```

**`--apply` 動作**：清除 `wf_trans_confirmed_at`、`wf_trans_confirmed_by`（保留審稿後再編輯合法中間態）。

**用法**：

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
node scripts/reconcile-cat-segment-wf-status.mjs
node scripts/reconcile-cat-segment-wf-status.mjs --apply
```

環境變數：`SUPABASE_URL`（或 `VITE_SUPABASE_URL`）、`SUPABASE_SERVICE_ROLE_KEY`。

### 2.3 更新作業檔回歸驗收（待產品）

1. 開啟 Team 專案內任一 **mqxliff**，確認若干句段（含 Workflow 翻譯確認）
2. 匯出或準備新版原始檔，執行 **更新作業檔**，使其中一句**譯文有變**
3. 預期：該句 `status = unconfirmed`，且 `wf_trans_confirmed_at` 為空
4. 編輯器：無綠點＋無套色分裂；篩選「內部流程 → 未確認」可篩到

### 2.4 Team 雙人協作驗收（待產品）

1. 帳號 A、B 同時開啟同一 Team 檔案
2. A 修改某**已確認**句段譯文並存檔
3. B 畫面該句確認狀態應撤銷（無實心綠點套色一致）
4. B 不應在不知情下把舊 wf 時間戳寫回 DB

若仍偶發分裂 → 列 Phase 2b：確認狀態變更廣播（輕量通知 + 重讀 DB）。

### 2.5 可選（Phase 2 末或 Phase 3）

| 項目 | 說明 |
|------|------|
| 篩選 `orig_confirmed` | 內部流程新增「原檔確認」 |
| 舊篩選 preset 相容 | `confirmed`/`unconfirmed` key 遷移提示 |
| 單句 Ctrl+Enter 加速 | TM 並行／減少冗餘 DB 寫入 |

---

## 3. Phase 2 完成定義

- [x] 套色、memoQ、篩選、進度對同句不再分裂（2.1 已實作）
- [ ] backfill `--dry-run` 全庫統計 + `--apply` 或確認 0 筆（腳本已備，待維運執行）
- [ ] §2.3、§2.4 產品驗收通過
- [ ] bug-report 升級為 **已修並完整驗收**

---

## 4. 程式觸點

| 檔案 | 變更 |
|------|------|
| [`cat-tool/app.js`](../cat-tool/app.js) | 2.1 顯示 helper |
| [`scripts/reconcile-cat-segment-wf-status.mjs`](../scripts/reconcile-cat-segment-wf-status.mjs) | 2.2 backfill |

---

## 5. 驗收紀錄（待產品填寫）

| 項目 | 日期 | 結果 | 備註 |
|------|------|------|------|
| §2.3 更新作業檔 | — | 待驗 | |
| §2.4 Team 雙人 | — | 待驗 | |
| backfill `--dry-run` 全庫 | — | 待執行 | 維運環境需 `SUPABASE_*` |
| backfill `--apply` | — | 待執行 | dry-run 0 筆或確認後再 apply |

驗收通過後：更新 bug-report §2.5 第 2、3 項為 **已驗**，狀態改 **已修並完整驗收**。

---

## 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-26 | 初稿：Phase 2 範圍、backfill、待驗清單 |
| 2026-06-26 | 2.1 顯示 helper、2.2 backfill 腳本落地；§2.3–2.4 驗收步驟待產品 |
