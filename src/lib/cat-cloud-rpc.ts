/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

type RpcPayload = Record<string, any>;

const nowIso = () => new Date().toISOString();

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
  assignmentId: r.assignment_id ?? null,
  env: r.env ?? "production",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

const mapFileRow = (r: any) => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  originalFileBase64: r.original_file_base64 ?? "",
  sourceLang: r.source_lang ?? "",
  targetLang: r.target_lang ?? "",
  originalSourceLang: r.original_source_lang ?? "",
  originalTargetLang: r.original_target_lang ?? "",
  workspaceNoteDraft: r.workspace_note_draft ?? "",
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

const mapSegmentRow = (r: any) => ({
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
  isLocked: !!r.is_locked,
  status: r.status ?? "",
  editorNote: r.editor_note ?? "",
  matchValue: r.match_value,
  createdAt: r.created_at,
  lastModified: r.last_modified,
});

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

const mapTbRow = (r: any) => ({
  id: r.id,
  name: r.name,
  terms: r.terms ?? [],
  nextTermNumber: r.next_term_number ?? 1,
  changeLog: r.change_log ?? [],
  sourceLangs: r.source_langs ?? [],
  targetLangs: r.target_langs ?? [],
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
        last_modified: nowIso(),
      } as any).eq("id", payload.projectId);
    case "db.getProjects": {
      const { data } = await supabase.from("cat_projects").select("*").order("last_modified", { ascending: false });
      return (data ?? []).map(mapProjectRow);
    }
    case "db.getProject": {
      const { data } = await supabase.from("cat_projects").select("*").eq("id", payload.projectId).maybeSingle();
      return data ? mapProjectRow(data) : null;
    }
    case "db.deleteProject":
      return await supabase.from("cat_projects").delete().eq("id", payload.projectId);

    case "db.createFile": {
      const { data, error } = await supabase
        .from("cat_files")
        .insert({
          project_id: payload.projectId,
          name: payload.name,
          original_file_base64: payload.originalFileBase64 ?? "",
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
      await supabase.from("cat_projects").update({ last_modified: nowIso() } as any).eq("id", payload.projectId);
      return data.id;
    }
    case "db.getFiles": {
      const { data } = await supabase.from("cat_files").select("*").eq("project_id", payload.projectId).order("last_modified", { ascending: false });
      return (data ?? []).map(mapFileRow);
    }
    case "db.getRecentFiles": {
      const { data } = await supabase.from("cat_files").select("*").order("last_modified", { ascending: false }).limit(payload.limit || 10);
      return (data ?? []).map(mapFileRow);
    }
    case "db.getFile": {
      const { data } = await supabase.from("cat_files").select("*").eq("id", payload.fileId).maybeSingle();
      return data ? mapFileRow(data) : null;
    }
    case "db.updateFile":
      return await supabase.from("cat_files").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.originalFileBase64 != null ? { original_file_base64: payload.updates.originalFileBase64 } : {}),
        ...(payload.updates?.sourceLang != null ? { source_lang: payload.updates.sourceLang } : {}),
        ...(payload.updates?.targetLang != null ? { target_lang: payload.updates.targetLang } : {}),
        ...(payload.updates?.originalSourceLang != null ? { original_source_lang: payload.updates.originalSourceLang } : {}),
        ...(payload.updates?.originalTargetLang != null ? { original_target_lang: payload.updates.originalTargetLang } : {}),
        ...(payload.updates?.workspaceNoteDraft != null ? { workspace_note_draft: payload.updates.workspaceNoteDraft } : {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.fileId);
    case "db.deleteFile":
      return await supabase.from("cat_files").delete().eq("id", payload.fileId);

    case "db.addSegments": {
      if (!Array.isArray(payload.segmentsArray) || payload.segmentsArray.length === 0) return 0;
      const { error: segInsertError, count: segCount } = await supabase.from("cat_segments").insert(
        payload.segmentsArray.map((s: any) => ({
          file_id: s.fileId,
          sheet_name: s.sheetName ?? "Sheet1",
          row_idx: s.rowIdx ?? 0,
          col_src: s.colSrc ?? null,
          col_tgt: s.colTgt ?? null,
          id_value: s.idValue ?? null,
          extra_value: s.extraValue ?? null,
          source_text: s.sourceText ?? "",
          target_text: s.targetText ?? "",
          is_locked: !!s.isLocked,
          status: s.status ?? "",
          editor_note: s.editorNote ?? "",
          match_value: coerceMatchValueForDb(s.matchValue),
          created_at: nowIso(),
          last_modified: nowIso(),
        })) as any
      );
      if (segInsertError) throw segInsertError;
      return segCount ?? payload.segmentsArray.length;
    }
    case "db.getSegmentsByFile": {
      const { data } = await supabase.from("cat_segments").select("*").eq("file_id", payload.fileId).order("row_idx", { ascending: true });
      return (data ?? []).map(mapSegmentRow);
    }
    case "db.updateSegmentTarget": {
      const { error: ustErr } = await supabase.from("cat_segments").update({
        target_text: payload.newTargetText,
        ...(payload.extra ?? {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.segmentId);
      if (ustErr) throw ustErr;
      return;
    }
    case "db.updateSegmentStatus": {
      const { error: ussErr } = await supabase.from("cat_segments").update({
        status: payload.newStatus,
        ...(payload.extra ?? {}),
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
      const { data, error } = await supabase
        .from("cat_private_notes")
        .insert({
          project_id: payload.entry.projectId,
          user_id: userId,
          content: payload.entry.content || "",
          created_by_name: payload.entry.createdByName || "",
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
      const { error } = await supabase
        .from("cat_private_notes")
        .update({ content: payload.content, updated_at: nowIso() } as any)
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
      const { data } = await supabase.from("cat_tms").select("*").order("last_modified", { ascending: false });
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
      const { data } = await supabase.from("cat_tm_segments").select("*").eq("tm_id", payload.tmId);
      return (data ?? []).map(mapTmSegmentRow);
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
      const { data } = await supabase.from("cat_tbs").select("*").order("last_modified", { ascending: false });
      return (data ?? []).map(mapTbRow);
    }
    case "db.getTB": {
      const { data } = await supabase.from("cat_tbs").select("*").eq("id", payload.tbId).maybeSingle();
      return data ? mapTbRow(data) : null;
    }
    case "db.updateTBName":
      return await supabase.from("cat_tbs").update({ name: payload.newName, last_modified: nowIso() } as any).eq("id", payload.tbId);
    case "db.updateTB":
      return await supabase.from("cat_tbs").update({
        ...(payload.updates?.name != null ? { name: payload.updates.name } : {}),
        ...(payload.updates?.terms != null ? { terms: payload.updates.terms } : {}),
        ...(payload.updates?.nextTermNumber != null ? { next_term_number: payload.updates.nextTermNumber } : {}),
        ...(payload.updates?.changeLog != null ? { change_log: payload.updates.changeLog } : {}),
        ...(payload.updates?.sourceLangs != null ? { source_langs: payload.updates.sourceLangs } : {}),
        ...(payload.updates?.targetLangs != null ? { target_langs: payload.updates.targetLangs } : {}),
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
        last_modified: nowIso(),
      } as any).eq("id", payload.tbId);
    case "db.deleteTB":
      return await supabase.from("cat_tbs").delete().eq("id", payload.id);

    default:
      throw new Error(`Unknown CAT cloud RPC action: ${action}`);
  }
}

