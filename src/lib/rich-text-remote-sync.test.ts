import { describe, expect, it } from "vitest";
import {
  decideRemoteEditorUpdate,
  isNewerRevision,
  serializeBlocksForCompare,
} from "./rich-text-remote-sync";

describe("serializeBlocksForCompare", () => {
  it("忽略 id，只比內容", () => {
    const a = [{ id: "1", type: "paragraph", content: [{ type: "text", text: "甲" }] }];
    const b = [{ id: "2", type: "paragraph", content: [{ type: "text", text: "甲" }] }];
    expect(serializeBlocksForCompare(a)).toBe(serializeBlocksForCompare(b));
  });

  it("內容不同則不相等", () => {
    const a = [{ type: "paragraph", content: [{ type: "text", text: "甲" }] }];
    const b = [{ type: "paragraph", content: [{ type: "text", text: "乙" }] }];
    expect(serializeBlocksForCompare(a)).not.toBe(serializeBlocksForCompare(b));
  });
});

describe("isNewerRevision", () => {
  it("數字 revision 後來者較新", () => {
    expect(isNewerRevision(3, 2)).toBe(true);
    expect(isNewerRevision(2, 3)).toBe(false);
    expect(isNewerRevision(2, 2)).toBe(false);
  });

  it("時間字串後來者較新", () => {
    expect(isNewerRevision("2026-11-07T10:00:00.000Z", "2026-11-07T09:00:00.000Z")).toBe(true);
  });
});

describe("decideRemoteEditorUpdate", () => {
  const base = {
    documentId: "n1",
    incomingDocumentId: "n1",
    incomingRevision: "2",
    lastAppliedRevision: "1",
    localDirty: false,
    localSerialized: "[]",
    remoteSerialized: "[1]",
  };

  it("不同註記忽略", () => {
    expect(decideRemoteEditorUpdate({ ...base, incomingDocumentId: "n2" })).toBe("ignore");
  });

  it("舊版或同版忽略", () => {
    expect(decideRemoteEditorUpdate({ ...base, incomingRevision: "1" })).toBe("ignore");
  });

  it("閱讀中收到新內容就套用", () => {
    expect(decideRemoteEditorUpdate(base)).toBe("apply");
  });

  it("內容已相同只採用新版號", () => {
    expect(decideRemoteEditorUpdate({ ...base, remoteSerialized: "[]" })).toBe("adopt");
  });

  it("正在編輯且遠端不同則衝突", () => {
    expect(decideRemoteEditorUpdate({ ...base, localDirty: true })).toBe("conflict");
  });

  it("使用者已選擇保留時，同一版不再跳衝突", () => {
    expect(
      decideRemoteEditorUpdate({
        ...base,
        localDirty: true,
        suppressedRevision: "2",
      }),
    ).toBe("ignore");
  });
});
