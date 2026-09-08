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

export function describeCaseCreateOutcome(input: {
  kind: CaseCreateOutcomeKind;
  caseId?: string;
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
        description: "後端已明確拒絕，未建立任何案件。請確認權限或稍後再試。",
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
