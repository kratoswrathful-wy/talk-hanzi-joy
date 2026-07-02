const DEFAULT_BASE = "http://localhost:8080";

export default async function globalSetup() {
  const url = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_BASE;
  const isProd = /^https:\/\/talk-hanzi-joy\.vercel\.app/i.test(url);
  if (isProd && process.env.PLAYWRIGHT_ALLOW_PRODUCTION !== "1") {
    throw new Error(
      "Playwright 禁止對 production 執行；請設 PLAYWRIGHT_BASE_URL=http://localhost:8080",
    );
  }
}
