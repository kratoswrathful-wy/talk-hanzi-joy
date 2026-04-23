# CAT 大改版與回溯紀錄（2026-04 下旬）

> 目的：在將 `main` 回溯至 **`5e424fd`** 之後，仍有一份可查的脈絡，方便**依序重建**當時想做的功能，並避免重踩初始化／TDZ／iframe 點擊等問題。  
> 相關偵錯文件（Claude Cowork）：  
> - `docs/bug-report_mqxliff-tag-issues.md`（較早，mqxliff／tag／搜尋高亮等）  
> - `docs/bug-report_bug5-init-crash.md`（較晚，部署後點檔案／TM／TB、`sfFilterSnapshotSegIds` TDZ 等）

---

## 一、時間線與 Commit 對照（由舊到新）

| Hash（簡寫） | 說明 |
|--------------|------|
| **`5e424fd`** | **綠框「大改版」**：準則兩欄、檔案類別移至 AI 管理、互斥群、句段寫入保護與多選等（見第二節）。 |
| `36fca56` | 作業備忘、專案／檔案附件、批次 USD、團隊版 RPC、Dexie v16、Supabase 遷移、`cat-cloud-rpc` 等（見第三節）。 |
| `0adcb94` | 團隊 iframe：RPC 回覆、檔案清單委派、TM/TB tbody 委派、附件摺疊與檔案選擇器、`openEditor` catch 等。 |
| `be228e7` | 將 `editorUndoStack` 等編輯器 `let` 提前，避免 `openEditor` 與檔名委派 TDZ。 |
| `4b5c8a8` | 將 SF 篩選狀態、`tagsExpanded`／`tagGroupInsertMode`、`bindTmTbResourceRowClicksOnce` 前移；`loadDashboardData` try/catch；仍未能穩定修復連環問題。 |

回溯 **A 方案**後，`main` 的程式 tree 應等於 **`5e424fd`**（若另加「本文件」之 docs commit，則為其上一筆）。

---

## 二、大改版 `5e424fd`（目標與範圍）

**Commit 標題（摘要）**  
`CAT：準則兩欄、檔案類別移至 AI 管理、互斥群、句段寫入保護與多選`

**變更規模（`git show --stat`）**  
- `cat-tool/app.js`、`public/cat/app.js`：約 +527 / -524 行級別的重排與邏輯變更  
- `cat-tool/index.html`、`public/cat/index.html`：約 +51 / -51  
- `cat-tool/style.css`、`public/cat/style.css`：+30 行  

**推測的產品目標（由標題與檔案歸納）**  
1. **準則兩欄**：AI 準則／文風或類似設定的雙欄或版面調整。  
2. **檔案類別移至 AI 管理**：與 AI 設定或專案檔案分類相關的 UI／資料流調整。  
3. **互斥群**：某種互斥選項（例如 TM 寫入／角色／選項群）的邏輯或 UI。  
4. **句段寫入保護與多選**：編輯器內對句段寫入權限、批次多選行為的強化（與後續 mqxliff 角色、確認流程可能連動）。

**策略／作法（高層）**  
- 以單一大 commit 集中改動 `app.js` 主流程、index 結構與樣式，屬「一次到位」式改版，**與後續 `36fca56` 的超大功能疊加**後，除錯難度顯著上升。  
- 若日後重建，建議改為：**小步 commit + 每步可部署驗證**，並與團隊／iframe 行為分開 merge。

**與較早那份 Claude 報告的關係**  
`docs/bug-report_mqxliff-tag-issues.md` 所記之 **mqxliff／tag／匯入匯出／搜尋高亮** 等問題，部分在 **`36fca56` 仍觸及 `xliff-import.js`、`xliff-tag-pipeline.js`、`app.js`**（該 commit 統計內含這些檔案）。亦即：**大改版與後續大作業備忘 commit 並非完全獨立**，重建時應一併閱讀該報告中的架構表與 Bug 編號。

---

## 三、`36fca56`：作業備忘、附件、團隊 RPC（第二次大塊）

**重點（摘自 commit message）**  
- Dexie **v16**：`fileWorkMemos`、`projectAttachments`、`fileAttachments`；備忘歷程與容量相關常數。  
- 編輯器「作業備忘」分頁、整理備忘精靈、附件解析（txt/xlsx/docx + mammoth）。  
- 翻譯 prompt 帶入備忘；本批 `termMatches` 術語子集；批次對話框粗估 USD。  
- 專案詳情附件區、檔案列折疊附件；**`parseId` 支援團隊 UUID**。  
- Supabase 遷移與 **`cat-cloud-rpc`** 對應 `db.*`；team 附件 base64 往返。  
- 同步 `public/cat`；並加入 **mqxliff 問題紀錄**（即 `bug-report_mqxliff-tag-issues.md`）與查詢腳本。

**風險**  
- 同時動到 **離線 IndexedDB、雲端 RPC、大段 `app.js` 初始化順序**，最容易與「DOMContentLoaded 內 `let`／`const` 宣告順序」「iframe 與父頁 RPC」交互出錯。

---

