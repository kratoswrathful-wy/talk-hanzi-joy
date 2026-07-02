import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveCatFixture(kind: "small" | "large"): string {
  const envKey = kind === "large" ? "PLAYWRIGHT_CAT_LARGE_FIXTURE" : "PLAYWRIGHT_CAT_SMALL_FIXTURE";
  const envPath = process.env[envKey];
  if (envPath && fs.existsSync(envPath)) return envPath;

  const localName = kind === "large" ? "Test_Big.mqxliff" : "Test_Small.mqxliff";
  const repoPath = path.resolve(__dirname, "..", "fixtures", localName);
  if (fs.existsSync(repoPath)) return repoPath;

  const downloads = path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads", localName);
  if (fs.existsSync(downloads)) return downloads;

  throw new Error(
    `找不到 ${localName}。請放入 tests/fixtures/、設定 ${envKey}，或放在 Downloads/${localName}`,
  );
}
