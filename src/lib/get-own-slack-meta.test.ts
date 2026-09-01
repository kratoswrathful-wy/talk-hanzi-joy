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

  it("RPC throw 時回傳 error 結構", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    const { fetchOwnSlackMeta } = await import("./get-own-slack-meta");
    const result = await fetchOwnSlackMeta();
    expect(result).toEqual({
      ok: false,
      error: { message: "network down" },
    });
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
    const { result } = renderHook(() => useOwnSlackMetaStatus(true, "u1"));
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
    const { result } = renderHook(() => useOwnSlackMetaStatus(true, "u1"));
    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });
  });

  it("RPC Promise reject 時進入 error 且離開 loading", async () => {
    rpcMock.mockRejectedValue(new Error("rpc exploded"));
    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result } = renderHook(() => useOwnSlackMetaStatus(true, "u1"));
    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });
  });

  it("A→B 切換且 enabled 維持 true 時會重新查詢", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ user_id: "u-a", slack_user_id: "U_A", slack_team_id: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ user_id: "u-b", slack_user_id: "U_B", slack_team_id: null }],
        error: null,
      });

    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result, rerender } = renderHook(
      ({ enabled, userId }) => useOwnSlackMetaStatus(enabled, userId),
      { initialProps: { enabled: true, userId: "u-a" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.status).toEqual({
        kind: "connected",
        slackUserId: "U_A",
      });
    });

    rerender({ enabled: true, userId: "u-b" });

    await waitFor(() => {
      expect(result.current.status).toEqual({
        kind: "connected",
        slackUserId: "U_B",
      });
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("A 的慢請求不得覆寫 B", async () => {
    let resolveFirst: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    rpcMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        data: [{ user_id: "u-b", slack_user_id: "U_B", slack_team_id: null }],
        error: null,
      });

    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result, rerender } = renderHook(
      ({ enabled, userId }) => useOwnSlackMetaStatus(enabled, userId),
      { initialProps: { enabled: true, userId: "u-a" as string | null } },
    );

    rerender({ enabled: true, userId: "u-b" });

    await waitFor(() => {
      expect(result.current.status).toEqual({
        kind: "connected",
        slackUserId: "U_B",
      });
    });

    resolveFirst!({
      data: [{ user_id: "u-a", slack_user_id: "U_STALE", slack_team_id: null }],
      error: null,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toEqual({
      kind: "connected",
      slackUserId: "U_B",
    });
  });

  it("disabled 時不保留上一人的 connected 狀態", async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: "u1", slack_user_id: "U1", slack_team_id: null }],
      error: null,
    });
    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result, rerender } = renderHook(
      ({ enabled, userId }) => useOwnSlackMetaStatus(enabled, userId),
      { initialProps: { enabled: true, userId: "u1" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.status.kind).toBe("connected");
    });

    rerender({ enabled: false, userId: "u1" });
    expect(result.current.status).toEqual({ kind: "not_connected" });
  });

  it("登出（userId 空白）時不保留 connected 狀態", async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: "u1", slack_user_id: "U1", slack_team_id: null }],
      error: null,
    });
    const { useOwnSlackMetaStatus } = await import("./get-own-slack-meta");
    const { result, rerender } = renderHook(
      ({ enabled, userId }) => useOwnSlackMetaStatus(enabled, userId),
      { initialProps: { enabled: true, userId: "u1" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.status.kind).toBe("connected");
    });

    rerender({ enabled: true, userId: null });
    expect(result.current.status).toEqual({ kind: "not_connected" });
  });
});
