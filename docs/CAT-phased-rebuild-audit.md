# CAT 分階段重建計畫 — 程式庫對照

> 對照來源：`.cursor/plans/cat_分階段重建_c26d361c.plan.md`（五階＋橫向）  
> 掃描範圍：儲存庫內 `cat-tool/`（含 `public/cat/` 同步目標，邏輯以 `cat-tool` 為準）  
> 日期：依目前 `main` 靜態檢視（未替換實測迴歸）

## 總表

| 階段 | 計畫重點 | 對庫結論 | 說明 |
|------|----------|----------|------|
| **階 1** | 更新 `bug-report_mqxliff` 敘事；`style.css` 原文欄最小高度 | **已完成** | [`docs/bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md) 已有實作對照表；[`cat-tool/style.css`](../cat-tool/style.css) 含 `.col-source .rt-editor { min-height: 1.35em; }` |
| **階 2** | `xliff-tag-pipeline` 匯出分岔、xliff-import 補譯文 tag、`.mxliff` 與 xlf 同路徑 | **已完成（依文件與實作指標）** | 同一份 bug 文件列 Bug #2/#3A/副檔名 **已實作** 並指到 `xliff-tag-pipeline.js`、`xliff-import.js`、`app.js`；**仍建議**用既有「建議測試」作迴歸，非本次靜態掃描可證偽。 |
| **階 3** | 搜尋不覆寫原／譯 tag pill；`normalizeXmlForSig` | **已完成（依文件與實作指標）** | 同上，Bug #4 與簽名正規化欄在 bug 表標 **已實作**；`app.js` 內有 `normalizeXmlForSig`、`runSearchAndFilter` 等關聯。 |
| **階 4** | 新專案歡迎／導向；AI 批次與 `_buildAiOptions` 帶入「類型」篩文風 | **核心已完成，產品表述與舊 plan 有差** | 存在 `showNewProjectWelcome`、`projectWelcomeModal`、`openAiBatchModal`、`config.batchStyleExampleCategories` → `_buildAiOptions(..., batchStyleExampleCategories)`。**舊 plan** 寫「沿用本檔／手打二擇一」；**目前**已改為**全站 `aiCategoryTags` 管理**、**僅批次**依勾選陣列篩文風、**本檔 `aiDomains` 已移除**（見近期提交）。行為上仍符合「階4：專案引導 + 批次帶參篩文風」。 |
| **階 5** | 共用資訊 UI、`loadSharedInfoAiPanel`、專案頁可讀共用內容；專案 vs 本檔準則分流；5b 團線欄位/RPC | **大塊已落地；「本檔專屬準則 ID 覆寫」未見、5b 未在此核** | 已有 `loadSharedInfoAiPanel`、共用資訊 modal／側欄、專案頁 `btnOpenSharedInfo`、本檔 `aiSeriesException` 等。`db.js` 中 **`files` 表未見** 獨立 `selectedGuidelineIds` / 本檔覆寫陣列（僅專案 `aiProjectSettings` 存選中準則與文風 ID）。**階5b**（Supabase 遷移、[`cat-cloud-rpc`](../src/lib/cat-cloud-rpc.ts) 對位）需專案另開工作單實地核。 |

## 橫向

| 項目 | 狀態 |
|------|------|
| 每階 `sync:cat` | 已制度化：`package.json` `prebuild` → `sync:cat`；另見 `AGENTS.md`、`.cursor/rules/cat-tool-source.mdc` |
| bug 表隨階2/3 短更新 | **已做**（`bug-report_mqxliff` 表頭寫 階1–3 與各項 已實作） |

## 結論（給「是否只剩 P5」）

- **階 1～4**：就**計畫當年寫的技術子項**而言，在程式＋`bug-report_mqxliff` 上**多數已就緒**；P4 與現行產品在「本檔類型」的設計有**意圖變更**，不應以舊字句當未做完唯一依據。  
- **階 5**：**共用資訊整條**與專案頁入口**已存在**；若嚴格按舊 plan 的「`null`＝專案、**非 null**＝**本檔專屬一組**準則/文風 **ID 陣列**」**尚未在 `files`／API 上完整落地**，可視為 **P5 尚餘子項（或 5a 邊界）**；**團線 5b** 須在後端＋遷移聯合驗收。

建議之後在 **`.cursor/plans/...cat_分階段重建...plan.md`** 的 YAML `todos` 把 p1–p4 標成 `completed`（若你們也認定完成），p5 拆成「本機 UI 已OK／本檔準則覆寫未做／5b 待後端」避免誤解。
