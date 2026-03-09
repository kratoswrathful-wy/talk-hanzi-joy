/** Shared filter/sort types and tree utilities used by all table views */

export type FilterOperator = "equals" | "not_equals" | "contains" | "is_checked" | "is_not_checked" | "gt" | "lt";
export type LogicOperator = "and" | "or";

export interface TableFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  negated?: boolean;
}

export interface FilterNode {
  type: "condition" | "group";
  condition?: TableFilter;
  group?: FilterGroup;
}

export interface FilterGroup {
  id: string;
  logic: LogicOperator;
  children: FilterNode[];
}

export interface TableSort {
  id: string;
  field: string;
  direction: "asc" | "desc";
}

export interface TableView {
  id: string;
  name: string;
  isDefault: boolean;
  /** @deprecated Use filterTree instead */
  filters?: TableFilter[];
  filterTree: FilterGroup;
  sorts: TableSort[];
  pinnedTop: string[];     // item IDs pinned to top
  pinnedBottom: string[];  // item IDs pinned to bottom
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  /** @deprecated Use createdByUserId */
  createdByRole?: string;
  createdByUserId?: string;
}

export interface FieldMeta {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "date" | "checkbox" | "computed";
}

/* ── Tree helpers ── */

export function createFilterGroup(logic: LogicOperator = "and"): FilterGroup {
  return { id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, logic, children: [] };
}

export function createRootGroup(): FilterGroup {
  return { id: "root", logic: "and", children: [] };
}

/** Count all conditions in a tree */
export function countConditions(group: FilterGroup): number {
  return group.children.reduce((sum, node) => {
    if (node.type === "condition") return sum + 1;
    if (node.type === "group" && node.group) return sum + countConditions(node.group);
    return sum;
  }, 0);
}

/** Collect all conditions flat (for pill display) */
export function flattenConditions(group: FilterGroup): TableFilter[] {
  const result: TableFilter[] = [];
  for (const node of group.children) {
    if (node.type === "condition" && node.condition) result.push(node.condition);
    if (node.type === "group" && node.group) result.push(...flattenConditions(node.group));
  }
  return result;
}

/** Deep-clone a filter tree */
export function cloneTree(group: FilterGroup): FilterGroup {
  return {
    ...group,
    children: group.children.map((node) => {
      if (node.type === "condition") return { ...node, condition: { ...node.condition! } };
      return { type: "group" as const, group: cloneTree(node.group!) };
    }),
  };
}

/** Add a condition to a specific group */
export function addConditionToGroup(root: FilterGroup, groupId: string, filter: TableFilter): FilterGroup {
  const tree = cloneTree(root);
  const target = findGroup(tree, groupId);
  if (target) target.children.push({ type: "condition", condition: filter });
  return tree;
}

/** Add a sub-group to a specific group */
export function addSubGroup(root: FilterGroup, parentGroupId: string, logic: LogicOperator = "and"): FilterGroup {
  const tree = cloneTree(root);
  const target = findGroup(tree, parentGroupId);
  if (target) target.children.push({ type: "group", group: createFilterGroup(logic) });
  return tree;
}

/** Remove a node (condition by filter id, or group by group id) from anywhere in tree */
export function removeNode(root: FilterGroup, nodeId: string): FilterGroup {
  const tree = cloneTree(root);
  removeNodeRecursive(tree, nodeId);
  return tree;
}

function removeNodeRecursive(group: FilterGroup, nodeId: string): boolean {
  const idx = group.children.findIndex((n) => {
    if (n.type === "condition" && n.condition?.id === nodeId) return true;
    if (n.type === "group" && n.group?.id === nodeId) return true;
    return false;
  });
  if (idx >= 0) {
    group.children.splice(idx, 1);
    return true;
  }
  for (const node of group.children) {
    if (node.type === "group" && node.group && removeNodeRecursive(node.group, nodeId)) return true;
  }
  return false;
}

/** Update a condition anywhere in tree */
export function updateConditionInTree(root: FilterGroup, filterId: string, updates: Partial<TableFilter>): FilterGroup {
  const tree = cloneTree(root);
  updateConditionRecursive(tree, filterId, updates);
  return tree;
}

function updateConditionRecursive(group: FilterGroup, filterId: string, updates: Partial<TableFilter>): boolean {
  for (const node of group.children) {
    if (node.type === "condition" && node.condition?.id === filterId) {
      Object.assign(node.condition, updates);
      return true;
    }
    if (node.type === "group" && node.group && updateConditionRecursive(node.group, filterId, updates)) return true;
  }
  return false;
}

/** Set logic operator for a group */
export function setGroupLogic(root: FilterGroup, groupId: string, logic: LogicOperator): FilterGroup {
  const tree = cloneTree(root);
  const target = findGroup(tree, groupId);
  if (target) target.logic = logic;
  return tree;
}

/** Find a group by id in tree */
export function findGroup(group: FilterGroup, groupId: string): FilterGroup | null {
  if (group.id === groupId) return group;
  for (const node of group.children) {
    if (node.type === "group" && node.group) {
      const found = findGroup(node.group, groupId);
      if (found) return found;
    }
  }
  return null;
}

/** Generic tree-based matching: evaluates each condition with the provided matcher */
export function matchFilterTree<T>(
  item: T,
  group: FilterGroup,
  matcher: (item: T, filter: TableFilter) => boolean
): boolean {
  if (group.children.length === 0) return true;
  const results = group.children.map((node) => {
    if (node.type === "condition" && node.condition) return matcher(item, node.condition);
    if (node.type === "group" && node.group) return matchFilterTree(item, node.group, matcher);
    return true;
  });
  return group.logic === "and" ? results.every(Boolean) : results.some(Boolean);
}
