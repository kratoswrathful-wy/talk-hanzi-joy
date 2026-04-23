# Bug Report：句段資料寫入競態（Write Race Condition）

> 調查日期：2026-04-23  
> 專案：1UP TMS — CAT 工具（`cat-tool/app.js`）  
> 觸發情境：線上專案 Reign of Hades > HOW TO PLAY BOOK 280x280.docx.sdlxliff，第 #994 行  
> 調查者：Claude（Cowork）

---

## 一、症狀

### Problem 1：版本回退（Version Regression）
- 使用者在句段 A 確認（Ctrl+Enter），TM 寫入正確的新版本 V2
- 但句段顯示的仍是舊版本 V1（已確認狀態）
- 效果：句段與 TM 不一致，TM 比句段新

### Problem 2：幽靈版本（Ghost Write）
- 句段顯示「中途打字」的內容，狀態卻是「confirmed」
- TM 有正確的最終版本
- 效果：DB 中的 `target_text` 是使用者從未「確認」過的中間版本

---

## 二、根本原因

### 核心機制

`DOMContentLoaded` 初始化後，每個 target input 都有以下三個非同步寫入通道：

| 通道 | 觸發條件 | 寫入函數 |
|------|----------|---------|
| **Debounce（500ms）** | 每次 `input` 事件，500ms 後自動寫入 | `DBService.updateSegmentTarget(id, PARTIAL)` |
| **Blur handler** | input 失去焦點時寫入 | `DBService.updateSegmentTarget(id, newVal)` |
| **Ctrl+Enter confirm** | 確認鍵，寫入 target + status + TM | `DBService.updateSegmentTarget(id, FULL)` 後接 `syncSegmentToWriteTmsOnConfirm` |

### 競態條件（Race Condition）

問題出在 `clearTimeout` **只能取消尚未觸發的 timer**，無法取消「已觸發、正在等待 network 回應」的 async 回呼：

```
t=0    使用者打了 "partial tex"
       → input 事件 → setTimeout(debounce_A, 500)

t=500  debounce_A 觸發
       → latestA = "partial tex"（讀 DOM）
       → seg.targetText = "partial tex"
       → await DBService.updateSegmentTarget(id, "partial tex")  ← IN-FLIGHT，尚未回傳

t=501  使用者補打 "t"，字串變 "partial text"
       → input 事件 → clearTimeout(debounce_A)  ← 但 debounce_A 已觸發！clearTimeout 無效！
       → setTimeout(debounce_B, 500)

t=600  使用者按 Ctrl+Enter
       → clearTimeout(debounce_B)  ← 取消的是 B（尚未觸發），有效
       → latestFull = "partial text"（讀 DOM）
       → seg.targetText = "partial text"
       → await DBService.updateSegmentTarget(id, "partial text")  ← write #1（FULL）
       → focusTargetEditorAtSegmentIndex(next)  ← 觸發 blur
       → blur handler → await DBService.updateSegmentTarget(id, "partial text")  ← write #2（FULL）
       → enqueueConfirmSideEffects:
           → updateSegmentStatus(id, 'confirmed')
           → syncSegmentToWriteTmsOnConfirm → TM 寫入 "partial text"（FULL）✓

t=1200 debounce_A 的 IN-FLIGHT 網路請求終於回傳
       → DB 寫入 "partial tex"（PARTIAL）← 覆蓋掉 FULL！❌
```

**最終結果：**
- `target_text` = "partial tex"（PARTIAL）
- `status` = "confirmed"
- TM = "partial text"（FULL）

這精確對應 Problem 2 的症狀。

### Problem 1 的機制

Problem 1（版本回退）的成因相同，差別在於時序發生在**兩次確認之間**：

```
t=0    句段 A：使用者打字 → debounce 觸發 → await updateSegmentTarget(V1)  IN-FLIGHT
t=100  Ctrl+Enter → updateSegmentTarget(V2) → TM=V2 → confirmed ✓
t=800  IN-FLIGHT 回傳 → DB 寫入 V1，覆蓋 V2 ❌
       → target_text = V1，status = confirmed，TM = V2
```

---

## 三、相關程式碼位置

