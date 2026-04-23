# 案例分析：Ghost Write 殘留資料 + 程式碼現況評估

> 調查日期：2026-04-23  
> 專案：1UP TMS — CAT 工具  
> 檔案：Reign of Hades > HOW TO PLAY BOOK 280x280.docx.sdlxliff  
> 調查者：Claude（Cowork）

---

## 一、DB 實際查驗結果

對 `cat_segments` 查詢 row_idx 994、1006–1011，比對 `source_text` 與 `target_text`：

### Row 994（原始回報案例）
| | 內容 |
|--|------|
| Source | Refer to the Action Summary section on page X if you feel uncertain how an action is resolved, or consult the corresponding section of the Rules Clarifications for more detailed information. |
| Target | 如果你不確定某個行動的結算方式，請參閱第 X 頁的行動摘要部分，或查閱規則說明的相應部分以獲取詳細的資訊。 |
| Status | confirmed |

**✅ 已正確**——完整且符合原文，推測已被後續寫入覆蓋或手動修正。

---

### Row 1008 ❌ Ghost Write（截斷）
| | 內容 |
|--|------|
| Source | Remove a Loot token from the zone your Character is currently in. Then, choose one Loot card of the corresponding type from the **Discover Market** that matches the removed Loot token. |
| Target | 從你的角色目前所在區域中移除一個戰利品指示物。然後從探索**是**集中選擇一張與所移除的戰利品指示物類型相同的**戰** |
| Status | confirmed |
| last_modified | 2026-04-22 10:46:33 |

**問題：**
- 「探索是集」為錯字，原文對應 "Discover Market"，應為「探索牌市」
- 句尾截斷在「的戰」，應接「利品牌」（"Loot card"）
- 正確完整譯文應為：「…然後從探索牌市中選擇一張與所移除的戰利品指示物類型相同的戰利品牌。」

**成因：** debounce 在使用者打到「的戰」時觸發，in-flight 寫入晚於 Ctrl+Enter 確認的寫入回傳，覆蓋正確版本。

---

### Row 1009 ❌ Ghost Write（截斷）
| | 內容 |
|--|------|
| Source | When discovering a Weapon, pay both its Spark and Carry Capacity costs as indicated on the card, then add the Weapon card to your **Inventory**. |
| Target | 發現武器時，支付卡片上標示的火花和負重上限，然後將該武器卡加入你的 |
| Status | confirmed |
| last_modified | 2026-04-23 05:31:26 |

**問題：** 句尾截斷在「你的」，缺「物品欄」（"Inventory"）。  
正確完整譯文：「…然後將該武器卡加入你的**物品欄**。」

**成因：** 同 Row 1008——debounce in-flight 晚歸，蓋掉確認版本。  
注意：Row 1009 與 Row 1010 的 `last_modified` 僅差 8 秒（05:31:26 vs 05:31:34），符合使用者快速連續確認時競態發生的時序。

---

### Row 1010（使用者原本指出的行號）
| | 內容 |
|--|------|
| Source | Choose a ready Weapon card in your inventory. |
| Target | 從你的物品欄選一張已就緒的武器卡。 |
| Status | confirmed |

**✅ 正確**——完整且符合原文。使用者說的「第 1010 行」可能是 UI 顯示從 1 開始計數，對應 DB 的 row_idx 1009（差一行）。

---

## 二、需要手動修正的資料

| row_idx | 現有譯文（截斷） | 正確完整譯文 |
|---------|-----------------|-------------|
| 1008 | …類型相同的戰 | …然後從探索牌市中選擇一張與所移除的戰利品指示物類型相同的戰利品牌。 |
| 1009 | …將該武器卡加入你的 | …然後將該武器卡加入你的物品欄。 |

**這兩筆需直接在 CAT 工具中開啟對應句段手動補完，程式碼修正後不會自動回復歷史資料。**

---

## 三、程式碼現況評估

查閱修正後的 `cat-tool/app.js`，確認以下防護機制已到位：

### ✅ 已實作
| 機制 | 位置（約） | 說明 |
|------|-----------|------|
| `targetWriteGeneration` 世代計數器 | 8623 | per-row，三通道（debounce / blur / Ctrl+Enter）各自遞增 |
| `isConfirming` 旗標 | 8624 | Ctrl+Enter 期間設為 `true`，blur handler 提早 return |
| debounce 補寫用 `seg.targetText` | 8706–8713 | 世代不符時補寫記憶體值，不重讀 DOM（焦點已移走） |
| blur 補寫 | 8772–8777 | 同樣有世代檢查 |
| `applyUpdateSegmentTarget` 帶 `segmentRevision` | 508–524 | DB 層樂觀鎖，衝突時拋 `SEGMENT_REVISION_CONFLICT` |
| `_maybeShowAiReviewModal` 也遞增世代 | 8881 | AI 建議寫入納入世代管控 |

### ⚠️ 一個微小時序問題

**位置：** blur handler 第 8728 行，Ctrl+Enter handler 第 8877 行

**問題描述：**

```
Ctrl+Enter 流程：
  8826: isConfirming = true
  8828: await applyUpdateSegmentTarget(...)   ← 網路等待
  ...回傳後繼續...
  8876: focusTargetEditorAtSegmentIndex()     ← blur 事件同步觸發
  8877: isConfirming = false                  ← ★ 在這裡才設回 false

blur handler（async）：
  進入 → refreshTagNextHighlight()（同步）
  → await resolvePendingRemoteConflict()      ← ★ 此處 yield，讓 8877 搶先執行
  → if (isConfirming) return                 ← 這時已是 false，沒有提早 return ❌
```

**實際影響：** blur 會執行一次額外的 `updateSegmentTarget`，寫入與 Ctrl+Enter 相同的內容（同文字、同 `seg.targetText`）。因為 `segmentRevision` 樂觀鎖的保護，此寫入若 revision 不符會靜默丟棄，不污染資料，但會浪費一次 Supabase round-trip。

**建議修法（一行）：**

```js
targetInput.addEventListener('blur', async () => {
    const wasConfirming = isConfirming;  // ← 進入時立即捕捉，await 前讀值
    refreshTagNextHighlight(row);
    const conflictOk = await resolvePendingRemoteConflict(seg, row, targetInput);
    if (!conflictOk) { ... }
    if (wasConfirming) {                 // ← 用快照，不受 isConfirming = false 影響
        emitCollabEdit('end', seg, null);
        ...
        return;
    }
    ...
```

---

## 四、整體評估

| 層次 | 狀態 | 說明 |
|------|------|------|
| 前端世代計數（Fix B）| ✅ 已到位 | 三通道均正確遞增，補寫使用記憶體值 |
| DB 樂觀鎖（Fix C）| ✅ 已到位 | `segmentRevision` 衝突保護，已超過原計畫預期 |
| `isConfirming` blur 抑制 | ⚠️ 微小時序缺口 | 影響輕微，建議補一行快照修法 |
| 殘留錯誤資料 | ❌ 需手動修正 | row_idx 1008、1009 仍是截斷的舊版本 |

**結論：** 主要競態已有效防護，現存問題只剩 `isConfirming` 時序的冗餘寫入（不影響資料正確性），以及兩筆需要手動補完的歷史資料。
