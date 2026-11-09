import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: { updated_at: string } | null;
  error: null;
};

const fromMock = vi.fn();
const pendingChecks: Array<(value: QueryResult) => void> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "production",
}));

const { createFeesVisiblePollFallback, createPollFallback, latestTimestamp } = await import("./realtime-poll");

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("realtime poll checkOnce mutex", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pendingChecks.length = 0;
    fromMock.mockReset();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                new Promise<QueryResult>((resolve) => {
                  pendingChecks.push(resolve);
                }),
            }),
          }),
        }),
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("coalesces interval and wake-up burst into one active plus one trailing check", async () => {
    const onChanged = vi.fn();
    const poll = createFeesVisiblePollFallback(onChanged, 1_000);
    poll.start();

    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(pendingChecks).toHaveLength(1);

    for (let i = 0; i < 5; i += 1) {
      document.dispatchEvent(new Event("visibilitychange"));
    }
    await flushMicrotasks();
    expect(fromMock).toHaveBeenCalledTimes(1);

    pendingChecks.shift()?.({
      data: { updated_at: "2026-08-25T10:00:00.000Z" },
      error: null,
    });
    await flushMicrotasks();
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(pendingChecks).toHaveLength(1);

    pendingChecks.shift()?.({
      data: { updated_at: "2026-08-25T10:01:00.000Z" },
      error: null,
    });
    await flushMicrotasks();

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    poll.stop();
  });

  it("first check reloads when DB latest is newer than in-memory", async () => {
    const onChanged = vi.fn();
    const poll = createPollFallback(
      "internal_notes",
      onChanged,
      1_000,
      () => "2026-08-25T09:00:00.000Z",
    );
    poll.start();
    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();
    pendingChecks.shift()?.({
      data: { updated_at: "2026-08-25T10:00:00.000Z" },
      error: null,
    });
    await flushMicrotasks();
    expect(onChanged).toHaveBeenCalledTimes(1);
    poll.stop();
  });
});

describe("latestTimestamp", () => {
  it("returns the greatest non-empty value", () => {
    expect(latestTimestamp(["2026-01-01T00:00:00.000Z", "", "2026-01-02T00:00:00.000Z"])).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(latestTimestamp([null, undefined])).toBeNull();
  });
});
