import fs from "fs";
import path from "path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let allSql = "";
for (const f of files) {
  allSql += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
}

function lastDef(schema, name) {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${schema}\\.${name}\\s*\\(`,
    "gi",
  );
  let m;
  let last = null;
  while ((m = re.exec(allSql))) last = m.index;
  if (last == null) return null;
  const chunk = allSql.slice(last, last + 6000);
  const bodyEnd = chunk.search(
    /\n\s*(revoke|grant|comment on function|create or replace function|create policy|alter table)/i,
  );
  const body = bodyEnd > 0 ? chunk.slice(0, bodyEnd) : chunk.slice(0, 2500);
  const grantsChunk = allSql.slice(last, last + 8000);
  const anonExec = /grant execute[\s\S]{0,200}?to[\s\S]{0,80}?\banon\b/i.test(grantsChunk);
  const publicExec = /grant execute[\s\S]{0,200}?to[\s\S]{0,80}?\bpublic\b/i.test(grantsChunk);
  return {
    definer: /security\s+definer/i.test(body),
    searchPath: /set\s+search_path/i.test(body),
    writes: /\b(insert|update|delete)\b/i.test(body),
    anonExec,
    publicExec,
    body,
  };
}

const fnRe = /create\s+or\s+replace\s+function\s+(public|private)\.(\w+)/gi;
const seen = new Set();
const rows = [];
let m;
while ((m = fnRe.exec(allSql))) {
  const key = `${m[1]}.${m[2]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const d = lastDef(m[1], m[2]);
  if (!d) continue;
  const sideEffect = d.writes || /credential|admin_|accept_|decline_|apply_case|sync_cat|cat_upsert|cat_save|cat_pm|update_case|get_case|ensure_cat|lms_sync|revoke_case|complete_case|handle_new_user|emit_change|upsert_segment|save_segment|catchup|annotation|snapshot|workflow|assignment|revoke|delete_case|create_case/i.test(m[2]);
  let classification = "named_exception";
  if ((d.anonExec || d.publicExec) && sideEffect) classification = "p0_blocker";
  else if ((d.anonExec || d.publicExec) && !sideEffect) classification = "p0_blocker";
  else if (!d.searchPath && sideEffect) classification = "p0_blocker";
  else if (!d.searchPath) classification = "p1_search_path";
  rows.push({
    name: key,
    definer: d.definer,
    searchPath: d.searchPath,
    anonExec: d.anonExec,
    publicExec: d.publicExec,
    sideEffect,
    classification,
  });
}

const p0 = rows.filter((r) => r.classification === "p0_blocker");
console.log(JSON.stringify({ total: rows.length, p0: p0.length, p0Names: p0.map((r) => r.name) }, null, 2));
