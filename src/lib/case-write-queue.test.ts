import { describe, expect, it } from "vitest";
import { adminWriteAccessFromRoles, createKeyedQueue, describeCaseWriteFailure } from "./case-write-queue";

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
});

describe("describeCaseWriteFailure", () => {
  it("maps stale revision to a conflict the user can retry", () => {
    const described = describeCaseWriteFailure(new Error("stale_revision"));
    expect(described.kind).toBe("conflict");
    expect(described.title).toBe("版本衝突");
    expect(described.description).toContain("已保留你剛輸入的內容");
  });
});
