import { describe, expect, it } from "vitest";
import {
  COMMENT_DELETED_PLACEHOLDER,
  applyCommentDelete,
  canDeleteComment,
  mergeCommentList,
} from "./comment-model";

const ACTOR = "5c126e91-1acf-4957-9bf0-fcc7aae62a9e";
const OTHER = "58848399-e3b4-40fa-a75f-b31021b2d07d";
const PM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const c = (
  id: string,
  opts: { authorUserId?: string; content?: string; replyTo?: string; deleted?: boolean } = {},
) => ({
  id,
  author: "名",
  content: opts.content ?? id,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...(opts.authorUserId ? { authorUserId: opts.authorUserId } : {}),
  ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  ...(opts.deleted ? { deleted: true, content: COMMENT_DELETED_PLACEHOLDER } : {}),
});

describe("canDeleteComment", () => {
  it("作者可刪自己的；同名不能靠暱稱刪別人", () => {
    expect(canDeleteComment({
      comment: c("1", { authorUserId: ACTOR }),
      actorId: ACTOR,
      isPmPlus: false,
    })).toBe(true);
    expect(canDeleteComment({
      comment: c("1", { authorUserId: OTHER }),
      actorId: ACTOR,
      isPmPlus: false,
    })).toBe(false);
  });

  it("舊則缺作者 ID 只有 PM 以上可刪", () => {
    expect(canDeleteComment({
      comment: c("1"),
      actorId: ACTOR,
      isPmPlus: false,
    })).toBe(false);
    expect(canDeleteComment({
      comment: c("1"),
      actorId: PM,
      isPmPlus: true,
    })).toBe(true);
  });

  it("已刪除不再給入口", () => {
    expect(canDeleteComment({
      comment: c("1", { authorUserId: ACTOR, deleted: true }),
      actorId: ACTOR,
      isPmPlus: true,
    })).toBe(false);
  });
});

describe("applyCommentDelete", () => {
  it("沒有回覆的主則直接移除", () => {
    const r = applyCommentDelete({
      current: [c("1", { authorUserId: ACTOR })],
      commentId: "1",
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.next).toEqual([]);
  });

  it("主則有他人回覆時改佔位，回覆留下", () => {
    const r = applyCommentDelete({
      current: [
        c("1", { authorUserId: ACTOR, content: "主文" }),
        c("2", { authorUserId: OTHER, content: "回覆", replyTo: "1" }),
      ],
      commentId: "1",
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.next[0]?.deleted).toBe(true);
      expect(r.next[0]?.content).toBe(COMMENT_DELETED_PLACEHOLDER);
      expect(r.next[0]?.imageUrls).toBeUndefined();
      expect(r.next[1]?.content).toBe("回覆");
    }
  });

  it("一般成員不能刪別人的", () => {
    const current = [c("1", { authorUserId: OTHER })];
    const r = applyCommentDelete({
      current,
      commentId: "1",
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("forbidden");
    expect(r.next).toEqual(current);
  });
});

describe("mergeCommentList", () => {
  it("追加時蓋上操作者 ID，不接受前端偽造的作者", () => {
    const r = mergeCommentList({
      current: [c("1", { authorUserId: OTHER })],
      incoming: [
        c("1", { authorUserId: OTHER }),
        c("2", { authorUserId: OTHER, content: "新" }),
      ],
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.next[1]?.authorUserId).toBe(ACTOR);
      expect(r.next[0]?.authorUserId).toBe(OTHER);
    }
  });

  it("incoming 以 deleted 標記有回覆主則時改佔位，不把原文當還活著", () => {
    const r = mergeCommentList({
      current: [
        c("1", { authorUserId: ACTOR, content: "主文" }),
        c("2", { authorUserId: OTHER, content: "回覆", replyTo: "1" }),
      ],
      incoming: [
        c("1", { authorUserId: ACTOR, deleted: true }),
        c("2", { authorUserId: OTHER, content: "回覆", replyTo: "1" }),
      ],
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.next[0]?.deleted).toBe(true);
      expect(r.next[0]?.content).toBe(COMMENT_DELETED_PLACEHOLDER);
      expect(r.next[1]?.content).toBe("回覆");
    }
  });

  it("先改作者再刪會失敗：既有 ID 的作者以庫存為準", () => {
    const r = mergeCommentList({
      current: [c("1", { authorUserId: OTHER })],
      incoming: [],
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(r.status).toBe("forbidden");
  });

  it("PM 可刪缺 ID 舊則；同時可追加", () => {
    const r = mergeCommentList({
      current: [c("old")],
      incoming: [c("only", { content: "新" })],
      actorId: PM,
      isPmPlus: true,
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.next.map((x) => x.id)).toEqual(["only"]);
  });
});
