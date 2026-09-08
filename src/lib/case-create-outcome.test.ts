import { describe, expect, it } from "vitest";
import { describeCaseCreateOutcome, isDefiniteCaseCreateError } from "./case-create-outcome";

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
