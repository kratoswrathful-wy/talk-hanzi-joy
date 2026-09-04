#!/usr/bin/env node
/**
 * 將非敏感的 MAINTENANCE_ETA 注入 dist/index.html（或指定檔）。
 * 禁止傳入 secret／連線字串。
 */
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2] || "dist/index.html";
const eta = (process.env.MAINTENANCE_ETA || "請依維護公告時間（窗口另行通知）").trim();
if (/supabase|postgres|password|token|secret|service_role|eyJ/i.test(eta)) {
  console.error("MAINTENANCE_ETA 含可疑敏感內容，拒絕注入");
  process.exit(1);
}
let html = readFileSync(target, "utf8");
if (!html.includes("__MAINTENANCE_ETA__")) {
  console.error("找不到 __MAINTENANCE_ETA__ 標記");
  process.exit(1);
}
html = html.split("__MAINTENANCE_ETA__").join(eta);
writeFileSync(target, html, "utf8");
console.log("maintenance_eta_injected=1");
