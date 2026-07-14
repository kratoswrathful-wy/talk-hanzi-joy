import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvFile(filename: string) {
  const envPath = path.resolve(__dirname, filename);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function loadDotEnv() {
  // .env.playwright.local 優先：Playwright 本機憑證獨立存放，避免與常被整檔重寫的 .env 混在一起（見 .cursor/rules/architecture.mdc §9）。
  loadDotEnvFile(".env.playwright.local");
  loadDotEnvFile(".env");
}

loadDotEnv();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const isLocalBase = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(baseURL);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      timeout: 180_000,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testMatch: /(dev-switch-user-persona|cat-navigation-2-3q|cat-bcd-wave-acceptance|ai-bridge-phase2|w5-phase2-billing-rls|w10-fees-visible-pm|w10-fees-visible-translator|cat-ai-batch-progress|cat-modal-state-bridge|cat-meta-display-map|lms-tool-set-field|lms-client-invoice-bridge|case-copy-title-refresh)\.spec\.ts/,
      use: {
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  ...(isLocalBase
    ? {
        webServer: {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
