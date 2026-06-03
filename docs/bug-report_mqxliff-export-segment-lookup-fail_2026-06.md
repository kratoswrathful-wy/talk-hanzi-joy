# Bug Report：mqxliff 匯出時句段查找失敗，譯文未寫回 XML

> 調查：2026-06-03｜第二版修正：2026-06-03  
> 專案：1UP TMS — CAT 內嵌  
> 觸點：[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)、[`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)、[`cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)

---

## Part 1 — 白話摘要

### 1.1 現象

- 編輯器內譯文正確（含 AI 翻譯、已確認）。
- 匯出 `Translated_*.mqxliff` 後，`<target>` 仍是**第一次匯入**的內容（常見原文照貼），**確認狀態（mq:status）也回到舊檔**。
- 遊戲對話 mqxliff 常見：`idValue`／Key 為對話路徑，`額外資訊` 含 hash、`Sheet: …`。

### 1.2 根因（第二版釐清）

| 欄位 | 內容 | 用途 |
|------|------|------|
| `trans-unit@id` | hash | **匯出 XML 查找鍵** |
| `idValue` | `x-mmq-context` 全文（對話路徑等） | 編輯器 Key、**更新作業檔比對** |
| hash 等 | 常在 `extraValue` | 額外資訊欄 |

匯出用 `tu.id` 查 map，map 卻主要用 `idValue` 建索引 → **對不到** → `if (!seg) return` 整句跳過 → 譯文與 `mq:status` 皆不寫入。

**第一版修復（`b0e7f5e` first-line）不足**：假設 `idValue` 第一行 = hash；實務上 **idValue 第一行常是對話路徑，不是 hash**。

查找失敗時確認狀態一併丟失，是因為 `updateMqxliffStatus` 與 `target@state` 都在找到 `seg` 之後才執行。

### 1.3 第二版修正（概要）

1. **匯入**寫入 `xliffTuId` = `trans-unit` 的 `id`（與 `idValue` 分離）。
2. **匯出** `buildSegmentExportLookupMap`：`xliffTuId`、`idValue` 全文與各行、`globalId`；查找時再試 `id`／`resname`／`mq:unitId`；最後手段 `globalId` 序號對齊。
3. **Team DB** 欄位 `xliff_tu_id`（migration `20260603120000`）。
4. **匯出前警示**：有 N 句對不到時 Modal，避免靜默匯出舊 XML。

### 1.4 驗收（既有專案）

1. 部署程式 + `supabase db push`。
2. Ctrl+F5 重開 CAT。
3. 用目前作業 mqxliff **再跑一次「更新作業檔」**（寫入 `xliffTuId`）。
4. 匯出；不應出現大量「N 句無法對應」；抽查 `<target>` 與確認狀態與編輯器一致。

---

## Part 2 — 技術細節

### 2.1 匯入

```javascript
idValue: keyFromContext || fallbackId,
xliffTuId: fallbackId,
```

### 2.2 匯出查找（第二版）

- `registerSegmentExportKeys` / `findSegmentForTransUnit` / `countXliffExportLookupMisses`
- 取代僅 `idValue` + first-line 的 `b0e7f5e` 邏輯

### 2.3 資料庫

- `supabase/migrations/20260603120000_cat_segments_xliff_tu_id.sql`
- `apply_cat_segments_patch_batch` 支援 `xliff_tu_id`

### 2.4 相關文件

- [`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) §4.5
- `.cursor/rules/xliff-tag-export.mdc`
