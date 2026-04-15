/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

type RpcPayload = Record<string, any>;

const nowIso = () => new Date().toISOString();

const mapProjectRow = (r: any) => ({
  id: r.id,
  name: r.name,
  sourceLangs: r.source_langs ?? [],
  targetLangs: r.target_langs ?? [],
  readTms: r.read_tms ?? [],
  writeTms: r.write_tms ?? [],
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

    case "db.addSegments":
      if (!Array.isArray(payload.segmentsArray) || payload.segmentsArray.length === 0) return null;
      return await supabase.from("cat_segments").insert(
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
          match_value: s.matchValue ?? null,
          created_at: nowIso(),
          last_modified: nowIso(),
        })) as any
      );
    case "db.getSegmentsByFile": {
      const { data } = await supabase.from("cat_segments").select("*").eq("file_id", payload.fileId).order("row_idx", { ascending: true });
      return (data ?? []).map(mapSegmentRow);
    }
    case "db.updateSegmentTarget":
      return await supabase.from("cat_segments").update({
        target_text: payload.newTargetText,
        ...(payload.extra ?? {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.segmentId);
    case "db.updateSegmentStatus":
      return await supabase.from("cat_segments").update({
        status: payload.newStatus,
        ...(payload.extra ?? {}),
        last_modified: nowIso(),
      } as any).eq("id", payload.segmentId);
    case "db.updateSegmentEditorNote":
      return await supabase.from("cat_segments").update({ editor_note: payload.editorNote ?? "", last_modified: nowIso() } as any).eq("id", payload.segmentId);

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
    case "db.bulkAddTMSegments":
      if (!Array.isArray(payload.tmSegmentsArray) || payload.tmSegmentsArray.length === 0) return null;
      return await supabase.from("cat_tm_segments").insert(
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

