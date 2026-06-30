# CAT QA：AI 檢查擴充與報告版面

> **狀態**：實作中（2026-06）  
> **範圍**：`cat-tool/` → `public/cat/`；Team 模式雲端偏好 + `cat_ai_settings.prompts` JSON 擴充  
> **關聯**：[`CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md`](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md)（既有規則 QA、結果表多選）、[`CAT_AI_GUIDELINES_AND_PROJECT_RULES.md`](./CAT_AI_GUIDELINES_AND_PROJECT_RULES.md)（共用資訊準則）

---

## 1. 目的

在 CAT 編輯器內完成品質檢查：列出問題 → 點 `#` 跳句 → 直接改譯文。**不**匯出 Excel。

本輪新增：

1. **AI 檢查**六類（分輪 API，不合併 prompt）
2. **結果表**可顯示於右側窄欄、下方寬面板，或兩邊同時（個人雲端偏好）
3. **操作區**永遠在右側 QA 分頁

---

## 2. 檢查項目

### 2.1 規則檢查（本地）

| 勾選 | 預設 | 類型 |
|------|------|------|
| 術語是否有遺漏或錯誤 | 開 | 術語未套用 |
| Tag 是否有遺漏 | 開 | Tag 檢查 |
| 原文相同但譯文不一致 | 開 | 譯文不一致 |
| 數字與原文不一致 | 開 | 數字不相符 |

程式：`runQaChecks`、`_qaPushSegmentRuleFindings`（[`cat-tool/app.js`](../cat-tool/app.js)）

### 2.2 AI 檢查（分輪）

| 勾選 | 結果 `type` | 空狀態 |
|------|-------------|--------|
| 錯字／打字 | 錯字 | 永遠可勾 |
| 語意與翻譯正確性 | 語意 | 永遠可勾 |
| 翻譯準則 | 翻譯準則 | 共用資訊無已選條目 → 反灰 |
| 文風偏好 | 文風 | 無已選條目 → 反灰 |
| 專案準則 | 專案準則 | 無條目 → 反灰 |
| 本案特殊指示 | 特殊指示 | 本檔無已套用指示 → 反灰 |

- **不帶** AI 翻譯用風格修改範例（`styleExamples`）
- 準則類：`_buildAiOptions` 對應子集注入 prompt
- 語意／錯字：不注入準則條目
- 每勾選項 = **獨立 API 輪次**（禁止合併多格 prompt）

### 2.3 檢查範圍（規則 + AI 共用）

含鎖定、句段範圍、目前篩選結果（與既有行為一致）。

---

## 3. 結果資料形狀

```js
{ segId, gid, type, info, key }
```

| 欄 | 規則 QA | AI QA |
|----|---------|-------|
| `type` | 程式固定字串 | 程式固定（對應勾選項） |
| `info` | 模板拼接 | AI JSON `issues` |
| `key` | 例 `${gid}:tag` | 例 `${gid}:typo`、`${gid}:semantic`、`${gid}:qg-trans` |

---

## 4. 報告版面

| 區域 | 內容 |
|------|------|
| 右側 `#tabQA` | 勾選、範圍、開始 QA、結果位置偏好、狀態列；結果表（可選） |
| 下方 `#tabQaResults` | 寬結果表（可選） |

偏好 `qa_report_surface`：`bottom`（預設）| `right` | `both`  
儲存：[`cat_user_ui_prefs.qa_report_surface`](../supabase/migrations/20260630140000_cat_user_ui_prefs_qa_report_surface.sql)，個人雲端；離線 `localStorage` fallback。

跑完 QA：

1. **強制**右側切到 QA 分頁
2. 偏好 `bottom` 或 `both` → 下方切「QA 結果」tab 並展開 `#notesPanel`

---

## 5. AI 管理 — 六格可編 prompt

存於 `cat_ai_settings.prompts`（jsonb）：

| 鍵 | UI id |
|----|-------|
| `typoSystem` | `aiPromptTypoSystem` |
| `qaSemanticSystem` | `aiPromptQaSemanticSystem` |
| `qaTransGuidelineSystem` | `aiPromptQaTransGuidelineSystem` |
| `qaStyleGuidelineSystem` | `aiPromptQaStyleGuidelineSystem` |
| `qaProjectGuidelineSystem` | `aiPromptQaProjectGuidelineSystem` |
| `qaSpecialInstructionSystem` | `aiPromptQaSpecialInstructionSystem` |

每格下方唯讀：`預設提示詞：「……」`（來源 [`QA_DEFAULT_PROMPTS`](../cat-tool/js/ai-translate.js)）。  
留空用內建；有內容取代主體，程式仍附加 JSON 結尾。

---

## 6. 程式觸點

| 功能 | 檔案 |
|------|------|
| QA 主流程、雙渲染、可用性 | [`cat-tool/app.js`](../cat-tool/app.js) |
| AI 批次 QA | [`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js) |
| UI | [`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css) |
| 偏好 RPC | [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)、[`cat-tool/db.js`](../cat-tool/db.js) |
| 確認後增量 | `_qaIncrementalRefreshAfterConfirm`（AI 項不重跑） |

---

## 7. 驗收清單

1. 只勾規則 → 不呼叫 AI
2. 勾語意 → 類型「語意」，API 含原文+譯文
3. 翻譯準則無條目 → 反灰；有條目 → 違反時列出
4. 文風／專案準則／特殊指示：無內容反灰
5. 錯字+語意同時勾 → 兩輪 API
6. 預設 `bottom` → 右側無表、下方有表；Team 跨裝置同步偏好
7. `both` → 兩表同步、忽略一致
8. 跑完 QA → 右側 QA tab；下方自動（bottom/both）
9. 點 # 跳句；確認後本地項更新、AI 項不重跑
10. AI 管理六格 + 預設提示詞展示
11. `npm run sync:cat` 後 `public/cat` 一致
