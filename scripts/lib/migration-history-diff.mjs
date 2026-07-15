/**
 * Pure helpers for migration version set / list-row diffs.
 * Keep this file ASCII-only so vitest can import it reliably.
 */

/**
 * @param {{ local?: string; remote?: string }[]} rows
 * @returns {{ onlyLocal: string[]; onlyRemote: string[]; synced: boolean }}
 */
export function diffMigrationRows(rows) {
  const onlyLocal = [];
  const onlyRemote = [];
  for (const row of rows) {
    const local = (row.local ?? "").trim();
    const remote = (row.remote ?? "").trim();
    if (local && !remote) onlyLocal.push(local);
    if (remote && !local) onlyRemote.push(remote);
  }
  return {
    onlyLocal,
    onlyRemote,
    synced: onlyLocal.length === 0 && onlyRemote.length === 0,
  };
}

/**
 * @param {string[]} localVersions
 * @param {string[]} remoteVersions
 */
export function diffVersionSets(localVersions, remoteVersions) {
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);
  const onlyLocal = localVersions.filter((v) => !remoteSet.has(v));
  const onlyRemote = remoteVersions.filter((v) => !localSet.has(v));
  return {
    onlyLocal,
    onlyRemote,
    synced: onlyLocal.length === 0 && onlyRemote.length === 0,
  };
}

/**
 * Parse `supabase migration list` pretty table or JSON.
 * @param {string} raw
 * @returns {{ local?: string; remote?: string }[]}
 */
export function parseMigrationListOutput(raw) {
  const text = raw.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    const parsed = JSON.parse(text);
    const rows = parsed.migrations ?? parsed;
    if (!Array.isArray(rows)) {
      throw new Error("migration list JSON missing migrations array");
    }
    return rows;
  }

  /** @type {{ local?: string; remote?: string }[]} */
  const rows = [];
  const lineRe =
    /^\s*`?(\d{14})`?\s*\|\s*`?(\d{14})?`?\s*\|\s*.+$/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(lineRe);
    if (!m) continue;
    rows.push({
      local: m[1] || "",
      remote: m[2] || "",
    });
  }
  if (rows.length === 0) {
    throw new Error(
      "Could not parse migration list output (need JSON or Local|Remote table)",
    );
  }
  return rows;
}
