/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

type RpcPayload = Record<string, any>;

const nowIso = () => new Date().toISOString();

/** 正式庫未跑 migration 時 RPC 不存在；改走舊式 update 以免無法寫庫。 */
function isMissingOptimisticLockInfraError(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const s = `${err.message || ""} ${err.code || ""} ${(err as any).details || ""}`.toLowerCase();
  return (
    s.includes("apply_cat_segment_target_update") ||
    s.includes("pgrst202") ||
    /function .* does not exist|could not find the function/.test(s) ||
    s.includes("42883") ||
    (s.includes("segment_revision") && (s.includes("column") && (s.includes("does not exist") || s.includes("undefined"))))
  );
}

/** 與 cat-tool/db.js 一致：供版本是否需追加時比對 */
function normalizeCatGuidelineContent(html: string | null | undefined): string {
  if (html == null) return "";
  const s = String(html).trim();
  if (!s) return "";
  if (typeof DOMParser === "undefined") return s.replace(/\s+/g, " ").trim();
  try {
    const doc = new DOMParser().parseFromString(s, "text/html");
    const text = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text;
  } catch {
    return s.replace(/\s+/g, " ").trim();
  }
}

/** cat_segments.match_value 為 double precision；空字串會導致 Postgres 報錯 */
function coerceMatchValueForDb(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

/** 將 cat-tool 傳入的 camelCase extra 轉為 Postgres 欄位；避免未知鍵寫入失敗 */
function segmentExtraCamelToSnake(extra: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!extra || typeof extra !== "object") return {};
  const e = extra as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ("matchValue" in e) out.match_value = coerceMatchValueForDb(e.matchValue);
  if ("isLockedUser" in e) out.is_locked_user = !!e.isLockedUser;
  if ("isLockedSystem" in e) out.is_locked_system = !!e.isLockedSystem;
  if ("isLocked" in e) {
    out.is_locked = !!e.isLocked;
  } else if ("isLockedUser" in e || "isLockedSystem" in e) {
    out.is_locked = !!e.isLockedUser || !!e.isLockedSystem;
  }
  if ("targetTags" in e) out.target_tags = Array.isArray(e.targetTags) ? e.targetTags : [];
  return out;
}

function tryParseJson<T>(v: unknown, fallback: T): T {
  if (Array.isArray(v)) return v as unknown as T;
  if (typeof v === "string" && v) {
    try { return JSON.parse(v) as T; } catch { /* ignore */ }
  }
  return fallback;
}

/** CAT 原始檔 private bucket（與 migration 20260503120000 一致） */
const CAT_ORIGINAL_FILES_BUCKET = "cat-original-files";

/** 列表／recent：不 SELECT original_file_base64，僅路徑 + metadata */
const CAT_FILE_LIST_COLUMNS =
  "id, project_id, name, source_lang, target_lang, original_source_lang, original_target_lang, workspace_note_draft, applicable_special_instruction_ids, related_lms_case_id, related_lms_case_title, google_sheet_url, file_format, created_at, last_modified, original_file_path";

function guessMimeFromCatFileName(name: string): string {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".mqxliff") || lower.endsWith(".xliff") || lower.endsWith(".xlf"))
    return "application/xml";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

function buildCatOriginalStoragePath(projectId: string, fileId: string): string {
  return `${projectId}/${fileId}/original`;
}

/** 與 cat-tool db.js chunk btoa 對齊，避免大檔單次 String.fromCharCode 爆堆疊 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(String(b64));
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function downloadCatOriginalAsBase64(storagePath: string): Promise<string> {
  const { data: blob, error } = await supabase.storage.from(CAT_ORIGINAL_FILES_BUCKET).download(storagePath);
  if (error) throw error;
  const ab = await blob.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(ab));
}

async function uploadCatOriginalFromBase64(
  storagePath: string,
  base64: string,
  displayName: string
): Promise<void> {
  const bytes = base64ToUint8Array(base64);
  const { error } = await supabase.storage.from(CAT_ORIGINAL_FILES_BUCKET).upload(storagePath, bytes, {
    contentType: guessMimeFromCatFileName(displayName),
    upsert: true,
  });
  if (error) throw error;
}

const mapProjectRow = (r: any) => ({
  id: r.id,
  name: r.name,
  sourceLangs: r.source_langs ?? [],
  targetLangs: r.target_langs ?? [],
  readTms: r.read_tms ?? [],
  writeTms: r.write_tms ?? [],
  readTbs: r.read_tbs ?? [],
  writeTb: r.write_tb ?? null,
  changeLog: r.change_log ?? [],
  tmPenalties: r.tm_penalties ?? {},
  clientQuestionFormUrl: r.client_question_form_url ?? "",
  clientQuestionFormColumns:
    r.client_question_form_columns != null && typeof r.client_question_form_columns === "object"
      ? r.client_question_form_columns
      : {},
  assignmentId: r.assignment_id ?? null,
  env: r.env ?? "production",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

function mapFileRow(r: any, opts?: { listMode?: boolean }) {
  const path = r.original_file_path != null && String(r.original_file_path).trim() !== "" ? String(r.original_file_path).trim() : "";
  const legacyB64 = r.original_file_base64 ?? "";
  const listMode = !!opts?.listMode;
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    originalFilePath: path,
    originalFileBase64: listMode ? "" : legacyB64,
    sourceLang: r.source_lang ?? "",
    targetLang: r.target_lang ?? "",
    originalSourceLang: r.original_source_lang ?? "",
    originalTargetLang: r.original_target_lang ?? "",
    workspaceNoteDraft: r.workspace_note_draft ?? "",
    applicableSpecialInstructionIds: Array.isArray(r.applicable_special_instruction_ids)
      ? r.applicable_special_instruction_ids.map((x: unknown) => Number(x)).filter((n) => !Number.isNaN(n))
      : [],
    relatedLmsCaseId: r.related_lms_case_id ?? null,
    relatedLmsCaseTitle: r.related_lms_case_title ?? "",
    googleSheetUrl: r.google_sheet_url ?? "",
    fileFormat: r.file_format ?? "",
    createdAt: r.created_at,
    lastModified: r.last_modified,
  };
}

/** getFile：完整列；若有 Storage 路徑則下載並填入 originalFileBase64（供 hydrateFile） */
async function mapFileRowWithOriginalHydrated(r: any) {
  const path = r.original_file_path != null && String(r.original_file_path).trim() !== "" ? String(r.original_file_path).trim() : "";
  const base = mapFileRow(r, { listMode: false });
  if (path) {
    try {
      base.originalFileBase64 = await downloadCatOriginalAsBase64(path);
    } catch (e) {
      const legacy = r.original_file_base64 ?? "";
      if (legacy) base.originalFileBase64 = legacy;
      else throw e;
    }
  }
  return base;
}

const mapSegmentRow = (r: any) => {
  const isLockedUser = !!r.is_locked_user;
  const isLockedSystem = !!r.is_locked_system;
  const isLocked = !!(r.is_locked ?? (isLockedUser || isLockedSystem));
  return {
    id: r.id,
    fileId: r.file_id,
    sheetName: r.sheet_name,
    rowIdx: r.row_idx,
    colSrc: r.col_src,
    colTgt: r.col_tgt,
    idValue: r.id_value,
    extraValue: r.extra_value,
    sourceText: r.source_text ?? "",
    targetText: r.target_text ?? "",
    sourceTags: tryParseJson<unknown[]>(r.source_tags, []),
    targetTags: tryParseJson<unknown[]>(r.target_tags, []),
    isLocked,
    isLockedUser,
    isLockedSystem,
    status: r.status ?? "",
    editorNote: r.editor_note ?? "",
    matchValue: r.match_value,
    createdAt: r.created_at,
    lastModified: r.last_modified,
    /** 樂觀鎖：寫庫寫前條件與寫入後自增 */
    segmentRevision: r.segment_revision != null ? Number(r.segment_revision) : 0,
  };
};

