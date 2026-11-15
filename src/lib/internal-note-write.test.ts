import { describe, expect, it } from "vitest";
import {
  clearOwnNoteWriteRevision,
  decideUnknownNoteWrite,
  describeNoteWriteFailure,
  isStaleNoteWrite,
  liveNoteSnapshotFromDbKeys,
  overlapNoteSnapshots,
  parseApplyInternalNoteWriteResult,
  peekOwnNoteWriteRevision,
  pickNoteWriteExpectedAt,
  preserveNoteServerRevision,
  rememberOwnNoteWriteRevision,
  sentNoteSnapshotFromDbPatch,
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

  it("自己剛寫入且店裡已是該版時，後續續存用新版號，不拿舊全文重送", () => {
    expect(
      pickNoteWriteExpectedAt(
        "2026-11-09T10:00:00.000Z",
        "2026-11-09T10:01:00.000Z",
        "2026-11-09T10:01:00.000Z",
      ),
    ).toBe("2026-11-09T10:01:00.000Z");
  });

  it("店裡較新但不是自己剛寫入時，仍用編輯器已套用的版本去撞衝突", () => {
    expect(
      pickNoteWriteExpectedAt(
        "2026-11-09T10:00:00.000Z",
        "2026-11-09T10:01:00.000Z",
        "2026-11-09T09:59:00.000Z",
      ),
    ).toBe("2026-11-09T10:00:00.000Z");
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

  it("缺版本或無效回應當成尚未確認", () => {
    expect(describeNoteWriteFailure({ error: "missing_version" })).toContain("尚未確認");
    expect(describeNoteWriteFailure({ error: "invalid_response" })).toContain("尚未確認");
  });
});

describe("preserveNoteServerRevision", () => {
  it("微秒時間原樣留下，不經 Date 截斷", () => {
    const raw = "2026-11-13T04:05:06.123456+00:00";
    expect(preserveNoteServerRevision(raw)).toBe(raw);
    expect(new Date(raw).toISOString()).toBe("2026-11-13T04:05:06.123Z");
  });

  it("空值不當成功版本", () => {
    expect(preserveNoteServerRevision("")).toBeNull();
    expect(preserveNoteServerRevision(null)).toBeNull();
  });
});

describe("parseApplyInternalNoteWriteResult", () => {
  it("HTTP 式成功但沒有版本不算業務成功", () => {
    expect(parseApplyInternalNoteWriteResult({ ok: true })).toEqual({
      ok: false,
      error: "missing_note",
    });
    expect(
      parseApplyInternalNoteWriteResult({ ok: true, note: { id: "n1" } }),
    ).toEqual({
      ok: false,
      error: "missing_version",
    });
  });

  it("成功時保留伺服器 updated_at 原字串", () => {
    const updatedAt = "2026-11-13T04:05:06.123456+00:00";
    const parsed = parseApplyInternalNoteWriteResult({
      ok: true,
      note: { id: "n1", updated_at: updatedAt, title: "x" },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.note?.updated_at).toBe(updatedAt);
  });

  it("業務失敗帶 error 碼", () => {
    expect(parseApplyInternalNoteWriteResult({ ok: false, error: "stale_updated_at" })).toEqual({
      ok: false,
      error: "stale_updated_at",
    });
  });
});

describe("rememberOwnNoteWriteRevision", () => {
  it("notify 前就能讀到自己剛寫入的版本", () => {
    rememberOwnNoteWriteRevision("n-own", "2026-11-14T03:00:00.123456+00:00");
    expect(peekOwnNoteWriteRevision("n-own")).toBe("2026-11-14T03:00:00.123456+00:00");
    expect(peekOwnNoteWriteRevision("n-other")).toBeNull();
    clearOwnNoteWriteRevision("n-own");
    expect(peekOwnNoteWriteRevision("n-own")).toBeNull();
  });
});

describe("decideUnknownNoteWrite", () => {
  const sentBlocks = sentNoteSnapshotFromDbPatch({
    question_or_note_blocks: [{ type: "paragraph", content: [{ type: "text", text: "已送出" }] }],
  });
  const matchingLive = liveNoteSnapshotFromDbKeys(["question_or_note_blocks"], {
    questionOrNoteBlocks: [{ type: "paragraph", content: [{ type: "text", text: "已送出" }] }],
  });
  const otherLive = liveNoteSnapshotFromDbKeys(["question_or_note_blocks"], {
    questionOrNoteBlocks: [{ type: "paragraph", content: [{ type: "text", text: "別人先存" }] }],
  });
  const sentOverlap = overlapNoteSnapshots(sentBlocks, matchingLive);
  const otherOverlap = overlapNoteSnapshots(sentBlocks, otherLive);

  it("寫入前失敗、伺服器仍是舊版：保留失敗，不當自己已存", () => {
    expect(
      decideUnknownNoteWrite({
        sentNoteId: "n1",
        liveNoteId: "n1",
        sentExpectedRevision: "2026-11-15T10:00:00.000Z",
        liveRevision: "2026-11-15T10:00:00.000Z",
        sentSnapshotSerialized: sentOverlap.sentSerialized,
        liveSnapshotSerialized: sentOverlap.liveSerialized,
        comparableKeyCount: sentOverlap.keyCount,
      }),
    ).toBe("keep-failed");
  });

  it("成功回覆遺失、期間無新編輯：讀回與送出快照相同就認自己的版本", () => {
    expect(
      decideUnknownNoteWrite({
        sentNoteId: "n1",
        liveNoteId: "n1",
        sentExpectedRevision: "2026-11-15T10:00:00.000Z",
        liveRevision: "2026-11-15T10:00:01.000Z",
        sentSnapshotSerialized: sentOverlap.sentSerialized,
        liveSnapshotSerialized: sentOverlap.liveSerialized,
        comparableKeyCount: sentOverlap.keyCount,
      }),
    ).toBe("adopt-own");
  });

  it("伺服器已是別人內容：真衝突，不因內容碰巧能對上就重送舊全文", () => {
    expect(
      decideUnknownNoteWrite({
        sentNoteId: "n1",
        liveNoteId: "n1",
        sentExpectedRevision: "2026-11-15T10:00:00.000Z",
        liveRevision: "2026-11-15T10:00:01.000Z",
        sentSnapshotSerialized: otherOverlap.sentSerialized,
        liveSnapshotSerialized: otherOverlap.liveSerialized,
        comparableKeyCount: otherOverlap.keyCount,
      }),
    ).toBe("conflict");
  });

  it("後端已明確拒絕寫入時，即使讀回碰巧同文也不當自己已存", () => {
    expect(
      decideUnknownNoteWrite({
        sentNoteId: "n1",
        liveNoteId: "n1",
        sentExpectedRevision: "2026-11-15T10:00:00.000Z",
        liveRevision: "2026-11-15T10:00:01.000Z",
        sentSnapshotSerialized: sentOverlap.sentSerialized,
        liveSnapshotSerialized: sentOverlap.liveSerialized,
        comparableKeyCount: sentOverlap.keyCount,
        writeRejected: true,
      }),
    ).toBe("conflict");
  });

  it("晚到讀回對到另一則註記：忽略，不套到目前這頁", () => {
    expect(
      decideUnknownNoteWrite({
        sentNoteId: "n-a",
        liveNoteId: "n-b",
        sentExpectedRevision: "2026-11-15T10:00:00.000Z",
        liveRevision: "2026-11-15T10:00:01.000Z",
        sentSnapshotSerialized: sentOverlap.sentSerialized,
        liveSnapshotSerialized: sentOverlap.liveSerialized,
        comparableKeyCount: sentOverlap.keyCount,
      }),
    ).toBe("ignore");
  });
});
