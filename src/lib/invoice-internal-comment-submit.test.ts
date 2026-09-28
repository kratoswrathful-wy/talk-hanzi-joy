import { describe, expect, it } from "vitest";
import { createInternalCommentSubmitSession } from "./invoice-internal-comment-submit";

describe("createInternalCommentSubmitSession", () => {
  it("送出失敗後重試沿用同一則 id，不由呼叫端指定", async () => {
    const session = createInternalCommentSubmitSession();
    let persistCalls = 0;
    const persist = async () => {
      persistCalls += 1;
      return persistCalls === 1 ? { error: new Error("Failed to fetch") } : { error: null };
    };
    const first = await session.submit({
      input: { content: "新則", author: "PM（測試）", timestamp: "2026/09/28 19:00:00" },
      known: true,
      currentComments: [{ id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" }],
      persist,
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    const pending = session.pendingId();
    expect(pending).toBe(first.commentId);
    const retry = await session.submit({
      input: { content: "新則", author: "PM（測試）", timestamp: "2026/09/28 19:00:00" },
      known: true,
      currentComments: [{ id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" }],
      persist,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.commentId).toBe(first.commentId);
    expect(session.pendingId()).toBeNull();
  });
});
