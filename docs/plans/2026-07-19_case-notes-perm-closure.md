狀態：已驗收

# 驗收結案紀錄：案件與內部註記權限定稿實作（工項 D–E）

結案日期：2026-07-19
對應工單：工單_案件與內部註記權限定稿_2026-07-19.md
承接：表格互動統一工單（A–C）未結事項第 1 項
驗收方式：Vercel preview ＋ 測試模式假人帳號（test-t1／test-exec）實測，Supabase SQL 與 PostgREST API 直查佐證
目前 `origin/main` HEAD：`0996a116`

## 合併總表

| 工項 | 內容 | PR | merge commit |
|---|---|---|---|
| D | 案件欄位遮罩（cases_visible＋基表收權＋realtime 信號＋寫入擋） | #58 | `5620c157` |
| E | 內部註記全員可見可編（預設與 permission_settings 對齊＋文件收斂） | #59 | `0996a116` |

備註：#59 合併前與 #58 在 §9.2 有文件衝突，解成「案件＋內部註記」兩段並存後合併。

## 權限矩陣定稿（本工單的裁定內容）

角色兩級：譯者／PM 以上（PM 與執行長本次同權）。

1. 案件列級：譯者可見**全部案件**。
2. 案件譯者不可見七欄：客戶、聯絡人、關鍵字、客戶 PO#、派案來源、客戶案件單連結、案件內部備註；其餘欄（含譯者/審稿他人名單）可見。
3. 案件詳情費用區塊：譯者僅見指派給自己的費用，筆數不洩漏他人。
4. 內部註記：全員可見、可編輯（案件執行討論性質）。
5. 通則：所有模組「內部備註」類欄位限 PM 以上。
6. 追認裁量（計畫階段核可）：edit_logs 於 view 內 SQL 過濾七欄相關條目；非 admin 寫入七欄被擋。

## 驗收結果摘要

### 工項 D（commit `e9a8887c`）

1. 譯者 token 直讀 `/rest/v1/cases` 基表 → 200、0 列；`cases_visible` → 同 env 全案可見（列級未收）。
2. 七欄遮罩：字串欄清空、client_case_link 空物件、internal_comments 空陣列，實查正確。
3. 寫入擋：譯者 PATCH `cases` 改 client → 200 但 0 列、DB 值未變（RLS＋基表收權雙擋）。
4. 側門：譯者屬性清單 14 欄（總表五個敏感欄排除）、篩選/排序清單一致。
5. Realtime：`cases` 移出 `supabase_realtime`、`case_change_signals` 加入（SQL 實查）。
6. PM/執行長全欄可見、流程不變。

### 工項 E（commit `65f2117a`）

1. `permission_settings`：test 與 production 的 member.internal_notes.visible＝true、各 `inotes_*` view/edit 全 true（SQL 實查）。
2. 譯者一可進 `/internal-notes`、側欄有模組、工具列完整、可新增。
3. 測試環境 62 筆註記全在 production env，test env 無資料，譯者見空清單屬資料面正常，非權限問題。

## 未結事項（不擋結案）

1. PM 與執行長分級（含費用模組）——未來議題，另開工單。
2. 內部註記的「譯者可編輯他人註記」細部行為未逐項實測（DB RLS 本即全開，維持現狀）；如日後要收斂編輯權再議。
3. E 的強制對齊會覆寫先前手動關閉的 member 註記設定——已依定稿執行，若日後發現有刻意關閉的細項需求，於 Permissions 頁再調。

## 過程備忘

1. 測試環境 e2e 併發會持續產生 [PW] 案件，互動驗收先用篩選鎖單列。
2. 跨 preview origin 搬 session 用 window.name 中轉；refresh token 一次性（already used 會 400），有效 session 要從現存 origin 的 localStorage 複製。
3. 驗收無資料殘留：寫入擋測試的 PATCH 未落地（DB 確認）。
