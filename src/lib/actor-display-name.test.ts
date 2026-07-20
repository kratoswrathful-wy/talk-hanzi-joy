import { describe, expect, it } from "vitest";
import { resolveActorDisplayName } from "./actor-display-name";

describe("resolveActorDisplayName", () => {
  it("prefers profile display_name, then metadata, then email", () => {
    expect(
      resolveActorDisplayName({
        displayName: "譯者一（測試）",
        email: "test-t1@test.local",
        userMetadataDisplayName: "meta",
      }),
    ).toBe("譯者一（測試）");
    expect(
      resolveActorDisplayName({
        displayName: "  ",
        email: "test-t1@test.local",
        userMetadataDisplayName: "譯者一（測試）",
      }),
    ).toBe("譯者一（測試）");
    expect(
      resolveActorDisplayName({
        displayName: null,
        email: "test-t1@test.local",
        userMetadataDisplayName: "",
      }),
    ).toBe("test-t1@test.local");
  });

  it("returns empty when nothing usable", () => {
    expect(resolveActorDisplayName({})).toBe("");
    expect(resolveActorDisplayName({ displayName: "  ", email: null })).toBe("");
  });
});
