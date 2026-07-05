/**
 * Vercel Serverless：CAT AI Model Registry Phase 2 — OpenAI 模型清單同步 endpoint。
 *
 * 授權：Authorization: Bearer <Supabase JWT>，後端以 SUPABASE_SERVICE_ROLE_KEY 驗證身分並查
 * public.user_roles，僅 executive 可執行（見 api/lib/require-executive.js）。不信任任何前端
 * 傳來的角色字串（_tmsRole / role / userId）。
 *
 * 非破壞性寫入原則（見 docs/CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md Phase 2）：
 *   - 不刪除任何既有列；OpenAI 本次未回傳的既有 provider model 只標 is_currently_available=false。
 *   - cat_ai_model_options 只對「穩定候選且 DB 尚無此 model_id」的模型 insert 新草稿
 *     （enabled=false、is_default=false）；既有列一律 skip，不 update。
 *   - 不啟用任何模型、不變更 is_default、不覆蓋人工設定、不修改 gpt-4.1-mini 既有欄位。
 *   - Phase 2 未新增 migration／RPC，因此不承諾真正 DB transaction；中途失敗僅標記
 *     ai_model_sync_runs.status='failed' 並回報錯誤，不做補償性回滾。
 */

import { requireExecutive } from "./lib/require-executive.js";
import { buildSyncPlan, statusForSyncError } from "./lib/model-sync-rules.js";

const OPENAI_TIMEOUT_MS = 25000;
const SUPPORTED_PROVIDER_KEY = "openai";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(body));
}

function sendError(res, status, error, message) {
  const body = message ? { error, message } : { error };
  return sendJson(res, status, body);
}

async function parseJsonBody(req) {
  if (req.body == null || req.body === "") return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    throw new Error("invalid_json");
  }
}

