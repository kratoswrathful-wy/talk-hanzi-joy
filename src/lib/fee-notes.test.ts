import { describe, expect, it } from "vitest";
import { feeNoteToCommentFields, notesFromJson, notesToJson } from "./fee-notes";
import type { Note } from "@/data/fee-mock-data";

const textOnly: Note = {
  id: "n1",
  author: "PM",
  text: "只有文字",
  createdAt: "2026-09-13T06:00:00.000Z",
};

const withAttachments: Note = {
  id: "n2",
  author: "PM",
  text: "含附件",
  createdAt: "2026-09-13T06:01:00.000Z",
  imageUrls: ["https://example.test/a.png"],
  fileUrls: [{ name: "說明.pdf", url: "https://example.test/a.pdf" }],
  replyTo: "n1",
};

describe("notesFromJson／notesToJson", () => {
  it("null／非陣列／空陣列回空，不與其他欄混用", () => {
    expect(notesFromJson(null)).toEqual([]);
    expect(notesFromJson("備註")).toEqual([]);
    expect(notesFromJson([])).toEqual([]);
  });

  it("舊格式只含文字的列往返不丟", () => {
    const round = notesFromJson(notesToJson([textOnly]));
    expect(round).toEqual([textOnly]);
  });

  it("含附件與回覆的列往返保留 imageUrls／fileUrls／replyTo（修前 mapper 會丟掉）", () => {
    const parsed = notesFromJson([
      {
        id: "n2",
        author: "PM",
        text: "含附件",
        createdAt: "2026-09-13T06:01:00.000Z",
        imageUrls: ["https://example.test/a.png", 1],
        fileUrls: [{ name: "說明.pdf", url: "https://example.test/a.pdf" }, { name: "壞" }],
        replyTo: "n1",
      },
      { author: "缺 id" },
      null,
    ]);
    expect(parsed).toEqual([withAttachments]);
    expect(notesFromJson(notesToJson(parsed))).toEqual([withAttachments]);
  });

  it("畫面欄位對應帶出附件，不把 text 寫成空 content", () => {
    expect(feeNoteToCommentFields(withAttachments)).toEqual({
      id: "n2",
      author: "PM",
      content: "含附件",
      imageUrls: ["https://example.test/a.png"],
      fileUrls: [{ name: "說明.pdf", url: "https://example.test/a.pdf" }],
      replyTo: "n1",
    });
  });
});
