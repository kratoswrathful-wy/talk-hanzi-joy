import { beforeEach, describe, expect, it, vi } from "vitest";
import { peekOwnNoteWriteRevision } from "@/lib/internal-note-write";
import type { InternalNote } from "@/hooks/use-internal-notes-table-views";

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    channel: () => ({
      on: function on() {
        return this;
      },
      subscribe: () => ({}),
    }),
    removeChannel: () => undefined,
  },
}));

vi.mock("@/lib/auth-ready", () => ({
  getAuthenticatedUser: () => Promise.resolve({ id: "u1" }),
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({
    start: () => undefined,
    stop: () => undefined,
  }),
  latestTimestamp: () => null,
}));

const { internalNotesStore } = await import("./internal-notes-store");

const sentBlocks = [{ type: "paragraph", content: [{ type: "text", text: "已送出" }] }];
const otherBlocks = [{ type: "paragraph", content: [{ type: "text", text: "別人先存" }] }];

function noteFixture(overrides: Partial<InternalNote> = {}): InternalNote {
  return {
    id: "n-unknown",
    title: "未知寫入測",
    relatedCase: "",
    createdAt: "2026-11-15T10:00:00.000Z",
    creator: "u1",
    status: "",
    noteType: "",
    internalAssignee: [],
    fileName: "",
    idRowCount: "",
    sourceText: "",
    translatedText: "",
    questionOrNote: "",
    questionOrNoteBlocks: sentBlocks as InternalNote["questionOrNoteBlocks"],
    updatedAt: "2026-11-15T10:00:00.000Z",
    referenceFiles: [],
    comments: [],
    invalidated: false,
    ...overrides,
  };
}

function dbRow(note: InternalNote) {
  return {
    id: note.id,
    title: note.title,
    related_case: note.relatedCase,
    created_at: note.createdAt,
    creator: note.creator,
    status: note.status,
    note_type: note.noteType,
    internal_assignee: note.internalAssignee,
    file_name: note.fileName,
    id_row_count: note.idRowCount,
    source_text: note.sourceText,
    translated_text: note.translatedText,
    question_or_note: note.questionOrNote,
    question_or_note_blocks: note.questionOrNoteBlocks,
    updated_at: note.updatedAt,
    reference_files: note.referenceFiles,
    comments: note.comments,
    invalidated: note.invalidated,
    env: "test",
  };
}

function mockRefreshRow(note: InternalNote) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: dbRow(note), error: null }),
        }),
        order: async () => ({ data: [dbRow(note)], error: null }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: null, error: { message: "skip insert" } }),
      }),
    }),
  }));
}

describe("internalNotesStore unknown write reconcile", () => {
  beforeEach(async () => {
    fromMock.mockReset();
    rpcMock.mockReset();
    mockRefreshRow(noteFixture());
    await internalNotesStore.add(noteFixture());
  });

  it("回覆遺失且讀回同文：認自己的版本，不開衝突", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    mockRefreshRow(noteFixture({ updatedAt: "2026-11-15T10:00:01.000Z" }));
    const error = await internalNotesStore.update(
      "n-unknown",
      { questionOrNoteBlocks: sentBlocks as InternalNote["questionOrNoteBlocks"] },
      "2026-11-15T10:00:00.000Z",
    );
    expect(error).toBeNull();
    expect(peekOwnNoteWriteRevision("n-unknown")).toBe("2026-11-15T10:00:01.000Z");
    expect(internalNotesStore.getById("n-unknown")?.updatedAt).toBe("2026-11-15T10:00:01.000Z");
  });

  it("寫入前失敗、伺服器仍舊版：維持失敗", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    mockRefreshRow(noteFixture());
    const error = await internalNotesStore.update(
      "n-unknown",
      { questionOrNoteBlocks: sentBlocks as InternalNote["questionOrNoteBlocks"] },
      "2026-11-15T10:00:00.000Z",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("尚未確認");
    expect(internalNotesStore.getById("n-unknown")?.updatedAt).toBe("2026-11-15T10:00:00.000Z");
  });

  it("期間有另一人更新：真衝突，不自動重送", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    mockRefreshRow(noteFixture({
      updatedAt: "2026-11-15T10:00:01.000Z",
      questionOrNoteBlocks: otherBlocks as InternalNote["questionOrNoteBlocks"],
    }));
    const error = await internalNotesStore.update(
      "n-unknown",
      { questionOrNoteBlocks: sentBlocks as InternalNote["questionOrNoteBlocks"] },
      "2026-11-15T10:00:00.000Z",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("較新版本");
  });
});
