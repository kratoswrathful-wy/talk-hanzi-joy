import { isTrustedUserId } from "@/lib/case-assignment-patch";

/** assignee 選項點選結果；userId 必須來自選項本身，不可用 label 反查。 */
export type AssigneeSelectPayload = {
  userId: string;
  label: string;
} | null;

export function assigneeOptionToPayload(opt: {
  id: string;
  label: string;
}): AssigneeSelectPayload {
  if (!isTrustedUserId(opt.id)) return null;
  return { userId: opt.id, label: opt.label };
}

/** 單人譯者／整檔審稿：取第一個有效 UUID。 */
export function primaryAssigneeUserId(
  selections: readonly AssigneeSelectPayload[],
): string | null {
  for (const s of selections) {
    if (s && isTrustedUserId(s.userId)) return s.userId;
  }
  return null;
}

export function assigneeSelectionsFromIds(
  options: ReadonlyArray<{ id: string; label: string }>,
  selectedIds: ReadonlySet<string>,
): AssigneeSelectPayload[] {
  const out: AssigneeSelectPayload[] = [];
  for (const opt of options) {
    if (selectedIds.has(opt.id)) {
      const payload = assigneeOptionToPayload(opt);
      if (payload) out.push(payload);
    }
  }
  return out;
}
