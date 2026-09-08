狀態：已落地（流程紀錄；非功能工項，不授權重部署）

# 正式前端準備：不可只靠 `--skip-domain` 名稱推定別名不變

紀錄第 2 項（2026-09-08）準備階段實害，供後續發布方案使用。不重開第 2 項，不在本紀錄授權回切或重部署。

## 發生什麼

核准要求：先建 production 產物、**不切正式別名**，確認後再 `db push`，再把已準備好的候選指到正式網域。

當時使用：

```text
npx vercel deploy --prod --skip-domain --yes
```

CLI 說明寫「Disable the automatic promotion (aliasing) of the relevant domains」。實測：

| 時間（約，+08） | 別名 | 實際指向 |
|---|---|---|
| 16:25:52 候選 READY | `talk-hanzi-joy.vercel.app` | 仍為舊 `dpl_9nNqVH6Y6KzEqfoHkySY6iYFGN89` |
| 同時 | `talk-hanzi-joy-1-up-localization-studio.vercel.app` | **已被指到新** `dpl_GvfaeuNYFaqKtEkBZWoQ3nCviH2w` |
| 約 16:27 | 團隊別名 | 已手動 `vercel alias set` 指回 `dpl_9nNq…`（在 `db push` 前） |
| `db push` 後至 `vercel promote` | 兩個別名 | 舊前端＋新庫（短窗口） |
| promote 成功後 | 兩個別名 | `dpl_GvfaeuNYFaqKtEkBZWoQ3nCviH2w` |

`--skip-domain` **沒有**保住團隊 `.vercel.app` 正式別名。自訂網域當次未切。

## 已知影響

- 約兩分鐘：團隊別名 = 新前端、正式庫仍舊（管理代完成 RPC 尚不存在）。
- 該期間是否有人用該網址操作：**未知**（無使用紀錄，不得寫「無影響」）。
- 自訂網域使用者當下仍走舊前端。

## 後續發布核實（不得只靠旗標名稱）

1. `vercel deploy --prod --skip-domain`（或同等準備）結束後，**立刻**對每一個正式別名做 `vercel inspect <hostname>`，確認 deployment id 仍是準備前的基準。
2. 用正式網域與團隊網域各抓一次 HTML／主 JS 特徵字串，兩邊都要仍是舊產物。
3. 任一正式別名已指向候選：先把該別名指回基準 deployment，再決定是否繼續 `db push`。
4. 切正式前端用 `vercel promote <已核實的 dpl>`（或對**每一個**正式別名明確 `alias set`），完成後再 inspect 兩側。
5. 準備用的獨特 URL（`talk-hanzi-*.vercel.app`）可單獨核實產物；它不是正式路由。
