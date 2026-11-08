import { describe, expect, it } from "vitest";
import {
  describeNoteWriteFailure,
  isStaleNoteWrite,
  stripNoteServerOwnedKeys,
} from "./internal-note-write";

describe("stripNoteServerOwnedKeys", () => {
  it("只留下允許的欄位，不帶伺服器欄", () => {
    const patch = stripNoteServerOwnedKeys({
      id: "x",
      env: "test",
      updated_at: "2026-11-07T00:00:00Z",
      question_or_note_blocks: [{ type: "paragraph" }],
      comments: [],
      unknown: 1,
    });
    expect(patch).toEqual({
      question_or_note_blocks: [{ type: "paragraph" }],
      comments: [],
    });
  });
});

describe("isStaleNoteWrite", () => {
  it("辨識版本衝突", () => {
    expect(isStaleNoteWrite({ error: "stale_updated_at" })).toBe(true);
    expect(isStaleNoteWrite({ message: "stale_updated_at" })).toBe(true);
    expect(isStaleNoteWrite({ message: "not_authorized" })).toBe(false);
  });
});

describe("describeNoteWriteFailure", () => {
  it("版本衝突用產品說明", () => {
    expect(describeNoteWriteFailure({ error: "stale_updated_at" })).toContain("較新版本");
  });
});
