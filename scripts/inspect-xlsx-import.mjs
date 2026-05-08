/**
 * Inspect XLSX cells for tag-detection failure patterns.
 *
 * This script loads SheetJS (xlsx) from the official CDN bundle (0.20.1)
 * to match the in-browser CAT behavior, then scans all sheets/cells.
 *
 * Usage (PowerShell):
 *   node scripts/inspect-xlsx-import.mjs "C:\path\file.xlsx"
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

function loadSheetJsFromCdn() {
  const cdnPath = new URL("./.cache/sheetjs-xlsx-0.20.1.min.js", import.meta.url);
  const localPath = fileURLToPath(cdnPath);
  if (!fs.existsSync(localPath)) {
    throw new Error(
      "Missing cached SheetJS bundle. Run once: node scripts/cache-sheetjs.mjs"
    );
  }
  const code = fs.readFileSync(localPath, "utf8");
  const sandbox = { console, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "xlsx.full.min.js" });
  if (!sandbox.XLSX) throw new Error("Failed to load XLSX from bundle");
  return sandbox.XLSX;
}

function isProbablyAngleLike(s) {
  return /<[^>]+>/.test(s);
}

function summarizeText(s, limit = 160) {
  const oneLine = String(s).replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? oneLine.slice(0, limit) + "…" : oneLine;
}

function extractVisibleText(cell) {
  if (!cell) return "";
  if (typeof cell.w === "string" && cell.w) return cell.w;
  if (cell.v == null) return "";
  return String(cell.v);
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/inspect-xlsx-import.mjs <file.xlsx>");
    process.exit(2);
  }
  const abs = path.resolve(filePath);
  const buf = fs.readFileSync(abs);

  const XLSX = loadSheetJsFromCdn();
  const wb = XLSX.read(buf, { type: "buffer" });
  const utils = XLSX.utils;
  const out = {
    file: abs,
    sheetNames: wb.SheetNames || [],
    totals: {
      cellsVisited: 0,
      cellsWithAngleLike: 0,
      cellsWithRichR: 0,
      cellsWithStyleS: 0,
      cellsWithAngleLikeButNoTagsDetected: 0,
    },
    samples: {
      angleLikeCells: [],
      richCells: [],
    },
  };

  for (const name of out.sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const range = utils.decode_range(ws["!ref"]);
    const dense = ws["!data"] != null;
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = utils.encode_cell({ r: R, c: C });
        const cell = dense ? ws["!data"]?.[R]?.[C] : ws[addr];
        if (!cell) continue;
        out.totals.cellsVisited++;
        if (cell.s) out.totals.cellsWithStyleS++;
        if (cell.r) out.totals.cellsWithRichR++;

        const txt = extractVisibleText(cell);
        if (txt && isProbablyAngleLike(txt)) {
          out.totals.cellsWithAngleLike++;
          if (out.samples.angleLikeCells.length < 30) {
            out.samples.angleLikeCells.push({
              sheet: name,
              addr,
              text: summarizeText(txt),
              hasRichR: !!cell.r,
              hasStyleS: !!cell.s,
            });
          }
        }
        if (cell.r && out.samples.richCells.length < 20) {
          out.samples.richCells.push({
            sheet: name,
            addr,
            text: summarizeText(txt),
            rSnippet: summarizeText(cell.r, 200),
          });
        }
      }
    }
  }

  // Print JSON to stdout
  process.stdout.write(JSON.stringify(out, null, 2));
}

main();

