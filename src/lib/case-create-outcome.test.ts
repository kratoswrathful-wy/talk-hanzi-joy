import { describe, expect, it } from "vitest";
import {
  caseCreateErrorCode,
  CREATE_NOTICE_DURATION_MS,
  createNoticeForCreatedCase,
  createdCaseNavigationState,
  describeCaseCreateOutcome,
  describeOmittedCreateAssignments,
  feedbackForCaseCreateOutcome,
  isDefiniteCaseCreateError,
} from "./case-create-outcome";

const ID = "550e8400-e29b-41d4-a716-446655440000";

describe("describeCaseCreateOutcome", () => {
  it("navigates only when the case was actually read back", () => {
    expect(describeCaseCreateOutcome({ kind: "created", caseId: ID }).navigateToCase).toBe(true);
    for (const kind of ["created_readback_failed", "create_unknown", "create_failed", "no_session"] as const) {
      expect(describeCaseCreateOutcome({ kind, caseId: ID }).navigateToCase).toBe(false);
    }
  });

  it("keeps the reserved case id visible when the case may already exist", () => {
    for (const kind of ["created_readback_failed", "create_unknown"] as const) {
      const feedback = describeCaseCreateOutcome({ kind, caseId: ID });
      expect(feedback.description).toContain(ID);
      expect(feedback.variant).toBe("destructive");
    }
  });

  it("never tells the user to click again when the result may be a created case", () => {
    for (const kind of ["created_readback_failed", "create_unknown"] as const) {
      const feedback = describeCaseCreateOutcome({ kind, caseId: ID });
      expect(feedback.description).toContain("不要再按一次");
      expect(feedback.description).not.toContain("重新建立");
    }
  });

  it("only a definite backend rejection may be reported as nothing created", () => {
    const failed = describeCaseCreateOutcome({ kind: "create_failed", caseId: ID });
    expect(failed.description).toContain("未建立任何案件");
    const unknown = describeCaseCreateOutcome({ kind: "create_unknown", caseId: ID });
    expect(unknown.description).not.toContain("未建立任何案件");
    const readback = describeCaseCreateOutcome({ kind: "created_readback_failed", caseId: ID });
    expect(readback.description).not.toContain("未建立任何案件");
  });

  it("no_session reports a lost login without claiming a case id", () => {
    const feedback = describeCaseCreateOutcome({ kind: "no_session" });
    expect(feedback.description).toContain("登入狀態已失效");
    expect(feedback.description).toContain("未建立任何案件");
  });

  it("does not call a name-only reviewer rejection a permission error", () => {
    const feedback = describeCaseCreateOutcome({
      kind: "create_failed",
      caseId: ID,
      errorCode: "missing_reviewer_user_id",
    });
    expect(feedback.description).toContain("這不是權限不足");
    expect(feedback.description).not.toContain("請確認權限");
  });

  it("extracts known create error codes from Error messages", () => {
    expect(caseCreateErrorCode(new Error("missing_reviewer_user_id"))).toBe("missing_reviewer_user_id");
    expect(caseCreateErrorCode(new Error("admin_create_case failed"))).toBeUndefined();
  });

  it("explains omitted name-only template assignees after a successful create", () => {
    const feedback = describeOmittedCreateAssignments(["審稿人員"]);
    expect(feedback?.description).toContain("本次未帶入");
    expect(describeOmittedCreateAssignments([])).toBeNull();
  });

  it("feedbackForCaseCreateOutcome uses omitted copy on success and specific copy on known reject", () => {
    const omitted = feedbackForCaseCreateOutcome({
      kind: "created",
      caseId: ID,
      omittedAssignmentLabels: ["審稿人員"],
    });
    expect(omitted.navigateToCase).toBe(true);
    expect(omitted.description).toContain("本次未帶入");

    const failed = feedbackForCaseCreateOutcome({
      kind: "create_failed",
      caseId: ID,
      errorCode: "missing_reviewer_user_id",
    });
    expect(failed.description).toContain("這不是權限不足");
  });

  it("createNoticeForCreatedCase only attaches omitted copy for a successful navigate", () => {
    const omitted = feedbackForCaseCreateOutcome({
      kind: "created",
      caseId: ID,
      omittedAssignmentLabels: ["審稿人員"],
    });
    const notice = createNoticeForCreatedCase(omitted);
    expect(notice?.title).toBe("已新增案件");
    expect(notice?.description).toContain("本次未帶入");
    expect(notice?.durationMs).toBe(CREATE_NOTICE_DURATION_MS);
    expect(createdCaseNavigationState(omitted).createNotice).toEqual(notice);

    const plain = feedbackForCaseCreateOutcome({ kind: "created", caseId: ID });
    expect(createNoticeForCreatedCase(plain)).toBeNull();
    expect(createdCaseNavigationState(plain)).toEqual({ autoFocusTitle: true });

    const failed = feedbackForCaseCreateOutcome({
      kind: "create_failed",
      errorCode: "missing_reviewer_user_id",
    });
    expect(createNoticeForCreatedCase(failed)).toBeNull();
  });
});

describe("isDefiniteCaseCreateError", () => {
  it("treats a backend permission code as a definite rejection", () => {
    expect(isDefiniteCaseCreateError({ code: "42501", message: "not_authorized" })).toBe(true);
    expect(isDefiniteCaseCreateError(new Error("admin_create_case failed"))).toBe(true);
  });

  it("does not treat transport loss as a definite rejection", () => {
    expect(isDefiniteCaseCreateError({ code: "", message: "Failed to fetch" })).toBe(false);
    expect(isDefiniteCaseCreateError({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(isDefiniteCaseCreateError(new Error("net::ERR_FAILED"))).toBe(false);
    expect(isDefiniteCaseCreateError({ code: "PGRST301", message: "Request aborted" })).toBe(false);
  });
});