| 位置 | 說明 | 行號（約） |
|------|------|-----------|
| `let targetDebounceTimer` | per-row debounce timer 變數 | 8598 |
| debounce callback | 觸發 `updateSegmentTarget(PARTIAL)` | 8660–8675 |
| blur handler | `clearTimeout` 後再寫入 | 8681–8716 |
| Ctrl+Enter confirm handler | `clearTimeout` 後寫入 FULL | 8742–8822 |
| `syncSegmentToWriteTmsOnConfirm` | 用 `seg.targetText` 寫入 TM | 8984 |
| `enqueueConfirmSideEffects` | confirm 側效鏈 | 7299–7303 |
| `propagateRepetition` | 重複句段傳播 | 7587–7638 |

**關鍵程式碼（debounce，第 8660–8675 行）：**

```js
targetDebounceTimer = setTimeout(async () => {
    const latest = extractTextFromEditor(targetInput);
    seg.targetText = latest;
    await DBService.updateSegmentTarget(seg.id, latest);  // ← 一旦到這行，clearTimeout 無法阻止
    emitCollabEdit('commit', seg, latest);
}, 500);
```

**關鍵程式碼（Ctrl+Enter，第 8742–8822 行）：**

```js
void (async () => {
    const conflictOk = await resolvePendingRemoteConflict(seg, row, targetInput);
    if (targetDebounceTimer) { clearTimeout(targetDebounceTimer); targetDebounceTimer = null; }
    // ⚠️ clearTimeout 只取消「尚未觸發」的 timer，已在飛行中的 await 無法阻止
    const latestTarget = extractTextFromEditor(targetInput);
    seg.targetText = latestTarget;
    await DBService.updateSegmentTarget(seg.id, latestTarget);
    // ...
    focusTargetEditorAtSegmentIndex(nextFocus);  // 觸發 blur → 又一次寫入
    await _maybeShowAiReviewModal(seg, i);
    enqueueConfirmSideEffects(async () => {
        await DBService.updateSegmentStatus(seg.id, 'confirmed');
        await syncSegmentToWriteTmsOnConfirm(seg, i);
        await propagateRepetition(seg, i);
    });
})();
```

---

## 四、修改建議

### Fix A：debounce 回呼完成後，自我檢查是否需補寫（立即可做）

在 debounce 的 `await updateSegmentTarget` 之後，加入確認狀態檢查：

```js
targetDebounceTimer = setTimeout(async () => {
    const latest = extractTextFromEditor(targetInput);
    seg.targetText = latest;
    await DBService.updateSegmentTarget(seg.id, latest);

    // ✅ 新增：如果 debounce 寫入期間 confirm 已完成，補寫正確的版本
    if (seg.status === 'confirmed' && seg.targetText !== latest) {
        await DBService.updateSegmentTarget(seg.id, seg.targetText);
    }

    emitCollabEdit('commit', seg, latest);
}, 500);
```

**缺點：** 只治標，若 confirm 在補寫之前又完成一次會有第三次競態。

---

### Fix B：引入「寫入世代計數器」（Generation Counter，建議方案）

每個 row 增加一個 generation 計數器；每次發起寫入時記錄當前 generation，寫入回傳後若 generation 已變動則放棄（或補寫）：

```js
let targetDebounceTimer;
let writeGeneration = 0;  // ← 新增：per-row 世代計數器

// debounce
targetDebounceTimer = setTimeout(async () => {
    const myGen = ++writeGeneration;
    const latest = extractTextFromEditor(targetInput);
    seg.targetText = latest;
    await DBService.updateSegmentTarget(seg.id, latest);

    // 如果已有更新的寫入（confirm 或新的 debounce），補寫最新版本
    if (writeGeneration !== myGen) {
        await DBService.updateSegmentTarget(seg.id, seg.targetText);
    }
    emitCollabEdit('commit', seg, latest);
}, 500);

// blur handler 與 Ctrl+Enter 都要在發起寫入前 ++writeGeneration
// blur:
const myGen = ++writeGeneration;
await DBService.updateSegmentTarget(seg.id, newVal);
// ...

// Ctrl+Enter:
const myGen = ++writeGeneration;
await DBService.updateSegmentTarget(seg.id, latestTarget);
// ...
```

---

### Fix C：在 Supabase 層加入樂觀鎖（Optimistic Locking，根治方案）

在 `cat_segments` 的 `updateSegmentTarget` 函數加入時間戳條件：

```sql
-- 只在 last_modified < 我的寫入時間時才更新
UPDATE cat_segments
SET target_text = $1, last_modified = now()
WHERE id = $2
  AND last_modified <= $3  -- $3 = 寫入發起時的 timestamp
```

對應的前端修改：

