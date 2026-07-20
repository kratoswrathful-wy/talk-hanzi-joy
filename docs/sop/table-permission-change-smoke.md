狀態：常駐規範

# SOP：資料表權限變更後的角色冒煙規範

日期：2026-07-20  
緣起：工項 D（#58）將 `cases` 基表 SELECT 收為僅 admin 後，在 PostgreSQL RLS 下「UPDATE 需能 SELECT 到該列」，導致譯者所有直寫 `cases` 的 UPDATE 靜默回 0 列、無 4xx，連帶承接／完成／協作承接／decline／退回／交件全部失效（修復見 #63 `apply_case_update` RPC，結案見 [`docs/plans/2026-07-20_cases-translator-update-rls-regression.md`](../plans/2026-07-20_cases-translator-update-rls-regression.md)）。此類故障在測試環境未被發現，因驗收只測「讀不到／敏感欄寫不進」，缺「允許欄的增刪改冒煙」。本規範將其固化為必做步驟。

交叉引用：工程主計畫 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](../ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md) §7、§9.10。

## 1. 適用時機（符合任一即觸發）

1. 任何 migration 變更資料表的 RLS 政策、GRANT、欄位權限。
2. 新增或改寫 `*_visible` 遮罩 view、將基表 SELECT 收為僅 admin/service。
3. 將資料表移入／移出 realtime publication。
4. 新增或改動 SECURITY DEFINER RPC 作為寫入代理。

## 2. 必做冒煙（每個受影響角色各跑一輪，正式環境等值情境）

對受影響資料表，以**該表最低權限的實際角色**（通常是譯者/member）登入，逐項確認 CRUD 不因權限變更而斷裂：

1. **讀**：清單與詳情能載入，可見欄符合矩陣、敏感欄遮罩正確。
2. **寫（允許欄）**：逐一觸發該角色所有會 UPDATE 該表的動作——以 `cases` 為例：承接（單檔）、協作分段承接、按完成、decline、退回、交件、以及總表可編欄位的行內編輯。每項確認 DB 實際落地（非僅前端 optimistic UI）。
3. **寫（禁止欄）**：確認敏感欄寫入被擋（回傳與 DB 皆未變）。
4. **側門**：屬性／篩選／排序選單不含無權欄；API 直讀基表得 0 列或遮罩值。
5. **關聯連鎖**：確認依賴該寫入的後續動作（如 CAT 檔案指派、Slack、狀態推導）在該角色下都完成。

## 3. 兩個必記陷阱

1. **RLS 下 UPDATE 需 SELECT 權**：收基表 SELECT 會靜默打斷同角色的 UPDATE，典型徵狀是 **HTTP 200 + 0 列、無 4xx**，optimistic UI／獨立路徑（如 Slack）仍會先跑，極易誤判為成功。凡收 SELECT 權，必查所有該角色的寫入路徑是否需改走 SECURITY DEFINER RPC 或遮罩 view。
2. **測試環境資料缺口**：測試環境常缺選項資料、承接情境、跨角色資料，會讓權限副作用不顯現。基表權限類變更的驗收，**必須在正式環境或正式等值資料上跑一輪**，不得只靠測試環境綠燈。

## 4. 驗收門檻

上述冒煙未逐項綠燈前，涉及資料表權限變更的 PR 不得標記通過。  
驗收報告須列出「受影響角色 × CRUD 動作」的實測清單與落地佐證（DB 查詢或 Network RPC 呼叫）。
