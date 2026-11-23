import { defineConfig } from '@playwright/test';

// 此設定只跑本機單機 CAT；不用登入正式帳號，也不載入登入狀態。
export default defineConfig({
  testDir: '.', testMatch: 'cat-quick-redo.spec.ts',
  workers: 1, retries: 0, timeout: 60000,
  outputDir: '../test-results/cat-quick-redo',
  reporter: [['list']],
});
