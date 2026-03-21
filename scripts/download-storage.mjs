/**
 * Batch-download all objects from Supabase Storage buckets (avatars, case-files, case-icons).
 *
 * Requires SOURCE_SUPABASE_URL + SOURCE_SUPABASE_SERVICE_ROLE_KEY from the *source* (e.g. old Lovable) project.
 * Service role is needed to list objects; public buckets can then be downloaded reliably.
 *
 * Usage:
 *   set SOURCE_SUPABASE_URL=https://xxxx.supabase.co
 *   set SOURCE_SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   npm run download-storage
 *
 * Optional:
 *   set OUT_DIR=storage-backup
 *   set BUCKETS=avatars,case-files,case-icons
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const url = process.env.SOURCE_SUPABASE_URL;
const key = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const outDir = process.env.OUT_DIR || join(ROOT, "storage-backup");
const buckets = (process.env.BUCKETS || "avatars,case-files,case-icons")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!url || !key) {
  console.error(`
Missing environment variables.

PowerShell:
  $env:SOURCE_SUPABASE_URL="https://<old-project-ref>.supabase.co"
  $env:SOURCE_SUPABASE_SERVICE_ROLE_KEY="<service_role key from old project>"
  npm run download-storage

cmd.exe:
  set SOURCE_SUPABASE_URL=https://...
  set SOURCE_SUPABASE_SERVICE_ROLE_KEY=eyJ...
  npm run download-storage
`);
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Recursively list all file paths in a bucket (folders have id === null in list response).
 */
async function listAllFilePaths(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) {
        const sub = await listAllFilePaths(bucket, fullPath);
        paths.push(...sub);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function downloadFile(bucket, objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw error;
  const buf = Buffer.from(await data.arrayBuffer());
  const dest = join(outDir, bucket, objectPath.replace(/\//g, "\\"));
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

async function main() {
  console.log(`Output directory: ${outDir}`);
  console.log(`Buckets: ${buckets.join(", ")}`);

  let total = 0;
  for (const bucket of buckets) {
    console.log(`\nListing bucket: ${bucket} ...`);
    const paths = await listAllFilePaths(bucket);
    console.log(`  Found ${paths.length} file(s).`);
    for (const p of paths) {
      process.stdout.write(`  ${bucket}/${p}\r`);
      await downloadFile(bucket, p);
      total++;
    }
    console.log(`\n  Done: ${bucket}`);
  }

  console.log(`\nFinished. Downloaded ${total} file(s) under ${outDir}\\<bucket>\\...`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
