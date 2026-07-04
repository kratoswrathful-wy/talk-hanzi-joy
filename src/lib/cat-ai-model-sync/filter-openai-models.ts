/**
 * CAT AI Model Registry Phase 2：OpenAI `/v1/models` 回應篩選規則。
 *
 * 型別化 re-export——**唯一權威實作**在 [`api/lib/model-sync-rules.js`](../../../api/lib/model-sync-rules.js)。
 * 該檔案刻意放在 `api/lib/`（純 JS），讓 Vercel serverless（`api/cat-ai-model-sync.js`）與本機
 * Vite dev proxy（`vite.config.ts`）都能在各自的 Node 執行環境安全載入，不依賴跨目錄 TS 靜態分析
 * 打包是否可靠。此檔僅供 `src/` 內（例如未來 Phase 3 React／CAT 前台程式碼）以型別安全的方式引用，
 * 目前尚無任何 `src/` 程式碼實際 import 此模組。
 */

import {
  classifyOpenAiModel as classifyOpenAiModelImpl,
  filterOpenAiModels as filterOpenAiModelsImpl,
  humanizeModelId as humanizeModelIdImpl,
} from "../../../api/lib/model-sync-rules.js";

export interface OpenAiModelEntry {
  id: string;
  object?: string;
  owned_by?: string;
  created?: number;
}

export interface ClassifiedModel {
  id: string;
  /** 是否應記錄進 ai_provider_models（寬鬆條件）。 */
  recordable: boolean;
  /** 是否為 preview / experimental 系列（可記錄，但不建立 cat_ai_model_options 草稿）。 */
  isPreview: boolean;
  /** 是否為「穩定候選」——recordable 且非 preview，才可自動建立 cat_ai_model_options 草稿。 */
  isStableCandidate: boolean;
}

/** 判斷單一 OpenAI model id 是否可記錄、是否為 preview、是否為穩定候選。 */
export function classifyOpenAiModel(id: string): ClassifiedModel {
  return classifyOpenAiModelImpl(id) as ClassifiedModel;
}

/**
 * 篩選 OpenAI `/v1/models` 回應。
 * 回傳：
 *   - recordable：應寫入 ai_provider_models 的完整清單（含 preview）
 *   - stableCandidates：應嘗試建立 cat_ai_model_options 草稿的子集（不含 preview）
 */
export function filterOpenAiModels(entries: OpenAiModelEntry[]): {
  recordable: OpenAiModelEntry[];
  stableCandidates: OpenAiModelEntry[];
  classified: ClassifiedModel[];
} {
  return filterOpenAiModelsImpl(entries) as {
    recordable: OpenAiModelEntry[];
    stableCandidates: OpenAiModelEntry[];
    classified: ClassifiedModel[];
  };
}

/** `gpt-4.1-mini` → `GPT-4.1 mini`（僅用於新草稿的 display_name_zh 預設值，供人工後續調整）。 */
export function humanizeModelId(modelId: string): string {
  return humanizeModelIdImpl(modelId) as string;
}
