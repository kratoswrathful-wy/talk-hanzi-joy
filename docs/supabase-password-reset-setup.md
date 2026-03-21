# Supabase 重設密碼收信設定（操作檢查清單）

應用程式已使用 `resetPasswordForEmail` 與 `/reset-password` 頁面。收不到信時請依序完成下列項目。

## 1. URL Configuration（必做）

**路徑：** Supabase Dashboard → **Authentication** → **URL Configuration**

| 項目 | 說明 |
|------|------|
| **Site URL** | 設成使用者主要進站網址（例如 `https://tms.one-up-studio.com`），需與正式環境一致。 |
| **Redirect URLs** | 必須**逐筆加入**下列完整網址（含 `https`、路徑、**勿**多餘尾隨斜線）： |

建議至少加入：

- `https://tms.one-up-studio.com/reset-password`（若使用自訂子網域）
- `https://talk-hanzi-joy.vercel.app/reset-password`（Vercel 預設網域）
- `http://localhost:8080/reset-password`（本機開發；埠口請依 `vite.config`）

若有其他環境（Preview、www），各加一筆對應的 `.../reset-password`。

**與程式對齊：** 若已在 Vercel 設定環境變數 `VITE_SUPABASE_AUTH_REDIRECT_ORIGIN`，`redirectTo` 會使用該網址根目錄；Redirect URLs 必須包含  
`{該網址}/reset-password`。

---

## 2. 確認測試帳號存在

**路徑：** **Authentication** → **Users**

- 重設密碼所填的 **email** 必須已註冊；若不存在，部分設定下**不會寄信**（避免洩漏帳號是否存在）。
- 若前端顯示成功仍無信，請在此確認使用者是否存在。

---

## 3. 仍收不到信：自訂 SMTP（建議正式環境）

**路徑：** **Project Settings** → **Authentication**（或 **Auth**）→ **SMTP** / **Custom SMTP**

- 內建寄件（`@mail.app.supabase.io`）可能被標為垃圾郵件或有速率限制。
- 設定公司郵件、Gmail、SendGrid、Resend 等 **SMTP**，寄件人與到達率較穩定。

---

## 4. 垃圾郵件與速率

- 搜尋 **垃圾郵件 / 促銷**，寄件者常見為 `noreply@mail.app.supabase.io`（或自訂 SMTP 網域）。
- 短時間多次按「忘記密碼」可能觸發 **rate limit**，請間隔數分鐘再試。
- 若有 **Logs**（Auth / API），可查看寄信或錯誤紀錄。

---

## 5. Email 範本（可選）

**路徑：** **Authentication** → **Email Templates** → **Reset Password**

- 確認模板啟用，且內容含 `{{ .ConfirmationURL }}`（預設通常有）。

---

## 重設密碼頁請從信件連結開啟

Supabase JS v2 預設 **PKCE**：信件內連結會帶 `?code=...`。[`ResetPasswordPage`](../src/pages/ResetPasswordPage.tsx) 會呼叫 `exchangeCodeForSession` 建立 session 後才允許更新密碼。若自行在網址列輸入 `/reset-password` 或按 F5 洗掉參數，會沒有 session。

## 相關程式

- [`src/pages/AuthPage.tsx`](../src/pages/AuthPage.tsx)：`resetPasswordForEmail`、`redirectTo`
- [`src/pages/ResetPasswordPage.tsx`](../src/pages/ResetPasswordPage.tsx)：`exchangeCodeForSession`（PKCE）、`updateUser({ password })`
