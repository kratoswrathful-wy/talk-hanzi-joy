/**
 * Mock-only tests for P0-A0 preflight (no live DB).
 * Run: node --test scripts/p0a0-preflight.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildReport } from "./p0a0-preflight.mjs";

const scriptPath = fileURLToPath(new URL("./p0a0-preflight.mjs", import.meta.url));

test("buildReport 摘要不含 caseId／userId", () => {
  const { summary, candidates } = buildReport({
    permissionRows: [{ id: "p1", env: "test" }],
    caseRows: [
      {
        id: "case-real-uuid",
        env: "test",
        translator: ["Alice"],
        reviewer: "",
        collab_rows: [{ translatorUserId: "user-real-uuid", id: "row1" }],
      },
    ],
    fileRows: [],
    legacyAssignments: [],
    fileAssignments: [],
    stageAssignments: [],
    viewAssignments: [],
    views: [],
  });
  const text = JSON.stringify(summary);
  assert.equal(text.includes("case-real-uuid"), false);
  assert.equal(text.includes("user-real-uuid"), false);
  assert.equal(summary.participantCandidates[0].unresolvedRows, 2);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((c) => c.trusted === false));
});

test("mock CLI --full 寫入 scripts/.cache 且 stdout 去識別", () => {
  const dir = mkdtempSync(join(tmpdir(), "p0a0-"));
  const fixture = join(dir, "fixture.json");
  writeFileSync(
    fixture,
    JSON.stringify({
      permissionRows: [{ id: "p1", env: "test" }],
      caseRows: [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          env: "test",
          translator: [],
          reviewer: "Bob",
          collab_rows: [],
        },
      ],
      fileRows: [],
      legacyAssignments: [],
      fileAssignments: [],
      stageAssignments: [],
      viewAssignments: [],
      views: [],
    }),
  );
  const env = {
    ...process.env,
    P0A0_PREFLIGHT_MOCK: "1",
    P0A0_PREFLIGHT_FIXTURE: fixture,
  };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const result = spawnSync(process.execPath, [scriptPath, "--full"], {
    env,
    encoding: "utf8",
    cwd: join(scriptPath, "..", ".."),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), false);
  assert.match(result.stderr, /完整報告已寫入忽略目錄/);
  const match = result.stderr.match(/完整報告已寫入忽略目錄：(.+)\r?\n?/);
  assert.ok(match);
  const full = JSON.parse(readFileSync(match[1].trim(), "utf8"));
  assert.equal(full.unresolvedCandidates[0].caseId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  rmSync(dir, { recursive: true, force: true });
});
