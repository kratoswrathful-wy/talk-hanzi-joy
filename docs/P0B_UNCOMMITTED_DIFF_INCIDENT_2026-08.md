# P0-B 未提交 diff 存證（2026-08-31）
狀態：已處理（已 git restore 回 `bd853bf2`；未使用 Cursor Discard）

## 來源

- 工作區：`C:\Homemade Apps\1UP-TMS-p0b-20260830`
- HEAD：`bd853bf2`
- 檔案：`src/pages/CatToolPage.tsx`（僅此檔 dirty）
- 完整 diff（gitignored）：`scripts/.cache/p0b-uncommitted-cattoolpage-20260831.diff`

## 摘要（相對 `bd853bf2` 的危險退回）

| 行為 | `bd853bf2`（安全） | 未提交 diff（不安全） |
|---|---|---|
| iframe message | `isTrustedCatIframeMessage`（origin **＋** `event.source === iframe.contentWindow`） | 僅 `event.origin` |
| assignment status | `cat_update_file_assignment_status`／`cat_update_view_assignment_status` RPC | 直接 `.from(...).update(...)` |
| PM assign／unassign | `cat_pm_assign_file`／`cat_pm_unassign_file` RPC | 直接 upsert／delete＋stage table DML |

統計：+70／−23 行。

## 可能產生原因

未提交 diff 內容高度吻合 **P0-B  hardening 前** 的舊寫法（只驗 origin、PostgREST 直寫）。較可能來源：

1. 其他代理／本機編輯在共用或誤開此 worktree 時，以舊片段覆寫 handler；或
2. 編輯器／合併工具把區塊還原成較舊緩衝，而未走 Cursor Discard（工作區無 `reset: moving to HEAD` 跡象，僅單檔 modified）。

無法從 git  alone 斷言是哪一個操作者；已存證後以 `git restore --source=HEAD` 恢復安全版。

## 處理

- 2026-08-31：`git restore --source=HEAD -- src/pages/CatToolPage.tsx`
- 不使用 Cursor Discard UI
- 後續另建修正 checkpoint（含本說明）
