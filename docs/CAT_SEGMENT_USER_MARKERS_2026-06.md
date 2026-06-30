# CAT 編輯器：個人句段色點（Phase 2.3k）

> **狀態**：**Phase 2.3k 規劃中**（與大檔 virt 修正同批）  
> **觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/db.js`](../cat-tool/db.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)  
> **相關**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.14

---

## Part 1 — 白話

譯者可在每個句段旁加上**個人**小色點（紅／藍／橘／灰／紫），一列可掛**多色**，作為書籤或進度標記。色點**不寫入** XLIFF、不影響他人譯文，僅供自己辨識與**進階篩選**。

- **本機版**：存於瀏覽器 IndexedDB（Dexie v27 `userSegmentMarkers`）。
- **團隊版**：同時存 Supabase `cat_user_segment_markers`，可跨裝置／跨伺服器讀寫（RLS 僅本人）。

---

## Part 2 — 技術規格

### 2.1 五色 enum

`red` | `blue` | `orange` | `grey` | `purple`

### 2.2 本機（Dexie v25）

表 `userSegmentMarkers`：

| 欄位 | 說明 |
|------|------|
| `fileId` | 檔案 id（number 或 uuid 字串） |
| `segmentId` | 句段 id |
| `colors` | `string[]`，子集於五色 |
| `updatedAt` | ISO 時間 |

索引：`[fileId+segmentId]` 複合唯一。

`DBService`：`getUserSegmentMarkersByFile`、`upsertUserSegmentMarker`、`deleteUserSegmentMarker`（colors 空陣列時刪列）。

### 2.3 雲端（Team）

```sql
cat_user_segment_markers (
  user_id uuid → profiles,
  file_id uuid → cat_files,
  segment_id uuid → cat_segments,
  colors text[] not null default '{}',
  updated_at timestamptz,
  primary key (user_id, file_id, segment_id)
)
```

RLS：`user_id = auth.uid()`（比照 `cat_private_notes`）。

RPC：`db.getUserSegmentMarkersByFile`、`db.upsertUserSegmentMarker`。

### 2.4 執行期 Map

開檔後 `_userSegmentMarkerMap: Map<segmentId, colors[]>`；`buildGridDataRow` 讀 Map 渲染 `.seg-user-markers`。

### 2.5 UI

- **位置**：狀態欄（`.col-status`）內、確認圖示左側。
- **操作**：點色點區開選單（或右鍵）勾選／取消多色；即時 upsert。
- **CSS**：`.seg-user-marker-dot` + `--marker-red` 等。

### 2.6 篩選

進階篩選 `#sfMarkerFilterRow`：五色 checkbox，**OR**（任選色與句段 colors 交集非空即命中）。納入 `getSfFilterSpecHash`、`evaluateSegment` 第五維 `markerColors`。

### 2.7 驗收

1. 本機加紅+藍兩點 → 重開檔仍在。
2. Team 另一瀏覽器開同一檔 → 色點一致。
3. 篩選「含紅色」→ 僅留有紅點列。
4. 移除色點 → 雲端／本機同步更新。
5. 匯出 XLIFF／Workflow 不受影響。
