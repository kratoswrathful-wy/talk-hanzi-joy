import type { SelectOption } from "@/stores/select-options-store";

/** `options` must be the full assignee list (already sorted by member sort_order). */
function labelOrderIndex(options: SelectOption[], label: string): number {
  const i = options.findIndex((o) => o.label === label);
  return i >= 0 ? i : 999999;
}

/** Pin currently selected assignees to the top; order among pinned = member list order. */
export function pinSelectedAssigneesToTop(
  options: SelectOption[],
  filtered: SelectOption[],
  selectedLabels: string[]
): SelectOption[] {
  if (selectedLabels.length === 0) return filtered;
  const selectedSet = new Set(selectedLabels);
  const pinned = filtered
    .filter((o) => selectedSet.has(o.label))
    .sort((a, b) => labelOrderIndex(options, a.label) - labelOrderIndex(options, b.label));
  const rest = filtered.filter((o) => !selectedSet.has(o.label));
  return [...pinned, ...rest];
}

/** Selected tags / chips: order by team member order (same as options array order). */
export function sortSelectedAssigneeOptions(options: SelectOption[], selectedLabels: string[]): SelectOption[] {
  const byLabel = new Map(options.map((o) => [o.label, o]));
  const ordered = [...selectedLabels].sort(
    (a, b) => labelOrderIndex(options, a) - labelOrderIndex(options, b)
  );
  return ordered.map((l) => byLabel.get(l)).filter(Boolean) as SelectOption[];
}
