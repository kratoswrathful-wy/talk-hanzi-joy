#!/usr/bin/env node
/** 維護頁專用建置：只產出靜態 index.html，不打包 React／Supabase。 */
import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(root, "index.html"), join(dist, "index.html"));
const inj = spawnSync(process.execPath, [join(root, "scripts", "inject-maintenance-eta.mjs"), join(dist, "index.html")], {
  env: process.env,
  encoding: "utf8",
});
if (inj.status !== 0) {
  console.error(inj.stderr || inj.stdout);
  process.exit(inj.status || 1);
}
console.log("maintenance_static_build=PASS");
