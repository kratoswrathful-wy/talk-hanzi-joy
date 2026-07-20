/** 承接／完成等流程寫入譯者名時的顯示名稱解析（避免 display_name 空字串寫入 translator）。 */
export function resolveActorDisplayName(input: {
  displayName?: string | null;
  email?: string | null;
  userMetadataDisplayName?: string | null;
}): string {
  const candidates = [
    input.displayName,
    input.userMetadataDisplayName,
    input.email,
  ];
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    if (t) return t;
  }
  return "";
}
