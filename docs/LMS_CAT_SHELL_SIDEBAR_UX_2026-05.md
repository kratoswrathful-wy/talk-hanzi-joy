# LMS／CAT 殼層側欄：問題、調查、決策與實作索引（2026-05）

本文件為 **React Shell 最左欄（LMS 導覽）** 與 **CAT iframe 內左側欄** 之文案與收合／展開行為的**單一真相**，供產品、維運與 AI 延續討論。與 TB 上標無直接關係；舊文件 [`CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](./CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) §6.3 曾將兩層 UI 混寫，**以本檔為準**。

---

## 1. 問題發現（使用者實測）

- **LMS 左欄導覽**：連到團隊 CAT 的項目誤顯示為 **「1UP CAT」**；預期應維持 **「CAT 團隊線上版」**（與離線版「CAT 個人離線版」並列、語意清楚）。
- **CAT iframe 內側欄標題**（`.sidebar-title`）：仍顯示 **「CAT Team」／「CAT Team（受派）」**；預期改為 **「1UP CAT」**（與 LMS 導覽字串分離）。
- **收合範圍**：僅 `/cat/team` 時收合 LMS 不足；**個人離線版** `/cat/offline` 進入時亦應收合 LMS，與團隊版一致。

---

## 2. 調查結論（三層 UI，勿混淆）

| 層級 | 檔案／節點 | 說明 |
|------|------------|------|
| **LMS 左欄導覽文案** | [`src/components/AppSidebar.tsx`](../src/components/AppSidebar.tsx) `navItems` 內 `title` + `url` | 連到 `/cat/team` 的條目應為 **「CAT 團隊線上版」**，不可改成「1UP CAT」。 |
| **iframe 無障礙標題** | [`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx) `<iframe title="…">` | 可維持 **「CAT 團隊線上版」**（瀏覽器／輔助工具用），與 LMS 導覽文案一致無妨。 |
| **CAT 內可見側欄標題** | [`cat-tool/app.js`](../cat-tool/app.js) `.sidebar-title`（`DOMContentLoaded` 與 `enforceTeamRoleLayout`） | Team 模式下應顯示 **「1UP CAT」**（取代 `CAT Team`／`CAT Team（受派）`）。 |

---

## 3. 收合／展開規則（已定案，2026-05-10）

### 3.1 React Shell 最左欄（`AppLayout` → `useSidebar().setOpen`）

- 路由 **`pathname` 以 `/cat/` 開頭**（含 **`/cat/team`**、**`/cat/offline`**）：**一律收合** LMS 最左欄（`setOpen(false)`），含「模組頁」與「編輯器（路徑含 `/files/`）」。
- 路由 **非** `/cat/` 開頭（LMS 各模組）：**展開** LMS 最左欄（`setOpen(true)`）。
- **不記住**使用者曾手動展開 LMS；每次依路由強制套用（與舊「同一區域內尊重手動」相比，CAT 與 LMS **跨區** 仍強制）。

### 3.2 CAT iframe 內側欄（`TMS_SIDEBAR_MODE`）

- **`module`**：iframe 內 `#sidebar` **展開**（移除 `collapsed`）。
- **`editor`**：路徑含 **`/files/`**（編輯器）時送出；iframe 內側欄 **收合**（`collapsed`）。**此行為維持不變**。
- **競態補強**：父頁 `useEffect` 可能在 iframe `message` listener 註冊前執行，故在 **`iframe` `onLoad`** 內（team 模式）依目前 `pathname` **再送一次** `TMS_SIDEBAR_MODE`。

---

## 4. 實作 Checklist（給 Agent／維運）

1. [`src/components/AppSidebar.tsx`](../src/components/AppSidebar.tsx)：將 `/cat/team` 導覽 `title` 改回 **「CAT 團隊線上版」**。
2. [`src/components/AppLayout.tsx`](../src/components/AppLayout.tsx)：`SidebarAutoController` 以 `path.startsWith("/cat/")` 判斷是否為 CAT；`lastAreaRef` 使用 `lms | catModule | catEditor | other`；`catModule` 與 `catEditor` 皆 `setOpen(false)`；**`catModule ↔ catEditor`** 仍強制重跑 effect。
3. [`cat-tool/app.js`](../cat-tool/app.js)：team 時 `.sidebar-title` 一律 **「1UP CAT」**（初始化與 `enforceTeamRoleLayout`，不再僅在譯者模式改標題）。
4. [`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx)：`iframe` **`onLoad`** 內 `mode === "team"` 時依 `location.pathname` 是否含 `/files/` 再 `postMessage({ type: 'TMS_SIDEBAR_MODE', mode })`。
5. 變更 `cat-tool/app.js` 後執行 **`npm run sync:cat`**，並提交 **`public/cat/`** 對應檔案。

---

## 5. 驗收（白話）

1. LMS 左欄最下方：團隊入口顯示 **「CAT 團隊線上版」**，不是「1UP CAT」。
2. 進入團隊 CAT 任意模組（儀表板、專案、TM、TB…）：iframe 內側欄頂部為 **「1UP CAT」**；LMS 最左欄為收合。
3. 進入 **個人離線版** `/cat/offline/...`（非編輯器）：LMS 最左欄收合。
4. 進入任一 **編輯器**（URL 含 `/files/`）：LMS 最左欄仍收合；CAT 內側欄收合（與先前一致）。
5. 從 CAT 切回 LMS 任意頁：LMS 最左欄展開。

---

## 6. 與其他文件關係

- [`docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](./CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) **§6.4**：註記 §6.3 文案敘述有誤，以本檔為準；§7.3 保留為**歷史落地紀錄**，不刪除。
- 程式對照：[`docs/CODEMAP.md`](./CODEMAP.md)（`AppLayout`、`CatToolPage`、`cat-tool/app.js`）。
