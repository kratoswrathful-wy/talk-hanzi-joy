import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

describe("fetchOwnSlackMeta", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("有資料時回傳本人 meta", async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: "u1", slack_user_id: "U1", slack_team_id: "T1" }],
      error: null,
    });
    const { fetchOwnSlackMeta } = await import("./get-own-slack-meta");
    const result = await fetchOwnSlackMeta();
    expect(result).toEqual({
      ok: true,
      meta: { user_id: "u1", slack_user_id: "U1", slack_team_id: "T1" },
    });
  });

  it("無資料時回傳 null meta", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { fetchOwnSlackMeta } = await import("./get-own-slack-meta");
    const result = await fetchOwnSlackMeta();
    expect(result).toEqual({ ok: true, meta: null });
  });

  it("RPC 拒絕時回傳 error 結構", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const { fetchOwnSlackMeta } = await import("./get-own-slack-meta");
    const result = await fetchOwnSlackMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("42501");
    }
  });
});

describe("useOwnSlackMetaStatus", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("成功後離開 loading", async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: "u1", slack_user_id: "U1", slack_team_id: null }],
      error: null,
    });
    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result } = renderHook(() => useOwnSlackMetaStatus(true));
    await waitFor(() => {
      expect(result.current.status.kind).toBe("connected");
    });
  });

  it("RPC 失敗時進入 error 且離開 loading", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "denied", code: "42501" },
    });
    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result } = renderHook(() => useOwnSlackMetaStatus(true));
    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });
  });

  it("舊請求不得覆寫新使用者狀態", async () => {
    let resolveFirst: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    rpcMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        data: [{ user_id: "u2", slack_user_id: "U2", slack_team_id: null }],
        error: null,
      });

    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result, rerender } = renderHook(
      ({ enabled }) => useOwnSlackMetaStatus(enabled),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.status.kind).toBe("connected");
    });
    expect(result.current.status).toEqual({
      kind: "connected",
      slackUserId: "U2",
    });

    resolveFirst!({
      data: [{ user_id: "u-stale", slack_user_id: "U_STALE", slack_team_id: null }],
      error: null,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toEqual({
      kind: "connected",
      slackUserId: "U2",
    });
  });
});
