/**
 * Cache SheetJS CDN bundle for Node-based inspection scripts.
 *
 * Usage:
 *   node scripts/cache-sheetjs.mjs
 */
import fs from "fs";
import path from "path";

const url = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
const destDir = path.join(process.cwd(), "scripts", ".cache");
const destFile = path.join(destDir, "sheetjs-xlsx-0.20.1.min.js");

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed to download SheetJS bundle: ${res.status} ${res.statusText}`);
}
const text = await res.text();
fs.writeFileSync(destFile, text, "utf8");
console.log("[cache-sheetjs] Wrote", destFile);

