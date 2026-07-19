狀態：已驗收

# 驗收結案紀錄：表格互動統一＋篩選排序＋權限稽核（工項 A–C）

結案日期：2026-07-19
對應工單：工單_表格互動統一與篩選排序權限稽核_2026-07-18.md
執行計畫留存：repo `docs/plans/2026-07-18_table-interaction-filter-perm-plan.md`（`6c2afc10`）
驗收方式：Vercel preview ＋ 測試模式假人帳號（test-exec／test-pm／test-t1）實測，Supabase SQL 與 PostgREST API 直查佐證
目前 `origin/main` HEAD：`ac252d17`

## 合併總表

| 工項 | 內容 | PR | merge commit |
|---|---|---|---|
| A | 可編輯儲存格互動統一（MultiColorSelect 單擊即開＋Escape 修復） | #55 | `ca3262f0` |
| B | 篩選/排序全欄位＋orphan 8 欄進費用總表 | #57 | `ac252d17` |
| C | 費用/請款權限稽核修補（W10 §9.2，含 C-11 基表側門） | #56 | `255cf6f7` |

## 工項 A：驗收要點與過程

1. 案件「譯者」「工作類型」單擊即開選單（原需兩段式點擊）；選後頭像文字對齊正常。
2. 唯讀欄（計費單位數）未變可編輯；費用表 colorSelect／文字欄回歸正常。
3. **第一輪退回**兩缺陷：Escape 關閉後（a）案件譯者已寫入 DB 但顯示不更新；（b）費用譯者殘留「選擇…」編輯樣態。補修 `beb07d60`（ColorSelect 補 onOpenChange；multiColorSelect 關閉時同步最後值）後重測通過，畫面與 DB 一致。
4. 多人協作交期唯讀：無協作測試資料，依變更範圍未觸及 Collab 元件判定（未實測，記錄在案）。

## 工項 B：驗收要點

1. 費用總表新增稿費側 4 欄＋營收側 4 欄（原 orphan metas），預設隱藏、屬性可開；exec 屬性 19/30。
2. 排序/篩選欄位清單與表格欄位同步（含新欄），實測排序生效；運算子符合型別。
3. 既有使用者視圖欄序/欄寬未被新欄打亂。
4. 權限側門：譯者屬性/篩選清單僅白名單 9＋稿費側 4，營收側四欄不可見（§9.2）。

## 工項 C：驗收要點與過程

1. 譯者列級隔離（僅本人列）；欄位白名單含「相關案件」「稿費請款狀態/單」（C-01/C-02，internal_note 語意經 DB 抽查裁定為案件參照）。
2. 選單側門（C-08）、路由防護（/client-invoices 擋非 PM+）、權限 key 單數統一（C-03）均通過。
3. C-06：`fees` 移出 `supabase_realtime` publication、改訂閱 `fee_change_signals`（SQL 實查）。
4. **第一輪退回 C-11（高嚴重度）**：譯者 token 直讀 PostgREST `public.fees` 基表可取得完整 client_info 與 edit_logs，繞過 view 遮罩。補修 `8080ce16`（基表 SELECT 僅 admin；fees_visible 改 security definer 內嵌列過濾）後重測：基表 0 列、view 遮罩正確。
5. 其他基表盤查：client_invoices/client_invoice_fees 本即 admin-only；invoices 譯者本人列符合 §9.2。
6. Migration 均走 db push：`20260718190218`、`20260719033336`。

## 未結事項（不擋結案）

1. **案件／內部註記的角色×欄位權限矩陣無明文定稿**——工項 C 依紅線未動這兩模組，待使用者與驗收方討論定案後另開工單。
2. C-09/C-10 低優先項列入待辦。
3. 註記/稿費請款/客戶請款總表「行內編輯」屬產品擴範圍，未納入本工單。
4. 多人協作交期唯讀僅程式面判定，建議下次有協作資料時順手抽驗。

## 過程備忘（供日後驗收參考）

1. 測試環境 e2e 併發跑動會使總表列序變動，驗收互動時先用篩選鎖定單列再操作。
2. Preview 跨 origin 搬 session 可用 `window.name` 中轉 localStorage auth token，免重登。
3. 測試模式身分切換後，localStorage session 會換成對應假人帳號，API 層測試可直接取 token。
4. 驗收無正式資料殘留；測試值（案件 translator、篩選/排序規則）均已清回。