```js
// 發起寫入前記錄時間
const writeIssuedAt = new Date().toISOString();

// 呼叫改為：
await DBService.updateSegmentTarget(seg.id, latest, writeIssuedAt);
```

**優點：** 舊的 in-flight 寫入永遠不會覆蓋比它新的寫入。  
**缺點：** 需要修改 `DBService.updateSegmentTarget` 和對應的 Supabase RPC/query。

---

### Fix D：在 blur/Ctrl+Enter 前「終止」debounce in-flight（可選強化）

若要徹底阻止 debounce 的 in-flight 寫入，可改用 `AbortController`：

```js
let targetDebounceTimer;
let debounceAbortController = null;  // ← 新增

// debounce
targetDebounceTimer = setTimeout(async () => {
    debounceAbortController = new AbortController();
    const latest = extractTextFromEditor(targetInput);
    seg.targetText = latest;
    try {
        await DBService.updateSegmentTarget(seg.id, latest, { signal: debounceAbortController.signal });
    } catch (e) {
        if (e.name === 'AbortError') return;  // 被取消，靜默退出
        throw e;
    }
    debounceAbortController = null;
    emitCollabEdit('commit', seg, latest);
}, 500);

// blur / Ctrl+Enter 前加：
if (debounceAbortController) {
    debounceAbortController.abort();
    debounceAbortController = null;
}
```

**注意：** 需要 `DBService.updateSegmentTarget` 接受並傳遞 `AbortSignal` 給 Supabase client。Supabase JS v2 的 `from().update()` 尚不支援 AbortSignal，需要用 `fetch` wrapper 繞過。

---

## 五、修改優先順序

| 優先 | Fix | 說明 | 成本 |
|------|-----|------|------|
| 🔴 立即 | **Fix A** | 最簡單，直接在現有 debounce 加 4 行；能阻止大多數 Problem 2 | 低 |
| 🟡 建議 | **Fix B** | 更完整，per-row generation counter，覆蓋 blur + confirm 所有通道 | 中 |
| 🟢 根治 | **Fix C** | DB 層樂觀鎖，真正防止任何 in-flight 覆蓋 | 高（需 DB migration） |
| 🔵 加強 | **Fix D** | AbortController 直接終止 in-flight，配合 Fix B 使用最佳 | 高（需 DBService 修改） |

**建議組合：** 先部署 **Fix A** 緩解問題，同時準備 **Fix B + Fix C** 一起上線。

---

## 六、額外注意：`_maybeShowAiReviewModal` 的額外寫入

第 13160 行的 `_maybeShowAiReviewModal` 在 AI 模式啟用時，會做一次**非 await 的** `DBService.updateSegmentTarget`：

```js
DBService.updateSegmentTarget(seg.id, aiText);  // fire-and-forget，非 await
```

這個 fire-and-forget 寫入與 confirm 的 `enqueueConfirmSideEffects` 同樣存在競態風險。若 AI review modal 更改了 target text，此寫入同樣可能被後到的 debounce 覆蓋。建議在 Fix B 的 generation counter 中一併涵蓋。

---

## 七、實作狀態（2026-04-21）

下列已在 `cat-tool/app.js` 落地，並以 `node scripts/sync-cat.mjs` 同步至 `public/cat`：

- **寫入世代**（`targetWriteGeneration`）：per-row 計數；debounce／blur／Ctrl+Enter／狀態圖示確認、AI 清除草稿寫庫前遞增。debounce 或任一寫庫在 `await` 回傳後若世代已變，則以 `seg.targetText` 補寫一次，避免 in-flight 舊寫入覆寫新內容。
- **`isConfirming`**：確認流程中觸發的 blur 不再次寫庫，僅協作相關收尾。
- **失敗不跑半套流程**：`updateSegmentTarget` 在確認前失敗則不更新已確認 UI、不 `enqueue` 狀態／TM 側效。
- **`_maybeShowAiReviewModal`**：有 AI 草稿時，清除 `aiSuggestion` 改為可 **await** 的 `onClearAiFlags`（內含世代遞增與寫庫）或內建 `updateSegmentTarget`，避免與他通道競態。

**未做**（日後可選）：Fix C 樂觀鎖、單一 RPC 原子確認、Fix D 之 Abort 取消 in-flight 請求等。

---

## 八、相關 DB 表結構（供 Fix C 參考）

```
cat_segments (
    id,
    target_text,
    status,
    last_modified,   ← 樂觀鎖的依據欄位
    ...
)
```
