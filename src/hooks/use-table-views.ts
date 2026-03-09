import { useState, useCallback, useMemo, useEffect } from "react";
import { type TranslatorFee } from "@/data/fee-mock-data";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree,
} from "@/lib/filter-types";

// Re-export for consumers
export type { TableFilter, TableSort, TableView, FilterOperator, FieldMeta, FilterGroup, LogicOperator };
export { countConditions };

export const fieldMetas: FieldMeta[] = [
  { key: "title", label: "標題", type: "text" },
  { key: "status", label: "狀態", type: "select" },
  { key: "assignee", label: "譯者", type: "select" },
  { key: "internalNote", label: "關聯案件", type: "text" },
  { key: "taskSummary", label: "稿費總額", type: "computed" },
  { key: "client", label: "客戶", type: "select" },
  { key: "contact", label: "聯絡人", type: "text" },
  { key: "clientCaseId", label: "關鍵字", type: "text" },
  { key: "clientPoNumber", label: "客戶 PO#", type: "text" },
  { key: "dispatchRoute", label: "派案途徑", type: "select" },
  { key: "clientRevenue", label: "營收總額", type: "computed" },
  { key: "profit", label: "利潤", type: "computed" },
  { key: "reconciled", label: "對帳完成", type: "checkbox" },
  { key: "rateConfirmed", label: "費率無誤", type: "checkbox" },
  { key: "invoiced", label: "請款完成", type: "checkbox" },
  { key: "sameCase", label: "費用群組", type: "checkbox" },
  { key: "translatorInvoiceStatus", label: "稿費請款狀態", type: "select" },
  { key: "clientInvoiceStatus", label: "客戶請款狀態", type: "select" },
  { key: "invoice", label: "請款單", type: "text" },
  { key: "createdBy", label: "建立者", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

function getFieldValue(fee: TranslatorFee, field: string): string | number | boolean {
  switch (field) {
    case "title": return fee.title;
    case "status": return fee.status;
    case "assignee": return fee.assignee;
    case "internalNote": return fee.internalNote;
    case "taskSummary": return fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
    case "client": return fee.clientInfo?.client || "";
    case "clientCaseId": return fee.clientInfo?.clientCaseId || "";
    case "contact": return fee.clientInfo?.contact || "";
    case "clientPoNumber": return fee.clientInfo?.clientPoNumber || "";
    case "dispatchRoute": return fee.clientInfo?.dispatchRoute || "";
    case "clientRevenue": {
      if (!fee.clientInfo || fee.clientInfo.notFirstFee) return 0;
      return fee.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
    }
    case "profit": {
      if (!fee.clientInfo || fee.clientInfo.notFirstFee) return 0;
      const rev = fee.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
      const cost = fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      return rev - cost;
    }
    case "reconciled": return !!fee.clientInfo?.reconciled;
    case "rateConfirmed": return !!fee.clientInfo?.rateConfirmed;
    case "invoiced": return !!fee.clientInfo?.invoiced;
    case "sameCase": return !!fee.clientInfo?.sameCase;
    case "createdBy": return fee.createdBy;
    case "createdAt": return fee.createdAt;
    default: return "";
  }
}

function matchFilter(fee: TranslatorFee, filter: TableFilter): boolean {
  const val = getFieldValue(fee, filter.field);
  switch (filter.operator) {
    case "equals": return String(val) === filter.value;
    case "not_equals": return String(val) !== filter.value;
    case "contains": return String(val).toLowerCase().includes(filter.value.toLowerCase());
    case "is_checked": return val === true;
    case "is_not_checked": return val === false;
    case "gt": return Number(val) > Number(filter.value);
    case "lt": return Number(val) < Number(filter.value);
    default: return true;
  }
}

function compareFees(a: TranslatorFee, b: TranslatorFee, sort: TableSort): number {
  const av = getFieldValue(a, sort.field);
  const bv = getFieldValue(b, sort.field);
  let cmp = 0;
  if (typeof av === "string" && typeof bv === "string") {
    cmp = av.localeCompare(bv, "zh-Hant-TW");
  } else if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else if (typeof av === "boolean" && typeof bv === "boolean") {
    cmp = (av ? 1 : 0) - (bv ? 1 : 0);
  } else {
    cmp = String(av).localeCompare(String(bv));
  }
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = fieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 220, status: 90, assignee: 100, internalNote: 160, taskSummary: 120,
  client: 100, contact: 100, clientCaseId: 120, clientPoNumber: 100, dispatchRoute: 100,
  clientRevenue: 100, profit: 100, reconciled: 70, rateConfirmed: 70, invoiced: 70,
  sameCase: 70, translatorInvoiceStatus: 100, clientInvoiceStatus: 100, invoice: 100, createdBy: 80, createdAt: 110,
};
const defaultHiddenColumns = ["contact", "dispatchRoute", "sameCase"];

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

const STORAGE_KEY = "fee-table-views";
const ACTIVE_VIEW_KEY = "fee-table-active-view";

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
    console.warn("Failed to load fee views from storage:", e);
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

export function useTableViews(currentRole?: string) {
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

  // ── Filter tree operations ──
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

  // ── Sort operations ──
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

  const applyFiltersAndSorts = useCallback((fees: TranslatorFee[]): TranslatorFee[] => {
    let result = fees;
    if (activeView.filterTree.children.length > 0) {
      result = result.filter((fee) => matchFilterTree(fee, activeView.filterTree, matchFilter));
    }
    if (activeView.sorts.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of activeView.sorts) {
          const cmp = compareFees(a, b, sort);
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
