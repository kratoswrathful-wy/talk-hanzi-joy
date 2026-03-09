import { useState, useCallback, useMemo, useEffect } from "react";
import { type ClientInvoice } from "@/data/client-invoice-types";
import { getStatusSortIndex, INVOICE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree,
} from "@/lib/filter-types";

export type { TableFilter, TableSort, TableView, FilterOperator, FieldMeta, FilterGroup, LogicOperator };
export { countConditions };

export const clientInvoiceFieldMetas: FieldMeta[] = [
  { key: "title", label: "標題", type: "text" },
  { key: "client", label: "客戶", type: "select" },
  { key: "status", label: "狀態", type: "select" },
  { key: "feeCount", label: "費用數", type: "computed" },
  { key: "totalAmount", label: "總金額", type: "computed" },
  { key: "transferDate", label: "匯款日期", type: "date" },
  { key: "note", label: "備註", type: "text" },
  { key: "createdBy", label: "建立者", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

function getFieldValue(
  inv: ClientInvoice,
  field: string,
  feeTotal?: (ids: string[]) => number
): string | number | boolean {
  switch (field) {
    case "title": return inv.title;
    case "client": return inv.client;
    case "status": return inv.status;
    case "feeCount": return inv.feeIds.length;
    case "totalAmount": return feeTotal ? feeTotal(inv.feeIds) : 0;
    case "transferDate": return inv.transferDate || "";
    case "note": return inv.note;
    case "createdBy": return inv.createdBy;
    case "createdAt": return inv.createdAt;
    default: return "";
  }
}

function makeMatcher(feeTotal?: (ids: string[]) => number) {
  return (inv: ClientInvoice, filter: TableFilter): boolean => {
    const val = getFieldValue(inv, filter.field, feeTotal);
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
  };
}

function compareItems(
  a: ClientInvoice, b: ClientInvoice, sort: TableSort, feeTotal?: (ids: string[]) => number
): number {
  const av = getFieldValue(a, sort.field, feeTotal);
  const bv = getFieldValue(b, sort.field, feeTotal);
  let cmp = 0;
  if (typeof av === "string" && typeof bv === "string") {
    cmp = av.localeCompare(bv, "zh-Hant-TW");
  } else if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv));
  }
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = clientInvoiceFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 220, client: 150, status: 100, feeCount: 80, totalAmount: 120,
  transferDate: 120, note: 200, createdBy: 100, createdAt: 120,
};
const defaultHiddenColumns = ["createdBy", "transferDate"];

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

const STORAGE_KEY = "client-invoice-table-views";
const ACTIVE_VIEW_KEY = "client-invoice-table-active-view";

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
    console.warn("Failed to load views from storage:", e);
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

export function useClientInvoiceTableViews(currentRole?: string) {
  const [views, setViews] = useState<TableView[]>(loadViewsFromStorage);
  const [activeViewId, setActiveViewId] = useState(loadActiveViewFromStorage);

  // Persist views to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch (e) {
      console.warn("Failed to save views to storage:", e);
    }
  }, [views]);

  // Persist active view ID
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_VIEW_KEY, activeViewId);
    } catch (e) {
      console.warn("Failed to save active view to storage:", e);
    }
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

  const applyFiltersAndSorts = useCallback(
    (items: ClientInvoice[], feeTotal?: (ids: string[]) => number): ClientInvoice[] => {
      let result = items;
      if (activeView.filterTree.children.length > 0) {
        const matcher = makeMatcher(feeTotal);
        result = result.filter((inv) => matchFilterTree(inv, activeView.filterTree, matcher));
      }
      if (activeView.sorts.length > 0) {
        result = [...result].sort((a, b) => {
          for (const sort of activeView.sorts) {
            const cmp = compareItems(a, b, sort, feeTotal);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
      const topIds = new Set(activeView.pinnedTop || []);
      const bottomIds = new Set(activeView.pinnedBottom || []);
      if (topIds.size > 0 || bottomIds.size > 0) {
        const pt: ClientInvoice[] = [], pb: ClientInvoice[] = [], mid: ClientInvoice[] = [];
        for (const item of result) {
          if (topIds.has(item.id)) pt.push(item);
          else if (bottomIds.has(item.id)) pb.push(item);
          else mid.push(item);
        }
        result = [...pt, ...mid, ...pb];
      }
      return result;
    },
    [activeView]
  );

  const pinTop = useCallback((ids: string[]) => {
    const current = activeView.pinnedTop || [];
    const newBottom = (activeView.pinnedBottom || []).filter((id) => !ids.includes(id));
    updateView(activeViewId, { pinnedTop: [...new Set([...current, ...ids])], pinnedBottom: newBottom });
  }, [activeViewId, activeView, updateView]);

  const pinBottom = useCallback((ids: string[]) => {
    const current = activeView.pinnedBottom || [];
    const newTop = (activeView.pinnedTop || []).filter((id) => !ids.includes(id));
    updateView(activeViewId, { pinnedBottom: [...new Set([...current, ...ids])], pinnedTop: newTop });
  }, [activeViewId, activeView, updateView]);

  const unpinItem = useCallback((id: string) => {
    updateView(activeViewId, {
      pinnedTop: (activeView.pinnedTop || []).filter((i) => i !== id),
      pinnedBottom: (activeView.pinnedBottom || []).filter((i) => i !== id),
    });
  }, [activeViewId, activeView, updateView]);

  const safeActiveViewId = useMemo(() => {
    if (visibleViews.some((v) => v.id === activeViewId)) return activeViewId;
    return "default";
  }, [visibleViews, activeViewId]);

  if (safeActiveViewId !== activeViewId) {
    setActiveViewId(safeActiveViewId);
  }

  return {
    views: visibleViews, activeView, activeViewId: safeActiveViewId,
    setActiveViewId, addView, deleteView, renameView, reorderViews,
    addCondition, removeFilterNode, updateCondition, addFilterGroup, changeGroupLogic,
    addSort, removeSort, updateSort, setColumnOrder, setColumnWidth,
    toggleColumnVisibility, applyFiltersAndSorts, pinTop, pinBottom, unpinItem,
  };
}
