# Bug Report：LMS 下載附件時檔名變成 UUID（非原始檔名）

> 調查日期：2026-05-10  
> 專案：1UP TMS — LMS（React / Vite，`src/`）  
> 相關程式：[`src/components/FileField.tsx`](../src/components/FileField.tsx)、[`src/components/comments/CommentContent.tsx`](../src/components/comments/CommentContent.tsx)、[`src/lib/storage-case-files.ts`](../src/lib/storage-case-files.ts)

本文採雙層結構：**Part 1** 用白話說明現象與原因；**Part 2** 為技術細節與實作計畫，供維運／AI 日後查閱。

---

## Part 1 — 白話摘要

### 1.1 使用者看到什麼（現象）

- 在案件頁把「客戶準則」「追蹤修訂」等檔案上傳到系統後，**畫面上**顯示的仍是正確檔名（例如 `客戶準則.pdf`）。
- 但當使用者用瀏覽器「另存新檔」或從新分頁儲存檔案時，**存到電腦裡的檔名**常變成一串亂碼（UUID），例如 `5c033208-9d30-4cf8-8243-1976fdb69c3b.png`。
- 留言裡用迴紋針附加的檔案也有相同狀況。

### 1.2 白話結論：問題出在哪裡

可以把流程想成兩段：

1. **系統怎麼存檔**：為了避免檔名衝突與 Storage 路徑字元限制，實際存在雲端（Supabase Storage）的路徑刻意用 **隨機 ID**（見 `buildCaseFileObjectPath` / `buildCaseFilePathWithPrefix`）。這是**刻意的**，不是 bug。
2. **使用者怎麼下載**：畫面上用 `<a href="公開網址" target="_blank">` 讓使用者點開。瀏覽器在「另存」時，**預設用網址最後一段**當建議檔名，所以會變成 UUID；**不會**自動改用畫面上顯示的那個 `name` 欄位。

另外：HTML 的 `download="檔名"` 屬性在**連到別的網域**（例如 `*.supabase.co`）時，多數瀏覽器會**忽略**，無法只靠加屬性解決。

### 1.3 修正後行為（概要）

- 對「本專案上傳到 Supabase `case-files`」的連結，提供**明確的下載動作**：先在背景把檔案抓成一份暫存資料，再用程式指定「存檔時要用顯示名稱／上傳時的檔名」。
- 一般「純網址、不是本 bucket 上傳」的連結仍維持用新分頁開啟即可（避免跨站 `fetch` 被 CORS 擋住）。

---

## Part 2 — 技術細節與調查過程

### 2.1 根因

| 元件 | 行為 | 後果 |
|------|------|------|
| `FileField` | `<a href={item.url} target="_blank">` 顯示 `{item.name}` | 另存時檔名取自 URL path 末段（UUID.ext） |
| `CommentContent`（`fileUrls`） | 同上 | 同上 |

`FileItem` 上傳成功時已正確寫入 `name: file.name` 與 `url: publicUrl`（見 `FileField.tsx` 上傳迴圈）。問題在**下載語意**，不在資料是否遺失檔名。

### 2.2 為何不能用 `<a download={name}>` 單獨解決

`download` 屬性對 **cross-origin** 連結通常無效（仍由遠端 `Content-Disposition` 或 URL 決定）。Supabase Storage 公開 URL 與 LMS 前端不同源，故需 **fetch → Blob → `blob:` URL → 觸發下載**（此時 `download` 對同源 blob 有效）。

### 2.3 受影響範圍（掃描摘要）

- **主要**：凡使用 `FileField` 的欄位（案件客戶準則、自製準則、追蹤修訂、內部備註參考檔、範本檔等）。
- **主要**：留言附件 chip（`CommentContent` 的 `fileUrls`）。
- **非本次「下載檔名」範圍**：案件／稿費單「客戶案件單連結」使用 `label \|\| url`，若未填 label 會**畫面上**露出長 URL（顯示問題）；富文字編輯器（BlockNote）內嵌檔案連結需另案。

### 2.4 實作（已落地）

1. 共用函式 [`src/lib/download-file.ts`](../src/lib/download-file.ts)：`downloadFile(url, fileName)`、`sanitizeDownloadFileName` — `fetch` → `blob` → 暫時 `objectURL` → `<a download>` → `revokeObjectURL`。
2. `FileField`（兩階段）：
   - **第一階段**：對 `item.url` 含 `/storage/v1/object/` 的項目另加下載按鈕（hover 顯示與編輯／刪除一致）呼叫 `downloadFile`；進行中禁用下載；失敗時 `toast.error`。
   - **第二階段**：同一條 Storage 列的**顯示檔名**改為 `<button>`，點擊與下載按鈕相同呼叫 `handleDownloadItem`（不再以檔名開新分頁，避免另存成 UUID）；**非 Storage**（貼上網址等）檔名仍為 `<a target="_blank">`。
3. `CommentContent`：附件改為 `button` + `Download` 圖示，點擊呼叫 `downloadFile`；失敗時 `toast.error` 並 `window.open` 後備。

### 2.5 驗收（白話）

1. 在案件頁上傳一個檔名可辨識的 PDF 到「客戶準則」：**點藍色檔名**或點**下載圖示**，下載建議檔名應與列表顯示名稱一致（或可編輯後的顯示名稱）。
2. 在留言用迴紋針附檔，送出後點附件，下載檔名應為顯示名稱。
3. 「貼上網址」的非 Storage 連結：點檔名仍為新分頁開啟，不強制走 blob 下載。

**取捨**：Storage 列無法再以「點檔名」一鍵在新分頁預覽；若需預覽須另加「在新分頁開啟」控制（未實作）。

---

## 相關文件

- [`AGENTS.md`](../AGENTS.md) — 文件索引  
- [`src/lib/storage-case-files.ts`](../src/lib/storage-case-files.ts) — Storage 路徑為 UUID 的設計說明
