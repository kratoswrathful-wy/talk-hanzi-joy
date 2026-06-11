/**
 * 從 Supabase MCP execute_sql 匯出的 JSON 組裝 migrate --prefetch 用資料。
 * 用法：node scripts/compose-migrate-prefetch.mjs <mcp-result.json> [out-path]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractPayload(raw) {
  const outer = JSON.parse(raw);
  const text = typeof outer.result === "string" ? outer.result : JSON.stringify(outer.result);
  const start = text.indexOf("[{");
  const end = text.lastIndexOf("}]");
  if (start < 0 || end < 0) throw new Error("無法從 MCP 結果擷取 JSON 陣列");
  const arr = JSON.parse(text.slice(start, end + 2));
  const row = arr[0];
  if (row?.payload) return row.payload;
  if (row?.cases || row?.cat_files || row?.cat_projects) return row;
  throw new Error("MCP 結果缺少 payload");
}

async function main() {
  const inPath = process.argv[2];
  const outPath =
    process.argv[3] ||
    path.join(__dirname, ".cache", "migrate-prefetch.json");
  if (!inPath) {
    console.error("用法：node scripts/compose-migrate-prefetch.mjs <mcp-result.json> [out-path]");
    process.exit(1);
  }
  const raw = await readFile(inPath, "utf8");
  const payload = extractPayload(raw);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`已寫入 ${outPath}`);
  console.log(
    `cases=${(payload.cases || []).length} projects=${(payload.cat_projects || []).length} files=${(payload.cat_files || []).length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
