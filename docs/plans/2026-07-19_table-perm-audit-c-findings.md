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
5. **C-11（驗收退回）**：譯者 PostgREST 直讀 `public.fees` 仍得完整 `client_info` → 基表 SELECT 僅 admin；`fees_visible` 改 `security_invoker=false` 並內嵌列級條件。

---

## 修補對照

| ID | 狀態 | 作法 |
|---|---|---|
| C-01 | 已修 | migration 重建 `fees_visible` 放行 `internal_note`／`url`；DB 腳本斷言已改 |
| C-02 | 已修 | 總表移出 `managerOnly`：`internalNote`、`translatorInvoiceStatus`、`translatorInvoice`；用語「相關案件」 |
| C-03 | 已修 | `permission-module-key` 正規化；側欄／路由／列表改單數；`checkPerm` 相容複數 config |
| C-04 | 已修 | PermissionsPage 補 `cinv_list_view` |
| C-05 | 已修 | 列表 `EditLogPanel` 非 admin 略過 `checkPerm`（信 `fees_visible.edit_logs`） |
| C-06 | 已修 | `fee_change_signals`＋trigger；publication 僅信號表；`fee-store` 訂閱信號後重查 view |
| C-07 | 已修 | `invoice` 欄改 `ClientInvoiceLink`＋`useClientInvoices`，標籤「客戶請款單」，維持 managerOnly |
| C-08 | 已修 | `FEE_TABLE_MANAGER_ONLY_KEYS` 硬編碼＋Permissions 補齊禁區 `table_field_*`；member 預設拒絕禁區 |
| C-09 | 待辦 | orphan 8 欄 → 工項 B |
| C-10 | 待辦 | 低優先用語／死碼 |
| **C-11** | **已修（退回補修）** | `fees_select` 僅 `is_admin`；`fees_visible`＝`security_invoker=false`＋WHERE 列過濾；poll 改 `fees_visible`；驗證腳本 `w10_fees_base_select_deny_check.sql` |

Migrations（皆已／將 `db push`）：

- `20260718190218_w10_fees_visible_related_case_and_change_signals.sql`
- `20260719033336_w10_fees_base_table_select_admin_only.sql`

---

## 基表直讀盤查（C-11 要求 2）

| 基表 | 譯者直讀 PostgREST？ | 是否有欄位遮罩 view？ | 判定 |
|---|---|---|---|
| `fees` | **修前：可（漏洞）→ 修後：RLS 擋成 0 列** | 有 `fees_visible`（欄位遮罩） | **已堵** |
| `client_invoices` | 否（SELECT 僅 `is_admin`） | 無（整表 admin-only） | **OK**，無需 view |
| `client_invoice_fees` | 否（同上） | 無 | **OK** |
| `invoices` | 可讀**本人**列（§9.2 列級本意；無額外營收欄需遮罩） | 無 | **OK**（列級即可；非「繞過 view」情境） |
| `invoice_fees` | 可讀本人請款單之連結列 | 無 | **OK**（同上） |
| `fee_change_signals` | 僅本人可見信號（無 `client_info`） | — | **OK**（設計如此） |

結論：需欄位遮罩的只有 `fees`；其餘敏感表要嘛 admin-only，要嘛 §9.2 允許譯者見本人完整列且無平行遮罩 view 可繞。

---

## 驗收要點（含 C-11）

1. 譯者 Bearer：`GET /rest/v1/fees?select=*&limit=1` → **0 列**（不得見 `client_info`）。
2. 譯者：`GET /rest/v1/fees_visible?select=*&limit=1` → 本人非草稿列；`client_info.client` 空；`internal_note` 可有值。
3. PM：`GET /rest/v1/fees` 仍可見完整列；UI 費用／請款回歸如前。
4. 其餘 UI／Realtime／路由通過項維持。
