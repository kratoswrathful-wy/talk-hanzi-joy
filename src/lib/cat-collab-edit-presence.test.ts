import { describe, expect, it } from "vitest";
import { mergeCollabEditPresence } from "./cat-collab-edit-presence";

type Edit = {
  sessionId: string;
  segmentId: string | null;
  state: string;
  text: string | null;
  at: string;
};

function edit(partial: Partial<Edit> & Pick<Edit, "sessionId" | "at">): Edit {
  return {
    segmentId: "seg-1",
    state: "typing",
    text: null,
    ...partial,
  };
}

describe("mergeCollabEditPresence", () => {
  it("第一筆用當下的時間", () => {
    const incoming = edit({ sessionId: "a", at: "2026-11-23T00:00:01.000Z", text: "t" });
    expect(mergeCollabEditPresence(undefined, incoming)).toEqual(incoming);
  });

  it("同一句後面的按鍵不改開始時間", () => {
    const started = edit({ sessionId: "a", at: "2026-11-23T00:00:01.000Z", text: "t" });
    const later = edit({ sessionId: "a", at: "2026-11-23T00:00:02.000Z", text: "them" });
    expect(mergeCollabEditPresence(started, later).at).toBe(started.at);
    expect(mergeCollabEditPresence(started, later).text).toBe("them");
  });

  it("換到另一句才重算開始時間", () => {
    const started = edit({ sessionId: "a", at: "2026-11-23T00:00:01.000Z" });
    const moved = edit({
      sessionId: "a",
      segmentId: "seg-2",
      at: "2026-11-23T00:00:05.000Z",
      text: "k",
    });
    expect(mergeCollabEditPresence(started, moved).at).toBe(moved.at);
  });

  it("較早的時間晚到，仍改回較早的那一個", () => {
    const laterFirst = edit({ sessionId: "a", at: "2026-11-23T00:00:04.000Z", text: "hem" });
    const earlierLate = edit({ sessionId: "a", at: "2026-11-23T00:00:01.000Z", text: "t" });
    expect(mergeCollabEditPresence(laterFirst, earlierLate).at).toBe(earlierLate.at);
  });

  it("先開始的人繼續打字，仍早於後加入的人", () => {
    const firstStart = edit({ sessionId: "first", at: "2026-11-23T00:00:01.000Z", text: "t" });
    const firstLater = mergeCollabEditPresence(
      firstStart,
      edit({ sessionId: "first", at: "2026-11-23T00:00:04.000Z", text: "them" }),
    );
    const second = edit({ sessionId: "second", at: "2026-11-23T00:00:02.000Z", text: "mine" });
    expect(Date.parse(firstLater.at)).toBeLessThan(Date.parse(second.at));
  });
});
