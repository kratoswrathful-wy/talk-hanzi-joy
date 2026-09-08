/**
 * 單檔「任務完成」入口分流：譯者本人 vs PM／executive 代完成。
 * 授權不得依顯示名推導。
 */

export type TaskCompleteActorKind = "translator" | "manager" | "none";

export function resolveTaskCompleteActorKind(input: {
  isPmOrAbove: boolean;
  viewerUserId: string | null | undefined;
  /** 來自 case_participants：active＋未撤銷的 translator user_id */
  activeTranslatorUserIds: readonly string[];
}): TaskCompleteActorKind {
  // 本人是有效譯者時一律視為「本人完成」（含兼任 PM），代完成只用於本人未受派的管理情境。
  const uid = (input.viewerUserId || "").trim();
  if (uid && input.activeTranslatorUserIds.some((id) => id === uid)) return "translator";
  if (input.isPmOrAbove) return "manager";
  return "none";
}

export function shouldOfferTaskCompleteButton(kind: TaskCompleteActorKind): boolean {
  return kind === "translator" || kind === "manager";
}

/** 管理者代完成不得以「譯者本人完成」名義發 Slack。 */
export function shouldNotifyTranslatorTaskComplete(kind: TaskCompleteActorKind): boolean {
  return kind === "translator";
}

/**
 * 把後端錯誤碼翻成可行動的說明；不得只回原始代碼（例如 case_unavailable）。
 * 後端尚未安裝代完成 RPC 時（PGRST202）必須明確說是後端未部署，不可誤導為授權問題。
 */
export function describeTaskCompleteFailure(input: {
  kind: TaskCompleteActorKind;
  code: string;
  message: string;
}): string {
  const { kind, code, message } = input;
  if (code === "PGRST202" || /pm_complete_case_translation/.test(message)) {
    return "代完成功能尚未部署到後端，請先完成後端更新再試（本次未變更任何案件）。";
  }
  if (code === "40001" || message.includes("case_revision_conflict")) {
    return "案件資料已被其他操作更新，請重新整理後再試（本次未變更任何案件）。";
  }
  if (code === "42501" || /not_authorized/.test(message)) {
    return kind === "manager"
      ? "您的帳號沒有代完成權限（需 PM 或執行官）。"
      : "您沒有完成本案任務的授權，可能已被改派。";
  }
  if (code === "P0002" || message.includes("case_unavailable")) {
    return kind === "manager"
      ? "本案目前無法完成任務：需為「已派出」且非多人協作的單檔案件。"
      : "本案目前無法由您完成：需為「已派出」的單檔案件，且您仍是有效受派譯者（改派或撤銷後即失效）。";
  }
  return message || "未知錯誤";
}
