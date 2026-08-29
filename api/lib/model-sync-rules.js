/**
 * CAT AI Model Registry Phase 2：OpenAI 模型篩選規則 + 同步寫入計畫（純函式，無 I/O）。
 *
 * 這份檔案是**唯一權威實作**（single source of truth），刻意放在 `api/lib/`（而非 `src/lib/`）：
 * `api/cat-ai-model-sync.js` 與 `vite.config.ts` 的本機 dev proxy 都需要在 Vercel serverless／
 * Vite Node 環境中可靠載入這段邏輯——同層（api/）純 JS 相互匯入沒有跨目錄打包風險；若反過來讓
 * `api/*.js` 靜態匯入 `src/**.ts`，雖然 Vercel 官方文件與範例顯示通常會被靜態分析追蹤打包，
 * 但仍有實務案例回報「api/ 跨樹匯入」在特定專案設定下未被追蹤導致執行期 500。故本檔案不依賴任何
 * `src/` 路徑；`src/lib/cat-ai-model-sync/*.ts` 改為從本檔重新匯出並補上型別，供未來 Phase 3
 * React／CAT 前台程式碼引用時有完整型別。
 *
 * 原則：寬鬆記錄（ai_provider_models）、嚴格開放（cat_ai_model_options 候選）。
 */

const INCLUDE_PREFIXES = [/^gpt-/i, /^o\d/i, /^chatgpt-/i];

const EXCLUDE_KEYWORDS = [
  "embedding",
  "whisper",
  "tts",
  "dall-e",
  "image",
  "audio",
  "realtime",
  "moderation",
  "transcribe",
  "davinci",
];

const PREVIEW_KEYWORDS = ["preview", "experimental", "exp"];

function matchesIncludePrefix(id) {
  return INCLUDE_PREFIXES.some((re) => re.test(id));
}

function matchesExcludeKeyword(id) {
  const lower = id.toLowerCase();
  if (lower.startsWith("ft:")) return true;
  return EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
}

function matchesPreviewKeyword(id) {
  const lower = id.toLowerCase();
  return PREVIEW_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * 判斷單一 OpenAI model id 是否可記錄、是否為 preview、是否為穩定候選。
 * @param {string} id
 * @returns {{ id: string, recordable: boolean, isPreview: boolean, isStableCandidate: boolean }}
 */
export function classifyOpenAiModel(id) {
  const includeMatch = matchesIncludePrefix(id);
  const excludeMatch = matchesExcludeKeyword(id);
  const recordable = includeMatch && !excludeMatch;
  const isPreview = recordable && matchesPreviewKeyword(id);
  const isStableCandidate = recordable && !isPreview;
  return { id, recordable, isPreview, isStableCandidate };
}

/**
 * 篩選 OpenAI `/v1/models` 回應。
 * @param {Array<{id: string, object?: string, owned_by?: string, created?: number}>} entries
 */
export function filterOpenAiModels(entries) {
  const classified = entries.map((e) => classifyOpenAiModel(e.id));
  const recordableIds = new Set(classified.filter((c) => c.recordable).map((c) => c.id));
  const stableIds = new Set(classified.filter((c) => c.isStableCandidate).map((c) => c.id));
  return {
    recordable: entries.filter((e) => recordableIds.has(e.id)),
    stableCandidates: entries.filter((e) => stableIds.has(e.id)),
    classified,
  };
}

/**
 * `gpt-4.1-mini` → `GPT-4.1 mini`（僅用於新草稿的 display_name_zh 預設值，供人工後續調整）。
 * @param {string} modelId
 */
export function humanizeModelId(modelId) {
  const parts = modelId.split("-").filter(Boolean);
  if (parts.length === 0) return modelId;
  const [head, ...rest] = parts;
  const headUpper = head.toUpperCase();
  if (rest.length === 0) return headUpper;
  return `${headUpper}-${rest.join(" ")}`;
}

/**
 * 依 OpenAI 回應與既有 DB 狀態，計算本次同步的寫入計畫（不做任何 I/O）。
 *
 * 非破壞性原則：
 *   - 不刪除既有 ai_provider_models 列，本次未回傳者只標 is_currently_available=false。
 *   - cat_ai_model_options 只對「穩定候選且 DB 尚無此 model_id」的模型建立新草稿；
 *     既有列一律 skip，不 update（保護人工設定與 gpt-4.1-mini seed）。
 *   - 新草稿一律 enabled=false、is_default=false、supports_chat_completions=true、supports_responses_api=true。
 *
 * @param {{
 *   providerKey: string,
 *   openAiModels: Array<{id: string, object?: string, owned_by?: string, created?: number}>,
 *   existingProviderModelIds: string[],
 *   existingOptionIds: string[],
 * }} input
 */
export function buildSyncPlan(input) {
  const { providerKey, openAiModels, existingProviderModelIds, existingOptionIds } = input;
  const { recordable, stableCandidates } = filterOpenAiModels(openAiModels);

  const recordableIds = new Set(recordable.map((m) => m.id));
  const existingOptionIdSet = new Set(existingOptionIds);

  const providerModelUpserts = recordable.map((m) => ({
    provider_key: providerKey,
    model_id: m.id,
    owned_by: m.owned_by ?? null,
    api_object: m.object ?? null,
    provider_created_at: m.created ? new Date(m.created * 1000).toISOString() : null,
    is_currently_available: true,
    raw: { id: m.id, object: m.object, owned_by: m.owned_by, created: m.created },
  }));

  const providerModelMissing = existingProviderModelIds
    .filter((id) => !recordableIds.has(id))
    .map((id) => ({
      provider_key: providerKey,
      model_id: id,
      is_currently_available: false,
    }));

  const optionDrafts = stableCandidates
    .filter((m) => !existingOptionIdSet.has(m.id))
    .map((m) => ({
      provider_key: providerKey,
      model_id: m.id,
      enabled: false,
      is_default: false,
      supports_chat_completions: true,
      supports_responses_api: true,
      display_name_zh: humanizeModelId(m.id),
      use_case: "general",
      tier: "standard",
      sort_order: 999,
    }));

  return {
    providerKey,
    discoveredCount: openAiModels.length,
    filteredCount: recordable.length,
    providerModelUpserts,
    providerModelMissing,
    optionDrafts,
  };
}

/**
 * sync endpoint 錯誤代碼 → HTTP status 對照。
 * 注意：OpenAI key 無效不可回傳 401——401 只保留給 Supabase JWT 未登入／無效。
 */
export const SYNC_ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  invalid_json: 400,
  unsupported_provider_key: 400,
  server_missing_openai_key: 503,
  server_missing_supabase_config: 503,
  openai_fetch_failed: 502,
  openai_invalid_response: 502,
  openai_invalid_key: 503,
  openai_insufficient_quota: 429,
  openai_rate_limited: 429,
  openai_permission_denied: 403,
  openai_unsupported_region: 403,
  openai_overloaded: 503,
  openai_timeout: 504,
  db_write_failed: 500,
};

/** @param {keyof typeof SYNC_ERROR_STATUS} code */
export function statusForSyncError(code) {
  return SYNC_ERROR_STATUS[code];
}
