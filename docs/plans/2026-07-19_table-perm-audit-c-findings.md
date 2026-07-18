狀態：規劃中

# 工項 C 稽核發現（費用／稿費請款／客戶請款）— 修補前清單

日期：2026-07-19  
分支：`feat/table-perm-audit-c`  
權威：`docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md` §9.2／§9.6–§9.7；計畫 `docs/plans/2026-07-18_table-interaction-filter-perm-plan.md`  
範圍：費用、稿費請款、客戶請款。**案件／內部註記不動。**  
本檔僅稽核結果；**待擁有者裁定後再修補**（禁止自行發明權限規則）。

---

## A. 確認一致

- 列級 RLS：`invoices`／`invoice_fees`／`fees` 本人＋`fees` 非草稿；`client_invoices*` 僅 admin。
- `fees_visible` 營收禁區遮罩與 `rateConfirmed` 對譯者為 false（批次 3）。
- `fee-store` 讀取／realtime 重查走 `fees_visible`；寫入仍走 `fees`。
- 客戶請款：側欄＋`RequireModule`＋頁面 `!isAdmin`＋RLS。
- 費用詳情：營收／客戶請款狀態等對非 manager 隱藏；譯者可看稿費內容與收錄請款。

---

## B. 與 §9.2 不一致／漏洞

| ID | 嚴重度 | 模組 | 現象 | 證據 | §9.2 要求 | 建議修法（待裁定） |
|---|---|---|---|---|---|---|
| C-01 | 高 | 費用 | `internal_note`／`internal_note_url` 在 UI 是「相關案件」，view 對譯者清空 → 詳情殘影「未設定」 | `fees_visible` migration；`TranslatorFeeDetail` 相關案件欄 | 白名單含「相關案件」；禁區是「內部備註」 | view 放行相關案件欄；真正內部備註另軌遮罩 |
| C-02 | 高 | 費用總表 | `translatorInvoiceStatus`、`translatorInvoice`、`internalNote`（關聯案件）皆 `managerOnly`，譯者總表看不到白名單欄 | `TranslatorFees.tsx` `allColumnDefs`／`managerOnlyFields` | 譯者應見稿費請款狀態、請款單連結、相關案件 | 自 `managerOnly` 移除白名單 key；客戶請款單欄維持禁區 |
| C-03 | 高 | 權限鍵 | 列表／側欄／路由用複數（`translator_invoices`／`client_invoices`），Permissions／詳情用單數 → 權限頁管不到列表 | `InvoicesPage`／`AppSidebar`／`App.tsx` vs `PermissionsPage` | 鍵必須對齊 | 統一 canonical key 並遷移既有 permissions JSON |
| C-04 | 中 | 客戶請款 | 路由查 `cinv_list_view`，Permissions 無此 item（幽靈鍵） | `App.tsx`／`AppSidebar`／`PermissionsPage` | 譯者不可見且可治理 | 補「檢視列表」item 或改對齊既有鍵 |
| C-05 | 中 | 費用總表 | 展開修改紀錄仍 `checkPerm` 過濾，可能重現 F1（譯者白名單條目被濾光） | `TranslatorFees` `EditLogPanel`；詳情已略過 | SQL 已遮罩，譯者直接渲染 | 非 admin 列表與詳情一致略過 `checkPerm` |
| C-06 | 中 | 費用 Realtime | 應用層已重查，但 WS `payload.new` 仍可能含未遮罩全欄（DevTools） | `fee-store` postgres_changes 訂閱 `fees` | 欄位靠遮罩層 | 產品裁定：是否必須堵 WS 殘影 |
| C-07 | 中 | 費用總表 | `invoice`「請款單」欄實際仍用 `useInvoices()`（稿費請款），與客戶請款禁區語意混淆 | `TranslatorFees` `InvoiceLink` | 客戶請款連結禁區；稿費連結白名單 | 拆欄或刪重複；白名單只留 `translatorInvoice*` |
| C-08 | 中 | 權限×總表 | 費用／請款 `table_field_*` 在 Permissions 幾乎未登錄 → 細項開關失效 | 各列表 `checkPerm` vs `PermissionsPage` | 無權欄不得進表／選單 | 補齊項目，或以 §9.2 硬編碼矩陣為準並文件化 |
| C-09 | 低 | 費用（B 前置） | orphan 8 metas 含 client 四欄；B 補欄時若未套 C，會進篩選選單 | `use-table-views`／`TranslatorFees` | 譯者不可見客戶側 | B：client* 必 managerOnly；fee* 對譯者開放 |
| C-10 | 低 | 費用 | `managerOnlyFields` 含未用 `hdPath`；「關聯／相關案件」用語不一致 | `TranslatorFees.tsx` | 用語與白／黑名單一致 | 清死碼；統一用語 |

---

## C. 需產品裁定後才能修

1. **`fees.internal_note` 語意（C-01）**：§9.2 白名單「相關案件」vs 現行 view／測試當機密遮罩——以哪個為準？
2. **Module key 正規名（C-03）**：以 PermissionsPage 單數為準並遷移 DB，或改 Permissions 為複數？
3. **Realtime WS 原表 payload（C-06）**：是否必須堵住，或接受「store 不落地即可」？
4. **同名 `display_name` 互看（§9.5）**：是否納入本 C 分支？（建議另工單）

---

## 下一步

擁有者回覆裁定後，於本分支依清單逐項修補、附回歸測試／DB 腳本，獨立 PR 送驗收。工項 B（含 orphan 8）等本 C 驗收通過後再開。
