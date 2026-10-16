/** 請款單費用關聯可能因漏讀後重試而重複；畫面與金額只認同一張單的不同費用。 */

export function uniqueFeeIds(feeIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of feeIds) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function groupUniqueFeeIdsByInvoice<T extends { invoiceId: string; feeId: string }>(
  links: readonly T[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const link of links) {
    const arr = grouped.get(link.invoiceId) || [];
    arr.push(link.feeId);
    grouped.set(link.invoiceId, arr);
  }
  for (const [invoiceId, ids] of grouped) {
    grouped.set(invoiceId, uniqueFeeIds(ids));
  }
  return grouped;
}
