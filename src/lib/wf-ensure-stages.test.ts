import { describe, expect, it } from "vitest";
import {
  classifyWorkflowStageLoad,
  defaultStatusForMissingStage,
  isWorkflowStagesInitFailedError,
  mapAdjustWorkflowStatusToStageStatus,
  missingWorkflowStageKinds,
  resolveUnassignedAdjustApplyAction,
  workflowStagesInitFailedError,
} from "./wf-ensure-stages";

describe("missingWorkflowStageKinds", () => {
  it("零階段要補齊三步", () => {
    expect(missingWorkflowStageKinds([])).toEqual(["prep", "translate", "review"]);
  });

  it("已有任一步不重做該步", () => {
    expect(missingWorkflowStageKinds([{ stageKind: "prep", status: "completed" }])).toEqual([
      "translate",
      "review",
    ]);
  });

  it("三步齊全不補", () => {
    expect(
      missingWorkflowStageKinds([
        { stage_kind: "prep" },
        { stageKind: "translate" },
        { stageKind: "review" },
      ]),
    ).toEqual([]);
  });
});

describe("defaultStatusForMissingStage", () => {
  it("新檔缺 prep → 準備中，不預設完成", () => {
    expect(defaultStatusForMissingStage("prep", [])).toBe("active");
  });

  it("翻譯或審稿已非待開始時，補 prep 為完成", () => {
    expect(
      defaultStatusForMissingStage("prep", [{ stageKind: "translate", status: "active" }]),
    ).toBe("completed");
  });

  it("缺翻譯／審稿一律 pending，不覆寫既有", () => {
    expect(defaultStatusForMissingStage("translate", [{ stageKind: "prep", status: "completed" }])).toBe(
      "pending",
    );
    expect(defaultStatusForMissingStage("review", [])).toBe("pending");
  });
});

describe("classifyWorkflowStageLoad", () => {
  it("失敗且沒讀到階段 → error，不是空", () => {
    expect(classifyWorkflowStageLoad({ stages: [], error: new Error("denied") })).toBe("error");
  });

  it("失敗但已有階段 → ok", () => {
    expect(
      classifyWorkflowStageLoad({
        stages: [{ stageKind: "prep" }],
        error: new Error("ensure failed"),
      }),
    ).toBe("ok");
  });

  it("成功零筆 → empty", () => {
    expect(classifyWorkflowStageLoad({ stages: [] })).toBe("empty");
  });
});

describe("未指派整檔狀態", () => {
  it("未選人且狀態不同 → 只改整檔步驟，不新建指派", () => {
    expect(
      resolveUnassignedAdjustApplyAction({
        wantedWfStatus: "completed",
        currentStageStatus: "pending",
      }),
    ).toBe("stage-only");
  });

  it("未選人且狀態相同 → skip", () => {
    expect(
      resolveUnassignedAdjustApplyAction({
        wantedWfStatus: "assigned",
        currentStageStatus: "pending",
      }),
    ).toBe("skip");
  });

  it("已選人 → insert", () => {
    expect(
      resolveUnassignedAdjustApplyAction({
        assigneeUserId: "uid-a",
        wantedWfStatus: "in_progress",
      }),
    ).toBe("insert");
  });

  it("三態對到步驟狀態", () => {
    expect(mapAdjustWorkflowStatusToStageStatus("assigned")).toBe("pending");
    expect(mapAdjustWorkflowStatusToStageStatus("in_progress")).toBe("active");
    expect(mapAdjustWorkflowStatusToStageStatus("completed")).toBe("completed");
  });
});

describe("workflow_stages_init_failed", () => {
  it("可辨識已建檔但階段失敗，供重試只補階段", () => {
    const err = workflowStagesInitFailedError("file-1");
    expect(isWorkflowStagesInitFailedError(err)).toBe(true);
    expect((err as { fileId?: string }).fileId).toBe("file-1");
  });
});
