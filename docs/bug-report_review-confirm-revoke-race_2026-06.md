# Bug：審稿確認後約 0.5 秒自動回退為「審稿確認後再編輯」

**狀態**：已修正（2026-06-26）  
**關聯規格**：[`CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md`](./CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md) §12.6、B-7g 確認狀態 UX

---

## §1 現象

以**審稿身分**（R1）編輯**譯者已確認**的句段，按 Ctrl+Enter（或狀態圖示）確認後：

1. 句段短暫顯示**審稿確認**（綠底＋綠點＋實線綠圈）
2. 約 **0.5～1 秒**後，譯文不變，狀態自動變成**審稿確認後再編輯**（虛線綠圈，`review_revoked_editing`）
3. 再按一次確認 → 恢復審稿確認，並 toast「**審稿已確認，未實質編輯內容**」

---

## §2 根因（白話）

編輯器用 `editorUndoEditStart[seg.id]` 記住「**開始打字前**的譯文」當基準。每次打字停 0.5 秒（debounce），或 input 事件觸發時，系統會比對「現在譯文」和這個基準；若不同且句段已是確認狀態，就會呼叫 `applyWorkflowRevokeOnTargetEdit`，把審稿確認撤銷成「審稿確認後再編輯」。

**問題**：Ctrl+Enter 確認成功後，`onCtrlEnterConfirm` 會把句段標成審稿確認，但**沒有**把 `editorUndoEditStart[seg.id]` 更新成確認當下的譯文。基準仍停留在「打字前的舊譯文」。

確認後約 0.5 秒，debounce 或焦點切換觸發的比對發現「現在譯文 ≠ 舊基準」，誤以為使用者又改了已確認內容 → 撤銷確認。

第二次確認時，系統發現譯文與第一次確認時拍的 `wfReviewRestoreSnapshot` 一致，走 `maybeRestoreReviewFromSnapshot` 還原路徑，故出現「未實質編輯內容」提示。

**此 bug 與 Team realtime 無關**：協作只同步譯文文字，不覆寫 wf 欄位；回退完全來自本機 debounce／input 邏輯。

---

## §3 程式觸點

| 位置 | 說明 |
|------|------|
| [`cat-tool/app.js`](../cat-tool/app.js) `onCtrlEnterConfirm` | 確認成功，設 `wfReviewConfirmedAt`、拍 restore 快照 |
| 同上 Ctrl+Enter `keydown`（約 23405 行） | 確認後未更新 `editorUndoEditStart` |
| 同上 `scheduleTargetDebouncedPersistAndUndo`（約 22698 行） | 500ms debounce；`oldVal !== latest` 時 `unconfirmSegmentVisualAfterReplace` |
| 同上 `input` 監聽（約 22827 行） | 即時 `applyWorkflowRevokeOnTargetEdit` |
| `applyWorkflowRevokeOnTargetEdit` → `_enterReviewRevokedEditing` | 設 `wfReviewRevokedPending=true` |
| `maybeRestoreReviewFromSnapshot` | 譯文=快照 → toast「審稿已確認，未實質編輯內容」 |

---

## §4 修正

在 Ctrl+Enter `keydown` 流程中，`onCtrlEnterConfirm` 回傳 `confirmed`／`upgraded`／`restored` 後，**立刻**同步基準：

```javascript
if (ceResult.confirmed || ceResult.upgraded || ceResult.restored) {
    applyOptimisticRepetitionAfterPrimaryConfirm(i, { updateDom: true });
    editorUndoEditStart[seg.id] = latestTarget;
    editorUndoStatusStart[seg.id] = seg.status;
}
```

後續 debounce／input 比對時「現在譯文 = 基準」，不再誤觸撤銷。

---

## §5 重現步驟（修正前）

1. Team 模式，以審稿身分開啟 workflow 檔。
2. 找一句**譯者已確認**（`trans_confirmed`）的句段。
3. 進入譯文欄，修改至少一個字。
4. 改完後按 Ctrl+Enter 確認。
5. **預期（bug）**：短暫審稿確認 → 約 0.5 秒後變虛線綠圈。
6. 再按 Ctrl+Enter → 恢復審稿確認 +「審稿已確認，未實質編輯內容」。

---

## §6 驗收（修正後）

1. 重複 §5 步驟 1～4。
2. **預期**：確認後維持審稿確認（實線綠圈），**不**自動變虛線綠圈。
3. 無需第二次確認；不出現「未實質編輯內容」toast（除非使用者真的未改譯文就重複確認）。

---

## §7 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-26 | 初稿：現象、根因、修正、驗收 |
