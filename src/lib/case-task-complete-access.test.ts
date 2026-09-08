import { describe, expect, it } from "vitest";
import {
  describeTaskCompleteFailure,
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

  it("manager path only when the viewer is not an active translator participant", () => {
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: true,
        viewerUserId: otherId,
        activeTranslatorUserIds: [translatorId],
      }),
    ).toBe("manager");
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: true,
        viewerUserId: otherId,
        activeTranslatorUserIds: [],
      }),
    ).toBe("manager");
  });

  it("PM who is also the active translator completes as translator", () => {
    expect(
      resolveTaskCompleteActorKind({
        isPmOrAbove: true,
        viewerUserId: translatorId,
        activeTranslatorUserIds: [translatorId],
      }),
    ).toBe("translator");
  });

  it("button and slack notify rules", () => {
    expect(shouldOfferTaskCompleteButton("translator")).toBe(true);
    expect(shouldOfferTaskCompleteButton("manager")).toBe(true);
    expect(shouldOfferTaskCompleteButton("none")).toBe(false);
    expect(shouldNotifyTranslatorTaskComplete("translator")).toBe(true);
    expect(shouldNotifyTranslatorTaskComplete("manager")).toBe(false);
  });

  it("does not treat undeployed manager RPC as an authorization problem", () => {
    expect(
      describeTaskCompleteFailure({
        kind: "manager",
        code: "PGRST202",
        message: "Could not find the function public.pm_complete_case_translation",
      }),
    ).toContain("尚未部署");
    expect(
      describeTaskCompleteFailure({
        kind: "translator",
        code: "P0002",
        message: "case_unavailable",
      }),
    ).toContain("有效受派譯者");
    expect(
      describeTaskCompleteFailure({
        kind: "manager",
        code: "P0002",
        message: "case_unavailable",
      }),
    ).toContain("已派出");
  });
});
