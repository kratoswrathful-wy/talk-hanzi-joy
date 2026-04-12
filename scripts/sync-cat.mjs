/**
 * Copies cat-tool/ → public/cat/ for Vite static serving at /cat/*
 * Excludes documentation-only files at the root of cat-tool.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "cat-tool");
const dest = path.join(root, "public", "cat");

const excludeRoot = new Set(["README.md", "LICENSE"]);

function shouldCopy(srcPath, base) {
  const rel = path.relative(base, srcPath);
  if (!rel || rel === ".") return true;
  const first = rel.split(path.sep)[0];
  if (base === src && !rel.includes(path.sep) && excludeRoot.has(first)) return false;
  return true;
}

if (!fs.existsSync(src)) {
  console.error("[sync-cat] Missing directory:", src);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => shouldCopy(p, src),
});
console.log("[sync-cat] Copied", src, "→", dest);
