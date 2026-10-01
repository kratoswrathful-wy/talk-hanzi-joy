import { describe, expect, it } from "vitest";
import {
  canToggleClientQuestionForm,
  mergeCaseComments,
} from "./case-comment-acl";

const c = (id: string, content: string): {
  id: string; author: string; content: string; createdAt: string;
} => ({
  id,
  author: "A",
  content,
  createdAt: "2026-09-30T00:00:00.000Z",
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

  it("一般成員只能追加留言，整包刪別人的會被拒", () => {
    const current = [c("1", "舊")];
    const ok = mergeCaseComments({
      current,
      incoming: [c("1", "舊"), c("2", "新")],
      isAdmin: false,
    });
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") expect(ok.next.map((x) => x.id)).toEqual(["1", "2"]);

    const wipe = mergeCaseComments({
      current,
      incoming: [c("2", "只留新的")],
      isAdmin: false,
    });
    expect(wipe.status).toBe("forbidden");
    expect(wipe.next).toEqual(current);
  });

  it("主管可以整包覆寫留言", () => {
    const current = [c("1", "舊")];
    const admin = mergeCaseComments({
      current,
      incoming: [c("2", "只留新的")],
      isAdmin: true,
    });
    expect(admin.status).toBe("ok");
    if (admin.status === "ok") expect(admin.next.map((x) => x.id)).toEqual(["2"]);
  });
});
