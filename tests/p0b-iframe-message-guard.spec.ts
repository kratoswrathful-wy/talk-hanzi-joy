/**
 * P0-B iframe message trust — skip by default until Preview／隔離環境就緒。
 *
 * 手動啟用：拿掉 test.skip 或設環境變數後改寫條件。
 * 本檔不宣稱通過；僅佔位避免日後漏測。
 */
import { test, expect } from "@playwright/test";

test.describe.skip("P0-B CAT iframe message guard (unverified, not deployable)", () => {
  test("placeholder: trusted origin+source required for assignment status RPC path", async () => {
    // 待隔離環境：開 /cat team、掛假 iframe、送錯 origin／錯 source 應被忽略。
    expect(true).toBe(true);
  });
});
