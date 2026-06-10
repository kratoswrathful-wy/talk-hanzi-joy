# Bug Report：mxliff 匯出確認狀態在 Phrase 顯示為未確認

**日期**：2026-06-10  
**狀態**：已修  
**相關格式**：`.mxliff`（Phrase / Memsource）  
**樣本**：`I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff`（`m:level="2"`）

---

## 1. 症狀

1. 在我方 CAT 編輯器內將可編輯句段全部確認後匯出 `.mxliff`。
2. 匯出 XML 中可編輯句段已寫入 `m:confirmed="1"`、`target@state="final"`。
3. 將匯出檔上傳／開啟於 **Phrase（Memsource）** 後，句段仍顯示為**未確認**（空心圓，非綠色勾選）。
4. 同檔案中 **TM 鎖定**（`m:locked="true"`）句段，匯出後 `m:confirmed` 從原檔 `"2"` 被改為 `"0"`。

---

## 2. 根因

### 2.1 `m:level` 與 `m:confirmed` 的對應

Phrase mxliff 根元素帶 `m:level="N"`，表示本作業需確認到第 N 級。句段「已確認」的門檻為：

| `m:confirmed` | 在 `m:level="2"` 作業的意義 |
|---------------|------------------------------|
| `"0"` | 未確認 |
| `"1"` | 第一級確認（**未達本作業門檻**） |
| `"2"` | 第二級確認（Phrase 視為已確認） |

我方匯出邏輯寫死 `m:confirmed="1"`，Phrase 判定為未達 `m:level`，故全部顯示未確認。

### 2.2 匯入只認 `"1"`

匯入時僅 `m:confirmed === '1'` 才設 `status = 'confirmed'`，原檔 TM 預確認句段（`m:confirmed="2"`）匯入後顯示為未確認。

### 2.3 TM 鎖定句段匯出被覆寫

`m:locked="true"` 句段匯出時仍覆寫 `m:confirmed`，將原檔 `"2"` 改為 `"0"`。

---

## 3. 修正

| 觸點 | 修正 |
|------|------|
| `xliff-build-segments.js` 匯入 | `parseInt(m:confirmed) > 0` → `status = 'confirmed'` |
| `xliff-tag-pipeline.js` mxliff 匯出 | 讀根元素 `m:level`，已確認句段寫 `m:confirmed = String(m:level)` |
| `xliff-tag-pipeline.js` mxliff 匯出 | `m:locked="true"` 句段**跳過** `m:confirmed`／`m:level-edited`／`target@state` 覆寫 |
| `xliff-tag-pipeline.js` sdlxliff 匯出 | `seg.isLockedSystem` 句段不覆寫 `sdl:seg@conf`／`target@state` |

**編輯器互動**（同次變更）：禁止編輯列可點選、反白文字；批次操作略過時以 `showCatToast` 提示列號。

---

## 4. 驗收（白話）

1. 匯入樣本 mxliff（`m:level="2"`）。
2. TM 鎖定句段（橘底 ⛔）應顯示**已確認**。
3. 將可編輯句段全部確認後匯出。
4. 記事本開匯出檔：
   - 可編輯且已確認句段：`m:confirmed="2"`（非 `"1"`）、`target@state="final"`。
   - TM 鎖定句段：保留原 `m:confirmed="2"`（未被改為 `"0"`）。
5. Phrase 開匯出檔：已確認句段顯示綠色勾選，非空心圓。

---

## 5. 與其他格式對照

| 格式 | 確認狀態欄位 | 鎖定欄位 | 備註 |
|------|-------------|----------|------|
| mxliff | `m:confirmed`（對齊 `m:level`） | `m:locked="true"` | 本次修正 |
| mqxliff | `mq:status`、`commitinfo` | `mq:locked` | 既有邏輯，無需改 |
| sdlxliff | `sdl:seg@conf` | `mq:locked`（相容） | 鎖定句段匯出不覆寫 conf |
| xliff | `target@state` | 無原生鎖定 | 不納入禁止編輯規格 |

詳見 [`CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md) §6。
