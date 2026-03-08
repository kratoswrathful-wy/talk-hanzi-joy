import { useState, useCallback, useMemo, useEffect } from "react";
import { type CaseRecord } from "@/data/case-types";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree,
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
  { key: "taskStatus", label: "任務狀態", type: "text" },
  { key: "executionTool", label: "執行工具", type: "text" },
  { key: "deliveryMethod", label: "交件方式", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

function getFieldValue(c: CaseRecord, field: string): string | number | boolean {
  switch (field) {
    case "title": return c.title;
    case "status": return c.status;
    case "category": return c.category;
    case "workType": return (c.workType || []).join(", ");
    case "billingUnit": return c.billingUnit;
    case "unitCount": return c.unitCount;
    case "translator": return (c.translator || []).join(", ");
    case "translationDeadline": return c.translationDeadline || "";
    case "reviewer": return c.reviewer;
    case "reviewDeadline": return c.reviewDeadline || "";
    case "taskStatus": return c.taskStatus;
    case "executionTool": return c.executionTool;
    case "deliveryMethod": return c.deliveryMethod;
    case "createdAt": return c.createdAt;
    default: return "";
  }
}

function matchFilter(c: CaseRecord, filter: TableFilter): boolean {
  const val = getFieldValue(c, filter.field);
  switch (filter.operator) {
    case "equals": return String(val) === filter.value;
    case "not_equals": return String(val) !== filter.value;
    case "contains": return String(val).toLowerCase().includes(filter.value.toLowerCase());
    case "gt": return Number(val) > Number(filter.value);
    case "lt": return Number(val) < Number(filter.value);
    default: return true;
  }
}

function compareCases(a: CaseRecord, b: CaseRecord, sort: TableSort): number {
  const av = getFieldValue(a, sort.field);
  const bv = getFieldValue(b, sort.field);
  let cmp = 0;
  if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv, "zh-Hant-TW");
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv));
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = caseFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 200, category: 90, workType: 130, billingUnit: 80, unitCount: 90,
  translator: 100, translationDeadline: 140, reviewer: 100, reviewDeadline: 140,
  taskStatus: 90, executionTool: 100, deliveryMethod: 100, createdAt: 110,
};
const defaultHiddenColumns = ["executionTool", "deliveryMethod"];

function createDefaultView(): TableView {
  return {
    id: "default",
    name: "預設視圖",
    isDefault: true,
    filterTree: createRootGroup(),
    sorts: [],
    columnOrder: [...defaultColumnOrder],
    columnWidths: { ...defaultColumnWidths },
    hiddenColumns: [...defaultHiddenColumns],
  };
}

const STORAGE_KEY = "case-table-views";
const ACTIVE_VIEW_KEY = "case-table-active-view";

function loadViewsFromStorage(): TableView[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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

function loadActiveViewFromStorage(): string {
  try {
    return localStorage.getItem(ACTIVE_VIEW_KEY) || "default";
  } catch {
    return "default";
  }
}

export function useCaseTableViews(currentRole?: string) {
  const [views, setViews] = useState<TableView[]>(loadViewsFromStorage);
  const [activeViewId, setActiveViewId] = useState(loadActiveViewFromStorage);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(views)); } catch {}
  }, [views]);

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_VIEW_KEY, activeViewId); } catch {}
  }, [activeViewId]);

  const visibleViews = useMemo(() =>
    views.filter((v) => v.isDefault || v.createdByRole === currentRole),
    [views, currentRole]
  );

  const activeView = useMemo(() =>
    visibleViews.find((v) => v.id === activeViewId) || visibleViews[0],
    [visibleViews, activeViewId]
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
      createdByRole: currentRole,
    };
    setViews((prev) => [...prev, newView]);
    setActiveViewId(newView.id);
    return newView.id;
  }, [currentRole]);

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
    return result;
  }, [activeView]);

  const safeActiveViewId = useMemo(() => {
    if (visibleViews.some((v) => v.id === activeViewId)) return activeViewId;
    return "default";
  }, [visibleViews, activeViewId]);

  if (safeActiveViewId !== activeViewId) {
    setActiveViewId(safeActiveViewId);
  }

  return {
    views: visibleViews,
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
  };
}
