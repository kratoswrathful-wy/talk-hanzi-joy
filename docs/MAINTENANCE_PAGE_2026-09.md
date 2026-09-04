狀態：維護頁 Preview 候選（不得 merge／不得 promotion 至 production）

# 靜態維護頁（ops/p0-maintenance-page-20260904）

本分支自 production `main` @ `724eb886` 分出，**獨立於** Draft PR #81（候選 `28f80509`）。

## 行為

- 所有路徑（含 `/`、`/cases`、`/cat/team`、任意 404 路徑）經 `vercel.json` rewrite 顯示同一靜態頁。
- **不**載入 React、LMS、CAT、Auth、Supabase client；`build` 只複製 `index.html`（無 app bundle、無 `<script>`）。
- 預計恢復時間：建置時以環境變數 `MAINTENANCE_ETA`（非敏感字串）取代 `__MAINTENANCE_ETA__`。

## 明確限制

1. **不能**遠端關閉使用者先前已開啟的舊 LMS／CAT 分頁。
2. 資料庫安全更新套用後，舊分頁的不相容寫入應由**新權限規則**拒絕。
3. 本部署僅供維護窗口期間臨時使用；窗口結束後由 PR #81 候選版本取代。
4. 可獨立於 `main`／PR #81 部署與下架。

## 驗證（Gate 2C）

| 項目 | 結果 |
|---|---|
| Draft PR | [#82](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/82)（`fb620f51`） |
| Vercel Preview | `https://talk-hanzi-joy-git-ops-p0-maint-bcbcc2-1-up-localization-studio.vercel.app`（Vercel Authentication／SSO 保護；自動化瀏覽器會進登入頁，非正式公開證據） |
| 本機 SPA 預覽 | `npm run preview`（`scripts/preview-maintenance.mjs`）對 `/`、`/cases`、`/cat/team`、不存在路徑皆回同一 HTML |
| 無 Supabase | HTML 無 script／無 `@supabase`；Network 不應出現 `supabase.co` REST／Auth／Realtime |
| production | **未**部署 |
