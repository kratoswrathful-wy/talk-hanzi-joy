import { describe, expect, it, vi } from "vitest";
import {
  replaceTestModeReturnTicket,
  restoreTestModeReturnSession,
  TEST_MODE_RETURN_EMAIL_KEY,
  TEST_MODE_RETURN_TOKEN_KEY,
} from "./test-mode-return-session";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("測試模式返回票", () => {
  it("驗證完成前保留返回票，成功切回本人後才清除", async () => {
    const storage = createStorage();
    replaceTestModeReturnTicket(storage, {
      token: "return-token",
      email: "owner@example.com",
    });
    const signOut = vi.fn(async () => undefined);

    const result = await restoreTestModeReturnSession({
      storage,
      verifyToken: async (token) => {
        expect(token).toBe("return-token");
        expect(storage.getItem(TEST_MODE_RETURN_TOKEN_KEY)).toBe("return-token");
        expect(storage.getItem(TEST_MODE_RETURN_EMAIL_KEY)).toBe(
          "owner@example.com",
        );
        return { email: "OWNER@example.com", error: null };
      },
      signOut,
    });

    expect(result).toEqual({
      status: "restored",
      email: "OWNER@example.com",
    });
    expect(storage.getItem(TEST_MODE_RETURN_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(TEST_MODE_RETURN_EMAIL_KEY)).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("返回票若切到非本人身分，清除票並安全登出", async () => {
    const storage = createStorage();
    replaceTestModeReturnTicket(storage, {
      token: "wrong-token",
      email: "owner@example.com",
    });
    const signOut = vi.fn(async () => undefined);

    const result = await restoreTestModeReturnSession({
      storage,
      verifyToken: async () => ({
        email: "other@example.com",
        error: null,
      }),
      signOut,
    });

    expect(result).toEqual({
      status: "signed-out",
      reason: "identity-mismatch",
      message: "other@example.com",
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(storage.getItem(TEST_MODE_RETURN_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(TEST_MODE_RETURN_EMAIL_KEY)).toBeNull();
  });

  it("返回票失效時清理同分頁殘留並安全登出", async () => {
    const storage = createStorage();
    replaceTestModeReturnTicket(storage, {
      token: "expired-token",
      email: "owner@example.com",
    });
    const signOut = vi.fn(async () => undefined);

    const result = await restoreTestModeReturnSession({
      storage,
      verifyToken: async () => ({
        email: null,
        error: "Token has expired",
      }),
      signOut,
    });

    expect(result).toEqual({
      status: "signed-out",
      reason: "verification-failed",
      message: "Token has expired",
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(storage.getItem(TEST_MODE_RETURN_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(TEST_MODE_RETURN_EMAIL_KEY)).toBeNull();
  });

  it("寫入新票前先移除不完整的舊票", () => {
    const storage = createStorage();
    storage.setItem(TEST_MODE_RETURN_TOKEN_KEY, "stale-token");

    replaceTestModeReturnTicket(storage, {
      token: "new-token",
      email: "owner@example.com",
    });

    expect(storage.getItem(TEST_MODE_RETURN_TOKEN_KEY)).toBe("new-token");
    expect(storage.getItem(TEST_MODE_RETURN_EMAIL_KEY)).toBe(
      "owner@example.com",
    );
  });
});
