import { describe, expect, it } from "vitest";
import {
  resolveTaskCompleteActorKind,
  shouldNotifyTranslatorTaskComplete,
  shouldOfferTaskCompleteButton,
} from "./case-task-complete-access";

describe("case-task-complete-access", () => {
  const translatorId = "550e8400-e29b-41d4-a716-446655440000";
  const otherId = "660e8400-e29b-41d4-a716-446655440001";

  it("translator completes only with active participant UUID match", () => {
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: false,
        viewerUserId: translatorId,
        activeTranslatorUserIds: [translatorId],
      }),
    ).toBe("translator");
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: false,
        viewerUserId: otherId,
        activeTranslatorUserIds: [translatorId],
      }),
    ).toBe("none");
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: false,
        viewerUserId: translatorId,
        activeTranslatorUserIds: [],
      }),
    ).toBe("none");
  });

  it("manager always uses manager path even if also listed as translator", () => {
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: true,
        viewerUserId: translatorId,
        activeTranslatorUserIds: [translatorId],
      }),
    ).toBe("manager");
  });

  it("button and slack notify rules", () => {
    expect(shouldOfferTaskCompleteButton("translator")).toBe(true);
    expect(shouldOfferTaskCompleteButton("manager")).toBe(true);
    expect(shouldOfferTaskCompleteButton("none")).toBe(false);
    expect(shouldNotifyTranslatorTaskComplete("translator")).toBe(true);
    expect(shouldNotifyTranslatorTaskComplete("manager")).toBe(false);
  });
});
