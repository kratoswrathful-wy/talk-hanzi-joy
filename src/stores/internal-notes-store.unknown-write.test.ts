import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestWriteScheduler } from "@/lib/case-write-queue";
import { clearOwnNoteWriteRevision, peekOwnNoteWriteRevision } from "@/lib/internal-note-write";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("internalNotesStore unknown write reconcile", () => {
  beforeEach(async () => {
    fromMock.mockReset();
    rpcMock.mockReset();
    clearOwnNoteWriteRevision("n-unknown");
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

describe("internalNotesStore lost-reply then extra draft via scheduler", () => {
  const blocksA = [{ type: "paragraph", content: [{ type: "text", text: "A" }] }];
  const blocksAB = [{ type: "paragraph", content: [{ type: "text", text: "AB" }] }];
  const blocksC = [{ type: "paragraph", content: [{ type: "text", text: "C" }] }];

  beforeEach(async () => {
    fromMock.mockReset();
    rpcMock.mockReset();
    clearOwnNoteWriteRevision("n-unknown");
    mockRefreshRow(noteFixture());
    await internalNotesStore.add(noteFixture());
  });

  it("回覆遺失後又打新字：排程送 AB，不重送 A、不降版本", async () => {
    const firstReply = deferred<{ data: null; error: { message: string } }>();
    const rpcArgs: Array<{ p_expected_updated_at?: string; p_patch?: { question_or_note_blocks?: unknown } }> = [];
    rpcMock.mockImplementation(async (_name: string, args: { p_expected_updated_at?: string; p_patch?: { question_or_note_blocks?: unknown } }) => {
      rpcArgs.push(args);
      if (rpcArgs.length === 1) return firstReply.promise;
      return {
        data: {
          ok: true,
          note: dbRow(noteFixture({
            updatedAt: "2026-11-15T10:00:02.000Z",
            questionOrNoteBlocks: blocksAB as InternalNote["questionOrNoteBlocks"],
          })),
        },
        error: null,
      };
    });

    let appliedRevision = "2026-11-15T10:00:00.000Z";
    const scheduler = createLatestWriteScheduler<InternalNote["questionOrNoteBlocks"]>(async (blocks) => {
      const error = await internalNotesStore.update(
        "n-unknown",
        { questionOrNoteBlocks: blocks },
        appliedRevision,
      );
      if (!error) {
        appliedRevision =
          peekOwnNoteWriteRevision("n-unknown")
          ?? internalNotesStore.getById("n-unknown")?.updatedAt
          ?? appliedRevision;
      }
    }, 0);

    scheduler.schedule(blocksA as InternalNote["questionOrNoteBlocks"]);
    const firstFlush = scheduler.flush();
    await vi.waitFor(() => {
      expect(rpcArgs).toHaveLength(1);
    });
    expect(rpcArgs[0]?.p_patch?.question_or_note_blocks).toEqual(blocksA);

    scheduler.schedule(blocksAB as InternalNote["questionOrNoteBlocks"]);
    const secondFlush = scheduler.flush();
    mockRefreshRow(noteFixture({
      updatedAt: "2026-11-15T10:00:01.000Z",
      questionOrNoteBlocks: blocksA as InternalNote["questionOrNoteBlocks"],
    }));
    firstReply.resolve({ data: null, error: { message: "Failed to fetch" } });
    await firstFlush;
    expect(peekOwnNoteWriteRevision("n-unknown")).toBe("2026-11-15T10:00:01.000Z");
    await secondFlush;

    expect(rpcArgs).toHaveLength(2);
    expect(rpcArgs[1]?.p_patch?.question_or_note_blocks).toEqual(blocksAB);
    expect(rpcArgs[1]?.p_expected_updated_at).toBe("2026-11-15T10:00:01.000Z");
    expect(internalNotesStore.getById("n-unknown")?.questionOrNoteBlocks).toEqual(blocksAB);
    expect(internalNotesStore.getById("n-unknown")?.updatedAt).toBe("2026-11-15T10:00:02.000Z");
  });

  it("期間他人先寫 C：保留本地 AB，走真衝突，不以新版號硬送", async () => {
    const firstReply = deferred<{ data: null; error: { message: string } }>();
    const rpcArgs: Array<{ p_expected_updated_at?: string; p_patch?: { question_or_note_blocks?: unknown } }> = [];
    rpcMock.mockImplementation(async (_name: string, args: { p_expected_updated_at?: string; p_patch?: { question_or_note_blocks?: unknown } }) => {
      rpcArgs.push(args);
      if (rpcArgs.length === 1) return firstReply.promise;
      return { data: { ok: false, error: "stale_updated_at" }, error: null };
    });

    let appliedRevision = "2026-11-15T10:00:00.000Z";
    const scheduler = createLatestWriteScheduler<InternalNote["questionOrNoteBlocks"]>(async (blocks) => {
      const error = await internalNotesStore.update(
        "n-unknown",
        { questionOrNoteBlocks: blocks },
        appliedRevision,
      );
      if (!error) {
        appliedRevision =
          peekOwnNoteWriteRevision("n-unknown")
          ?? internalNotesStore.getById("n-unknown")?.updatedAt
          ?? appliedRevision;
      }
      return error;
    }, 0);

    scheduler.schedule(blocksA as InternalNote["questionOrNoteBlocks"]);
    const firstFlush = scheduler.flush();
    await vi.waitFor(() => {
      expect(rpcArgs).toHaveLength(1);
    });
    scheduler.schedule(blocksAB as InternalNote["questionOrNoteBlocks"]);
    const secondFlush = scheduler.flush();
    mockRefreshRow(noteFixture({
      updatedAt: "2026-11-15T10:00:01.000Z",
      questionOrNoteBlocks: blocksC as InternalNote["questionOrNoteBlocks"],
    }));
    firstReply.resolve({ data: null, error: { message: "Failed to fetch" } });
    await firstFlush;
    expect(peekOwnNoteWriteRevision("n-unknown")).toBeNull();
    await secondFlush;

    expect(rpcArgs[1]?.p_patch?.question_or_note_blocks).toEqual(blocksAB);
    expect(rpcArgs[1]?.p_expected_updated_at).toBe("2026-11-15T10:00:00.000Z");
    expect(rpcArgs[1]?.p_expected_updated_at).not.toBe("2026-11-15T10:00:01.000Z");
    expect(internalNotesStore.getById("n-unknown")?.questionOrNoteBlocks).toEqual(blocksC);
  });
});
