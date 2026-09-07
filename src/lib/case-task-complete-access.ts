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
  if (input.isPmOrAbove) return "manager";
  const uid = (input.viewerUserId || "").trim();
  if (!uid) return "none";
  if (input.activeTranslatorUserIds.some((id) => id === uid)) return "translator";
  return "none";
}

export function shouldOfferTaskCompleteButton(kind: TaskCompleteActorKind): boolean {
  return kind === "translator" || kind === "manager";
}

/** 管理者代完成不得以「譯者本人完成」名義發 Slack。 */
export function shouldNotifyTranslatorTaskComplete(kind: TaskCompleteActorKind): boolean {
  return kind === "translator";
}
