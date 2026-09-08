#!/usr/bin/env node
/**
 * 以暫存 keys 呼叫 provision／輸出 creds 路徑（不印密碼）。
 * 用法：
 *   node scripts/isolation-pipe-provision.mjs micro3|personas <keys-dir>
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const mode = process.argv[2];
const keysDir = process.argv[3];
if (!mode || !keysDir) {
  console.error("usage: isolation-pipe-provision.mjs micro3|personas <keys-dir>");
  process.exit(1);
}

const url = readFileSync(join(keysDir, "url.txt"), "utf8").trim();
const anonKey = readFileSync(join(keysDir, "anon.key"), "utf8").trim();
const serviceRoleKey = readFileSync(join(keysDir, "service.key"), "utf8").trim();
const script =
  mode === "personas"
    ? "scripts/isolation-provision-test-personas.mjs"
    : "scripts/micro3-provision-temp-users.mjs";

const input = JSON.stringify({ url, anonKey, serviceRoleKey });
const r = spawnSync("node", [script], {
  input,
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
if (r.status !== 0) {
  console.error((r.stderr || r.stdout || "provision failed").slice(0, 1500));
  process.exit(r.status || 1);
}
const credPath = (r.stdout || "").trim();
if (!credPath) {
  console.error("provision returned empty creds path");
  process.exit(1);
}
process.stdout.write(credPath);
