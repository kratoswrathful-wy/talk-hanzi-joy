/**
 * 將 cases.tools[] 中「自研工具」遷移至 cat_files.related_lms_case_id + cases.cat_tool_enabled。
 *
 * 預設 dry-run（不寫入）；加 --apply 才套用。
 *
 * 環境變數：
 *   SUPABASE_URL 或 VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 用法：
 *   node scripts/migrate-case-tools-to-cat-links.mjs
 *   node scripts/migrate-case-tools-to-cat-links.mjs --case-id <uuid>
 *   node scripts/migrate-case-tools-to-cat-links.mjs --apply
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");

const LEGACY_TOOL_NAME = "自研工具";
const LABEL_PROJECT = "專案名稱";
const LABEL_FILE = "檔案名稱";
const LABEL_LINK = "連結";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const caseIdArgIdx = args.indexOf("--case-id");
const filterCaseId = caseIdArgIdx >= 0 ? args[caseIdArgIdx + 1] : null;
const prefetchArgIdx = args.indexOf("--prefetch");
const prefetchPath = prefetchArgIdx >= 0 ? args[prefetchArgIdx + 1] : null;

const CAT_FILE_URL_RE =
  /\/cat\/team\/files\/([0-9a-f-]{36})(?:\?[^#\s]*?(?:[&?]p=([0-9a-f-]{36}))?)?/i;

function trim(s) {
  return String(s ?? "").trim();
}

function normName(s) {
  return trim(s);
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
async function loadProjects(admin) {
  const { data, error } = await admin.from("cat_projects").select("id, name");
  if (error) throw error;
  const byExact = new Map();
  const byTrim = new Map();
  for (const p of data || []) {
    const name = String(p.name ?? "");
    byExact.set(name, p);
    const t = normName(name);
    if (!byTrim.has(t)) byTrim.set(t, []);
    byTrim.get(t).push(p);
  }
  return { rows: data || [], byExact, byTrim };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
async function loadFiles(admin) {
  const { data, error } = await admin
    .from("cat_files")
    .select("id, name, project_id, related_lms_case_id, related_lms_case_title");
  if (error) throw error;
  const byId = new Map();
  const byProjectAndName = new Map();
  for (const f of data || []) {
    byId.set(f.id, f);
    const key = `${f.project_id}\0${normName(f.name)}`;
    if (!byProjectAndName.has(key)) byProjectAndName.set(key, []);
    byProjectAndName.get(key).push(f);
  }
  return { rows: data || [], byId, byProjectAndName };
}

function getFieldLabels(entry) {
  const fields = Array.isArray(entry.fields) ? entry.fields : [];
  const map = new Map();
  for (const f of fields) {
    if (f?.id && f?.label) map.set(f.id, trim(f.label));
  }
  return map;
}

function extractLegacyValues(entry) {
  const labelById = getFieldLabels(entry);
  const values = entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues : {};
  const fileValues =
    entry.fileValues && typeof entry.fileValues === "object" ? entry.fileValues : {};
  let projectName = "";
  let fileName = "";
  let linkUrl = "";

  for (const [fieldId, raw] of Object.entries(values)) {
    const label = labelById.get(fieldId) || "";
    const val = trim(raw);
    if (!val) continue;
    if (label === LABEL_PROJECT) projectName = val;
    else if (label === LABEL_FILE) fileName = val;
    else if (label === LABEL_LINK) linkUrl = val;
  }

  for (const [fieldId, files] of Object.entries(fileValues)) {
    if (labelById.get(fieldId) !== LABEL_LINK) continue;
    const list = Array.isArray(files) ? files : [];
    for (const item of list) {
      const u = trim(item?.url);
      if (u && CAT_FILE_URL_RE.test(u)) {
        linkUrl = u;
        break;
      }
    }
    if (linkUrl) break;
  }

  return { projectName, fileName, linkUrl };
}

function parseUrl(linkUrl) {
  const m = CAT_FILE_URL_RE.exec(linkUrl);
  if (!m) return null;
  return { fileId: m[1], projectId: m[2] || null, method: "url" };
}

function resolveByName(projectName, fileName, projects, files) {
  if (!projectName || !fileName) return { status: "unresolved", reason: "缺少專案名稱或檔案名稱" };

  const pn = normName(projectName);
  const fn = normName(fileName);

  let project = projects.byExact.get(projectName) || null;
  if (!project) {
    const candidates = projects.byTrim.get(pn) || [];
    if (candidates.length === 1) project = candidates[0];
    else if (candidates.length > 1) {
      return { status: "ambiguous", reason: `專案名稱「${projectName}」對應多個 CAT 專案` };
    }
  }
  if (!project) {
    return { status: "unresolved", reason: `找不到 CAT 專案「${projectName}」` };
  }

  const key = `${project.id}\0${fn}`;
  const matches = files.byProjectAndName.get(key) || [];
  if (matches.length === 0) {
    return { status: "unresolved", reason: `專案「${projectName}」內找不到檔案「${fileName}」` };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      reason: `專案「${projectName}」內有多筆同名檔案「${fileName}」`,
      fileIds: matches.map((m) => m.id),
    };
  }

  return {
    status: "resolved",
    fileId: matches[0].id,
    projectId: project.id,
    method: "project_and_filename",
  };
}

function classifyLink(caseId, caseTitle, fileRow) {
  const existing = fileRow.related_lms_case_id;
  if (existing === caseId) {
    return {
      status: "already_linked",
      reason: "檔案已連結至本案",
      fileId: fileRow.id,
      projectId: fileRow.project_id,
    };
  }
  if (existing && existing !== caseId) {
    return {
      status: "skip_conflict",
      reason: `檔案已連結至其他案件：${fileRow.related_lms_case_title || existing}`,
      fileId: fileRow.id,
      projectId: fileRow.project_id,
      otherCaseId: existing,
    };
  }
  return {
    status: "would_link",
    reason: "dry-run：將寫入連結",
    fileId: fileRow.id,
    projectId: fileRow.project_id,
  };
}

function resolveEntry(caseId, caseTitle, entry, projects, files) {
  const base = {
    caseId,
    caseTitle,
    toolEntryId: entry.id,
    legacyTool: entry.tool,
    parseMethod: null,
    fileId: null,
    projectId: null,
    status: "unresolved",
    reason: "",
  };

  const { projectName, fileName, linkUrl } = extractLegacyValues(entry);

  let resolved = null;
  if (linkUrl) {
    const parsed = parseUrl(linkUrl);
    if (parsed) {
      const fileRow = files.byId.get(parsed.fileId);
      if (!fileRow) {
        return { ...base, parseMethod: "url", status: "unresolved", reason: "URL 中的檔案 ID 不存在於 cat_files" };
      }
      if (parsed.projectId && fileRow.project_id !== parsed.projectId) {
        return {
          ...base,
          parseMethod: "url",
          fileId: parsed.fileId,
          projectId: fileRow.project_id,
          status: "unresolved",
          reason: "URL 的 projectId 與檔案實際專案不一致",
        };
      }
      resolved = { fileRow, method: "url" };
    }
  }

  if (!resolved) {
    const byName = resolveByName(projectName, fileName, projects, files);
    if (byName.status === "resolved") {
      const fileRow = files.byId.get(byName.fileId);
      resolved = { fileRow, method: byName.method };
    } else {
      return {
        ...base,
        parseMethod: byName.method || (linkUrl ? "url_fallback_name" : "project_and_filename"),
        status: byName.status,
        reason: byName.reason,
        fileIds: byName.fileIds,
      };
    }
  }

  const outcome = classifyLink(caseId, caseTitle, resolved.fileRow);
  return {
    ...base,
    parseMethod: resolved.method,
    fileId: outcome.fileId,
    projectId: outcome.projectId,
    status: outcome.status,
    reason: outcome.reason,
    otherCaseId: outcome.otherCaseId,
  };
}

function buildMarkdownReport(report) {
  const lines = [
    `# 自研工具 → 1UP CAT 遷移報告`,
    ``,
    `- 產生時間：${report.generatedAt}`,
    `- 模式：${report.mode}`,
    `- 掃描案件數：${report.casesScanned}`,
    `- 自研工具筆數：${report.legacyToolEntries}`,
    ``,
    `## 狀態摘要`,
    ``,
  ];

  for (const [status, count] of Object.entries(report.summary)) {
    lines.push(`- **${status}**：${count}`);
  }

  lines.push(``, `## 明細`, ``);
  lines.push(`| 案件 | toolEntryId | 解析 | fileId | 狀態 | 原因 |`);
  lines.push(`|------|-------------|------|--------|------|------|`);

  for (const row of report.entries) {
    const title = (row.caseTitle || row.caseId).replace(/\|/g, "\\|");
    lines.push(
      `| ${title} | ${row.toolEntryId} | ${row.parseMethod || "—"} | ${row.fileId || "—"} | ${row.status} | ${(row.reason || "").replace(/\|/g, "\\|")} |`
    );
  }

  if (report.applyErrors?.length) {
    lines.push(``, `## 套用錯誤`, ``);
    for (const e of report.applyErrors) {
      lines.push(`- ${e}`);
    }
  }

  return lines.join("\n");
}

function buildIndexes(projectsRows, filesRows) {
  const projects = { rows: projectsRows, byExact: new Map(), byTrim: new Map() };
  for (const p of projectsRows) {
    const name = String(p.name ?? "");
    projects.byExact.set(name, p);
    const t = normName(name);
    if (!projects.byTrim.has(t)) projects.byTrim.set(t, []);
    projects.byTrim.get(t).push(p);
  }

  const files = { rows: filesRows, byId: new Map(), byProjectAndName: new Map() };
  for (const f of filesRows) {
    files.byId.set(f.id, f);
    const key = `${f.project_id}\0${normName(f.name)}`;
    if (!files.byProjectAndName.has(key)) files.byProjectAndName.set(key, []);
    files.byProjectAndName.get(key).push(f);
  }

  return { projects, files };
}

async function loadPrefetch(path) {
  const raw = await readFile(path, "utf8");
  const data = JSON.parse(raw);
  const cases = data.cases || [];
  const filtered = filterCaseId ? cases.filter((c) => c.id === filterCaseId) : cases;
  const { projects, files } = buildIndexes(data.cat_projects || [], data.cat_files || []);
  return { cases: filtered, projects, files };
}

async function main() {
  let cases;
  let projects;
  let files;

  if (prefetchPath) {
    ({ cases, projects, files } = await loadPrefetch(prefetchPath));
  } else {
    if (!url || !key) {
      console.error("缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）或 SUPABASE_SERVICE_ROLE_KEY");
      process.exit(1);
    }

    const admin = createClient(url, key, { auth: { persistSession: false } });

    let caseQuery = admin.from("cases").select("id, title, tools, cat_tool_enabled");
    if (filterCaseId) caseQuery = caseQuery.eq("id", filterCaseId);

    const { data: casesData, error: casesErr } = await caseQuery;
    if (casesErr) throw casesErr;
    cases = casesData || [];

    const [projectsData, filesData] = await Promise.all([loadProjects(admin), loadFiles(admin)]);
    projects = projectsData;
    files = filesData;
  }

  const entries = [];
  let legacyCount = 0;

  for (const c of cases || []) {
    const tools = Array.isArray(c.tools) ? c.tools : [];
    for (const entry of tools) {
      if (trim(entry?.tool) !== LEGACY_TOOL_NAME) continue;
      legacyCount += 1;
      const row = resolveEntry(c.id, c.title || "", entry, projects, files);
      entries.push(row);
    }
  }

  const summary = {};
  for (const e of entries) {
    summary[e.status] = (summary[e.status] || 0) + 1;
  }

  const applyErrors = [];

  if (apply) {
    if (!url || !key) {
      console.error("缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）或 SUPABASE_SERVICE_ROLE_KEY（--apply 必填）");
      process.exit(1);
    }
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const caseUpdates = new Map();

    for (const row of entries) {
      if (row.status !== "would_link") continue;
      const { error } = await admin
        .from("cat_files")
        .update({
          related_lms_case_id: row.caseId,
          related_lms_case_title: row.caseTitle,
        })
        .eq("id", row.fileId)
        .is("related_lms_case_id", null);

      if (error) {
        applyErrors.push(`${row.caseId}/${row.toolEntryId}: cat_files 更新失敗 — ${error.message}`);
        continue;
      }

      row.status = "linked";
      row.reason = "已寫入連結";
      caseUpdates.set(row.caseId, row.caseTitle);
    }

    for (const [caseId] of caseUpdates) {
      const { error } = await admin.from("cases").update({ cat_tool_enabled: true }).eq("id", caseId);
      if (error) applyErrors.push(`${caseId}: cat_tool_enabled 更新失敗 — ${error.message}`);
    }

    const toolsToStrip = new Map();
    for (const row of entries) {
      if (!["linked", "already_linked"].includes(row.status)) continue;
      if (!toolsToStrip.has(row.caseId)) toolsToStrip.set(row.caseId, new Set());
      toolsToStrip.get(row.caseId).add(row.toolEntryId);
    }

    for (const c of cases || []) {
      const stripIds = toolsToStrip.get(c.id);
      if (!stripIds?.size) continue;
      const tools = Array.isArray(c.tools) ? c.tools : [];
      const nextTools = tools.filter((t) => !stripIds.has(t.id));
      if (nextTools.length === tools.length) continue;
      const { error } = await admin.from("cases").update({ tools: nextTools }).eq("id", c.id);
      if (error) applyErrors.push(`${c.id}: tools[] 移除失敗 — ${error.message}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    casesScanned: (cases || []).length,
    legacyToolEntries: legacyCount,
    filterCaseId,
    summary,
    entries,
    applyErrors: apply ? applyErrors : undefined,
  };

  await mkdir(CACHE_DIR, { recursive: true });
  const baseName = `migrate-case-tools-report-${timestamp}`;
  const jsonPath = path.join(CACHE_DIR, `${baseName}.json`);
  const mdPath = path.join(CACHE_DIR, `${baseName}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, buildMarkdownReport(report), "utf8");

  console.log(`模式：${report.mode}`);
  console.log(`掃描案件：${report.casesScanned}；自研工具：${legacyCount}`);
  console.log("狀態摘要：", summary);
  console.log(`報告：${jsonPath}`);
  console.log(`摘要：${mdPath}`);
  if (applyErrors.length) {
    console.error("套用錯誤：", applyErrors);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
