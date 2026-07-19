狀態：已落地待驗收

# 工項 C 稽核發現與修補結果（費用／稿費請款／客戶請款）

日期：2026-07-19  
分支：`feat/table-perm-audit-c`  
權威：W10 §9.2；計畫 `docs/plans/2026-07-18_table-interaction-filter-perm-plan.md`  
範圍：費用、稿費請款、客戶請款。**案件／內部註記不動。**

---

## 裁定摘要（2026-07-19）

1. **C-01**：`internal_note`＝相關案件 → 對譯者可見；修正 `fees_visible`。真正機密內部備註另開欄位（非本次）。
2. **C-03**：canonical＝Permissions 單數 key；列表／路由改查單數＋相容讀複數；URL 不改名。
3. **C-06**：Realtime 原表 payload 為漏洞，必須堵 → 改訂閱 `fee_change_signals`，自 publication 移除 `fees`。
4. **C-02／C-04／C-05／C-07／C-08**：依 findings 修補。C-09／C-10 低優先不擋驗收。

---

## 修補對照

| ID | 狀態 | 作法 |
|---|---|---|
| C-01 | 已修 | migration 重建 `fees_visible` 放行 `internal_note`／`url`；DB 腳本斷言已改 |
| C-02 | 已修 | 總表移出 `managerOnly`：`internalNote`、`translatorInvoiceStatus`、`translatorInvoice`；用語「相關案件」 |
| C-03 | 已修 | `permission-module-key` 正規化；側欄／路由／列表改單數；`checkPerm` 相容複數 config |
| C-04 | 已修 | PermissionsPage 補 `cinv_list_view` |
| C-05 | 已修 | 列表 `EditLogPanel` 非 admin 略過 `checkPerm`（信 `fees_visible.edit_logs`） |
| C-06 | 已修 | `fee_change_signals`＋trigger；publication 僅信號表；`fee-store` 訂閱信號後重查 view；poll 改 `fees_visible` |
| C-07 | 已修 | `invoice` 欄改 `ClientInvoiceLink`＋`useClientInvoices`，標籤「客戶請款單」，維持 managerOnly |
| C-08 | 已修 | `FEE_TABLE_MANAGER_ONLY_KEYS` 硬編碼＋Permissions 補齊禁區 `table_field_*`；member 預設拒絕禁區 |
| C-09 | 待辦 | orphan 8 欄 → 工項 B |
| C-10 | 待辦 | `hdPath` 死碼等小清理（`managerOnlyFields` 已改共用集合，無 hdPath） |

Migration：`supabase/migrations/20260718190218_w10_fees_visible_related_case_and_change_signals.sql`（已 `db push`）。

---

## 驗收要點

1. 譯者：費用總表可見「相關案件」、稿費請款狀態／連結；不可見營收／客戶／客戶請款單／客戶請款狀態。
2. 譯者：客戶請款路由／側欄仍不可見（`cinv_list_view`）。
3. 譯者：`fees_visible.internal_note` 有值；`client_info.client` 仍空。
4. DevTools／Realtime：訂閱不到 `fees` 全列；僅見 `fee_change_signals` 非敏感欄。
5. 權限頁「客戶請款 → 檢視列表」可治理；列表／詳情 module key 對齊單數。
6. 既有使用者費用視圖欄序／篩選不應損壞（key 未改，僅可見性與標籤微調）。
