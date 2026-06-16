# 1UP CAT／LMS 整合 UX — Git 摘要索引

> **完整主紀錄**見 Cursor 大計畫 **`1up_ux_與遷移_70701b21.plan.md`**（檔名保留；內容為 **UX 專用**，不含自研工具遷移）。  
> 上層：[`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.1。

## 快速狀態（2026-06-12）

| 項目 | 狀態 |
|------|------|
| 第二波 UX | 已落地 `7ae0fc5` |
| B+D2 `cat_tool_enabled` | 已落地 `a4acbc1` |
| UX 微調 + 專案名連結 | 已落地 `3fc97f1` |
| 加號 Plus 圖示 | 已驗收 `27d0585` |

## Commit 鏈

`7ae0fc5` → `a4acbc1` → `3fc97f1` → `27d0585` → `e0b48eb`

## 詳細章節（見大計畫）

- §2 第二波 UX
- §3 方案 B+D2
- §4–§6 UX 微調與加號
- §7 驗收紀錄
- §8 程式索引

## Phase A 收尾（同路線圖，非 UX 大計畫本體）

| 子項 | 狀態 | commit |
|------|------|--------|
| A-2 GS 匯入必選連結案件 | 已落地 | `ab04381` |
| A-5 未受派譯者全檔唯讀 | 已落地 | `ab04381` |

Phase A 全項已收尾，見主計畫 [`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.1。

## Phase B 收尾（2026-06-15，見專項規格）

| 子項 | 狀態 | commit／章節 |
|------|------|----------------|
| B-4 v5（migration、檔案清單逐行、LMS 雙向、譯者勾選驗證） | 已落地 | `e4a6205`；§11 |
| 開檔熱修（TDZ、`allSegments` 誤用） | 已落地 | `cee4b03`、`60e8526`；§11.7 |
| 更新作業檔×句段集 Modal | 已落地 | `76be7ee`；§11.8 |
| 任務完成按下驗證 | 已落地並驗收 | `d7232ab`；§11.9 |

完整規格與驗收：[`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md)。Phase C（追蹤修訂）仍規劃中。

## Phase B-6 規格定案（2026-06-15，文件 only）

| 決策 | 定案 |
|------|------|
| 準備中編輯 | 僅 PM+ 可編；譯者／審稿人唯讀 |
| 審稿完成 Slack | 暫不 |
| 單人多檔審稿聚合 | 暫不 |
| 舊已派出檔 | `prep` backfill 為準備完成 |

子規格：[`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md)（prep 閘門、審稿任務完成、Phase C 基準快照觸發點）。**程式尚未實作**。

## 相關檔案

- [`CAT_IMPORT_CASE_LINK_2026-06.md`](./CAT_IMPORT_CASE_LINK_2026-06.md) — A-1／A-2 匯入連結
- [`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) — Phase B 規格（**已落地** `e4a6205`～`d7232ab`）
- [`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) — Phase B-6（**規劃中**）
- [`CODEMAP.md`](./CODEMAP.md) — 1UP 子區塊路徑
