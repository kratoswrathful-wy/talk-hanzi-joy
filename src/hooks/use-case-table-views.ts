import { useState, useCallback, useMemo, useEffect } from "react";
import { type CaseRecord } from "@/data/case-types";
import { getStatusSortIndex, CASE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree, smartCompare,
} from "@/lib/filter-types";

export type { TableFilter, TableSort, TableView, FilterOperator, FieldMeta, FilterGroup, LogicOperator };
export { countConditions };

export const caseFieldMetas: FieldMeta[] = [
  { key: "title", label: "案件編號", type: "text" },
  { key: "status", label: "狀態", type: "select" },
  { key: "category", label: "類型", type: "select" },
  { key: "workType", label: "工作類型", type: "select" },
  { key: "billingUnit", label: "計費單位", type: "select" },
  { key: "unitCount", label: "計費單位數", type: "number" },
  { key: "translator", label: "譯者", type: "select" },
  { key: "translationDeadline", label: "翻譯交期", type: "date" },
  { key: "reviewer", label: "審稿人員", type: "select" },
  { key: "reviewDeadline", label: "審稿交期", type: "date" },
  
  { key: "executionTool", label: "執行工具", type: "text" },
  { key: "deliveryMethod", label: "交件方式", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

type DeadlineField = "translationDeadline" | "reviewDeadline";

function pickCollabDeadline(
  rows: CaseRecord["collabRows"],
  field: DeadlineField,
  mode: "earliest" | "latest"
): string | null {
  const timestamps = rows
    .map((r) => r[field])
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((ts) => !Number.isNaN(ts));

  if (timestamps.length === 0) return null;

  const targetTs = mode === "earliest"
    ? Math.min(...timestamps)
    : Math.max(...timestamps);

  return new Date(targetTs).toISOString();
}

function getCaseDeadlineForSort(
  c: CaseRecord,
  field: DeadlineField,
  viewerDisplayName?: string
): string {
  if (!c.multiCollab || !c.collabRows?.length) {
    return c[field] || "";
  }

  const rows = c.collabRows;

  if (c.status === "draft" || c.status === "inquiry") {
    return pickCollabDeadline(rows, field, "earliest") || "";
  }

  if (field === "translationDeadline") {
    if (viewerDisplayName && rows.some((r) => r.translator === viewerDisplayName)) {
      const myRows = rows.filter((r) => r.translator === viewerDisplayName);
      const myUncompleted = myRows.filter((r) => !r.taskCompleted);
      return (
        myUncompleted.length > 0
          ? pickCollabDeadline(myUncompleted, field, "earliest")
          : pickCollabDeadline(myRows, field, "latest")
      ) || "";
    }

    const uncompleted = rows.filter((r) => !r.taskCompleted);
    return (
      uncompleted.length > 0
        ? pickCollabDeadline(uncompleted, field, "earliest")
        : pickCollabDeadline(rows, field, "latest")
    ) || "";
  }

  if (viewerDisplayName && rows.some((r) => r.reviewer === viewerDisplayName)) {
    const myRows = rows.filter((r) => r.reviewer === viewerDisplayName);
    const myUncompleted = myRows.filter((r) => !r.delivered);
    return (
      myUncompleted.length > 0
        ? pickCollabDeadline(myUncompleted, field, "earliest")
        : pickCollabDeadline(myRows, field, "latest")
    ) || "";
  }

  const uncompleted = rows.filter((r) => !r.delivered);
  return (
    uncompleted.length > 0
      ? pickCollabDeadline(uncompleted, field, "earliest")
      : pickCollabDeadline(rows, field, "latest")
  ) || "";
}

function getFieldValue(c: CaseRecord, field: string, viewerDisplayName?: string): string | number | boolean {
  switch (field) {
    case "title": return c.title;
    case "status": return c.status;
    case "category": return c.category;
    case "workType": return (c.workType || []).join(", ");
    case "billingUnit": return c.billingUnit;
    case "unitCount": return c.unitCount;
    case "translator": return (c.translator || []).join(", ");
    case "translationDeadline": return getCaseDeadlineForSort(c, "translationDeadline", viewerDisplayName);
    case "reviewer": return c.reviewer;
    case "reviewDeadline": return getCaseDeadlineForSort(c, "reviewDeadline", viewerDisplayName);

    case "executionTool": return c.executionTool;
    case "deliveryMethod": return c.deliveryMethod;
    case "createdAt": return c.createdAt;
    default: return "";
  }
}

function matchFilter(c: CaseRecord, filter: TableFilter, viewerDisplayName?: string): boolean {
  const val = getFieldValue(c, filter.field, viewerDisplayName);
  let result: boolean;
  switch (filter.operator) {
    case "equals": result = String(val) === filter.value; break;
    case "not_equals": result = String(val) !== filter.value; break;
    case "contains": result = String(val).toLowerCase().includes(filter.value.toLowerCase()); break;
    case "gt": result = Number(val) > Number(filter.value); break;
    case "lt": result = Number(val) < Number(filter.value); break;
    case "is_empty": result = String(val ?? "").trim() === ""; break;
    default: result = true;
  }
  return filter.negated ? !result : result;
}

function compareCases(a: CaseRecord, b: CaseRecord, sort: TableSort): number {
  if (sort.field === "status") {
    const aLabel = CASE_STATUS_LABEL_MAP[a.status] || a.status;
    const bLabel = CASE_STATUS_LABEL_MAP[b.status] || b.status;
    const cmp = getStatusSortIndex(aLabel) - getStatusSortIndex(bLabel);
    return sort.direction === "desc" ? -cmp : cmp;
  }
  const meta = caseFieldMetas.find((m) => m.key === sort.field);
  const av = getFieldValue(a, sort.field);
  const bv = getFieldValue(b, sort.field);
  const cmp = smartCompare(av, bv, meta?.type);
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = caseFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 200, category: 90, workType: 130, billingUnit: 80, unitCount: 90,
  translator: 100, translationDeadline: 140, reviewer: 100, reviewDeadline: 140,
  executionTool: 100, deliveryMethod: 100, createdAt: 110,
};
const defaultHiddenColumns = ["executionTool", "deliveryMethod"];

function createDefaultView(): TableView {
  return {
    id: "default",
    name: "預設視圖",
    isDefault: true,
    filterTree: createRootGroup(),
    sorts: [],
    pinnedTop: [],
    pinnedBottom: [],
    columnOrder: [...defaultColumnOrder],
    columnWidths: { ...defaultColumnWidths },
    hiddenColumns: [...defaultHiddenColumns],
  };
}

const BASE_STORAGE_KEY = "case-table-views";
const BASE_ACTIVE_VIEW_KEY = "case-table-active-view";

function loadViewsFromStorage(key: string): TableView[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as TableView[];
      if (!parsed.some((v) => v.id === "default")) {
        return [createDefaultView(), ...parsed];
      }
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load case views from storage:", e);
  }
  return [createDefaultView()];
}

function loadActiveViewFromStorage(key: string): string {
  try {
    return localStorage.getItem(key) || "default";
  } catch {
    return "default";
  }
}

export function useCaseTableViews(userId?: string) {
  const storageKey = userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
  const activeKey = userId ? `${BASE_ACTIVE_VIEW_KEY}:${userId}` : BASE_ACTIVE_VIEW_KEY;

  const [views, setViews] = useState<TableView[]>(() => loadViewsFromStorage(storageKey));
  const [activeViewId, setActiveViewId] = useState(() => loadActiveViewFromStorage(activeKey));

  useEffect(() => {
    setViews(loadViewsFromStorage(storageKey));
    setActiveViewId(loadActiveViewFromStorage(activeKey));
  }, [storageKey, activeKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(views)); } catch {}
  }, [views, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(activeKey, activeViewId); } catch {}
  }, [activeViewId, activeKey]);

  const activeView = useMemo(() =>
    views.find((v) => v.id === activeViewId) || views[0],
    [views, activeViewId]
  );

  const updateView = useCallback((viewId: string, updates: Partial<TableView>) => {
    setViews((prev) => prev.map((v) => v.id === viewId ? { ...v, ...updates } : v));
  }, []);

  const toggleColumnVisibility = useCallback((key: string) => {
    const hidden = activeView.hiddenColumns || [];
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    updateView(activeViewId, { hiddenColumns: next });
  }, [activeViewId, activeView, updateView]);

  const addView = useCallback((name: string) => {
    const newView: TableView = {
      ...createDefaultView(),
      id: `view-${Date.now()}`,
      name,
      isDefault: false,
      createdByUserId: userId,
    };
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newView.id);
    return newView.id;
  }, [userId]);

  const deleteView = useCallback((viewId: string) => {
    if (viewId === "default") return;
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    if (activeViewId === viewId) setActiveViewId("default");
  }, [activeViewId]);

  const renameView = useCallback((viewId: string, newName: string) => {
    if (viewId === "default" || !newName.trim()) return;
    updateView(viewId, { name: newName.trim() });
  }, [updateView]);

  const reorderViews = useCallback((fromId: string, toId: string) => {
    setViews((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((v) => v.id === fromId);
      const toIdx = next.findIndex((v) => v.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const addCondition = useCallback((groupId: string, filter: Omit<TableFilter, "id">) => {
    const id = `f-${Date.now()}`;
    const newTree = addConditionToGroup(activeView.filterTree, groupId, { ...filter, id });
    updateView(activeViewId, { filterTree: newTree });
  }, [activeViewId, activeView, updateView]);

  const removeFilterNode = useCallback((nodeId: string) => {
    const newTree = removeNode(activeView.filterTree, nodeId);
    updateView(activeViewId, { filterTree: newTree });
  }, [activeViewId, activeView, updateView]);

  const updateCondition = useCallback((filterId: string, updates: Partial<TableFilter>) => {
    const newTree = updateConditionInTree(activeView.filterTree, filterId, updates);
    updateView(activeViewId, { filterTree: newTree });
  }, [activeViewId, activeView, updateView]);

  const addFilterGroup = useCallback((parentGroupId: string, logic: LogicOperator = "and") => {
    const newTree = addSubGroup(activeView.filterTree, parentGroupId, logic);
    updateView(activeViewId, { filterTree: newTree });
  }, [activeViewId, activeView, updateView]);

  const changeGroupLogic = useCallback((groupId: string, logic: LogicOperator) => {
    const newTree = setGroupLogic(activeView.filterTree, groupId, logic);
    updateView(activeViewId, { filterTree: newTree });
  }, [activeViewId, activeView, updateView]);

  const addSort = useCallback((sort: Omit<TableSort, "id">) => {
    const id = `s-${Date.now()}`;
    updateView(activeViewId, { sorts: [...activeView.sorts, { ...sort, id }] });
  }, [activeViewId, activeView, updateView]);

  const removeSort = useCallback((sortId: string) => {
    updateView(activeViewId, { sorts: activeView.sorts.filter((s) => s.id !== sortId) });
  }, [activeViewId, activeView, updateView]);

  const updateSort = useCallback((sortId: string, updates: Partial<TableSort>) => {
    updateView(activeViewId, {
      sorts: activeView.sorts.map((s) => s.id === sortId ? { ...s, ...updates } : s),
    });
  }, [activeViewId, activeView, updateView]);

  const setColumnOrder = useCallback((order: string[]) => {
    updateView(activeViewId, { columnOrder: order });
  }, [activeViewId, updateView]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    updateView(activeViewId, { columnWidths: { ...activeView.columnWidths, [key]: width } });
  }, [activeViewId, activeView, updateView]);

  const applyFiltersAndSorts = useCallback((items: CaseRecord[]): CaseRecord[] => {
    let result = items;
    if (activeView.filterTree.children.length > 0) {
      result = result.filter((c) => matchFilterTree(c, activeView.filterTree, matchFilter));
    }
    if (activeView.sorts.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of activeView.sorts) {
          const cmp = compareCases(a, b, sort);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    // Apply pinning
    const topIds = new Set(activeView.pinnedTop || []);
    const bottomIds = new Set(activeView.pinnedBottom || []);
    if (topIds.size > 0 || bottomIds.size > 0) {
      const pinned_top: CaseRecord[] = [];
      const pinned_bottom: CaseRecord[] = [];
      const middle: CaseRecord[] = [];
      for (const item of result) {
        if (topIds.has(item.id)) pinned_top.push(item);
        else if (bottomIds.has(item.id)) pinned_bottom.push(item);
        else middle.push(item);
      }
      result = [...pinned_top, ...middle, ...pinned_bottom];
    }
    return result;
  }, [activeView]);

  const pinTop = useCallback((ids: string[]) => {
    const current = activeView.pinnedTop || [];
    const bottomSet = new Set(activeView.pinnedBottom || []);
    const newBottom = [...bottomSet].filter((id) => !ids.includes(id));
    const merged = [...new Set([...current, ...ids])];
    updateView(activeViewId, { pinnedTop: merged, pinnedBottom: newBottom });
  }, [activeViewId, activeView, updateView]);

  const pinBottom = useCallback((ids: string[]) => {
    const current = activeView.pinnedBottom || [];
    const topSet = new Set(activeView.pinnedTop || []);
    const newTop = [...topSet].filter((id) => !ids.includes(id));
    const merged = [...new Set([...current, ...ids])];
    updateView(activeViewId, { pinnedBottom: merged, pinnedTop: newTop });
  }, [activeViewId, activeView, updateView]);

  const unpinItem = useCallback((id: string) => {
    updateView(activeViewId, {
      pinnedTop: (activeView.pinnedTop || []).filter((i) => i !== id),
      pinnedBottom: (activeView.pinnedBottom || []).filter((i) => i !== id),
    });
  }, [activeViewId, activeView, updateView]);

  const safeActiveViewId = useMemo(() => {
    if (views.some((v) => v.id === activeViewId)) return activeViewId;
    return "default";
  }, [views, activeViewId]);

  if (safeActiveViewId !== activeViewId) {
    setActiveViewId(safeActiveViewId);
  }

  return {
    views,
    activeView,
    activeViewId: safeActiveViewId,
    setActiveViewId,
    addView,
    deleteView,
    renameView,
    reorderViews,
    addCondition,
    removeFilterNode,
    updateCondition,
    addFilterGroup,
    changeGroupLogic,
    addSort,
    removeSort,
    updateSort,
    setColumnOrder,
    setColumnWidth,
    toggleColumnVisibility,
    applyFiltersAndSorts,
    pinTop,
    pinBottom,
    unpinItem,
  };
}
