# Bug Report：句段集指派 Modal 誤納 `cancelled` 記錄導致指派失效

> 發現／修正日期：2026-05-09  
> 專案：1UP TMS — CAT 工具（`cat-tool/`）  
> 狀態：**已修正**（`dfea428`）

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

在「指派句段集」的 Modal 裡勾選譯者後按「儲存指派」，**有時存了好像沒效**：
- 某位原本已被指派、後來被取消的譯者，再次勾選並儲存後，畫面或功能仍顯示他沒被指派。
- 反過來，開啟 Modal 時，已被取消的人**勾選框卻顯示為勾選**（以為他仍被指派中）。

### 1.2 根本原因（一句話）

程式向資料庫查詢「誰被指派了」時，**沒有排除已取消（`status = 'cancelled'`）的記錄**，導致：

1. **開 Modal 時**：已取消的人被誤算為「仍在指派」→ 勾選框顯示為勾選（錯誤的預選狀態）。
2. **儲存時**：已取消的人在清單裡仍佔了一個「已存在」的位置 → 重新勾選他時，程式認為「這個人已經在了，不必再新增」→ `assignView` 沒有被呼叫 → 資料庫裡的那筆記錄繼續維持 `cancelled` → 實際上沒被重新指派。

### 1.3 影響範圍

- 只影響**句段集（cat_views）指派**，檔案指派（`cat_file_assignments`）走另一條路，不受影響。
- 受影響情境：曾被指派後又取消、之後想重新指派的譯者。

### 1.4 驗收方式

1. 開一個有句段集的專案，點句段集的指派按鈕。
2. 找一位「過去被指派過、後來被取消」的譯者，確認 Modal 開啟時他**未勾選**。
3. 勾選他，按「儲存指派」，再重新開啟 Modal，確認他仍顯示勾選（已成功重新指派）。

---

## Part 2 — 技術細節

### 2.1 資料模型

句段集指派存在 `cat_view_assignments` 資料表：

| 欄位 | 說明 |
|---|---|
| `view_id` | 句段集 ID |
| `assignee_user_id` | 被指派人 |
| `status` | `assigned` / `cancelled` |
| `assigned_by` | 指派人 |
| `assigned_at` / `updated_at` | 時間戳記 |

取消指派不做實體刪除，而是把 `status` 改為 `cancelled`（軟刪除）。  
這讓「重新指派」可以用 `upsert` 復原，但同時也要求所有查詢**必須主動過濾 `cancelled`**。

### 2.2 問題程式碼（修正前）

**位置 1：`openViewAssignModal`（開啟 Modal 預選，`cat-tool/app.js` ≈ 第 4398 行）**

```js
// ❌ 修正前：未過濾 cancelled，已取消的人也被算進 selectedSet
const existingList = await DBService.listViewAssignments(currentAssignFileIds[0]);
selectedSet = new Set((existingList || []).map(a => String(a.assigneeUserId || a.assignee_user_id)));
```

**位置 2：儲存邏輯（`btnSaveFileAssign` 的 `_fileAssignModeIsView` 分支，≈ 第 2789 行）**

```js
// ❌ 修正前：existingUids 含 cancelled 記錄，重新勾選已取消的人不會觸發 assignView
const existingUids = new Set((existing || []).map(a => String(a.assigneeUserId || a.assignee_user_id)));
for (const uid of selectedUserIds) {
    if (!existingUids.has(uid)) await DBService.assignView(viewId, [uid]);  // ← 永遠不執行
}
for (const a of (existing || [])) {   // ← 也對已 cancelled 的人多餘呼叫 unassignView
    ...
}
```

### 2.3 修正後程式碼

**位置 1（開 Modal 預選）：**

```js
// ✅ 修正後：排除 cancelled，只有真正有效的指派才顯示為勾選
selectedSet = new Set(
    (existingList || [])
        .filter(a => a.status !== 'cancelled')
        .map(a => String(a.assigneeUserId || a.assignee_user_id))
);
```

**位置 2（儲存邏輯）：**

```js
// ✅ 修正後：先過濾出有效指派，再做新增／取消的差異比對
const activeExisting = (existing || []).filter(a => a.status !== 'cancelled');
const existingUids = new Set(activeExisting.map(a => String(a.assigneeUserId || a.assignee_user_id)));
for (const uid of selectedUserIds) {
    if (!existingUids.has(uid)) await DBService.assignView(viewId, [uid]);  // 含重新指派的情境
}
for (const a of activeExisting) {   // 只對真正有效的指派做取消，不重複操作已 cancelled 的
    const uid = String(a.assigneeUserId || a.assignee_user_id);
    if (!selectedIds.has(uid)) await DBService.unassignView(viewId, uid);
}
```

`DBService.assignView` 底層用 `upsert`（`onConflict: view_id,assignee_user_id`），  
所以若記錄已存在但 `status=cancelled`，upsert 會直接把 `status` 更新回 `assigned`，重新指派完全正確。

### 2.4 為何「存了沒效」沒有報錯

`assignView` 完全沒被呼叫（直接跳過），不會有錯誤訊息；`unassignView` 即使對 `cancelled` 記錄重複執行也是 no-op（update 一筆已是 `cancelled` 的記錄）。  
兩端靜默，導致問題難以被工程直覺察覺，需要從 UI 行為才能觀察到。

### 2.5 修正 commit

`dfea428` — `fix(cat): view assignment modal ignore cancelled records`  
影響檔案：`cat-tool/app.js`、`public/cat/app.js`（sync 同步）
