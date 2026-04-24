---
name: 主計畫納入 TM 游標
overview: 將使用者「第九點」（TM 搜尋結果互動、Ctrl+數字、Ctrl+K 焦點、假游標、Ctrl+0）寫入 [cat_工具綜合改版_42ac9451.plan.md](c:/Users/WeiYi/.cursor/plans/cat_工具綜合改版_42ac9451.plan.md)：以**新第 11 節**避免與既有「第 9 節（TB footer 編輯）」混淆，並指派為**第四波開頭、獨立驗收**（與第 3 節樂觀鎖可並行開發但分開合併／驗收）。
todos:
  - id: edit-master-plan-md
    content: 在 cat_工具綜合改版_42ac9451.plan.md 新增 §11、總覽表列、frontmatter todo、實作順序與第四波分段說明
    status: cancelled
  - id: optional-wave4-doc
    content: 若已有第四波主記錄草稿，於該檔補一行對應 §11／live-tm-cursor-ux（可與樂觀鎖分開驗收）
    status: cancelled
isProject: false
---

# 將「第九點（TM／游標）」納入主計畫

## 為何不併入現有節次

- 主計畫 [§9](c:/Users/WeiYi/.cursor/plans/cat_工具綜合改版_42ac9451.plan.md) 已定義為 **「編輯器內修改比對到的 TB 條目」**（`tbId`、`liveFooterContent` 表單、`ActiveWriteTb` 權限），與 **TM 搜尋結果列表互動、全域游標標記** 是不同產品面。
- [§2](c:/Users/WeiYi/.cursor/plans/cat_工具綜合改版_42ac9451.plan.md) 聚焦 **篩選列／`#sfInput`／Ctrl+F**；TM 分頁與 `renderLiveTmMatches` 行為放在 §2 會讓「搜尋工具列」與「右側 TM 比對」邊界模糊。

**結論**：採 **新章節「第 11 節」**，並在 frontmatter `todos` 新增一筆專用項目（勿覆寫既有 `editor-tb-inline-edit`）。

## 建議寫入內容（第 11 節草案標題與子項）

**標題**：`## 11. TM 搜尋結果互動與編輯區游標輔助（快捷鍵／假游標）`

**產品子項（對齊你先前列的 5 點，寫入時可略調語氣為計畫體）**：

1. **TM 結果貼上觸發**：TM 搜尋結果列改為 **雙擊** 才將譯文貼入使用中譯文欄（與 CAT 分頁一致）；**單擊** 僅選取／利於拖選複製，不觸發貼上。
2. **編號與 Ctrl+數字**：TM 結果列表顯示與 CAT 分頁語意一致的 **1～N 編號**；**Ctrl+1…9（及必要時 0 的語意需與現有 CAT 快捷鍵對齊，避免衝突）** 將對應序號結果貼入譯文（細節在實作前對照現有 CAT 分頁快捷鍵實作與快捷鍵說明 modal 一併更新）。
3. **Ctrl+K 後焦點**：使用 Ctrl+K（既有「某類標記／格式」行為）後，**焦點回到目前編輯欄位末尾**，游標在 **可立即輸入、不覆寫既有譯文** 的狀態（與「插入點在尾端」一致）。
4. **假游標（非閃爍標記）**：離開譯文（或約定之「編輯區」）焦點時，**記錄最後的插入點／選取狀態**；在可視區內以 **靜態、不閃爍** 的標記顯示「最後編輯位置」（需評估：`contenteditable`／覆層／座標換算可行性與捲動／換列時的更新成本）。
5. **Ctrl+0 插入選取文字**：在 **原文、CAT 分頁、TM 搜尋分頁**（至少）有文字選取時，**Ctrl+0** 將選取內容插入 **假游標所記錄的位置**（若無有效記錄則需定義 fallback：例如略過或提示）。

**實作指引（計畫中簡短列出即可）**：

- 主要觸及 [cat-tool/app.js](c:/Homemade%20Apps/1UP%20TMS/cat-tool/app.js)（TM 列表 click/dblclick、快捷鍵表、編輯區 focus/blur）、[cat-tool/index.html](c:/Homemade%20Apps/1UP%20TMS/cat-tool/index.html)（必要時 TM 列表 DOM 結構／快捷鍵說明）、[cat-tool/style.css](c:/Homemade%20Apps/1UP%20TMS/cat-tool/style.css)（假游標樣式）。
- 完成後依倉慣例執行 `node scripts/sync-cat.mjs` 同步 [public/cat](c:/Homemade%20Apps/1UP%20TMS/public/cat)。

## 範圍總覽表（檔案頂部表格）

在「範圍總覽」表格新增一列，指向 §11 與上述三檔。

## Frontmatter `todos`

新增一項，例如：

- `id`: `live-tm-cursor-ux`（或 `tm-matches-dblclick-shortcuts-caret`）
- `content`: 摘要列出五點（TM 雙擊貼上、編號+Ctrl+數字、Ctrl+K 焦點尾端、假游標、Ctrl+0 插入）
- `status`: `pending`

（保留既有 `editor-tb-inline-edit` 不變。）

## 波次指派（回答「下一波或其他階段」）

- 主計畫「白話：建議怎麼分階段做」目前將 **第四波** 訂為 **§3 樂觀鎖／協作**。
- **建議**：將 §11 列為 **第四波的第一個可交付子階**（或表達為「第四波 A：編輯器 TM／游標體驗」），與 **第四波 B：§3 樂觀鎖** **檔案區段不同、可並行開發**，但 **獨立驗收、獨立合併** 以降低與協作除錯混在一起的风险。
- 若你希望 **第四波只做樂觀鎖**，則改為 **「第三波與第五波之間的緩衝交付」** 亦可；但以你先前「第九點拆下一波」的意圖，**緊接第三波 QA 收尾之後的第四波開頭**最一致。

## 「建議實作順序」清單

在文末編號清單中，於 **§3 樂觀鎖** 之前（或緊接 QA 相關項之後）插入一條：**「第 11 節 TM／游標輔助」**，並註明與快捷鍵說明 modal 一併更新。

---

**實作本計畫時**：僅編輯 [cat_工具綜合改版_42ac9451.plan.md](c:/Users/WeiYi/.cursor/plans/cat_工具綜合改版_42ac9451.plan.md)（路徑以你工作區 `.cursor/plans` 為準）；不需改程式碼，除非你另開「執行實做」任務。
