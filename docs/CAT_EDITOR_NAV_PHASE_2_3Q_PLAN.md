# Phase 2.3q：共用 explicit 導覽完成條件 + stale 導覽取消（實作計畫）

> **狀態**：**已實作 `6344baa`**；Playwright Wave 1 顯示 **Test A 穩定 L2 fail**、**Test B 間歇 fail** → **開啟產品修復波**（Phase Q/R；見 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) §Phase P/Q/R/S）  
> **前置**：Phase 2.3p hotfix `649ef70`（焦點驗證；置中／假游標／手動點擊 stale 導覽由本 commit 修正）  
> **主紀錄摘要**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.18

---

## 問題定性

**不是「只修清除篩選」——是共用 virt 導覽管線的多症狀 regression。**

| 症狀 | 路徑 |
|------|------|
| 清除篩選後句段置頂、假游標殘留 | filter-clear anchor |
| Ctrl+Enter 確認跳行間歇性焦點遺失、置中失敗 | confirm-jump（`app.js` L25106） |
| 手動點擊可見列後畫面反覆跳位、最終停到無關句 | stale pending + virt nav lock |
| log 顯示 focus OK 但 `centeredOk: false` | 完成條件只有 `focusLanded` |

共用根因：

1. `flushPendingEditorFocus` 在 `focusLanded` 後即清 pending，不要求 `centerOk`
2. 手動點擊無取消 stale 導覽路徑
3. `CatVirtGrid.releaseNavigationAnchor()` 只清 `_anchorSegId`／`_anchorOffsetPx`，**不清** `_navAnchorLock`（resize 重畫仍 `renderWindow(_anchorSegId, _navAnchorBlock)`）

---

## 修正策略（Layer 0 → B → D → A → C）

### Layer 0：前置 helper + CatVirtGrid API

**檔案**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/js/grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js)

- `measureRowCenterDeltaPx` / `isCenterOk`（16px 容差；`#editorGrid` = `cfg.scrollEl`）
- `withProgrammaticEditorFocus`（`_programmaticEditorFocusDepth`）
- `_navigationCancelGen`、`_pendingEditorCenterRetry`
- `window.__catNavState`（供 `cat-fake-caret.js` 查詢 pending／real focus）
- **新增 export** `CatVirtGrid.cancelNavigationAnchor(reason)`：清 anchor、`_navAnchorLock`、coalesce key
- **禁止**從 `app.js` 直接改 virt 私有變數

### Layer B：共用 completion gate（核心）

**適用**：所有 `pending.explicitNav === true` 且 `scrollBlock === 'center'`（confirm-jump、清除篩選、Ctrl+Alt+↓、Ctrl+G）。

**完成條件**（兩者皆 true 才清 pending）：

```js
focusOk && centerOk  // centerOk: |rowCenterDeltaPx| <= 16
```

**flush 順序**（2.3p 禁令：virt scroll 必須在 focus **之前**）：

```text
1. !centerOk → scroll center → return（下一幀）
2. focus（withProgrammaticEditorFocus）
3. 驗 focusOk；失敗 → focus retry（≤3）
4. 驗 centerOk；失敗 → 不得同 stack scroll → center retry（≤3）→ 下一幀從步驟 1
5. 成功 → hide 假游標 + 清 pending
6. 達上限 → [catNav] flush failed + 安全收尾（釋放 lock、不搶焦點）
```

**rAF 雙重守衛**：`pending.gen` + `_navigationCancelGen`。

### Layer D：手動點擊取消 stale 導覽（與 B 同 deploy）

- `pointerdown`（capture）記錄 `_lastUserPointerEditorFocus`
- `focusin`（L4071）：非 programmatic 且 recent pointer → `cancelPendingNavigationForUserInteraction`
- 須清：pending、filter anchor、preserve、**`CatVirtGrid.cancelNavigationAnchor`**、假游標
- **手動點擊不觸發置中**

### Layer A：清除篩選錨點升級（B+D 之後；**不可單獨 deploy**）

`flushFilterAnchorAfterVirtRender`：僅 `focusEditor === true` 時 `explicitNav + forceVirtScroll + skipVirtScroll: false`。  
`isSfSearchControlActive()` 時維持只 scroll、不 focus。

### Layer C：假游標持久守衛

- focus 成功一律 `hide()`
- `refreshAfterVirtRender` 透過 `__catNavState` defer
- `onAfterRender`：有 pending nav 時 skip refresh

---

## 不做的（避免回歸）

- focus 成功後同 stack 再 scroll
- 只加 focus retry 不修 center
- Layer A 單獨 deploy
- preserve 改成 explicitNav
- 手動點擊 force center

---

## 驗收標準（摘要）

> **Playwright 現況**（Wave 1，`d15ad0b`）：**A** 穩定 fail；**B** 間歇 fail；**C/E/D/G/H/I** 首輪 pass。產品修復後須重跑全矩陣（見 Playwright 計畫 §Phase R）。

