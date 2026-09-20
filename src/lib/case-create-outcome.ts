/**
 * 「新增案件」按鈕的結果分流：把建案四種結果轉成明確的畫面反應。
 * 舊行為只有 `if (newCase) navigate(...)`，建案被拒或讀不回時整個按鈕看起來「沒有反應」。
 * 這裡不吞任何結果：確定未建立、已建立但讀不回、結果不明都必須說清楚，
 * 且已保留的新案識別一律回報，不引導使用者重複點擊或換新識別再建一筆。
 */

export type CaseCreateOutcomeKind =
  | "created"
  | "created_readback_failed"
  | "create_failed"
  | "create_unknown"
  | "no_session";

export interface CaseCreateFeedback {
  /** 只有確定拿到案件資料才導航；讀不回時留在原頁，避免開到讀不到的詳情頁。 */
  navigateToCase: boolean;
  title: string;
  description?: string;
  variant?: "destructive";
}

const TRANSPORT_FAILURE_RE =
  /fetch|network|abort|timeout|load failed|failed to send|err_failed|net::/i;

function caseCreateErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const rec = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [rec.message, rec.details, rec.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ");
  }
  return String(error ?? "");
}

/**
 * 只有「伺服器有回應並拒絕」才算確定未建立。
 * 連線中斷／abort／逾時（含 Postgrest 空 code 的 Failed to fetch 物件）一律當結果不明，
 * 不得報成「未建立任何案件」。
 */
export function isDefiniteCaseCreateError(error: unknown): boolean {
  if (TRANSPORT_FAILURE_RE.test(caseCreateErrorText(error))) return false;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string" && code.trim()) return true;
  return error instanceof Error;
}

const CREATE_FAILED_REASON: Record<string, string> = {
  missing_reviewer_user_id:
    "後端已明確拒絕，未建立任何案件。審稿人員只有姓名、沒有對應帳號，請從選單點選既有人員，或先建空白案件再指定。這不是權限不足。",
  missing_translator_user_id:
    "後端已明確拒絕，未建立任何案件。譯者只有姓名、沒有對應帳號，請從選單點選既有人員，或先建空白案件再指定。這不是權限不足。",
  hidden_reviewer_participant:
    "後端已明確拒絕，未建立任何案件。審稿人員帳號與顯示名不一致，請重新從選單點選。",
  not_authorized:
    "後端已明確拒絕，未建立任何案件。目前身分沒有新增案件的權限。",
};

const KNOWN_CREATE_ERROR_CODES = Object.keys(CREATE_FAILED_REASON);

export function caseCreateErrorCode(error: unknown): string | undefined {
  const text = caseCreateErrorText(error);
  return KNOWN_CREATE_ERROR_CODES.find((code) => text.includes(code));
}

export function describeOmittedCreateAssignments(labels: string[]): CaseCreateFeedback | null {
  if (labels.length === 0) return null;
  return {
    navigateToCase: true,
    title: "已新增案件",
    description: `範本裡的${labels.join("、")}只有姓名、沒有帳號識別，本次未帶入。請在案件裡從選單點選人員。`,
  };
}

export function describeCaseCreateOutcome(input: {
  kind: CaseCreateOutcomeKind;
  caseId?: string;
  errorCode?: string;
}): CaseCreateFeedback {
  const id = input.caseId ?? "";
  switch (input.kind) {
    case "created":
      return { navigateToCase: true, title: "已新增案件" };
    case "created_readback_failed":
      return {
        navigateToCase: false,
        title: "新案件已建立，但資料讀不回",
        description:
          `新案識別：${id}。案件已在後端建立、未被刪除，只是目前讀不回來。`
          + "請不要再按一次新增（會多出一筆），重新整理後應可在列表看到。",
        variant: "destructive",
      };
    case "create_unknown":
      return {
        navigateToCase: false,
        title: "建案結果不明",
        description:
          `保留的新案識別：${id}。目前無法確認是否已建立（連線中斷或逾時）。`
          + "請不要再按一次新增，重新整理列表確認後再決定。",
        variant: "destructive",
      };
    case "create_failed":
      return {
        navigateToCase: false,
        title: "無法新增案件",
        description:
          (input.errorCode && CREATE_FAILED_REASON[input.errorCode])
          || (input.errorCode
            ? `後端已明確拒絕，未建立任何案件。原因：${input.errorCode}。`
            : "後端已明確拒絕，未建立任何案件。請確認權限或稍後再試。"),
        variant: "destructive",
      };
    case "no_session":
      return {
        navigateToCase: false,
        title: "無法新增案件",
        description: "登入狀態已失效，請重新登入後再試（未建立任何案件）。",
        variant: "destructive",
      };
  }
}

/** 案件清單／詳情「新增」按鈕共用：成功時說明未帶入的範本人員，失敗時不再一律說成權限。 */
export function feedbackForCaseCreateOutcome(input: {
  kind: CaseCreateOutcomeKind;
  caseId?: string;
  errorCode?: string;
  omittedAssignmentLabels?: string[];
}): CaseCreateFeedback {
  if (input.kind === "created") {
    return describeOmittedCreateAssignments(input.omittedAssignmentLabels ?? [])
      ?? describeCaseCreateOutcome({ kind: "created", caseId: input.caseId });
  }
  return describeCaseCreateOutcome({
    kind: input.kind,
    caseId: input.caseId,
    errorCode: input.errorCode,
  });
}
