# CAT 編輯器：個人句段色點（Phase 2.3k → 2.3l）

> **狀態**：**Phase 2.3m 已實作，待 Claude AI 驗收**（2026-07-01）
> **觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/db.js`](../cat-tool/db.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)、[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)  
> **相關**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.12

---

## Part 1 — 白話

譯者可在每個句段旁加上**個人**小色點（**紅／黃／藍／紫**），一列可掛**多色**，作為書籤或進度標記。色點**不寫入** XLIFF、不影響他人譯文，僅供自己辨識與**進階篩選**。

- **本機版**：存於瀏覽器 IndexedDB（Dexie v27 `userSegmentMarkers`）。
- **團隊版**：Supabase `cat_user_segment_markers`，**同帳號**可跨瀏覽器／裝置（RLS 僅本人）。
- **Phase 2.3l**：四色 2×2 排列於確認綠圈上方（9px）；進階篩選列分隔線＋色點圖示；右鍵批次附加／移除；**橘／灰已移除**（讀取時 strip，不轉換）。

---

## Part 2 — 技術規格

### 2.1 四色 enum（2.3l）

`red` | `yellow` | `blue` | `purple`

（2.3k 的 `orange`／`grey` 已廢止；載入與 upsert 時 filter 掉。）

### 2.2 本機（Dexie v27）

表 `userSegmentMarkers`：`fileId`、`segmentId`、`colors[]`、`updatedAt`。索引 `[fileId+segmentId]`。

`DBService.upsertUserSegmentMarker` 正規化為四色子集；空陣列刪列。

### 2.3 雲端（Team）

`cat_user_segment_markers`（`user_id`, `file_id`, `segment_id`, `colors text[]`）。RPC 讀寫時同樣 filter 四色。

### 2.4 執行期 Map

`_userSegmentMarkerMap: Map<segmentId, colors[]>`；`buildStatusColumnHtml` = 色點 + 確認圖示。

### 2.5 UI（2.3l）

| 項目 | 規格 |
|------|------|
| 位置 | `.col-status` 直向：上方 2×2 色點，下方 Workflow 綠圈；**欄寬 56px、內容置中** |
| 尺寸 | `.seg-user-marker-dot` **9×9px**（原 7px 之 1.3 倍） |
| 右緣 | 與相符度欄相同 `#e2e8f0` 灰實線 |
| 點擊 | 各 dot 切換該色 on/off；**樂觀更新**（瞬間 DOM，背景 upsert） |
| 右鍵 | 多選句段 → 「附加／移除（X色圓點）」；**全部**已有該色 → 移除，**任一**沒有 → 附加 |

### 2.6 篩選

`#sfMarkerFilterRow`：與「內部流程」同型分隔線 + 粗體「個人色點」；checkbox 以 `.sf-marker-filter-dot` 顯示，無文字 label。OR 邏輯不變。

### 2.7 驗收（2.3l）

1. 四色 2×2 + 9px DOM 量測。
2. 點擊切換 + 右鍵批次附加／移除邏輯。
3. Team upsert + reload 持久化。
4. 篩選「紅」僅留有紅點列。
5. 舊資料含橘／灰 → 開檔後不顯示。

### 2.8 第一輪驗收紀錄（2.3k，2026-06-30）

五色 UI、Supabase、篩選「紅」通過；見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.11。

### 2.9 Phase 2.3l 變更摘要

- `USER_MARKER_COLORS` → 四色；`normalizeUserMarkerColors()`。
- `batchSetUserSegmentMarkerColor()` + context menu。
- CSS：`.col-status` column、`.seg-user-markers` grid 2×2、`.sf-adv-status-row-markers` 分隔線。

### 2.10 Phase 2.3m — 樂觀更新與 UI 微調

- `toggleUserSegmentMarkerColor`：更新 `_userSegmentMarkerMap` → `refreshUserMarkerStatusCell` → `void upsert`；失敗還原 + `showCatToast`。
- `batchSetUserSegmentMarkerColor`：同上，批次先全量 DOM 再背景 `Promise.all`。
- 多選右鍵：`_ctxMenuSelectionSnapshot` 避免 `focusin` 清掉多選。
- 審稿確認外圈：`box-shadow` 外環 **2px**。

### 2.11 驗收（2.3m）

1. 色點點擊瞬間變色（無明顯等待）。
2. 多選右鍵附加／移除色點作用於**全部**已選句段。
3. 狀態欄內容置中、右緣分隔線可見。

---

## 開發時序

| 日期 | 事項 |
|------|------|
| 2026-06-30 | Phase 2.3k 五色 + Supabase（`3d6030d`） |
| 2026-06-30 | Phase 2.3l 四色改版 + 右鍵批次 + 橘灰移除；**第一輪部分通過** |
| 2026-07-01 | Phase 2.3m 樂觀更新 + 狀態欄 UI + 多選右鍵修正；**待驗收** |
