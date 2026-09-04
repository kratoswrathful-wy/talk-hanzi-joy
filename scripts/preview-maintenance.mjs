#!/usr/bin/env node
/** 本機預覽：所有路徑回傳 dist/index.html（等同 vercel rewrite）。 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "dist", "index.html"));
const port = Number(process.env.PORT || 4173);
createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`maintenance_preview=http://127.0.0.1:${port}/`);
});
