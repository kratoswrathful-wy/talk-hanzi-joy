狀態：已驗收

# CAT AI Model Registry Phase 2 收尾紀錄（2026-07-05）

本文件整合 **Phase 2 首次 production sync**、**PR #7 temperature hotfix**、**production registry 現況** 與 **PM 決策**，作為 Phase 2 結案與 Phase 3 規劃起點。細節以程式與 production DB 為準；規格原文見 [`CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md`](CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md)。

---

## 1. Phase 2 程式交付（已 merge）

| 項目 | 值 |
|---|---|
| PR | [#6](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/6) |
| merge commit | `7b8ea65d` |
| endpoint | `POST /api/cat-ai-model-sync` |
| 規格 | [`docs/CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md`](CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md) |

---

## 2. 首次 production sync（已成功）

| 項目 | 值 |
|---|---|
| runId | `a8e4b19a-6115-4a7e-8620-2a4cdd1117f5` |
| status | `success` |
| started_at | 2026-07-05 02:19:52 UTC |
| finished_at | 2026-07-05 02:19:55 UTC |
| discoveredCount | 118 |
| filteredCount | 74 |
| newOptionsCreated | 69 |
| missing_count | 0 |

### sync 後 registry 表規模（production，read-only 查詢）

| 表 | 列數 |
|---|---|
| `ai_provider_models` | 74 |
| `cat_ai_model_options` | 70 |

> Phase 2 sync 依規格只 **insert 新草稿**（`enabled=false`、`is_default=false`），不得改既有列。`gpt-4.1-mini` Phase 1 seed 維持不變。

---

## 3. PR #7 — GPT-5.5 temperature hotfix（已 merge）

| 項目 | 值 |
|---|---|
| PR | [#7](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/7) |
| merge commit | `ab4b9005` |
| production deployment | **READY**（`dpl_CsCRnELb8W2RgW6HScEnqQ17Fjht`，commit `ab4b9005`） |

### 問題

- production default 已為 **gpt-5.5**
- OpenAI 對 GPT-5.5 系列 **不支援自訂 `temperature`**（僅預設 1）
- 舊版 CAT `ai-translate.js` 的 `_openAiBody()` 一律帶 `temperature`（翻譯 0.3、QA JSON 0.2）→ **400 `unsupported_value`**

### 修正

- 新增 `cat-tool/js/ai-model-temperature.js`（`shouldOmitTemperature` / `buildOpenAiChatBody`）
- GPT-5.5 家族（`gpt-5.5`、`gpt-5.5-pro` 及日期釘選版）**省略 `temperature`**
- 其餘模型（含 `gpt-4.1-mini`）維持既有 temperature 行為
- 回歸測試：`api/lib/cat-ai-model-temperature.test.js`

### production smoke test（merge 後，2026-07-05）

透過 `https://talk-hanzi-joy.vercel.app/api/cat-openai`，body 等同 merge 後 CAT 行為（gpt-5.5、**無 temperature**）：

| 測項 | 結果 |
|---|---|
| AI 翻譯（`response_format: json_object`） | **200**；model 解析為 `gpt-5.5-2026-04-23` |
| QA JSON（`response_format: json_object`） | **200** |
| 400 `unsupported_value` | **未出現**（正式路徑） |

對照：刻意帶 `temperature: 0.3` 仍回 **400**（確認根因與 fix 必要）。

**temperature 400 blocking risk 已解除。**

---

## 4. 目前 production registry 狀態（read-only，2026-07-05）

| 項目 | 值 |
|---|---|
| **enabled=true** | `gpt-4.1-mini`、`gpt-5.5` |
| **is_default=true** | `gpt-5.5`（全表恰好 1 筆） |
| gpt-4.1-mini | `enabled=true`、`is_default=false`（Phase 1 seed 文案完整） |
| gpt-5.5 | `enabled=true`、`is_default=true`；`usage_hint_zh`／`short_label_zh` 仍為 **null** |

### PM 決策（2026-07-05，正式採納）

1. **正式接受 `gpt-5.5` 作為目前 production default model**
2. **`gpt-4.1-mini` 保留 `enabled=true`**，作為低成本 fallback／可切回模型
3. **不需要**把 default 切回 `gpt-4.1-mini`

### 歷史註記（不阻擋現行採用）

- `gpt-5.5` 列之 `created_at`／`updated_at` 與首次 sync 結束同秒，且現況為 `enabled=true`／`is_default=true`，**與 Phase 2 sync 規格（新草稿 `enabled=false`）不符**
- 較像 sync 後的 **manual DB 操作** 或非 sync 路徑寫入；**尚未查明操作者**
- PM 已決定接受現況；後續由 Phase 3 管理 UI 避免再靠手動 DB 操作

---

## 5. 後續待辦（Phase 3 起）

### Phase 3 管理 UI（規劃中，**本次未實作**）

需支援（避免手動 DB）：

- 啟用／停用模型（`enabled`）
- 設定 default model（`is_default`，維持全表唯一）
- 編輯 `display_name_zh`
- 編輯 `usage_hint_zh`
- 編輯 `short_label_zh`
- 顯示模型是否支援 `temperature` 或其他特殊能力（例如 GPT-5.5 家族需省略 temperature）

### 文案與調查

- [ ] 補齊 **gpt-5.5** 的 `usage_hint_zh`／`short_label_zh`
- [ ] 視需要調查 gpt-5.5 何時被設為 `enabled` + `is_default`（不阻擋目前採用 gpt-5.5）

### 尚未開始

- **Phase 4**：前台選單改讀 registry、BYOK 收斂
- **Phase 5**：AI job log 快照

**Phase 3 規格**（2026-07-05）：[`docs/CAT_AI_MODEL_REGISTRY_PHASE3_SPEC_2026-07.md`](CAT_AI_MODEL_REGISTRY_PHASE3_SPEC_2026-07.md)

---

## 6. commit 對照

| 里程碑 | commit（短碼） | 說明 |
|---|---|---|
| Phase 2 endpoint merge | `7b8ea65d` | PR #6 |
| temperature hotfix merge | `ab4b9005` | PR #7 |
| Phase 2 收尾文件 | （本 PR） | 僅 docs |

---

## 7. 相關文件

| 文件 | 用途 |
|---|---|
| [`CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md`](CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md) | 總計畫與 Phase 狀態 |
| [`CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md`](CAT_AI_MODEL_REGISTRY_PHASE2_SPEC_2026-07.md) | Phase 2 endpoint 規格（已驗收） |
| [`CAT_AI_MODEL_REGISTRY_PHASE1_PROD_APPLY_2026-07-04.md`](CAT_AI_MODEL_REGISTRY_PHASE1_PROD_APPLY_2026-07-04.md) | Phase 1 production 套用 |
| [`CODEMAP.md`](CODEMAP.md) | 路徑與現況摘要 |
