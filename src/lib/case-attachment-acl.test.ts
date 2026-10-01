import { describe, expect, it } from "vitest";
import {
  canMemberRemoveCaseFile,
  copyFileItemsKeepUploaders,
  filePersistUserMessage,
  mergeCaseFileList,
  memberPersistShouldRefuse,
  pickMemberPermittedChanges,
  stampUploadedBy,
} from "./case-attachment-acl";

const a = { name: "a.txt", url: "https://ex.test/a", uploadedBy: "u1" };
const b = { name: "b.txt", url: "https://ex.test/b", uploadedBy: "u2" };
const orphan = { name: "old.txt", url: "https://ex.test/old" };

describe("case attachment acl", () => {
  it("一般成員只能刪自己上傳的檔；舊檔無歸屬不能刪", () => {
    expect(canMemberRemoveCaseFile(a, "u1")).toBe(true);
    expect(canMemberRemoveCaseFile(b, "u1")).toBe(false);
    expect(canMemberRemoveCaseFile(orphan, "u1")).toBe(false);
  });

  it("新增一律蓋上目前帳號，不信任畫面傳來的上傳者", () => {
    const stamped = stampUploadedBy({ name: "n.txt", url: "https://ex.test/n", uploadedBy: "spoof" }, "u1");
    expect(stamped.uploadedBy).toBe("u1");
  });

  it("完稿：成員可加自己的檔，整清單覆寫刪別人的檔會被拒且原列不變", () => {
    const added = mergeCaseFileList({
      current: [a, b],
      incoming: [a, b, { name: "c.txt", url: "https://ex.test/c", uploadedBy: "spoof" }],
      actorId: "u1",
      isAdmin: false,
      memberMayWrite: true,
    });
    expect(added.status).toBe("ok");
    if (added.status === "ok") {
      expect(added.next.map((x) => x.name)).toEqual(["a.txt", "b.txt", "c.txt"]);
      expect(added.next[2].uploadedBy).toBe("u1");
    }

    const wipe = mergeCaseFileList({
      current: [a, b],
      incoming: [a],
      actorId: "u1",
      isAdmin: false,
      memberMayWrite: true,
    });
    expect(wipe.status).toBe("not_owned");
    expect(wipe.next).toEqual([a, b]);
  });

  it("準則／原文：成員增刪都被拒；主管可改", () => {
    const member = mergeCaseFileList({
      current: [orphan],
      incoming: [orphan, a],
      actorId: "u1",
      isAdmin: false,
      memberMayWrite: false,
    });
    expect(member.status).toBe("readonly");
    expect(member.next).toEqual([orphan]);

    const admin = mergeCaseFileList({
      current: [orphan],
      incoming: [a],
      actorId: "pm",
      isAdmin: true,
      memberMayWrite: false,
    });
    expect(admin.status).toBe("ok");
    if (admin.status === "ok") {
      expect(admin.next).toEqual([{ ...a, uploadedBy: "pm" }]);
    }
  });

  it("複製案件保留原上傳者，不改成複製的人", () => {
    const copied = copyFileItemsKeepUploaders([
      { name: "g.txt", url: "https://ex.test/g", uploadedBy: "orig", size: 3 },
    ]);
    expect(copied).toEqual([{ name: "g.txt", url: "https://ex.test/g", uploadedBy: "orig", size: 3 }]);
    expect(copied[0].uploadedBy).not.toBe("copier");
  });

  it("Storage 成功但案件寫入失敗不得顯示已存好", () => {
    expect(filePersistUserMessage(null).ok).toBe(true);
    expect(filePersistUserMessage(new Error("field_not_permitted")).ok).toBe(false);
    expect(filePersistUserMessage(new Error("field_not_permitted")).title).toMatch(/未寫入案件/);
  });

  it("一般成員寫入會拿掉不能改的欄，留下完稿", () => {
    const picked = pickMemberPermittedChanges({
      title: "不該送",
      client: "秘密",
      clientGuidelines: [{ name: "g.txt", url: "https://ex.test/g" }],
      translatorFinal: [{ name: "a.txt", url: "https://ex.test/a" }],
      processNote: "可保留",
    });
    expect(picked).toEqual({
      translatorFinal: [{ name: "a.txt", url: "https://ex.test/a" }],
      processNote: "可保留",
    });
    expect(memberPersistShouldRefuse({
      beforeFilter: { title: "不該送" },
      afterFilter: pickMemberPermittedChanges({ title: "不該送" }),
      hasSocial: false,
    })).toBe(true);
    expect(memberPersistShouldRefuse({
      beforeFilter: { translatorFinal: [] },
      afterFilter: pickMemberPermittedChanges({ translatorFinal: [] }),
      hasSocial: false,
    })).toBe(false);
  });
});
