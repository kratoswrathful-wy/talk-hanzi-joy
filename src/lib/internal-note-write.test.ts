import { describe, expect, it } from "vitest";
import {
  describeNoteWriteFailure,
  isStaleNoteWrite,
  pickNoteWriteExpectedAt,
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

describe("pickNoteWriteExpectedAt", () => {
  it("優先用編輯器已套用的版本，不用店裡較新的時間", () => {
    expect(
      pickNoteWriteExpectedAt("2026-11-09T10:00:00.000Z", "2026-11-09T10:01:00.000Z"),
    ).toBe("2026-11-09T10:00:00.000Z");
  });

  it("編輯器還沒套用時才退回店裡的時間", () => {
    expect(pickNoteWriteExpectedAt(null, "2026-11-09T10:01:00.000Z")).toBe(
      "2026-11-09T10:01:00.000Z",
    );
    expect(pickNoteWriteExpectedAt(undefined, undefined)).toBeNull();
  });
});

describe("isStaleNoteWrite", () => {
  it("辨識版本衝突", () => {
    expect(isStaleNoteWrite({ error: "stale_updated_at" })).toBe(true);
    expect(isStaleNoteWrite({ message: "stale_updated_at" })).toBe(true);
    expect(isStaleNoteWrite({ message: "這則註記已有較新版本，尚未覆寫你正在編輯的內容。" })).toBe(true);
    expect(isStaleNoteWrite({ message: "not_authorized" })).toBe(false);
  });
});

describe("describeNoteWriteFailure", () => {
  it("版本衝突用產品說明", () => {
    expect(describeNoteWriteFailure({ error: "stale_updated_at" })).toContain("較新版本");
  });
});
