# Bug Report：Bug #5 — 部署後點擊檔案／TM／TB 無效

> 調查日期：2026-04-23  
> 專案：1UP TMS — CAT 工具（`cat-tool/app.js`）  
> 觸發 commit：`5e424fd` — "CAT：準則兩欄、檔案類別移至 AI 管理、互斥群、句段寫入保護"  
> 調查者：Claude（Cowork）

---

## 一、症狀

| 操作 | 結果 |
|------|------|
| 點擊「專案檔案列表」中的檔案名稱 | 出現 alert 錯誤訊息：`Cannot access 'sfFilterSnapshotSegIds' before initialization`，接著進入空白的編輯器畫面 |
| 點擊 TM / TB 名稱 | **完全沒有反應**，不進入 TM/TB 詳細頁 |

---

## 二、根本原因

### 2-1 JavaScript `let` 暫時死區（TDZ）

`DOMContentLoaded` 的 `async` callback（從 `app.js` 第 111 行開始）在初始化過程中**提早崩潰退出**，導致以下兩件事沒有發生：

1. `let sfFilterSnapshotSegIds = null;`（第 6058 行）**從未執行** → 變數停留在 TDZ  
2. `bindTmTbResourceRowClicksOnce()`（第 3332 行）**從未執行** → TM/TB 點擊事件從未綁定

此後，當使用者點擊檔案名稱：
- 第 2591 行設定的 `filesListBody` click handler 觸發
- 呼叫 `openEditor(id)`
- `openEditor` 在第 5885 行執行 `sfFilterSnapshotSegIds = null`
- **TDZ ReferenceError** → 被 `openEditor` 的 catch（第 5901 行）攔截 → `alert(msg)`

TM/TB 的點擊之所以完全沒有反應，是因為 `bindTmTbResourceRowClicksOnce()` 本身從未被呼叫，click handler 根本不存在。

### 2-2 崩潰點：callback 在第 6058 行之前中斷

`DOMContentLoaded` callback 唯一的 top-level `await`（會讓 callback 暫停）是：

```js
// app.js, line 1835
await loadDashboardData();
```

此行之後、第 6058 行之前，若有任何 **未被 try-catch 包裹的錯誤**（例如 `loadDashboardData()` 本身拋出、或其後某個 DOM 操作存取到 null 元素），callback 就會靜默退出。

具體崩潰點尚未確定（缺少 browser console stack trace），但可信的候選位置包括：
- `loadDashboardData()` 內部 DB 查詢因新 schema 欄位失敗（最可能）
- 第 1835 行後的某個沒有 null guard 的 `.addEventListener` 呼叫
- `initWorkMemoAttachmentsUi()`（第 2607 行）內部拋出

### 2-3 開發者自己留下的線索

第 1715 行有一則重要注解：

```js
// 編輯器核心狀態須早於會呼叫 openEditor 的 listener（否則會觸發 let TDZ）
let currentSegmentsList = [];
let editorUndoStack = [];
// ...（共 10 個變數）
```

這個區塊的目的就是把 `openEditor` 所需的狀態變數聲明在 `await loadDashboardData()` 之前。  
**但 `sfFilterSnapshotSegIds`（及相關的 SF Engine 變數）漏掉了，沒有被放進這個安全區塊。**

---

## 三、受影響的變數（全部在第 6051–6071 行宣告）

```js
let sfMode = 'search';
let sfUseRegexChecked = false;
let sfSearchMatches = [];
let sfActiveMatchIdx = -1;
let sfFilterGroups = [];
let sfFilterSnapshotSegIds = null;     // ← 主要罪犯（第 6058 行）
let sfFilterLockedSpecHash = '';       // ← 同樣用在 openEditor 第 5886 行
const highMatchEditConfirmedIds = new Set(); // ← 同樣用在 openEditor 第 5887 行
let highMatchModalPromiseResolver = null;
let highMatchGuardFocusSegId = null;
let highMatchInputGuardBusy = false;
let sfPresets = JSON.parse(localStorage.getItem('catToolSfPresets') || '{}');
let lastEditedRowIdx = null;
let selectedRowIds = new Set();
let _pendingFocusSegIdxAfterRender = null;
let lastSelectedRowIdx = null;
let isBatchOpInProgress = false;
```

---

## 四、修改建議

### Fix A：將所有 SF Engine 狀態變數移到安全區塊（最重要）

**位置：** `app.js` 第 1725–1727 行（`currentFileDefaultMqRole` 聲明的下方）  
**動作：** 把上述 17 個變數從第 6051–6071 行**剪下**，貼到第 1727 行之後。