## 四、`0adcb94`：團隊 iframe 點擊修復嘗試

**重點**  
- `CatToolPage.tsx`：`CAT_CLOUD_RPC` 在 `user` 未就緒時仍回傳錯誤，避免 RPC 掛死。  
- 專案檔名開啟：`filesListBody` **事件委派**、文字節點經 `parent` 再 `closest`。  
- TM／TB：tbody **委派**名稱與更名，移除 `baseResourceList` 逐列綁定。  
- 附件摺疊、`label`+`sr-only` 檔案輸入；`openEditor` catch、`showMqRoleModal` DOM 缺失防護。  

**與後續問題的關係**  
- 委派會更早觸發 `openEditor`，若編輯器／搜尋相關 **`let`／`const` 仍宣告在檔案後段**，易觸發 **TDZ**（見第五節）。

---

## 五、`be228e7` / `4b5c8a8`：TDZ 與 init 防護嘗試

| Commit | 作法 |
|--------|------|
| `be228e7` | 將 `currentSegmentsList`、`editorUndoStack` 等 **PRO EDITOR** 的 `let` 移到 `pendingRemoteBySegId` 後方（「安全區」），避免檔名委派先於變數初始化。 |
| `4b5c8a8` | 將 **SF 引擎**相關 `let`、`tagGroupInsertMode`、`tagsExpanded`、`bindTmTbResourceRowClicksOnce` 整段前移；`loadDashboardData` **try/catch**；刪除重複宣告與第二段 TM/TB 綁定。 |

**仍遺留或新暴露的問題（回溯前觀察）**  
1. **`btnSfReplaceAll`（及一組 SF UI `const`）** 仍在 `syncSelectedRowIdsWithVisibleGrid` → `updateSfReplaceAllButtonLabel` **之後**才宣告，有 **`Cannot access 'btnSfReplaceAll' before initialization`** 的 TDZ 風險。  
2. **TM 清單點擊仍可能無反應**（TB 較正常）：可能與 `openTmDetail` 內未防 null、async 錯誤被吞、或改以 `#viewTM` 委派較穩等有關——**尚未在 main 上完成最後一輪修正**。  
3. **進入編輯器後多數按鈕失效**：典型於 **未捕獲錯誤打斷後續綁定／狀態**、或 **全螢幕／遮罩未關**、或 **連鎖 TDZ** 導致事件或 UI 未完整初始化；需搭配 **DevTools Console** 從「第一次紅字」往下追。  

**與 `bug-report_bug5-init-crash.md` 的對照**  
該報告已指出 **`sfFilterSnapshotSegIds` TDZ**、`bindTmTbResourceRowClicksOnce` 可能未執行、以及將 SF 狀態移入安全區等 **Fix A–D**；實作上已部分採納，但 **SF 的 DOM `const` 區**與 **btnSfReplaceAll** 仍未一併前移，故未完全閉環。

---

## 六、為何決定回溯（放棄在當前 main 上硬修）

- **連環錯誤**：TDZ、iframe、團隊 RPC、超大 `app.js` 單檔耦合，修一處暴露下一處。  
- **使用者影響**：線上無法穩定開檔、導覽與編輯器按鈕大量失效，優先恢復可營運版本。  
- **重建策略**：以 **`5e424fd` 為乾淨基底**，再從 **`backup/cat-main-before-revert-2026-04-23`（或同等備份分支）** 上 **cherry-pick／手動拆 PR**，每次只合一小塊並部署驗證。

---

## 七、後續重建建議（實務順序）

1. **凍結基線**：維持 `main` = `5e424fd`（＋可選：僅本 recovery 文件之 commit）。  
2. **備份分支**：保留 `4b5c8a8`（或含完整歷史之分支）供 `git diff` / `git cherry-pick -n`。  
3. **分模組回補**（範例順序，可依產品再調）：  
   - 團隊 RPC 與 `CatToolPage` 契約（自 `36fca56`／`0adcb94` 拆出）。  
   - Dexie schema 與 Supabase 遷移（自 `36fca56` 拆出，**前後需 migration 清單**）。  
   - 作業備忘／附件 UI（與 `attachment-parse.js` 分開 PR）。  
   - mqxliff／tag：依 `bug-report_mqxliff-tag-issues.md` 對照 `xliff-*` 與 `highlightCell` 路徑。  
   - 編輯器／SF：**所有**會被 `openEditor`、`renderEditorSegments`、`runSearchAndFilter` 讀到的 **`let`／`const`，一律早於**任何可能呼叫它們的 listener（含 `syncSelectedRowIdsWithVisibleGrid`）。  
4. **每步**：`npm run sync:cat`（若仍採雙目錄）、型別檢查、部署 staging 再合 `main`。

---

## 八、備份分支名稱（執行 A 方案時建立）

於回溯前建立（實際以當時 `HEAD` 為準）：  
`backup/cat-main-before-revert-2026-04-23` → 指向 **`4b5c8a8`**（回溯前之 `main`）。

---

*本文件於執行 `git reset --hard 5e424fd` 前後撰寫／提交，僅作歷史與重建用，不取代正式 PR 說明。*
