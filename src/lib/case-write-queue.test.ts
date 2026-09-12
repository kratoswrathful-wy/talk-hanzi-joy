import { describe, expect, it, vi } from "vitest";
import { adminWriteAccessFromRoles, CASE_SAVE_NOT_READY_MESSAGE, createKeyedQueue, createLatestWriteScheduler, describeCaseWriteFailure, hardLeaveGuardKind, mergeOptimisticCaseWrite, nextSavePhaseAfterWrite, resolveInAppLeaveDecision, resolveIntendedCaseWrite, shouldBlockNonAdminAssignmentWrite, shouldUseAdminCaseWritePath } from "./case-write-queue";

describe("createKeyedQueue", () => {
  it("runs tasks for the same key in order and uses the previous result", async () => {
    const queue = createKeyedQueue();
    const seen: number[] = [];
    const first = queue.enqueue("a", async () => {
      seen.push(1);
      return 1;
    });
    const second = queue.enqueue("a", async () => {
      seen.push(2);
      return 2;
    });
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });

  it("continues the next task when the previous one fails", async () => {
    const queue = createKeyedQueue();
    const first = queue.enqueue("a", async () => {
      throw new Error("boom");
    });
    const second = queue.enqueue("a", async () => "ok");
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
  });
});

describe("adminWriteAccessFromRoles", () => {
  it("does not treat a role query failure as a member", () => {
    const access = adminWriteAccessFromRoles([], new Error("timeout"));
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.message).toContain("無法確認身分");
  });

  it("treats pm and executive as admin when the query succeeded", () => {
    expect(adminWriteAccessFromRoles([{ role: "member" }], null)).toEqual({
      ok: true,
      isAdmin: false,
    });
    expect(adminWriteAccessFromRoles([{ role: "pm" }], null)).toEqual({
      ok: true,
      isAdmin: true,
    });
  });

  it("role query failure still sends assignment writes to the admin RPC", () => {
    const failed = adminWriteAccessFromRoles([], new Error("timeout"));
    expect(shouldUseAdminCaseWritePath(failed, true)).toBe(true);
    expect(shouldBlockNonAdminAssignmentWrite(failed, true)).toBe(false);
    expect(shouldUseAdminCaseWritePath(failed, false)).toBe(false);
  });

  it("known members cannot use the admin write path", () => {
    const member = adminWriteAccessFromRoles([{ role: "member" }], null);
    expect(shouldUseAdminCaseWritePath(member, true)).toBe(false);
    expect(shouldBlockNonAdminAssignmentWrite(member, true)).toBe(true);
  });

  it("missing session still attempts assignment RPC instead of swallowing the write", () => {
    const missing = adminWriteAccessFromRoles(null, new Error("no_session"));
    expect(shouldUseAdminCaseWritePath(missing, true)).toBe(true);
    expect(shouldBlockNonAdminAssignmentWrite(missing, true)).toBe(false);
    expect(shouldUseAdminCaseWritePath(missing, false)).toBe(false);
  });
});

describe("identity write routing matrix", () => {
  it("empty successful roles are not admin and cannot send assignment writes", () => {
    const empty = adminWriteAccessFromRoles([], null);
    expect(empty).toEqual({ ok: true, isAdmin: false });
    expect(shouldUseAdminCaseWritePath(empty, true)).toBe(false);
    expect(shouldBlockNonAdminAssignmentWrite(empty, true)).toBe(true);
    expect(shouldUseAdminCaseWritePath(empty, false)).toBe(false);
  });

  it("executive is admin; member title-only uses permitted path", () => {
    const executive = adminWriteAccessFromRoles([{ role: "executive" }], null);
    expect(shouldUseAdminCaseWritePath(executive, true)).toBe(true);
    const member = adminWriteAccessFromRoles([{ role: "member" }], null);
    expect(shouldUseAdminCaseWritePath(member, false)).toBe(false);
    expect(shouldBlockNonAdminAssignmentWrite(member, false)).toBe(false);
  });

  it("role lookup failure does not block sending; backend still decides", () => {
    const failed = adminWriteAccessFromRoles(null, new Error("timeout"));
    expect(shouldUseAdminCaseWritePath(failed, true)).toBe(true);
    expect(shouldBlockNonAdminAssignmentWrite(failed, true)).toBe(false);
  });

  it("after a previous identity failure the next queued write still runs", async () => {
    const queue = createKeyedQueue();
    const first = queue.enqueue("case-1", async () => {
      throw new Error("無法確認身分，指派與公布尚未寫入。請稍後再試。");
    });
    const second = queue.enqueue("case-1", async () => "sent");
    await expect(first).rejects.toThrow("無法確認身分");
    await expect(second).resolves.toBe("sent");
  });
});

describe("resolveIntendedCaseWrite", () => {
  it("keeps the intended write when the local snapshot is missing", () => {
    expect(resolveIntendedCaseWrite(null, null, { status: "inquiry" })).toEqual({
      status: "ready",
      base: null,
      write: { status: "inquiry" },
    });
  });

  it("prefers the local snapshot when both local and store rows exist", () => {
    const local = { title: "local" };
    const store = { title: "store" };
    expect(resolveIntendedCaseWrite(local, store, { title: "next" })).toEqual({
      status: "ready",
      base: local,
      write: { title: "next" },
    });
  });

  it("does not treat an empty patch as a successful write", () => {
    expect(resolveIntendedCaseWrite(null, { title: "keep" }, {})).toEqual({
      status: "not_ready",
      message: CASE_SAVE_NOT_READY_MESSAGE,
    });
  });
});

