const DEFAULT_BASE = "http://localhost:8080";

export default async function globalSetup() {
  const url = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_BASE;
  const isProd = /^https:\/\/talk-hanzi-joy\.vercel\.app/i.test(url);
  const onlineTestMode = process.env.PLAYWRIGHT_ENTER_TEST_MODE === "1";
  if (isProd && process.env.PLAYWRIGHT_ALLOW_PRODUCTION !== "1" && !onlineTestMode) {
    throw new Error(
      "Playwright 禁止對 production 以正式身分執行；請用 localhost，或設 PLAYWRIGHT_ENTER_TEST_MODE=1（線上測試模式）",
    );
  }
}
