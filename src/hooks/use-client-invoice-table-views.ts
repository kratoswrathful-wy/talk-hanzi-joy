import { useState, useCallback, useMemo, useEffect } from "react";
import { type ClientInvoice } from "@/data/client-invoice-types";
import { getStatusSortIndex, INVOICE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree, smartCompare,
} from "@/lib/filter-types";

export type { TableFilter, TableSort, TableView, FilterOperator, FieldMeta, FilterGroup, LogicOperator };
export { countConditions };

export const clientInvoiceFieldMetas: FieldMeta[] = [
  { key: "title", label: "標題", type: "text" },
  { key: "invoiceNumber", label: "請款單編號", type: "text" },
  { key: "client", label: "客戶", type: "select" },
  { key: "status", label: "狀態", type: "select" },
  { key: "billingChannel", label: "請款管道", type: "select" },
  { key: "isRecordOnly", label: "純請款紀錄", type: "checkbox" },
  { key: "feeCount", label: "費用數", type: "computed" },
  { key: "totalAmount", label: "應收總額", type: "computed" },
  { key: "recordCurrency", label: "幣別", type: "select" },
  { key: "serviceFee", label: "手續費", type: "computed" },
  { key: "expectedCollectionDate", label: "預計收款時間", type: "date" },
  { key: "actualCollectionDate", label: "實際收款時間", type: "date" },
  { key: "transferDate", label: "匯款日期", type: "date" },
  { key: "note", label: "客戶請款備註", type: "text" },
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
    case "serviceFee": {
      const total = inv.isRecordOnly ? (inv.recordAmount || 0) : (feeTotal ? feeTotal(inv.feeIds) : 0);
      const paid = inv.payments.reduce((s: number, p: any) => s + (p.type === "full" ? (p.noFee ? total : (p.amount || 0)) : (p.amount || 0)), 0);
      return inv.status === "collected" && paid < total ? total - paid : 0;
    }
    case "billingChannel": return inv.billingChannel || "";
    case "isRecordOnly": return !!inv.isRecordOnly;
    case "recordCurrency": return inv.isRecordOnly ? (inv.recordCurrency || "TWD") : "";
    case "expectedCollectionDate": return inv.expectedCollectionDate || "";
    case "actualCollectionDate": return inv.actualCollectionDate || "";
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
    let result: boolean;
    switch (filter.operator) {
      case "equals": result = String(val) === filter.value; break;
      case "not_equals": result = String(val) !== filter.value; break;
      case "contains": result = String(val).toLowerCase().includes(filter.value.toLowerCase()); break;
      case "is_checked": result = val === true; break;
      case "is_not_checked": result = val === false; break;
      case "gt": result = Number(val) > Number(filter.value); break;
      case "lt": result = Number(val) < Number(filter.value); break;
      case "is_empty": result = String(val ?? "").trim() === ""; break;
      default: result = true;
    }
    return filter.negated ? !result : result;
  };
}

function compareItems(
  a: ClientInvoice, b: ClientInvoice, sort: TableSort, feeTotal?: (ids: string[]) => number
): number {
  if (sort.field === "status") {
    const aLabel = INVOICE_STATUS_LABEL_MAP[a.status] || a.status;
    const bLabel = INVOICE_STATUS_LABEL_MAP[b.status] || b.status;
    const cmp = getStatusSortIndex(aLabel) - getStatusSortIndex(bLabel);
    return sort.direction === "desc" ? -cmp : cmp;
  }
  const meta = clientInvoiceFieldMetas.find((m) => m.key === sort.field);
  const av = getFieldValue(a, sort.field, feeTotal);
  const bv = getFieldValue(b, sort.field, feeTotal);
  const cmp = smartCompare(av, bv, meta?.type);
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = clientInvoiceFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 220, client: 150, status: 100, billingChannel: 100, isRecordOnly: 100,
  feeCount: 80, totalAmount: 120, recordCurrency: 80,
  serviceFee: 100, expectedCollectionDate: 130, actualCollectionDate: 130,
  transferDate: 120, note: 200, createdBy: 100, createdAt: 120,
};
const defaultHiddenColumns = ["createdBy", "transferDate", "isRecordOnly", "recordCurrency"];

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

const BASE_STORAGE_KEY = "client-invoice-table-views";
const BASE_ACTIVE_VIEW_KEY = "client-invoice-table-active-view";

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
    console.warn("Failed to load views from storage:", e);
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

export function useClientInvoiceTableViews(userId?: string) {
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
    if (views.some((v) => v.id === activeViewId)) return activeViewId;
    return "default";
  }, [views, activeViewId]);

  if (safeActiveViewId !== activeViewId) {
    setActiveViewId(safeActiveViewId);
  }

  return {
    views, activeView, activeViewId: safeActiveViewId,
    setActiveViewId, addView, deleteView, renameView, reorderViews,
    addCondition, removeFilterNode, updateCondition, addFilterGroup, changeGroupLogic,
    addSort, removeSort, updateSort, setColumnOrder, setColumnWidth,
    toggleColumnVisibility, applyFiltersAndSorts, pinTop, pinBottom, unpinItem,
  };
}
