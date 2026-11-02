import { describe, expect, it } from "vitest";
import {
  canToggleClientQuestionForm,
  mergeCaseComments,
} from "./case-comment-acl";

const ACTOR = "5c126e91-1acf-4957-9bf0-fcc7aae62a9e";
const OTHER = "58848399-e3b4-40fa-a75f-b31021b2d07d";
const PM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const c = (
  id: string,
  content: string,
  authorUserId?: string,
): {
  id: string; author: string; content: string; createdAt: string; authorUserId?: string;
} => ({
  id,
  author: "A",
  content,
  createdAt: "2026-09-30T00:00:00.000Z",
  ...(authorUserId ? { authorUserId } : {}),
});

describe("case comment acl", () => {
  it("提問勾選：全員可看；只有本案譯者或主管可改", () => {
    expect(canToggleClientQuestionForm({
      isAdmin: false,
      actorId: "t1",
      translatorUserIds: ["t1"],
    })).toBe(true);
    expect(canToggleClientQuestionForm({
      isAdmin: false,
      actorId: "viewer",
      translatorUserIds: ["t1"],
    })).toBe(false);
    expect(canToggleClientQuestionForm({
      isAdmin: true,
      actorId: "pm",
      translatorUserIds: [],
    })).toBe(true);
  });

  it("一般成員只能追加並刪自己的；整包刪別人的會被拒", () => {
    const current = [c("1", "舊", OTHER)];
    const ok = mergeCaseComments({
      current,
      incoming: [c("1", "舊", OTHER), c("2", "新")],
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      expect(ok.next.map((x) => x.id)).toEqual(["1", "2"]);
      expect(ok.next[1]?.authorUserId).toBe(ACTOR);
    }

    const wipe = mergeCaseComments({
      current,
      incoming: [c("2", "只留新的")],
      actorId: ACTOR,
      isPmPlus: false,
    });
    expect(wipe.status).toBe("forbidden");
    expect(wipe.next).toEqual(current);
  });

  it("PM 以上可刪缺作者 ID 的舊則", () => {
    const current = [c("1", "舊")];
    const admin = mergeCaseComments({
      current,
      incoming: [c("2", "只留新的")],
      actorId: PM,
      isPmPlus: true,
    });
    expect(admin.status).toBe("ok");
    if (admin.status === "ok") expect(admin.next.map((x) => x.id)).toEqual(["2"]);
  });
});
