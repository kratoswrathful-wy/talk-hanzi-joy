import { describe, expect, it } from "vitest";
import { resolveMemberCollabWrite } from "./member-collab-write";

const prev = {
  id: "cr-1",
  accepted: true,
  taskCompleted: false,
  reviewTaskCompleted: false,
};

describe("resolveMemberCollabWrite", () => {
  it("審稿人勾審稿完成（同時帶起翻譯）走審稿寫入，不走譯者任務完成", () => {
    expect(resolveMemberCollabWrite([prev], [{
      ...prev,
      taskCompleted: true,
      reviewTaskCompleted: true,
    }])).toEqual({ action: "complete_review", rowIds: ["cr-1"] });
  });

  it("譯者只勾任務完成走譯者寫入", () => {
    expect(resolveMemberCollabWrite([prev], [{
      ...prev,
      taskCompleted: true,
    }])).toEqual({ action: "complete_translate", rowId: "cr-1" });
  });

  it("本人取消審稿走取消審稿", () => {
    expect(resolveMemberCollabWrite([{
      ...prev,
      taskCompleted: true,
      reviewTaskCompleted: true,
    }], [{
      ...prev,
      taskCompleted: true,
      reviewTaskCompleted: false,
    }])).toEqual({ action: "cancel_review", rowIds: ["cr-1"] });
  });

  it("承接優先於完成", () => {
    expect(resolveMemberCollabWrite([{
      ...prev,
      accepted: false,
    }], [{
      ...prev,
      accepted: true,
    }])).toEqual({ action: "accept", rowId: "cr-1" });
  });
});
