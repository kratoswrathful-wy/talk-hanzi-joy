export const DEFAULT_WORKFLOW_STAGE_KINDS = ["prep", "translate", "review"] as const;

export type WorkflowStageKind = (typeof DEFAULT_WORKFLOW_STAGE_KINDS)[number];

export type WorkflowStageLike = {
  stageKind?: string | null;
  stage_kind?: string | null;
  status?: string | null;
};

export type WorkflowStageLoadState = "loading" | "ok" | "empty" | "error";

export const WORKFLOW_STAGES_INIT_FAILED = "workflow_stages_init_failed";

export function stageKindOf(stage: WorkflowStageLike | null | undefined): string {
  return String(stage?.stageKind || stage?.stage_kind || "").trim();
}

export function missingWorkflowStageKinds(
  stages: WorkflowStageLike[] | null | undefined,
): WorkflowStageKind[] {
  const have = new Set((stages || []).map(stageKindOf).filter(Boolean));
  return DEFAULT_WORKFLOW_STAGE_KINDS.filter((kind) => !have.has(kind));
}

export function defaultStatusForMissingStage(
  kind: WorkflowStageKind,
  existing: WorkflowStageLike[] | null | undefined,
): "active" | "pending" | "completed" {
  if (kind !== "prep") return "pending";
  const siblingProgressed = (existing || []).some((stage) => {
    const k = stageKindOf(stage);
    return (k === "translate" || k === "review") && String(stage.status || "") !== "pending";
  });
  return siblingProgressed ? "completed" : "active";
}

export function classifyWorkflowStageLoad(input: {
  stages?: WorkflowStageLike[] | null;
  error?: unknown;
}): WorkflowStageLoadState {
  if (input.error && !(input.stages && input.stages.length)) return "error";
  if (input.stages && input.stages.length) return "ok";
  return "empty";
}

export function mapAdjustWorkflowStatusToStageStatus(
  wfStatus: string | null | undefined,
): "pending" | "active" | "completed" {
  const s = String(wfStatus || "");
  if (s === "completed") return "completed";
  if (s === "in_progress") return "active";
  return "pending";
}

export function resolveUnassignedAdjustApplyAction(input: {
  assigneeUserId?: string | null;
  wantedWfStatus?: string | null;
  currentStageStatus?: string | null;
}): "insert" | "stage-only" | "skip" {
  const uid = String(input.assigneeUserId || "").trim();
  if (uid) return "insert";
  const next = mapAdjustWorkflowStatusToStageStatus(input.wantedWfStatus);
  const current = String(input.currentStageStatus || "").trim();
  if (current && next === current) return "skip";
  return "stage-only";
}

export function isWorkflowStagesInitFailedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: string; message?: string };
  return rec.code === WORKFLOW_STAGES_INIT_FAILED;
}

export function workflowStagesInitFailedError(fileId: string, cause?: unknown): Error {
  const err = new Error("檔案已建立，但流程階段尚未完成。請重試調整狀態，不要再匯入一次。") as Error & {
    code: string;
    fileId: string;
    cause?: unknown;
  };
  err.code = WORKFLOW_STAGES_INIT_FAILED;
  err.fileId = fileId;
  if (cause !== undefined) err.cause = cause;
  return err;
}