| 類別 | 要點 |
|------|------|
| A | 大檔 Ctrl+Enter ×5（相鄰／遠距／捲動後／篩選中）：`focusOk + centerOk + completed` — **Playwright：穩定 fail** |
| B | 大檔清除篩選：同上 + 無假游標 — **Playwright：間歇 fail** |
| C | 導覽進行中手動點另一列：不跳位、cancel log、舊 navGen 不再動 viewport、`nav lock` 已清 — **Playwright：pass** |
| D | 小檔（≤800 句）confirm／clear filter／Ctrl+Alt+↓／手動點擊 — **Playwright：pass** |
| E | Ctrl+G、F3、QA、手動捲動、Ctrl+F 不搶焦點、離屏 tip — **Playwright：pass** |
| F | 達上限 `[catNav] flush failed`，不靜默 |
| G | 大檔已確認句 F8：viewport 不甩到無關區、離屏假游標不偷換焦點（**不要求置中**）— **Playwright：pass** |
| H | 大檔 F8 後無來回拉扯、`navAnchorLock` 已清、假游標不錯列 — **Playwright：pass** |
| I | 大檔手動點譯文格：viewport 穩定（日常點擊；與 C 互補）— **Playwright：pass** |

Debug：`localStorage.setItem('catNavDebug', '1')`（CAT iframe Console）。

**Playwright 自動化驗收**：[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) — Wave 1 完成 `d15ad0b`；接續 **§Phase P/Q/R/S**。

---

## 產品修復波（Wave 1 後）

> **觸發**：Playwright Wave 1 排除 L1 點擊問題後，Test A 仍穩定 `centeredOk: false`；Test B 間歇 fail。  
> **交叉引用**：Playwright 計畫 §測試執行報告 Wave 1、§Phase Q/R。

### 問題定義（定案）

```text
大檔 virtual-scroll explicit centering 管線不穩。
Test A（Ctrl+Enter confirm-jump）：穩定 reproducer，rowCenterDeltaPx ≈ +71。
Test B（clear-filter return-to-target）：間歇 sibling，rowCenterDeltaPx ≈ -32。
焦點可進入目標譯文格（focusOk），但 center 無法收斂至 ≤16px（centerOk fail）。
```

**不是**：Playwright 點錯列；純 focus bug；「只修 Ctrl+Enter 即可忽略 B」。

### 修復範圍

- **Shared path**：`pending.explicitNav === true` 且 `scrollBlock === 'center'`（confirm-jump、清除篩選、Ctrl+Alt+↓、Ctrl+G 等 explicit 置中）。
- **入口**：以 Test A 為穩定 reproducer；**必須**對照 Test B 路徑，找最小共用差異。
- **不做**：整包重寫 `CatVirtGrid`；把手動點擊／F8／typing 改成 force center；放寬 16px 門檻。

### Inspect 清單

```text
1. flushPendingEditorFocus（center retry 分支）
2. scheduleEditorFocus（explicitNav、forceVirtScroll、scrollBlock）
3. confirm-jump handler（app.js L25106 一帶）
4. flushFilterAnchorAfterVirtRender（clear-filter）
5. CatVirtGrid.scrollToSegId / centerOnSegId / isSegIdCentered
6. renderWindow + setScrollTopDeferred 時序
7. ResizeObserver / invalidateHeights（confirm 或 filter 後是否覆寫 scrollTop）
8. cancelNavigationAnchor reason（失敗時勿標 nav-complete）
```

### 修復原則

```text
explicit navigation in virt mode:
1. target row mount
2. CatVirtGrid scroll / center
3. wait for renderWindow + setScrollTopDeferred + height invalidation settle
4. focus target editor（preventScroll）
5. measure center；僅 focusOk && centerOk 才完成
6. retry 掛在 layout 事件後，非僅同 stack rAF×3
```

### Phase Q → R 順序

1. **Phase Q**：`[catNav] explicit center diagnostic` log（`catNavDebug` gate）；`repeat-each` A×3、B×5；A/B 路徑對照表。
2. **Phase R**：依對照結果修 shared timing → `npm run sync:cat` → 重跑 Playwright 全矩陣（§Phase R 指令）。

細節與報告模板：Playwright 計畫 §Phase Q、§Phase R。

---

## 實作順序

```text
1. Layer 0
2. Layer B + D（同 commit）
3. Layer A
4. Layer C
5. npm run sync:cat
6. 全量驗收 A～F
```

---

## 程式觸點索引

| 檔案 | 區段 |
|------|------|
| [`cat-tool/app.js`](../cat-tool/app.js) | L4071 focusin、L21620 notifyVirtUserScroll、L21666–21897 filterAnchor／flush、L25106 confirm-jump、L25335 onAfterRender |
| [`cat-tool/js/grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js) | L96–112 nav lock、L200–203 resize anchor、L451–560 scroll／center／invalidate |
| [`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js) | L583–600 refreshAfterVirtRender |
