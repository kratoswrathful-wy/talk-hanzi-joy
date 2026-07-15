#!/usr/bin/env node
/**
 * 比對 supabase migration 版號：repo 檔案 ↔ 遠端 schema_migrations（或 fixture）。
 *
 * 用法：
 *   node scripts/check-migration-history.mjs --fixture tests/fixtures/migration-history-synced.json
 *   node scripts/check-migration-history.mjs --fixture tests/fixtures/migration-history-drift-repair-only.json   # 預期 exit 1
 *   node scripts/check-migration-history.mjs --live   # 需已 supabase link + SUPABASE_ACCESS_TOKEN
 *
 * 偵測重點：「只 repair 不補檔」→ remote 有、local 無；或「只補檔未套用」→ local 有、remote 無。
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffMigrationRows,
  diffVersionSets,
  parseMigrationListOutput,
} from "./lib/migration-history-diff.mjs";

export { diffMigrationRows, diffVersionSets, parseMigrationListOutput };

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/**
 * @param {string[]} argv
 * @returns {{ fixture: string | null; live: boolean; help: boolean }}
 */
function parseArgs(argv) {
  let fixture = null;
  let live = false;
  let help = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--live") live = true;
    else if (a === "--fixture") {
      fixture = argv[++i] ?? null;
    } else if (a.startsWith("--fixture=")) {
      fixture = a.slice("--fixture=".length);
    }
  }
  return { fixture, live, help };
}

/** @returns {string[]} */
function listLocalVersions() {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`找不到 migrations 目錄：${MIGRATIONS_DIR}`);
  }
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, 14))
    .filter((v) => /^\d{14}$/.test(v))
    .sort();
}

/** @param {string} fixturePath */
function loadFixture(fixturePath) {
  const abs =
    fixturePath.startsWith("/") || /^[A-Za-z]:/.test(fixturePath)
      ? fixturePath
      : join(ROOT, fixturePath);
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  if (Array.isArray(raw.migrations)) {
    return { mode: "rows", rows: raw.migrations };
  }
  if (Array.isArray(raw.local) && Array.isArray(raw.remote)) {
    return { mode: "sets", local: raw.local, remote: raw.remote };
  }
  throw new Error(
    `Fixture 格式無效：需 { migrations: [{local,remote}] } 或 { local:[], remote:[] }（${abs}）`,
  );
}

function fetchLiveMigrationList() {
  const r = spawnSync(
    "npx",
    ["supabase", "--agent", "no", "migration", "list", "--linked"],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
      env: process.env,
    },
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0 && !out.includes("Local")) {
    throw new Error(
      `supabase migration list 失敗（exit ${r.status}）：\n${out}`,
    );
  }
  return parseMigrationListOutput(out);
}

function printDiff(diff) {
  if (diff.onlyRemote.length) {
    console.error(
      "漂移：遠端有、repo 無（典型：只 repair／MCP 直套未補檔）→",
      diff.onlyRemote.join(", "),
    );
  }
  if (diff.onlyLocal.length) {
    console.error(
      "漂移：repo 有、遠端無（典型：補檔未 db push／未 repair applied）→",
      diff.onlyLocal.join(", "),
    );
  }
}

function main() {
  const { fixture, live, help } = parseArgs(process.argv);
  if (help || (!fixture && !live)) {
    console.log(`用法：
  node scripts/check-migration-history.mjs --fixture <path>
  node scripts/check-migration-history.mjs --live
`);
    process.exit(help ? 0 : 2);
  }

  /** @type {{ onlyLocal: string[]; onlyRemote: string[]; synced: boolean }} */
  let diff;
  if (fixture) {
    const data = loadFixture(fixture);
    diff =
      data.mode === "rows"
        ? diffMigrationRows(data.rows)
        : diffVersionSets(data.local, data.remote);
  } else {
    const rows = fetchLiveMigrationList();
    const localFiles = listLocalVersions();
    const fromCli = diffMigrationRows(rows);
    const remoteVersions = rows
      .map((r) => (r.remote ?? "").trim())
      .filter(Boolean);
    const fileDiff = diffVersionSets(localFiles, remoteVersions);
    diff = {
      onlyLocal: [...new Set([...fromCli.onlyLocal, ...fileDiff.onlyLocal])],
      onlyRemote: [...new Set([...fromCli.onlyRemote, ...fileDiff.onlyRemote])],
      synced: false,
    };
    diff.synced = diff.onlyLocal.length === 0 && diff.onlyRemote.length === 0;
  }

  if (!diff.synced) {
    printDiff(diff);
    process.exit(1);
  }
  console.log("migration history synced: repo <-> remote versions match");
  process.exit(0);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
