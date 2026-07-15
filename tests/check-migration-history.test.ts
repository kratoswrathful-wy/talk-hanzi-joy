import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  diffMigrationRows,
  diffVersionSets,
  parseMigrationListOutput,
} from "../scripts/lib/migration-history-diff.mjs";

const ROOT = join(import.meta.dirname, "..");

describe("check-migration-history", () => {
  it("detects repair-only drift (remote only)", () => {
    const fixture = JSON.parse(
      readFileSync(
        join(ROOT, "tests/fixtures/migration-history-drift-repair-only.json"),
        "utf8",
      ),
    );
    const diff = diffMigrationRows(fixture.migrations);
    expect(diff.synced).toBe(false);
    expect(diff.onlyRemote).toContain("20260704024703");
    expect(diff.onlyLocal).toEqual([]);
  });

  it("passes synced fixture", () => {
    const fixture = JSON.parse(
      readFileSync(
        join(ROOT, "tests/fixtures/migration-history-synced.json"),
        "utf8",
      ),
    );
    const diff = diffMigrationRows(fixture.migrations);
    expect(diff.synced).toBe(true);
  });

  it("CLI: drift fixture exits 1", () => {
    const r = spawnSync(
      process.execPath,
      [
        "scripts/check-migration-history.mjs",
        "--fixture",
        "tests/fixtures/migration-history-drift-repair-only.json",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/repair|遠端有/);
  });

  it("CLI: synced fixture exits 0", () => {
    const r = spawnSync(
      process.execPath,
      [
        "scripts/check-migration-history.mjs",
        "--fixture",
        "tests/fixtures/migration-history-synced.json",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(r.status).toBe(0);
  });

  it("diffVersionSets: local-only pending file", () => {
    const diff = diffVersionSets(
      ["20260703120000", "20260715999999"],
      ["20260703120000"],
    );
    expect(diff.onlyLocal).toEqual(["20260715999999"]);
    expect(diff.synced).toBe(false);
  });

  it("parses pretty migration list table", () => {
    const sample = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260703120000 | 20260703120000 | 2026-07-03 12:00:00
   20260715120000 |                | 2026-07-15 12:00:00
`;
    const rows = parseMigrationListOutput(sample);
    expect(rows).toHaveLength(2);
    expect(diffMigrationRows(rows).onlyLocal).toEqual(["20260715120000"]);
  });
});
