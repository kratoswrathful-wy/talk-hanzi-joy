import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STORE_READBACK_INTERVAL_MS,
  awaitStoreReadback,
  awaitStoreReadbackMatch,
  failReadbackTimedOut,
  failWriteFailed,
  readbackAfterWrite,
} from "./ai-agent-readback";

afterEach(() => {
  vi.useRealTimers();
});

describe("ai-agent-readback", () => {
  it("寫入失敗／回讀逾時訊息可區分且含 id", () => {
    const w = failWriteFailed("案件", "permission denied");
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.error).toContain("寫入失敗（案件）");
    expect(w.error).toContain("permission denied");
    expect(w.error).not.toContain("勿重寫");

    const r = failReadbackTimedOut("案件", "case-uuid-1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("寫入成功但回讀逾時");
    expect(r.error).toContain("id=case-uuid-1");
    expect(r.error).toContain("勿重寫");
  });

  it("立刻可讀 → 立即回傳", async () => {
    const out = await awaitStoreReadback(() => ({ id: "a" }), { timeoutMs: 500, intervalMs: 20 });
    expect(out).toEqual({ id: "a" });
  });

  it("延遲出現 → 輪詢後取得", async () => {
    vi.useFakeTimers();
    let hit = 0;
    const p = awaitStoreReadback(
      () => {
        hit += 1;
        return hit >= 3 ? { id: "late" } : null;
      },
      { timeoutMs: 1000, intervalMs: STORE_READBACK_INTERVAL_MS },
    );
    await vi.advanceTimersByTimeAsync(STORE_READBACK_INTERVAL_MS * 4);
    await expect(p).resolves.toEqual({ id: "late" });
  });

  it("逾時 → null；readbackAfterWrite → fail 含勿重寫", async () => {
    vi.useFakeTimers();
    const p = readbackAfterWrite("費用", "fee-1", () => null, {
      timeoutMs: 200,
      intervalMs: 50,
    });
    await vi.advanceTimersByTimeAsync(400);
    const r = await p;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("寫入成功但回讀逾時（費用 id=fee-1）");
    expect(r.error).toContain("勿重寫");
  });

  it("awaitStoreReadbackMatch：欄位對齊才回傳", async () => {
    vi.useFakeTimers();
    let n = 0;
    const p = awaitStoreReadbackMatch(
      () => ({ channel: n >= 3 ? "V 信箱" : "" }),
      (v) => v.channel === "V 信箱",
      { timeoutMs: 1000, intervalMs: 50 },
    );
    const tick = async () => {
      n += 1;
      await vi.advanceTimersByTimeAsync(50);
    };
    await tick();
    await tick();
    await tick();
    await expect(p).resolves.toEqual({ channel: "V 信箱" });
  });
});