```js
// 原始安全區塊（~第 1716 行）
let currentSegmentsList = [];
let editorUndoStack = [];
// ...（保持不動）
let currentFileDefaultMqRole = null;

// ↓ 新增：把 SF Engine 所有狀態移到這裡 ↓
let sfMode = 'search';
let sfUseRegexChecked = false;
let sfSearchMatches = [];
let sfActiveMatchIdx = -1;
let sfFilterGroups = [];
let sfFilterSnapshotSegIds = null;
let sfFilterLockedSpecHash = '';
const highMatchEditConfirmedIds = new Set();
let highMatchModalPromiseResolver = null;
let highMatchGuardFocusSegId = null;
let highMatchInputGuardBusy = false;
let sfPresets = JSON.parse(localStorage.getItem('catToolSfPresets') || '{}');
let lastEditedRowIdx = null;
let selectedRowIds = new Set();
let _pendingFocusSegIdxAfterRender = null;
let lastSelectedRowIdx = null;
let isBatchOpInProgress = false;
```

然後在第 6051 行原處**刪除**上述所有 `let`/`const` 宣告（只保留那一段的注解即可）。

---

### Fix B：在崩潰之前就呼叫 `bindTmTbResourceRowClicksOnce()`

**位置：** `app.js` 第 1715 行（安全區塊注解的正上方）  
**動作：** 在安全區塊之前先呼叫一次（function declaration 被 hoisted，可以在定義之前呼叫）

```js
// 在這行之前加入：
bindTmTbResourceRowClicksOnce();

// 編輯器核心狀態須早於會呼叫 openEditor 的 listener（否則會觸發 let TDZ）
let currentSegmentsList = [];
// ...
```

---

### Fix C：防禦性 try-catch 包裹 `await loadDashboardData()`

**位置：** `app.js` 第 1835 行  
**動作：** 加上 try-catch，讓 DB 查詢失敗時 callback 不會崩潰

```js
// 原本：
await loadDashboardData();

// 改為：
try {
    await loadDashboardData();
} catch (err) {
    console.error('[init] loadDashboardData failed, continuing init:', err);
}
```

---

### Fix D（選做）：查出 callback 的實際崩潰點

在瀏覽器 DevTools Console 執行以下操作：
1. 重新整理頁面
2. 馬上查看 Console 是否有紅色 `Uncaught` 或 `Unhandled` 錯誤
3. Stack trace 最頂端的那行就是崩潰點

可疑候選清單（按可能性排序）：
- `loadDashboardData()` 內部 Supabase 查詢拋出（新 commit 的 schema 變更是否有對應 migration？）
- 第 2143 行：`btnBackToProjects.addEventListener(...)` —— 確認 HTML 有此 id
- `initWorkMemoAttachmentsUi()` 呼叫（第 2607 行）內部的 null 存取
- 第 4960–4963 行直接 `document.getElementById('btnCreate...').addEventListener(...)` 的 null 安全性

---

## 五、修改優先順序

| 優先 | Fix | 說明 |
|------|-----|------|
| 🔴 立即 | **Fix A** | 直接解決 TDZ → 點擊檔案不再噴錯 |
| 🔴 立即 | **Fix B** | 直接解決 TM/TB 點擊沒有反應 |
| 🟡 建議 | **Fix C** | 防止 callback 整個崩潰，更有防禦性 |
| 🟢 可選 | **Fix D** | 找出真正的崩潰點並修它，根治問題 |

---

## 六、相關程式碼位置

| 內容 | 檔案 | 行號 |
|------|------|------|
| DOMContentLoaded callback 開始 | `app.js` | 111 |
| 安全區塊注解（早期聲明）| `app.js` | 1715–1727 |
| `await loadDashboardData()` | `app.js` | 1835 |
| `filesListBody` click handler（呼叫 `openEditor`） | `app.js` | 2591–2604 |
| `bindTmTbResourceRowClicksOnce()` 函數定義 | `app.js` | 3276–3331 |
| `bindTmTbResourceRowClicksOnce()` 呼叫 | `app.js` | 3332 |
| `openEditor` 函數定義 | `app.js` | 5596 |
| `sfFilterSnapshotSegIds = null`（TDZ 發生點） | `app.js` | 5885 |
| `openEditor` catch → `alert(msg)` | `app.js` | 5901–5904 |
| SF Engine 變數區塊（需移走） | `app.js` | 6051–6071 |
| `sfFilterSnapshotSegIds` 宣告（問題根源） | `app.js` | 6058 |