const mapTmRow = (r: any) => ({
  id: r.id,
  name: r.name,
  sourceLangs: r.source_langs ?? [],
  targetLangs: r.target_langs ?? [],
  changeLog: r.change_log ?? [],
  env: r.env ?? "production",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

const mapTmSegmentRow = (r: any) => ({
  id: r.id,
  tmId: r.tm_id,
  sourceText: r.source_text ?? "",
  targetText: r.target_text ?? "",
  key: r.key ?? "",
  prevSegment: r.prev_segment ?? "",
  nextSegment: r.next_segment ?? "",
  writtenFile: r.written_file ?? "",
  writtenProject: r.written_project ?? "",
  createdBy: r.created_by ?? "Unknown User",
  changeLog: r.change_log ?? [],
  sourceLang: r.source_lang ?? "",
  targetLang: r.target_lang ?? "",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

const TB_ONLINE_SUFFIX = "（擷取自線上表單）";

function ensureOnlineTbNameClient(name: string): string {
  const n = String(name || "").trim() || "未命名術語庫";
  if (n.endsWith(TB_ONLINE_SUFFIX)) return n;
  return n.replace(/\s+$/, "") + TB_ONLINE_SUFFIX;
}

const mapTbRow = (r: any) => ({
  id: r.id,
  name: r.name,
  terms: r.terms ?? [],
  nextTermNumber: r.next_term_number ?? 1,
  changeLog: r.change_log ?? [],
  sourceLangs: r.source_langs ?? [],
  targetLangs: r.target_langs ?? [],
  sourceType: r.source_type === "online" ? "online" : "manual",
  sourceTypeLocked: !!r.source_type_locked,
  googleSheetUrl: r.google_sheet_url ?? "",
  onlineImportConfig: r.online_import_config && typeof r.online_import_config === "object" ? r.online_import_config : {},
  onlineTabs: Array.isArray(r.online_tabs) ? r.online_tabs : [],
  env: r.env ?? "production",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

const mapWorkspaceNoteRow = (r: any) => ({
  id: r.id,
  projectId: r.project_id,
  fileId: r.file_id,
  displayTitle: r.display_title,
  content: r.content,
  createdBy: r.created_by,
  savedAt: r.saved_at,
});

const mapPrivateNoteRow = (r: any) => ({
  id: r.id,
  projectId: r.project_id,
  userId: r.user_id,
  content: r.content,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  itemType: r.item_type === "todo" ? "todo" : "note",
  todoDone: !!r.todo_done,
});

const mapGuidelineRow = (r: any) => ({
  id: r.id,
  projectId: r.project_id,
  type: r.type,
  content: r.content,
  versions: r.versions ?? [],
  createdById: r.created_by_id,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  sortOrder: r.sort_order ?? 0,
});

const mapGuidelineReplyRow = (r: any) => ({
  id: r.id,
  guidelineId: r.guideline_id,
  parentReplyId: r.parent_reply_id,
  depth: r.depth ?? 0,
  content: r.content,
  createdById: r.created_by_id,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
  isResolved: r.is_resolved ?? false,
  resolvedByName: r.resolved_by_name,
  resolvedAt: r.resolved_at,
});

function parseAiCategories(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return ["通用"];
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
    } catch {
      return [s];
    }
    return [s];
  }
  return ["通用"];
}

function serializeAiCategories(v: unknown): string {
  const arr = parseAiCategories(v);
  return JSON.stringify(arr.length > 0 ? arr : ["通用"]);
}

function mapAiGuidelineIssueGroup(r: any): { issueGroupId: string | null; issueGroupName: string | null } {
  const raw = r?.issue_group;
  const ig = Array.isArray(raw) ? raw[0] : raw;
  if (ig && typeof ig === "object") {
    return {
      issueGroupId: ig.id != null ? String(ig.id) : r.issue_group_id != null ? String(r.issue_group_id) : null,
      issueGroupName: ig.name != null ? String(ig.name) : null,
    };
  }
  return {
    issueGroupId: r.issue_group_id != null ? String(r.issue_group_id) : null,
    issueGroupName: null,
  };
}

const mapAiGuidelineRow = (r: any) => {
  const ig = mapAiGuidelineIssueGroup(r);
  return {
    id: Number(r.id),
    content: r.content ?? "",
    category: serializeAiCategories(r.category),
    mutexGroup: r.mutex_group ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    scope: r.scope === "style" ? "style" : "translation",
    isDefault: !!r.is_default,
    examples: tryParseJson<any[]>(r.examples, []),
    issueGroupId: ig.issueGroupId,
    issueGroupName: ig.issueGroupName,
    createdAt: r.created_at,
  };
};

const mapAiCategoryTagRow = (r: any) => ({
  id: Number(r.id),
  name: r.name ?? "",
  createdAt: r.created_at,
  listHidden: !!(r as any).list_hidden,
});

const mapAiStyleExampleRow = (r: any) => ({
  id: Number(r.id),
  sourceLang: r.source_lang ?? "",
  targetLang: r.target_lang ?? "",
  categories: tryParseJson<string[]>(r.categories, []),
  modTags: tryParseJson<string[]>(r.mod_tags, []),
  sourceText: r.source_text ?? "",
  aiDraft: r.ai_draft ?? "",
  userFinal: r.user_final ?? "",
  editNotes: tryParseJson<string[]>(r.edit_notes, []),
  contextPrev: r.context_prev ?? "",
  contextNext: r.context_next ?? "",
  segId: r.seg_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapAiSettingsRow = (r: any) => ({
  id: 1,
  apiKey: r.api_key ?? "",
  apiBaseUrl: r.api_base_url ?? "",
  model: r.model ?? "gpt-4.1-mini",
  batchSize: Number(r.batch_size ?? 20) || 20,
  preferOpenAiProxy: r.prefer_openai_proxy !== false,
  prompts: (r.prompts && typeof r.prompts === "object") ? r.prompts : {},
});

const mapAiProjectSettingsRow = (r: any) => ({
  projectId: r.project_id,
  selectedGuidelineIds: Array.isArray(r.selected_guideline_ids) ? r.selected_guideline_ids.map((x: unknown) => Number(x)).filter((n: number) => !Number.isNaN(n)) : [],
  selectedStyleGuidelineIds: Array.isArray(r.selected_style_guideline_ids) ? r.selected_style_guideline_ids.map((x: unknown) => Number(x)).filter((n: number) => !Number.isNaN(n)) : [],
  specialInstructions: Array.isArray(r.special_instructions) ? r.special_instructions : [],
  projectGuidelines: Array.isArray(r.project_guidelines) ? r.project_guidelines : [],
  updatedAt: r.updated_at,
});

async function cleanupEmptyIssueGroups(params: { scope: "translation" | "style" | "project"; projectId?: string | null }) {
  const { scope } = params;
  let q = supabase
    .from("cat_ai_issue_groups" as any)
    .select("id, scope, project_id")
    .eq("scope", scope);
  if (scope === "project") {
    if (!params.projectId) return;
    q = (q as any).eq("project_id", params.projectId);
  }
  const { data: groups, error: groupErr } = await q;
  if (groupErr || !groups || groups.length === 0) return;

  let projectGuidelines: any[] = [];
  if (scope === "project" && params.projectId) {
    const { data: psRow } = await supabase
      .from("cat_ai_project_settings" as any)
      .select("project_guidelines")
      .eq("project_id", params.projectId)
      .maybeSingle();
    projectGuidelines = Array.isArray((psRow as any)?.project_guidelines) ? (psRow as any).project_guidelines : [];
  }

  for (const g of groups as any[]) {
    const gid = String(g.id || "");
    if (!gid) continue;
    const { data: linkedGuideline, error: glErr } = await supabase
      .from("cat_ai_guidelines" as any)
      .select("id")
      .eq("issue_group_id", gid)
      .limit(1)
      .maybeSingle();
    if (glErr) continue;
    const usedByGuideline = !!linkedGuideline;
    const usedByProjectGuideline = scope === "project" && projectGuidelines.some((el) => el && String((el as any).issueGroupId || "") === gid);
    if (!usedByGuideline && !usedByProjectGuideline) {
      await supabase.from("cat_ai_issue_groups" as any).delete().eq("id", gid);
    }
  }
}

export async function handleCatCloudRpc(action: string, payload: RpcPayload, userId: string) {
  switch (action) {
    case "db.addModuleLog": {
      const { module, payload: p } = payload;
      if (!module) return null;
      await supabase.from("cat_module_logs").insert({ module, payload: p ?? null, at: nowIso() } as any);
      return null;
    }
    case "db.getModuleLogs": {
      const { module, limit = 20 } = payload;
      const q = supabase
        .from("cat_module_logs")
        .select("*")
        .order("at", { ascending: false })
        .limit(Number(limit) || 20);
      const { data } = module ? await q.eq("module", module) : await q;
      return (data ?? []).map((r: any) => ({ module: r.module, at: r.at, ...(r.payload ?? {}) }));
    }

    case "db.createProject": {
      const { name, sourceLangs = [], targetLangs = [] } = payload;
      const { data, error } = await supabase
        .from("cat_projects")
        .insert({
          name: name || "未命名專案",
          source_langs: sourceLangs,
          target_langs: targetLangs,
          owner_user_id: userId,
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.updateProjectName":
      return await supabase.from("cat_projects").update({ name: payload.newName, last_modified: nowIso() } as any).eq("id", payload.projectId);
    case "db.updateProjectLangs":
      return await supabase.from("cat_projects").update({ source_langs: payload.sourceLangs ?? [], target_langs: payload.targetLangs ?? [], last_modified: nowIso() } as any).eq("id", payload.projectId);
    case "db.updateProjectTMs":
      return await supabase.from("cat_projects").update({ read_tms: payload.readTms ?? [], write_tms: payload.writeTms ?? [], last_modified: nowIso() } as any).eq("id", payload.projectId);
    case "db.updateProjectTBs":
      return await supabase.from("cat_projects").update({ read_tbs: payload.readTbs ?? [], write_tb: payload.writeTb ?? null, last_modified: nowIso() } as any).eq("id", payload.projectId);
    case "db.patchProject":
      return await supabase.from("cat_projects").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.sourceLangs != null ? { source_langs: payload.updates.sourceLangs } : {}),
        ...(payload.updates?.targetLangs != null ? { target_langs: payload.updates.targetLangs } : {}),
        ...(payload.updates?.readTms != null ? { read_tms: payload.updates.readTms } : {}),
        ...(payload.updates?.writeTms != null ? { write_tms: payload.updates.writeTms } : {}),
        ...(payload.updates?.changeLog != null ? { change_log: payload.updates.changeLog } : {}),
        ...(payload.updates?.tmPenalties != null ? { tm_penalties: payload.updates.tmPenalties } : {}),
        ...(payload.updates?.clientQuestionFormUrl != null ? { client_question_form_url: payload.updates.clientQuestionFormUrl } : {}),
        ...(payload.updates?.clientQuestionFormColumns !== undefined
          ? { client_question_form_columns: payload.updates.clientQuestionFormColumns ?? {} }
          : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.projectId);
    case "db.getProjects": {
      const { data } = await supabase.from("cat_projects").select("*").order("created_at", { ascending: true, nullsFirst: true });
      return (data ?? []).map(mapProjectRow);
    }
    case "db.getProject": {
      const { data } = await supabase.from("cat_projects").select("*").eq("id", payload.projectId).maybeSingle();
      return data ? mapProjectRow(data) : null;
    }
    case "db.deleteProject": {
      const projectId = payload.projectId;
      const { data: files } = await supabase.from("cat_files").select("original_file_path").eq("project_id", projectId);
      const paths = (files ?? [])
        .map((f: any) => String(f.original_file_path ?? "").trim())
        .filter(Boolean);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(CAT_ORIGINAL_FILES_BUCKET).remove(paths);
        if (rmErr) console.warn("[cat-cloud-rpc] deleteProject storage remove:", rmErr);
      }
      return await supabase.from("cat_projects").delete().eq("id", projectId);
    }

    case "db.createFile": {
      const fileId = crypto.randomUUID();
      const projectId = payload.projectId;
      const b64 = payload.originalFileBase64 ?? "";
      let originalPath: string | null = null;
      let inlineB64 = b64;
      if (b64.length > 0) {
        originalPath = buildCatOriginalStoragePath(projectId, fileId);
        await uploadCatOriginalFromBase64(originalPath, b64, payload.name || "");
        inlineB64 = "";
      }
      const { data, error } = await supabase
        .from("cat_files")
        .insert({
          id: fileId,
          project_id: projectId,
          name: payload.name,
          original_file_base64: inlineB64,
          original_file_path: originalPath,
          source_lang: payload.sourceLang ?? "",
          target_lang: payload.targetLang ?? "",
          original_source_lang: payload.originalSourceLang ?? "",
          original_target_lang: payload.originalTargetLang ?? "",
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("cat_projects").update({ last_modified: nowIso() } as any).eq("id", projectId);
      return data.id;
    }
    case "db.getFiles": {
      const { data } = await supabase
        .from("cat_files")
        .select(CAT_FILE_LIST_COLUMNS)
        .eq("project_id", payload.projectId)
        .order("created_at", { ascending: true, nullsFirst: true });
      return (data ?? []).map((r: any) => mapFileRow(r, { listMode: true }));
    }
    case "db.getRecentFiles": {
      const { data } = await supabase
        .from("cat_files")
        .select(CAT_FILE_LIST_COLUMNS)
        .order("last_modified", { ascending: false })
        .limit(payload.limit || 10);
      return (data ?? []).map((r: any) => mapFileRow(r, { listMode: true }));
    }
    case "db.getFile": {
      const { data } = await supabase.from("cat_files").select("*").eq("id", payload.fileId).maybeSingle();
      return data ? await mapFileRowWithOriginalHydrated(data) : null;
    }
    case "db.searchLmsCases": {
      const keyword = String(payload.keyword || "").trim();
      const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 50);
      if (!keyword) return [];
      let env = "production";
      if (payload.projectId) {
        const { data: prj } = await supabase
          .from("cat_projects")
          .select("env")
          .eq("id", payload.projectId)
          .maybeSingle();
        env = (prj as any)?.env || "production";
      }
      const { data } = await supabase
        .from("cases")
        .select("id,title,keyword,status,updated_at")
        .eq("env", env)
        .or(`title.ilike.%${keyword}%,keyword.ilike.%${keyword}%`)
        .order("updated_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? "",
        keyword: r.keyword ?? "",
        status: r.status ?? "",
      }));
    }
    case "db.updateFile": {
      const fileId = payload.fileId;
      const u = payload.updates ?? {};
      const rowPatch: Record<string, unknown> = {
        ...(u.name != null ? { name: u.name } : {}),
        ...(u.sourceLang != null ? { source_lang: u.sourceLang } : {}),
        ...(u.targetLang != null ? { target_lang: u.targetLang } : {}),
        ...(u.originalSourceLang != null ? { original_source_lang: u.originalSourceLang } : {}),
        ...(u.originalTargetLang != null ? { original_target_lang: u.originalTargetLang } : {}),
        ...(u.workspaceNoteDraft != null ? { workspace_note_draft: u.workspaceNoteDraft } : {}),
        ...(u.applicableSpecialInstructionIds != null
          ? {
              applicable_special_instruction_ids: Array.isArray(u.applicableSpecialInstructionIds)
                ? u.applicableSpecialInstructionIds
                : [],
            }
          : {}),
        ...(u.relatedLmsCaseId !== undefined ? { related_lms_case_id: u.relatedLmsCaseId } : {}),
        ...(u.relatedLmsCaseTitle !== undefined ? { related_lms_case_title: u.relatedLmsCaseTitle ?? "" } : {}),
        ...(u.googleSheetUrl != null ? { google_sheet_url: String(u.googleSheetUrl) } : {}),
        ...(u.fileFormat != null ? { file_format: String(u.fileFormat) } : {}),
        last_modified: nowIso(),
      };
      if (u.originalFileBase64 != null) {
        const b64 = String(u.originalFileBase64);
        const { data: existing } = await supabase
          .from("cat_files")
          .select("project_id, original_file_path, name")
          .eq("id", fileId)
          .maybeSingle();
        if (!existing) throw new Error("db.updateFile: file not found");
        const pid = (existing as any).project_id;
        const prevPath = String((existing as any).original_file_path ?? "").trim();
        const path = prevPath || buildCatOriginalStoragePath(pid, fileId);
        const displayName = u.name != null ? String(u.name) : String((existing as any).name ?? "");
        if (b64.length > 0) {
          await uploadCatOriginalFromBase64(path, b64, displayName);
          rowPatch.original_file_path = path;
          rowPatch.original_file_base64 = "";
        } else {
          if (prevPath) {
            const { error: rmErr } = await supabase.storage.from(CAT_ORIGINAL_FILES_BUCKET).remove([prevPath]);
            if (rmErr) console.warn("[cat-cloud-rpc] updateFile storage remove:", rmErr);
          }
          rowPatch.original_file_path = null;
          rowPatch.original_file_base64 = "";
        }
      }
      return await supabase.from("cat_files").update(rowPatch as any).eq("id", fileId);
    }
    case "db.deleteFile": {
      const { data: row } = await supabase.from("cat_files").select("original_file_path").eq("id", payload.fileId).maybeSingle();
      const p = row?.original_file_path != null ? String(row.original_file_path).trim() : "";
      if (p) {
        const { error: rmErr } = await supabase.storage.from(CAT_ORIGINAL_FILES_BUCKET).remove([p]);
        if (rmErr) console.warn("[cat-cloud-rpc] deleteFile storage remove:", rmErr);
      }
      return await supabase.from("cat_files").delete().eq("id", payload.fileId);
    }

    case "db.addSegments": {
      if (!Array.isArray(payload.segmentsArray) || payload.segmentsArray.length === 0) return 0;
      const BATCH = 500;
      const rows = payload.segmentsArray.map((s: any) => {
        const isLockedUser = !!s.isLockedUser;
        const isLockedSystem = !!s.isLockedSystem;
        const isLocked = !!(s.isLocked ?? (isLockedUser || isLockedSystem));
        return {
          file_id: s.fileId,
          sheet_name: s.sheetName ?? "Sheet1",
          row_idx: s.rowIdx ?? 0,
          col_src: s.colSrc ?? null,
          col_tgt: s.colTgt ?? null,
          id_value: s.idValue ?? null,
          extra_value: s.extraValue ?? null,
          source_text: s.sourceText ?? "",
          target_text: s.targetText ?? "",
          source_tags: Array.isArray(s.sourceTags) ? s.sourceTags : [],
          target_tags: Array.isArray(s.targetTags) ? s.targetTags : [],
          is_locked_user: isLockedUser,
          is_locked_system: isLockedSystem,
          is_locked: isLocked,
          status: s.status ?? "",
          editor_note: s.editorNote ?? "",
          match_value: coerceMatchValueForDb(s.matchValue),
          created_at: nowIso(),
          last_modified: nowIso(),
          segment_revision: 0,
        };
      });
      let totalCount = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { error, count } = await supabase.from("cat_segments").insert(chunk as any);
        if (error) throw error;
        totalCount += count ?? chunk.length;
      }
      return totalCount;
    }
    case "db.getSegmentsByFile": {
      const PAGE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("cat_segments")
          .select("*")
          .eq("file_id", payload.fileId)
          .order("row_idx", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return allData.map(mapSegmentRow);
    }
    case "db.updateSegmentTarget": {
      const { expectedSegmentRevision: exp, segmentId, newTargetText, extra: extraRaw } = payload;
      if (exp === undefined || exp === null) {
        throw new Error("db.updateSegmentTarget: expectedSegmentRevision is required");
      }
      const ex = segmentExtraCamelToSnake(extraRaw);
      const { data, error: rpcErr } = await supabase.rpc("apply_cat_segment_target_update", {
        p_segment_id: segmentId,
        p_new_target_text: newTargetText ?? "",
        p_expected_segment_revision: exp,
        p_extras: ex,
      } as any);
      if (rpcErr) {
        if (!isMissingOptimisticLockInfraError(rpcErr)) throw rpcErr;
        /* eslint-disable no-console */
        console.warn(
          "[cat-cloud-rpc] apply_cat_segment_target_update 失敗，回退舊式 update。請在 Supabase 執行 migration 20260421120000_cat_segments_segment_revision.sql。",
          rpcErr
        );
        const { error: ustErr } = await supabase.from("cat_segments").update({
          target_text: newTargetText ?? "",
          ...ex,
          last_modified: nowIso(),
        } as any).eq("id", segmentId);
        if (ustErr) throw ustErr;
        return { newSegmentRevision: exp };
      }
      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      if (!row) {
        return { conflict: true as const };
      }
      const nr = (row as any).segment_revision != null ? Number((row as any).segment_revision) : NaN;
      return { newSegmentRevision: Number.isFinite(nr) ? nr : 0 };
    }
    case "db.updateSegmentStatus": {
      const ex = segmentExtraCamelToSnake(payload.extra);
      const { error: ussErr } = await supabase.from("cat_segments").update({
        status: payload.newStatus,
        ...ex,
        last_modified: nowIso(),
      } as any).eq("id", payload.segmentId);
      if (ussErr) throw ussErr;
      return;
    }
    case "db.updateSegmentEditorNote": {
      const { error: useErr } = await supabase.from("cat_segments").update({ editor_note: payload.editorNote ?? "", last_modified: nowIso() } as any).eq("id", payload.segmentId);
      if (useErr) throw useErr;
      return;
    }
    case "db.acquireSegmentEditLease": {
      const { fileId, segmentId, sessionId, holderName, ttlSeconds = 20 } = payload;
      const { data, error } = await supabase.rpc("try_acquire_cat_segment_edit_lease", {
        p_file_id: fileId,
        p_segment_id: segmentId,
        p_session_id: sessionId,
        p_holder_user_id: userId,
        p_holder_name: holderName ?? null,
        p_ttl_seconds: Number(ttlSeconds) || 20,
      } as any);
      if (error) throw error;
      return data ?? { acquired: false };
    }
    case "db.releaseSegmentEditLease": {
      const { segmentId, sessionId } = payload;
      const { data, error } = await supabase.rpc("release_cat_segment_edit_lease", {
        p_segment_id: segmentId,
        p_session_id: sessionId,
      } as any);
      if (error) throw error;
      return !!data;
    }

    case "db.addWorkspaceNote": {
      const { data, error } = await supabase
        .from("cat_workspace_notes")
        .insert({
          project_id: payload.entry.projectId,
          file_id: payload.entry.fileId ?? null,
          display_title: payload.entry.displayTitle || "未命名",
          content: payload.entry.content || "",
          created_by: payload.entry.createdBy || "Unknown User",
          saved_at: payload.entry.savedAt || nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.getWorkspaceNotesByProject": {
      const { data } = await supabase.from("cat_workspace_notes").select("*").eq("project_id", payload.projectId).order("saved_at", { ascending: false });
      return (data ?? []).map(mapWorkspaceNoteRow);
    }
    case "db.getWorkspaceNote": {
      const { data } = await supabase.from("cat_workspace_notes").select("*").eq("id", payload.noteId).maybeSingle();
      return data ? mapWorkspaceNoteRow(data) : null;
    }
    case "db.deleteWorkspaceNote":
      return await supabase.from("cat_workspace_notes").delete().eq("id", payload.noteId);
    case "db.updateWorkspaceNote":
      return await supabase.from("cat_workspace_notes").update({
        ...(payload.updates?.displayTitle != null ? { display_title: payload.updates.displayTitle } : {}),
        ...(payload.updates?.content != null ? { content: payload.updates.content } : {}),
        saved_at: payload.updates?.savedAt || nowIso(),
      } as any).eq("id", payload.noteId);

    // ---- Private Notes ----
    case "db.addPrivateNote": {
      const itemType = payload.entry?.itemType === "todo" ? "todo" : "note";
      const { data, error } = await supabase
        .from("cat_private_notes")
        .insert({
          project_id: payload.entry.projectId,
          user_id: userId,
          content: payload.entry.content || "",
          created_by_name: payload.entry.createdByName || "",
          item_type: itemType,
          todo_done: !!payload.entry.todoDone,
          created_at: nowIso(),
          updated_at: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.getPrivateNotesByProject": {
      const { data, error } = await supabase
        .from("cat_private_notes")
        .select("*")
        .eq("project_id", payload.projectId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPrivateNoteRow);
    }
    case "db.updatePrivateNote": {
      const patch: Record<string, unknown> = { updated_at: nowIso() };
      if (payload.content !== undefined) patch.content = payload.content;
      if (payload.todoDone !== undefined) patch.todo_done = !!payload.todoDone;
      const { error } = await supabase
        .from("cat_private_notes")
        .update(patch as any)
        .eq("id", payload.noteId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "db.deletePrivateNote": {
      const { error } = await supabase
        .from("cat_private_notes")
        .delete()
        .eq("id", payload.noteId)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }

    // ---- Guidelines ----
    case "db.addGuideline": {
      const { data, error } = await supabase
        .from("cat_guidelines")
        .insert({
          project_id: payload.entry.projectId,
          type: payload.entry.type || "shared_note",
          content: payload.entry.content || "",
          versions: [],
          created_by_id: userId,
          created_by_name: payload.entry.createdByName || "",
          created_at: nowIso(),
          updated_at: nowIso(),
          sort_order: payload.entry.sortOrder ?? 0,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.getGuidelinesByProject": {
      const { data, error } = await supabase
        .from("cat_guidelines")
        .select("*")
        .eq("project_id", payload.projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapGuidelineRow);
    }
    case "db.updateGuideline": {
      const { data: existing, error: fetchErr } = await supabase
        .from("cat_guidelines")
        .select("content, versions, updated_at, created_by_name")
        .eq("id", payload.guidelineId)
        .single();
      if (fetchErr) throw fetchErr;
      if (normalizeCatGuidelineContent(existing.content) === normalizeCatGuidelineContent(payload.content)) return;
      const baseVers = (existing.versions as any[] | null) ?? [];
      const versions = [...baseVers];
      if (normalizeCatGuidelineContent(existing.content) !== "") {
        versions.push({
          content: existing.content,
          createdByName: payload.updaterName || existing.created_by_name,
          createdAt: existing.updated_at,
        });
      }
      const { error } = await supabase
        .from("cat_guidelines")
        .update({ content: payload.content, versions, updated_at: nowIso() } as any)
        .eq("id", payload.guidelineId);
      if (error) throw error;
      return;
    }
    case "db.deleteGuideline": {
      const { error } = await supabase
        .from("cat_guidelines")
        .delete()
        .eq("id", payload.guidelineId);
      if (error) throw error;
      return;
    }

    // ---- Guideline Replies ----
    case "db.addGuidelineReply": {
      const { data, error } = await supabase
        .from("cat_note_replies")
        .insert({
          guideline_id: payload.entry.guidelineId,
          parent_reply_id: payload.entry.parentReplyId ?? null,
          depth: payload.entry.depth ?? 0,
          content: payload.entry.content || "",
          created_by_id: userId,
          created_by_name: payload.entry.createdByName || "",
          created_at: nowIso(),
          is_resolved: false,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.getGuidelineReplies": {
      const { data, error } = await supabase
        .from("cat_note_replies")
        .select("*")
        .eq("guideline_id", payload.guidelineId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapGuidelineReplyRow);
    }
    case "db.resolveGuidelineReply": {
      const { error } = await supabase
        .from("cat_note_replies")
        .update({
          is_resolved: !!payload.isResolved,
          resolved_by_name: payload.isResolved ? payload.resolvedByName : null,
          resolved_at: payload.isResolved ? nowIso() : null,
        } as any)
        .eq("id", payload.replyId);
      if (error) throw error;
      return;
    }
    case "db.deleteGuidelineReply": {
      const { error } = await supabase
        .from("cat_note_replies")
        .delete()
        .eq("id", payload.replyId);
      if (error) throw error;
      return;
    }

    // ---- Image Upload (cat-notes-images bucket) ----
    case "db.uploadNoteImage": {
      const { fileName, base64, mimeType } = payload;
      const byteStr = atob(base64.split(",")[1] ?? base64);
      const ab = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) ab[i] = byteStr.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeType || "image/png" });
      const path = `${userId}/${Date.now()}_${fileName || "image.png"}`;
      const { error } = await supabase.storage.from("cat-notes-images").upload(path, blob, { contentType: mimeType || "image/png", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("cat-notes-images").getPublicUrl(path);
      return urlData.publicUrl;
    }

    case "db.createTM": {
      const { data, error } = await supabase
        .from("cat_tms")
        .insert({
          name: payload.name || "未命名記憶庫",
          source_langs: payload.sourceLangs ?? [],
          target_langs: payload.targetLangs ?? [],
          owner_user_id: userId,
          change_log: [],
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.updateTMLangs":
      return await supabase.from("cat_tms").update({ source_langs: payload.sourceLangs ?? [], target_langs: payload.targetLangs ?? [], last_modified: nowIso() } as any).eq("id", payload.tmId);
    case "db.getTMs": {
      const { data } = await supabase.from("cat_tms").select("*").order("created_at", { ascending: true, nullsFirst: true });
      return (data ?? []).map(mapTmRow);
    }
    case "db.getTM": {
      const { data } = await supabase.from("cat_tms").select("*").eq("id", payload.tmId).maybeSingle();
      return data ? mapTmRow(data) : null;
    }
    case "db.updateTMName":
      return await supabase.from("cat_tms").update({ name: payload.newName, last_modified: nowIso() } as any).eq("id", payload.tmId);
    case "db.patchTM":
      return await supabase.from("cat_tms").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.sourceLangs != null ? { source_langs: payload.updates.sourceLangs } : {}),
        ...(payload.updates?.targetLangs != null ? { target_langs: payload.updates.targetLangs } : {}),
        ...(payload.updates?.changeLog != null ? { change_log: payload.updates.changeLog } : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.tmId);
    case "db.deleteTM":
      return await supabase.from("cat_tms").delete().eq("id", payload.tmId);

    case "db.addTMSegment": {
      const { data, error } = await supabase
        .from("cat_tm_segments")
        .insert({
          tm_id: payload.tmId,
          source_text: payload.sourceText ?? "",
          target_text: payload.targetText ?? "",
          key: payload.meta?.key ?? "",
          prev_segment: payload.meta?.prevSegment ?? "",
          next_segment: payload.meta?.nextSegment ?? "",
          written_file: payload.meta?.writtenFile ?? "",
          written_project: payload.meta?.writtenProject ?? "",
          created_by: payload.meta?.createdBy ?? "Unknown User",
          change_log: payload.meta?.changeLog ?? [],
          source_lang: payload.meta?.sourceLang ?? "",
          target_lang: payload.meta?.targetLang ?? "",
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("cat_tms").update({ last_modified: nowIso() } as any).eq("id", payload.tmId);
      return data.id;
    }
    case "db.bulkAddTMSegments": {
      if (!Array.isArray(payload.tmSegmentsArray) || payload.tmSegmentsArray.length === 0) return null;
      const { error: batErr } = await supabase.from("cat_tm_segments").insert(
        payload.tmSegmentsArray.map((s: any) => ({
          tm_id: s.tmId,
          source_text: s.sourceText ?? "",
          target_text: s.targetText ?? "",
          key: s.key ?? "",
          prev_segment: s.prevSegment ?? "",
          next_segment: s.nextSegment ?? "",
          written_file: s.writtenFile ?? "",
          written_project: s.writtenProject ?? "",
          created_by: s.createdBy ?? "Unknown User",
          change_log: s.changeLog ?? [],
          source_lang: s.sourceLang ?? "",
          target_lang: s.targetLang ?? "",
          created_at: s.createdAt ?? nowIso(),
          last_modified: s.lastModified ?? nowIso(),
        })) as any
      );
      if (batErr) throw batErr;
      return null;
    }
    case "db.getTMSegments": {
      // PostgREST 預設 max_rows（常為 1000）；未分頁時只回第一頁，導致 TM 比對／頁面遺漏句段
      const pageSize = 1000;
      const rows: any[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("cat_tm_segments")
          .select("*")
          .eq("tm_id", payload.tmId)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      return rows.map(mapTmSegmentRow);
    }
    case "db.getTMSegmentById": {
      const { data } = await supabase.from("cat_tm_segments").select("*").eq("id", payload.id).maybeSingle();
      return data ? mapTmSegmentRow(data) : null;
    }
    case "db.updateTMSegment":
      return await supabase.from("cat_tm_segments").update({
        target_text: payload.targetText,
        ...(payload.metaUpdate?.changeLog ? { change_log: payload.metaUpdate.changeLog } : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.id);
    case "db.deleteTMSegment":
      return await supabase.from("cat_tm_segments").delete().eq("id", payload.id);
    case "db.deleteTMSegmentsByTMId":
      return await supabase.from("cat_tm_segments").delete().eq("tm_id", payload.tmId);

    case "db.createTB": {
      const { data, error } = await supabase
        .from("cat_tbs")
        .insert({
          name: payload.name || "未命名術語庫",
          terms: [],
          next_term_number: 1,
          change_log: [],
          source_langs: payload.sourceLangs ?? [],
          target_langs: payload.targetLangs ?? [],
          source_type: payload.sourceType === "online" ? "online" : "manual",
          source_type_locked: !!payload.sourceTypeLocked,
          google_sheet_url: typeof payload.googleSheetUrl === "string" ? payload.googleSheetUrl : "",
          online_import_config:
            payload.onlineImportConfig && typeof payload.onlineImportConfig === "object" ? payload.onlineImportConfig : {},
          owner_user_id: userId,
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }
    case "db.updateTBLangs":
      return await supabase.from("cat_tbs").update({ source_langs: payload.sourceLangs ?? [], target_langs: payload.targetLangs ?? [], last_modified: nowIso() } as any).eq("id", payload.tbId);
    case "db.getTBs": {
      const { data } = await supabase.from("cat_tbs").select("*").order("created_at", { ascending: true, nullsFirst: true });
      return (data ?? []).map(mapTbRow);
    }
    case "db.getTB": {
      const { data } = await supabase.from("cat_tbs").select("*").eq("id", payload.tbId).maybeSingle();
      return data ? mapTbRow(data) : null;
    }
    case "db.updateTBName": {
      const { data: row } = await supabase.from("cat_tbs").select("source_type").eq("id", payload.tbId).maybeSingle();
      let nextName = String(payload.newName ?? "").trim() || "未命名術語庫";
      if ((row as any)?.source_type === "online") {
        nextName = ensureOnlineTbNameClient(nextName);
      }
      return await supabase.from("cat_tbs").update({ name: nextName, last_modified: nowIso() } as any).eq("id", payload.tbId);
    }
    case "db.updateTB":
      return await supabase.from("cat_tbs").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.terms != null ? { terms: payload.updates.terms } : {}),
        ...(payload.updates?.nextTermNumber != null ? { next_term_number: payload.updates.nextTermNumber } : {}),
        ...(payload.updates?.changeLog != null ? { change_log: payload.updates.changeLog } : {}),
        ...(payload.updates?.sourceLangs != null ? { source_langs: payload.updates.sourceLangs } : {}),
        ...(payload.updates?.targetLangs != null ? { target_langs: payload.updates.targetLangs } : {}),
        ...(payload.updates?.sourceType === "online" || payload.updates?.sourceType === "manual"
          ? { source_type: payload.updates.sourceType }
          : {}),
        ...(payload.updates?.sourceTypeLocked != null ? { source_type_locked: !!payload.updates.sourceTypeLocked } : {}),
        ...(payload.updates?.googleSheetUrl != null ? { google_sheet_url: String(payload.updates.googleSheetUrl) } : {}),
        ...(payload.updates?.onlineImportConfig != null
          ? { online_import_config: payload.updates.onlineImportConfig }
          : {}),
        ...(payload.updates?.onlineTabs != null ? { online_tabs: payload.updates.onlineTabs } : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.tbId);
    case "db.patchTB":
      return await supabase.from("cat_tbs").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.terms != null ? { terms: payload.updates.terms } : {}),
        ...(payload.updates?.nextTermNumber != null ? { next_term_number: payload.updates.nextTermNumber } : {}),
        ...(payload.updates?.changeLog != null ? { change_log: payload.updates.changeLog } : {}),
        ...(payload.updates?.sourceLangs != null ? { source_langs: payload.updates.sourceLangs } : {}),
        ...(payload.updates?.targetLangs != null ? { target_langs: payload.updates.targetLangs } : {}),
        ...(payload.updates?.sourceType === "online" || payload.updates?.sourceType === "manual"
          ? { source_type: payload.updates.sourceType }
          : {}),
        ...(payload.updates?.sourceTypeLocked != null ? { source_type_locked: !!payload.updates.sourceTypeLocked } : {}),
        ...(payload.updates?.googleSheetUrl != null ? { google_sheet_url: String(payload.updates.googleSheetUrl) } : {}),
        ...(payload.updates?.onlineImportConfig != null
          ? { online_import_config: payload.updates.onlineImportConfig }
          : {}),
        ...(payload.updates?.onlineTabs != null ? { online_tabs: payload.updates.onlineTabs } : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.tbId);
    case "db.deleteTB":
      return await supabase.from("cat_tbs").delete().eq("id", payload.id);

    // ---- AI Guidelines / Tags / Settings / Project Settings ----
    case "db.addAiGuideline": {
      const entry = payload.entry ?? {};
        const { data, error } = await supabase
        .from("cat_ai_guidelines" as any)
        .insert({
          content: entry.content || "",
          category: parseAiCategories(entry.category),
          mutex_group: entry.mutexGroup || null,
          sort_order: Number(entry.sortOrder ?? 0) || 0,
          scope: entry.scope === "style" ? "style" : "translation",
          is_default: !!entry.isDefault,
          examples: Array.isArray(entry.examples) ? entry.examples : [],
          issue_group_id: entry.issueGroupId || null,
          created_at: nowIso(),
          updated_at: nowIso(),
          created_by: userId,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return Number((data as any)?.id);
    }
    case "db.getAiGuidelines": {
      const { data, error } = await supabase
        .from("cat_ai_guidelines" as any)
        .select("*, issue_group:cat_ai_issue_groups(id, name, scope, project_id)")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapAiGuidelineRow);
    }
    case "db.updateAiGuideline": {
      const guidelineId = Number(payload.id);
      const { data: before } = await supabase
        .from("cat_ai_guidelines" as any)
        .select("id, scope, issue_group_id")
        .eq("id", guidelineId)
        .maybeSingle();
      const patch: Record<string, unknown> = { updated_at: nowIso() };
      if (payload.patch?.content !== undefined) patch.content = payload.patch.content ?? "";
      if (payload.patch?.category !== undefined) patch.category = parseAiCategories(payload.patch.category);
      if (payload.patch?.mutexGroup !== undefined) patch.mutex_group = payload.patch.mutexGroup || null;
      if (payload.patch?.sortOrder !== undefined) patch.sort_order = Number(payload.patch.sortOrder ?? 0) || 0;
      if (payload.patch?.scope !== undefined) patch.scope = payload.patch.scope === "style" ? "style" : "translation";
      if (payload.patch?.isDefault !== undefined) patch.is_default = !!payload.patch.isDefault;
      if (payload.patch?.examples !== undefined) patch.examples = Array.isArray(payload.patch.examples) ? payload.patch.examples : [];
      if (payload.patch?.issueGroupId !== undefined) patch.issue_group_id = payload.patch.issueGroupId || null;
      const { error } = await supabase
        .from("cat_ai_guidelines" as any)
        .update(patch as any)
        .eq("id", guidelineId);
      if (error) throw error;
      if (payload.patch?.issueGroupId !== undefined && before) {
        const oldScope = (before as any).scope === "style" ? "style" : "translation";
        await cleanupEmptyIssueGroups({ scope: oldScope }).catch(() => {});
      }
      return true;
    }
    case "db.deleteAiGuideline": {
      const guidelineId = Number(payload.id);
      const { data: before } = await supabase
        .from("cat_ai_guidelines" as any)
        .select("id, scope, issue_group_id")
        .eq("id", guidelineId)
        .maybeSingle();
      const { error } = await supabase
        .from("cat_ai_guidelines" as any)
        .delete()
        .eq("id", guidelineId);
      if (error) throw error;
      if (before) {
        const oldScope = (before as any).scope === "style" ? "style" : "translation";
        await cleanupEmptyIssueGroups({ scope: oldScope }).catch(() => {});
      }
      return true;
    }
    case "db.getAiIssueGroups": {
      const scope = String(payload.scope || "");
      if (!["translation", "style", "project"].includes(scope)) throw new Error("invalid scope");
      let q = supabase.from("cat_ai_issue_groups" as any).select("*").eq("scope", scope).order("sort_order", { ascending: true }).order("name", { ascending: true });
      if (scope === "project") {
        const pid = payload.projectId;
        if (!pid) throw new Error("projectId required");
        q = (q as any).eq("project_id", pid);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: String(row.id),
        scope: row.scope,
        projectId: row.project_id ?? null,
        name: row.name ?? "",
        sortOrder: Number(row.sort_order ?? 0) || 0,
        createdAt: row.created_at,
      }));
    }
    case "db.addAiIssueGroup": {
      const scope = String(payload.scope || "");
      if (!["translation", "style", "project"].includes(scope)) throw new Error("invalid scope");
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("群組名稱不得空白");
      const projectId = scope === "project" ? payload.projectId : null;
      if (scope === "project" && !projectId) throw new Error("projectId required");
      const { data, error } = await supabase
        .from("cat_ai_issue_groups" as any)
        .insert({
          scope,
          project_id: projectId || null,
          name,
          sort_order: Number(payload.sortOrder ?? 0) || 0,
          created_at: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return String((data as any)?.id);
    }
    case "db.updateAiIssueGroup": {
      const id = String(payload.id || "");
      if (!id) throw new Error("invalid id");
      const name = payload.name !== undefined ? String(payload.name).trim() : undefined;
      if (name === "") throw new Error("群組名稱不得空白");
      const up: Record<string, unknown> = {};
      if (name !== undefined) up.name = name;
      if (payload.sortOrder !== undefined) up.sort_order = Number(payload.sortOrder ?? 0) || 0;
      if (Object.keys(up).length === 0) return true;
      const { error } = await supabase.from("cat_ai_issue_groups" as any).update(up as any).eq("id", id);
      if (error) throw error;
      return true;
    }
    case "db.deleteAiIssueGroup": {
      const groupId = String(payload.id || "");
      if (!groupId) throw new Error("invalid id");
      const { data: groupRow, error: gErr } = await supabase
        .from("cat_ai_issue_groups" as any)
        .select("id, scope, project_id")
        .eq("id", groupId)
        .maybeSingle();
      if (gErr) throw gErr;
      if (!groupRow) return true;
      const gAny = groupRow as any;
      await supabase.from("cat_ai_guidelines" as any).update({ issue_group_id: null, updated_at: nowIso() } as any).eq("issue_group_id", groupId);
      if (gAny.scope === "project" && gAny.project_id) {
        const { data: settingsRows } = await supabase.from("cat_ai_project_settings" as any).select("project_id, project_guidelines").eq("project_id", gAny.project_id);
        for (const sr of (settingsRows as any[]) ?? []) {
          const pg = Array.isArray(sr.project_guidelines) ? sr.project_guidelines : [];
          const next = pg.map((el: Record<string, unknown>) => {
            if (!el || typeof el !== "object") return el;
            if (String((el as any).issueGroupId || "") === groupId) {
              const { issueGroupId: _ig, ...rest } = el as any;
              return rest;
            }
            return el;
          });
          await supabase
            .from("cat_ai_project_settings" as any)
            .update({ project_guidelines: next, updated_at: nowIso(), updated_by: userId } as any)
            .eq("project_id", sr.project_id);
        }
      }
      const { error: delErr } = await supabase.from("cat_ai_issue_groups" as any).delete().eq("id", groupId);
      if (delErr) throw delErr;
      return true;
    }
    case "db.getAiCategoryTags": {
      const { data, error } = await supabase
        .from("cat_ai_category_tags" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapAiCategoryTagRow);
    }
    case "db.addAiCategoryTag": {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("標籤名稱不得空白");
      const { data: existing, error: exErr } = await supabase
        .from("cat_ai_category_tags" as any)
        .select("id, list_hidden")
        .eq("name", name)
        .maybeSingle();
      if (exErr) throw exErr;
      const exAny = existing as any;
      if (exAny?.id != null) {
        if (exAny.list_hidden) {
          const { error: upErr } = await supabase
            .from("cat_ai_category_tags" as any)
            .update({ list_hidden: false } as any)
            .eq("id", exAny.id);
          if (upErr) throw upErr;
          return Number(exAny.id);
        }
        throw new Error("標籤已存在");
      }
      const { data, error } = await supabase
        .from("cat_ai_category_tags" as any)
        .insert({ name, created_at: nowIso(), list_hidden: false } as any)
        .select("id")
        .single();
      if (error) throw error;
      return Number((data as any)?.id);
    }
    case "db.renameAiCategoryTag": {
      const name = String(payload.newName || "").trim();
      if (!name) throw new Error("標籤名稱不得空白");
      const { data: row, error: rowErr } = await supabase
        .from("cat_ai_category_tags" as any)
        .select("name, list_hidden")
        .eq("id", payload.id)
        .single();
      if (rowErr) throw rowErr;
      const rowAny = row as any;
      if (rowAny?.list_hidden) throw new Error("此標籤已自清單隱藏，請先按「復原」再更名。");
      const oldName = String(rowAny?.name || "");
      const { error: renErr } = await supabase
        .from("cat_ai_category_tags" as any)
        .update({ name } as any)
        .eq("id", payload.id);
      if (renErr) throw renErr;
      // Keep guideline category references in sync
      const { data: glRows, error: glErr } = await supabase
        .from("cat_ai_guidelines" as any)
        .select("id, category");
      if (glErr) throw glErr;
      for (const g of (glRows as any[]) ?? []) {
        const arr = parseAiCategories((g as any)?.category);
        if (!arr.includes(oldName)) continue;
        const next = arr.map((x) => (x === oldName ? name : x));
        const { error: ugErr } = await supabase
          .from("cat_ai_guidelines" as any)
          .update({ category: next, updated_at: nowIso() } as any)
          .eq("id", (g as any)?.id);
        if (ugErr) throw ugErr;
      }
      const { data: exRows, error: exErr } = await supabase
        .from("cat_ai_style_examples" as any)
        .select("id, categories");
      if (exErr) throw exErr;
      for (const ex of (exRows as any[]) ?? []) {
        const cats = tryParseJson<string[]>((ex as any)?.categories, []);
        if (!cats.includes(oldName)) continue;
        const next = cats.map((c) => (c === oldName ? name : c));
        const { error: uexErr } = await supabase
          .from("cat_ai_style_examples" as any)
          .update({ categories: next, updated_at: nowIso() } as any)
          .eq("id", (ex as any)?.id);
        if (uexErr) throw uexErr;
      }
      return true;
    }
    case "db.deleteAiCategoryTag": {
      const removeFromReferences = !!payload.opts?.removeFromReferences;
      const { data: row, error: rowErr } = await supabase
        .from("cat_ai_category_tags" as any)
        .select("name")
        .eq("id", payload.id)
        .maybeSingle();
      if (rowErr) throw rowErr;
      if (!row) return true;
      const rowAny = row as any;
      const tagName = String(rowAny?.name || "");
      if (!removeFromReferences) {
        const { error: hidErr } = await supabase
          .from("cat_ai_category_tags" as any)
          .update({ list_hidden: true } as any)
          .eq("id", payload.id);
        if (hidErr) throw hidErr;
        return true;
      }
      const { data: glRows, error: glErr } = await supabase
        .from("cat_ai_guidelines" as any)
        .select("id, category");
      if (glErr) throw glErr;
      for (const g of (glRows as any[]) ?? []) {
        const arr = parseAiCategories((g as any)?.category);
        if (!arr.includes(tagName)) continue;
        const next = arr.filter((x) => x !== tagName);
        const patched = next.length > 0 ? next : ["通用"];
        const { error: ugErr } = await supabase
          .from("cat_ai_guidelines" as any)
          .update({ category: patched, updated_at: nowIso() } as any)
          .eq("id", (g as any)?.id);
        if (ugErr) throw ugErr;
      }
      const { data: exRows, error: exErr } = await supabase
        .from("cat_ai_style_examples" as any)
        .select("id, categories");
      if (exErr) throw exErr;
      for (const ex of (exRows as any[]) ?? []) {
        const cats = tryParseJson<string[]>((ex as any)?.categories, []);
        if (!cats.includes(tagName)) continue;
        const next = cats.filter((c) => c !== tagName);
        const { error: uexErr } = await supabase
          .from("cat_ai_style_examples" as any)
          .update({ categories: next, updated_at: nowIso() } as any)
          .eq("id", (ex as any)?.id);
        if (uexErr) throw uexErr;
      }
      const { error } = await supabase
        .from("cat_ai_category_tags" as any)
        .delete()
        .eq("id", payload.id);
      if (error) throw error;
      return true;
    }
    case "db.restoreAiCategoryTag": {
      const { error } = await supabase
        .from("cat_ai_category_tags" as any)
        .update({ list_hidden: false } as any)
        .eq("id", payload.id);
      if (error) throw error;
      return true;
    }
    case "db.getAiSettings": {
      const { data, error } = await supabase
        .from("cat_ai_settings" as any)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAiSettingsRow(data) : {
        id: 1,
        apiKey: "",
        apiBaseUrl: "",
        model: "gpt-4.1-mini",
        batchSize: 20,
        preferOpenAiProxy: true,
        prompts: {},
      };
    }
    case "db.saveAiSettings": {
      const s = payload.settings ?? {};
      const row = {
        id: 1,
        api_key: s.apiKey ?? "",
        api_base_url: s.apiBaseUrl ?? "",
        model: s.model ?? "gpt-4.1-mini",
        batch_size: Number(s.batchSize ?? 20) || 20,
        prefer_openai_proxy: s.preferOpenAiProxy !== false,
        prompts: (s.prompts && typeof s.prompts === "object") ? s.prompts : {},
        updated_at: nowIso(),
        updated_by: userId,
      };
      const { error } = await supabase.from("cat_ai_settings" as any).upsert(row as any, { onConflict: "id" });
      if (error) throw error;
      return true;
    }
    case "db.getAiProjectSettings": {
      const { data, error } = await supabase
        .from("cat_ai_project_settings" as any)
        .select("*")
        .eq("project_id", payload.projectId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAiProjectSettingsRow(data) : {
        projectId: payload.projectId,
        selectedGuidelineIds: [],
        selectedStyleGuidelineIds: [],
        specialInstructions: [],
        projectGuidelines: [],
      };
    }
    case "db.saveAiProjectSettings": {
      const patch = payload.patch ?? {};
      const projectId = payload.projectId;
      if (!projectId) return null;
      const { data: current } = await supabase
        .from("cat_ai_project_settings" as any)
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      const currentAny = current as any;
      const row = {
        project_id: projectId,
        selected_guideline_ids: Array.isArray(patch.selectedGuidelineIds) ? patch.selectedGuidelineIds : (currentAny?.selected_guideline_ids ?? []),
        selected_style_guideline_ids: Array.isArray(patch.selectedStyleGuidelineIds) ? patch.selectedStyleGuidelineIds : (currentAny?.selected_style_guideline_ids ?? []),
        special_instructions: Array.isArray(patch.specialInstructions) ? patch.specialInstructions : (currentAny?.special_instructions ?? []),
        project_guidelines: Array.isArray(patch.projectGuidelines) ? patch.projectGuidelines : (currentAny?.project_guidelines ?? []),
        updated_at: nowIso(),
        updated_by: userId,
      };
      const { error } = await supabase.from("cat_ai_project_settings" as any).upsert(row as any, { onConflict: "project_id" });
      if (error) throw error;
      await cleanupEmptyIssueGroups({ scope: "project", projectId }).catch(() => {});
      return true;
    }
    case "db.replaceAiDataset":
      // 已停用：以本機快照整批覆寫雲端曾導致誤清空，不再支援此 RPC。
      throw new Error("db.replaceAiDataset is disabled");

    // ── 句段集（cat_views） ─────────────────────────────────────────────────
    case "db.listViews": {
      const { data, error } = await supabase
        .from("cat_views" as any)
        .select(`
          id, project_id, owner_user_id, name, file_ids, segment_ids,
          filter_summary, file_roles, created_at, last_modified,
          owner:profiles!cat_views_owner_user_id_fkey(id, display_name, email)
        `)
        .eq("project_id", payload.projectId)
        .order("created_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      const viewRows = data ?? [];
      const viewIds = viewRows.map((r: any) => r.id).filter(Boolean);
      const namesByView = new Map<string, string[]>();
      if (viewIds.length) {
        const { data: asg, error: asgErr } = await supabase
          .from("cat_view_assignments" as any)
          .select(
            `
            view_id, assignee_user_id, status,
            assignee:profiles!cat_view_assignments_assignee_user_id_fkey(id, display_name, email)
          `
          )
          .in("view_id", viewIds);
        if (asgErr) throw asgErr;
        for (const row of asg ?? []) {
          const r = row as any;
          if (!r || r.status === "cancelled" || !r.view_id) continue;
          const label =
            r.assignee?.display_name || r.assignee?.email || String(r.assignee_user_id || "");
          if (!label) continue;
          const vid = String(r.view_id);
          const cur = namesByView.get(vid) || [];
          if (!cur.includes(label)) cur.push(label);
          namesByView.set(vid, cur);
        }
      }
      return viewRows.map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        ownerUserId: r.owner_user_id,
        ownerName: r.owner?.display_name || r.owner?.email || null,
        name: r.name ?? "未命名句段集",
        fileIds: Array.isArray(r.file_ids) ? r.file_ids : [],
        segmentIds: Array.isArray(r.segment_ids) ? r.segment_ids : [],
        filterSummary: r.filter_summary ?? {},
        fileRoles: r.file_roles ?? {},
        createdAt: r.created_at,
        lastModified: r.last_modified,
        assigneeNames: namesByView.get(String(r.id)) ?? [],
      }));
    }
    case "db.getView": {
      const { data, error } = await supabase
        .from("cat_views" as any)
        .select(`
          id, project_id, owner_user_id, name, file_ids, segment_ids,
          filter_summary, file_roles, created_at, last_modified,
          owner:profiles!cat_views_owner_user_id_fkey(id, display_name, email)
        `)
        .eq("id", payload.viewId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: (data as any).id,
        projectId: (data as any).project_id,
        ownerUserId: (data as any).owner_user_id,
        ownerName: (data as any).owner?.display_name || (data as any).owner?.email || null,
        name: (data as any).name ?? "未命名句段集",
        fileIds: Array.isArray((data as any).file_ids) ? (data as any).file_ids : [],
        segmentIds: Array.isArray((data as any).segment_ids) ? (data as any).segment_ids : [],
        filterSummary: (data as any).filter_summary ?? {},
        fileRoles: (data as any).file_roles ?? {},
        createdAt: (data as any).created_at,
        lastModified: (data as any).last_modified,
      };
    }
    case "db.createView": {
      const { projectId, name, fileIds, segmentIds, filterSummary, fileRoles } = payload;
      const { data, error } = await supabase
        .from("cat_views" as any)
        .insert({
          project_id: projectId,
          owner_user_id: userId,
          name: name || "未命名句段集",
          file_ids: Array.isArray(fileIds) ? fileIds : [],
          segment_ids: Array.isArray(segmentIds) ? segmentIds : [],
          filter_summary: filterSummary ?? {},
          file_roles: fileRoles ?? {},
          created_at: nowIso(),
          last_modified: nowIso(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id;
    }
    case "db.updateView": {
      const { viewId, name, fileRoles } = payload;
      const patch: Record<string, unknown> = { last_modified: nowIso() };
      if (name != null) patch.name = name;
      if (fileRoles != null) patch.file_roles = fileRoles;
      const { error } = await supabase
        .from("cat_views" as any)
        .update(patch as any)
        .eq("id", viewId);
      if (error) throw error;
      return true;
    }
    case "db.deleteView": {
      const { error } = await supabase
        .from("cat_views" as any)
        .delete()
        .eq("id", payload.viewId);
      if (error) throw error;
      return true;
    }
    case "db.getSegmentsByIds": {
      const ids: string[] = Array.isArray(payload.segmentIds) ? payload.segmentIds : [];
      if (ids.length === 0) return [];
      const CHUNK = 200;
      const results: unknown[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("cat_segments")
          .select("*")
          .in("id", chunk);
        if (error) throw error;
        results.push(...(data ?? []).map(mapSegmentRow));
      }
      return results;
    }
    case "db.getSegmentsByFileForPreview": {
      const fileIds: string[] = Array.isArray(payload.fileIds) ? payload.fileIds : [];
      if (fileIds.length === 0) return [];
      // 每次以 20 個 file_id 為一批，並於批內用 .range() 分頁，
      // 避免 Supabase 預設 1000 筆上限截斷跨多檔句段集的資料。
      const FILE_CHUNK = 20;
      const PAGE = 1000;
      const results: unknown[] = [];
      for (let i = 0; i < fileIds.length; i += FILE_CHUNK) {
        const chunk = fileIds.slice(i, i + FILE_CHUNK);
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("cat_segments")
            .select("*")
            .in("file_id", chunk)
            .order("file_id", { ascending: true })
            .order("row_idx", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          results.push(...data.map(mapSegmentRow));
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      return results;
    }
    case "db.listViewAssignments": {
      const { data, error } = await supabase
        .from("cat_view_assignments" as any)
        .select(`
          id, view_id, assignee_user_id, status, assigned_by, assigned_at, updated_at,
          assignee:profiles!cat_view_assignments_assignee_user_id_fkey(id, display_name, email)
        `)
        .eq("view_id", payload.viewId);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        viewId: r.view_id,
        assigneeUserId: r.assignee_user_id,
        assigneeName: r.assignee?.display_name || r.assignee?.email || null,
        status: r.status,
        assignedBy: r.assigned_by,
        assignedAt: r.assigned_at,
        updatedAt: r.updated_at,
      }));
    }
    case "db.assignView": {
      const { viewId, assigneeUserIds } = payload;
      if (!Array.isArray(assigneeUserIds) || assigneeUserIds.length === 0) return [];
      const rows = assigneeUserIds.map((uid: string) => ({
        view_id: viewId,
        assignee_user_id: uid,
        status: "assigned",
        assigned_by: userId,
        assigned_at: nowIso(),
        updated_at: nowIso(),
      }));
      const { data, error } = await supabase
        .from("cat_view_assignments" as any)
        .upsert(rows as any, { onConflict: "view_id,assignee_user_id" })
        .select("id");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.id);
    }
    case "db.unassignView": {
      const { viewId, assigneeUserId } = payload;
      const { error } = await supabase
        .from("cat_view_assignments" as any)
        .update({ status: "cancelled", updated_at: nowIso() } as any)
        .eq("view_id", viewId)
        .eq("assignee_user_id", assigneeUserId);
      if (error) throw error;
      return true;
    }
    case "db.listMyViewAssignments": {
      const { data, error } = await supabase
        .from("cat_view_assignments" as any)
        .select(`
          id, view_id, status, assigned_at, updated_at,
          view:cat_views!cat_view_assignments_view_id_fkey(id, project_id, name, file_ids, segment_ids, file_roles)
        `)
        .eq("assignee_user_id", userId)
        .neq("status", "cancelled")
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        viewId: r.view_id,
        status: r.status,
        assignedAt: r.assigned_at,
        updatedAt: r.updated_at,
        view: r.view ? {
          id: r.view.id,
          projectId: r.view.project_id,
          name: r.view.name,
          fileIds: Array.isArray(r.view.file_ids) ? r.view.file_ids : [],
          segmentIds: Array.isArray(r.view.segment_ids) ? r.view.segment_ids : [],
          fileRoles: r.view.file_roles ?? {},
        } : null,
      }));
    }
    case "db.updateViewAssignmentStatus": {
      const { assignmentId, status } = payload;
      const { error } = await supabase
        .from("cat_view_assignments" as any)
        .update({ status, updated_at: nowIso() } as any)
        .eq("id", assignmentId)
        .eq("assignee_user_id", userId);
      if (error) throw error;
      return true;
    }

    default:
      throw new Error(`Unknown CAT cloud RPC action: ${action}`);
  }
}

