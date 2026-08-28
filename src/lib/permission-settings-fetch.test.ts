import { describe, expect, it } from "vitest";
import {
  fetchPermissionConfigBounded,
  setPermissionFetchTimeoutMs,
} from "./permission-settings-fetch";

describe("permission_settings bounded timeout", () => {
  it("永不完成的查詢必須在 timeout 內 fail-closed（路由 spinner 可結束）", async () => {
    setPermissionFetchTimeoutMs(40);
    const started = Date.now();
    const result = await fetchPermissionConfigBounded(
      () =>
        new Promise(() => {
          /* never settles */
        }),
    );
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/permission_settings timeout/);
    }
    expect(elapsed).toBeLessThan(500);
    setPermissionFetchTimeoutMs(null);
  });

  it("成功回應回傳 ok:true", async () => {
    setPermissionFetchTimeoutMs(200);
    const result = await fetchPermissionConfigBounded(async () => ({
      data: { config: { fields: {} } },
      error: null,
    }));
    expect(result).toEqual({ ok: true, data: { config: { fields: {} } } });
    setPermissionFetchTimeoutMs(null);
  });
});