async function fetchOpenAiModels(apiKey) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), OPENAI_TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (resp.status === 401) {
      return { kind: "invalid_key" };
    }
    if (!resp.ok) {
      return { kind: "fetch_failed", status: resp.status };
    }

    let json;
    try {
      json = await resp.json();
    } catch {
      return { kind: "invalid_response" };
    }
    if (!json || !Array.isArray(json.data)) {
      return { kind: "invalid_response" };
    }
    return { kind: "ok", models: json.data };
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") {
      return { kind: "timeout" };
    }
    return { kind: "fetch_failed" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "method_not_allowed");
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return sendError(res, statusForSyncError("invalid_json"), "invalid_json");
  }

  const providerKey = (body && body.providerKey) || SUPPORTED_PROVIDER_KEY;
  if (providerKey !== SUPPORTED_PROVIDER_KEY) {
    return sendError(
      res,
      statusForSyncError("unsupported_provider_key"),
      "unsupported_provider_key",
      "Phase 2 only supports 'openai'",
    );
  }

  const auth = await requireExecutive(req);
  if (!auth.ok) {
    const message = auth.error === "forbidden" ? "executive role required" : undefined;
    return sendError(res, statusForSyncError(auth.error), auth.error, message);
  }
  const { supabaseAdmin } = auth;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return sendError(res, statusForSyncError("server_missing_openai_key"), "server_missing_openai_key");
  }

  const startedAt = new Date().toISOString();
  let runId = null;
  try {
    const { data: runRow, error: runInsertError } = await supabaseAdmin
      .from("ai_model_sync_runs")
      .insert({ provider_key: providerKey, status: "running", started_at: startedAt })
      .select("id")
      .single();
    if (runInsertError || !runRow) {
      return sendError(res, statusForSyncError("db_write_failed"), "db_write_failed");
    }
    runId = runRow.id;
  } catch {
    return sendError(res, statusForSyncError("db_write_failed"), "db_write_failed");
  }

  async function failRun(errorCode, errorMessage) {
    try {
      await supabaseAdmin
        .from("ai_model_sync_runs")
        .update({
          status: "failed",
          error_message: errorMessage || errorCode,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    } catch {
      // 記錄失敗不應再拋出；以主要錯誤回應為準。
    }
  }

  const openaiResult = await fetchOpenAiModels(openaiKey);
  if (openaiResult.kind === "invalid_key") {
    await failRun("openai_invalid_key");
    return sendError(res, statusForSyncError("openai_invalid_key"), "openai_invalid_key");
  }
  if (openaiResult.kind === "timeout") {
    await failRun("openai_timeout");
    return sendError(res, statusForSyncError("openai_timeout"), "openai_timeout");
  }
  if (openaiResult.kind === "invalid_response") {
    await failRun("openai_invalid_response");
    return sendError(res, statusForSyncError("openai_invalid_response"), "openai_invalid_response");
  }
  if (openaiResult.kind === "fetch_failed") {
    await failRun("openai_fetch_failed");
    return sendError(res, statusForSyncError("openai_fetch_failed"), "openai_fetch_failed");
  }

  let existingProviderModelIds;
  let existingOptionIds;
  try {
    const [providerModelsRes, optionsRes] = await Promise.all([
      supabaseAdmin.from("ai_provider_models").select("model_id").eq("provider_key", providerKey),
      supabaseAdmin.from("cat_ai_model_options").select("model_id").eq("provider_key", providerKey),
    ]);
    if (providerModelsRes.error || optionsRes.error) {
      throw new Error("read_failed");
    }
    existingProviderModelIds = (providerModelsRes.data ?? []).map((r) => r.model_id);
    existingOptionIds = (optionsRes.data ?? []).map((r) => r.model_id);
  } catch {
    await failRun("db_write_failed", "failed to read existing registry rows");
    return sendError(res, statusForSyncError("db_write_failed"), "db_write_failed");
  }

  const plan = buildSyncPlan({
    providerKey,
    openAiModels: openaiResult.models,
    existingProviderModelIds,
    existingOptionIds,
  });

  try {
    if (plan.providerModelUpserts.length > 0) {
      const nowIso = new Date().toISOString();
      const { error } = await supabaseAdmin.from("ai_provider_models").upsert(
        plan.providerModelUpserts.map((u) => ({ ...u, last_seen_at: nowIso })),
        { onConflict: "provider_key,model_id" },
      );
      if (error) throw error;
    }

    if (plan.providerModelMissing.length > 0) {
      const missingIds = plan.providerModelMissing.map((m) => m.model_id);
      const { error } = await supabaseAdmin
        .from("ai_provider_models")
        .update({ is_currently_available: false, last_seen_at: new Date().toISOString() })
        .eq("provider_key", providerKey)
        .in("model_id", missingIds);
      if (error) throw error;
    }

    if (plan.optionDrafts.length > 0) {
      const { error } = await supabaseAdmin
        .from("cat_ai_model_options")
        .upsert(plan.optionDrafts, { onConflict: "provider_key,model_id", ignoreDuplicates: true });
      if (error) throw error;
    }
  } catch {
    await failRun("db_write_failed");
    return sendError(res, statusForSyncError("db_write_failed"), "db_write_failed");
  }

  const finishedAt = new Date().toISOString();
  const responseBody = {
    ok: true,
    runId,
    providerKey,
    discoveredCount: plan.discoveredCount,
    filteredCount: plan.filteredCount,
    upsertedProviderModels: plan.providerModelUpserts.length,
    newOptionsCreated: plan.optionDrafts.length,
    markedUnavailable: plan.providerModelMissing.length,
    startedAt,
    finishedAt,
  };

  try {
    await supabaseAdmin
      .from("ai_model_sync_runs")
      .update({
        status: "success",
        discovered_count: plan.discoveredCount,
        new_count: plan.optionDrafts.length,
        missing_count: plan.providerModelMissing.length,
        finished_at: finishedAt,
      })
      .eq("id", runId);
  } catch {
    // sync 本身已成功寫入 registry；run 記錄更新失敗不影響回應結果，僅記錄無法完整反映最終狀態。
  }

  return sendJson(res, 200, responseBody);
}