describe("mergeOptimisticCaseWrite", () => {
  it("keeps the previous official status while a status write is in flight", () => {
    expect(mergeOptimisticCaseWrite("draft", { title: "A", status: "inquiry" }, true)).toEqual({
      title: "A",
      status: "draft",
    });
  });

  it("does not strip status when the patch has no status write", () => {
    expect(mergeOptimisticCaseWrite("draft", { title: "A", status: "inquiry" }, false)).toEqual({
      title: "A",
      status: "inquiry",
    });
  });
});

describe("createLatestWriteScheduler", () => {
  it("writes only the last scheduled value after the delay", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const scheduler = createLatestWriteScheduler((value: string) => {
      seen.push(value);
    }, 400);
    scheduler.schedule("N07A-BO");
    scheduler.schedule("N07A-BODY-1");
    scheduler.schedule("N07A-BODY-full");
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    expect(seen).toEqual(["N07A-BODY-full"]);
    vi.useRealTimers();
  });

  it("flush writes the latest pending value immediately", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const scheduler = createLatestWriteScheduler((value: string) => {
      seen.push(value);
    }, 400);
    scheduler.schedule("partial");
    await scheduler.flush();
    expect(seen).toEqual(["partial"]);
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    expect(seen).toEqual(["partial"]);
    vi.useRealTimers();
  });

  it("marks pending immediately and does not treat a later success as latest if more text is waiting", async () => {
    vi.useFakeTimers();
    const busy: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let writes = 0;
    const scheduler = createLatestWriteScheduler(async (value: string) => {
      writes += 1;
      if (writes === 1) await firstWrite;
      void value;
    }, 400, (status) => {
      busy.push(status);
    });
    scheduler.schedule("first");
    expect(scheduler.busy()).toBe("pending");
    expect(scheduler.hasUnfinished()).toBe(true);
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    expect(scheduler.busy()).toBe("saving");
    scheduler.schedule("second-latest");
    expect(scheduler.busy()).toBe("pending");
    expect(nextSavePhaseAfterWrite({ outcome: "ok", hasPending: scheduler.hasPending() })).toBe("pending");
    releaseFirst?.();
    await scheduler.flush();
    expect(scheduler.hasUnfinished()).toBe(false);
    expect(nextSavePhaseAfterWrite({ outcome: "ok", hasPending: false })).toBe("saved");
    vi.useRealTimers();
  });

  it("keeps the latest text after a failed write and does not retry the old short value", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const scheduler = createLatestWriteScheduler(async (value: string) => {
      seen.push(value);
      if (value === "short") throw new Error("write failed");
    }, 400);
    scheduler.schedule("short");
    await expect(scheduler.flush()).resolves.toBeUndefined();
    expect(seen).toEqual(["short"]);
    scheduler.schedule("full-latest");
    await scheduler.flush();
    expect(seen).toEqual(["short", "full-latest"]);
    vi.useRealTimers();
  });
});

describe("leave decisions", () => {
  it("flushes unfinished body before draft publish or navigate", () => {
    expect(resolveInAppLeaveDecision({
      bodyUnfinished: true,
      bodySaveFailed: false,
      showDraftPublishPrompt: true,
    })).toBe("flush-body");
    expect(resolveInAppLeaveDecision({
      bodyUnfinished: false,
      bodySaveFailed: true,
      showDraftPublishPrompt: true,
    })).toBe("stay-failed");
    expect(resolveInAppLeaveDecision({
      bodyUnfinished: false,
      bodySaveFailed: false,
      showDraftPublishPrompt: true,
    })).toBe("prompt-publish");
    expect(resolveInAppLeaveDecision({
      bodyUnfinished: false,
      bodySaveFailed: false,
      showDraftPublishPrompt: false,
    })).toBe("navigate");
  });

  it("keeps draft and pending hard-leave guards distinct", () => {
    expect(hardLeaveGuardKind({ draftPublishPrompt: true, bodyUnfinished: false })).toBe("draft");
    expect(hardLeaveGuardKind({ draftPublishPrompt: false, bodyUnfinished: true })).toBe("pending");
    expect(hardLeaveGuardKind({ draftPublishPrompt: true, bodyUnfinished: true })).toBe("draft-pending");
    expect(hardLeaveGuardKind({ draftPublishPrompt: false, bodyUnfinished: false })).toBe("none");
  });
});

describe("describeCaseWriteFailure", () => {
  it("maps stale revision to a conflict the user can retry", () => {
    const described = describeCaseWriteFailure(new Error("stale_revision"));
    expect(described.kind).toBe("conflict");
    expect(described.title).toBe("版本衝突");
    expect(described.description).toContain("已保留你剛輸入的內容");
  });

  it("maps identity lookup failure without treating it as a generic save error", () => {
    const described = describeCaseWriteFailure(new Error("無法確認身分，指派與公布尚未寫入。請稍後再試。"));
    expect(described.kind).toBe("identity");
    expect(described.title).toBe("無法確認身分");
  });
});
