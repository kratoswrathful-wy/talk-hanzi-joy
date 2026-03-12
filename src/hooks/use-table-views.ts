import { useState, useCallback, useMemo, useEffect } from "react";
import { type TranslatorFee } from "@/data/fee-mock-data";
import { type Invoice } from "@/data/invoice-types";
import { type ClientInvoice } from "@/data/client-invoice-types";
import { getStatusSortIndex, FEE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree, smartCompare,
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
  { key: "feeTaskType", label: "稿費工作類型", type: "select" },
  { key: "feeBillingUnit", label: "稿費計費單位", type: "select" },
  { key: "feeUnitCount", label: "稿費單位數", type: "number" },
  { key: "feeUnitPrice", label: "稿費單價", type: "number" },
  { key: "client", label: "客戶", type: "select" },
  { key: "contact", label: "聯絡人", type: "text" },
  { key: "clientCaseId", label: "關鍵字", type: "text" },
  { key: "clientPoNumber", label: "客戶 PO#", type: "text" },
  { key: "dispatchRoute", label: "派案途徑", type: "select" },
  { key: "clientRevenue", label: "營收總額", type: "computed" },
  { key: "clientTaskType", label: "營收工作類型", type: "select" },
  { key: "clientBillingUnit", label: "營收計費單位", type: "select" },
  { key: "clientUnitCount", label: "營收單位數", type: "number" },
  { key: "clientUnitPrice", label: "營收單價", type: "number" },
  { key: "profit", label: "利潤", type: "computed" },
  { key: "reconciled", label: "對帳完成", type: "checkbox" },
  { key: "rateConfirmed", label: "費率無誤", type: "checkbox" },
  { key: "invoiced", label: "請款完成", type: "checkbox" },
  { key: "sameCase", label: "費用群組", type: "checkbox" },
  { key: "translatorInvoiceStatus", label: "稿費請款狀態", type: "select" },
  { key: "clientInvoiceStatus", label: "客戶請款狀態", type: "select" },
  { key: "translatorInvoice", label: "稿費請款單", type: "text" },
  { key: "invoice", label: "請款單", type: "text" },
  { key: "createdBy", label: "建立者", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

export interface FeeFilterContext {
  invoices: Invoice[];
  clientInvoices: ClientInvoice[];
}

const TRANSLATOR_INVOICE_STATUS_MAP: Record<string, string> = {
  pending: "待付款",
  partial: "部份付款",
  paid: "已付款",
};

const CLIENT_INVOICE_STATUS_MAP: Record<string, string> = {
  pending: "待收款",
  partial_collected: "部份到帳",
  collected: "全額收齊",
};

export const translatorInvoiceStatusOptions = [
  { value: "尚未請款", label: "尚未請款" },
  { value: "待付款", label: "待付款" },
  { value: "部份付款", label: "部份付款" },
  { value: "已付款", label: "已付款" },
];

export const clientInvoiceStatusOptions = [
  { value: "尚未請款", label: "尚未請款" },
  { value: "待收款", label: "待收款" },
  { value: "部份到帳", label: "部份到帳" },
  { value: "全額收齊", label: "全額收齊" },
];

function getFieldValue(fee: TranslatorFee, field: string, ctx?: FeeFilterContext): string | number | boolean {
  switch (field) {
    case "title": return fee.title;
    case "status": return fee.status;
    case "assignee": return fee.assignee;
    case "internalNote": return fee.internalNote;
    case "taskSummary": return fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
    case "feeTaskType": return fee.taskItems.map((i) => i.taskType).join(", ");
    case "feeBillingUnit": return fee.taskItems.map((i) => i.billingUnit).join(", ");
    case "feeUnitCount": return fee.taskItems.reduce((s, i) => s + i.unitCount, 0);
    case "feeUnitPrice": return fee.taskItems.length > 0 ? fee.taskItems[0].unitPrice : 0;
    case "client": return fee.clientInfo?.client || "";
    case "clientCaseId": return fee.clientInfo?.clientCaseId || "";
    case "contact": return fee.clientInfo?.contact || "";
    case "clientPoNumber": return fee.clientInfo?.clientPoNumber || "";
    case "dispatchRoute": return fee.clientInfo?.dispatchRoute || "";
    case "clientRevenue": {
      if (!fee.clientInfo || fee.clientInfo.notFirstFee) return 0;
      return fee.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
    }
    case "clientTaskType": return fee.clientInfo?.clientTaskItems.map((i) => i.taskType).join(", ") || "";
    case "clientBillingUnit": return fee.clientInfo?.clientTaskItems.map((i) => i.billingUnit).join(", ") || "";
    case "clientUnitCount": return fee.clientInfo?.clientTaskItems.reduce((s, i) => s + Number(i.unitCount), 0) || 0;
    case "clientUnitPrice": return fee.clientInfo?.clientTaskItems.length ? Number(fee.clientInfo.clientTaskItems[0].clientPrice) : 0;
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
    case "translatorInvoiceStatus": {
      if (!ctx) return "";
      const linked = ctx.invoices.find((inv) => inv.feeIds.includes(fee.id));
      return linked ? (TRANSLATOR_INVOICE_STATUS_MAP[linked.status] || linked.status) : "尚未請款";
    }
    case "clientInvoiceStatus": {
      if (!ctx) return "";
      const linked = ctx.clientInvoices.find((inv) => inv.feeIds.includes(fee.id));
      return linked ? (CLIENT_INVOICE_STATUS_MAP[linked.status] || linked.status) : "尚未請款";
    }
    case "translatorInvoice": {
      if (!ctx) return "";
      const linked = ctx.invoices.filter((inv) => inv.feeIds.includes(fee.id));
      return linked.map((inv) => inv.title || inv.translator).join(", ");
    }
    case "invoice": {
      if (!ctx) return "";
      const linked = ctx.invoices.filter((inv) => inv.feeIds.includes(fee.id));
      return linked.map((inv) => inv.title || inv.translator).join(", ");
    }
    case "createdBy": return fee.createdBy;
    case "createdAt": return fee.createdAt;
    default: return "";
  }
}

function matchFilterWithCtx(ctx?: FeeFilterContext) {
  return (fee: TranslatorFee, filter: TableFilter): boolean => {
    const val = getFieldValue(fee, filter.field, ctx);
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

function compareFeesWithCtx(a: TranslatorFee, b: TranslatorFee, sort: TableSort, ctx?: FeeFilterContext): number {
  if (sort.field === "status") {
    const aLabel = FEE_STATUS_LABEL_MAP[a.status] || a.status;
    const bLabel = FEE_STATUS_LABEL_MAP[b.status] || b.status;
    const cmp = getStatusSortIndex(aLabel) - getStatusSortIndex(bLabel);
    return sort.direction === "desc" ? -cmp : cmp;
  }
  const meta = fieldMetas.find((m) => m.key === sort.field);
  const av = getFieldValue(a, sort.field, ctx);
  const bv = getFieldValue(b, sort.field, ctx);
  const cmp = smartCompare(av, bv, meta?.type);
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = fieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 220, status: 90, assignee: 100, internalNote: 160, taskSummary: 120,
  client: 100, contact: 100, clientCaseId: 120, clientPoNumber: 100, dispatchRoute: 100,
  clientRevenue: 100, profit: 100, reconciled: 70, rateConfirmed: 70, invoiced: 70,
  sameCase: 70, translatorInvoiceStatus: 100, clientInvoiceStatus: 100,
  translatorInvoice: 120, invoice: 100, createdBy: 80, createdAt: 110,
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

const BASE_STORAGE_KEY = "fee-table-views";
const BASE_ACTIVE_VIEW_KEY = "fee-table-active-view";

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
    console.warn("Failed to load fee views from storage:", e);
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

export function useTableViews(userId?: string) {
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

  const applyFiltersAndSorts = useCallback((fees: TranslatorFee[], ctx?: FeeFilterContext): TranslatorFee[] => {
    let result = fees;
    const matcher = matchFilterWithCtx(ctx);
    if (activeView.filterTree.children.length > 0) {
      result = result.filter((fee) => matchFilterTree(fee, activeView.filterTree, matcher));
    }
    if (activeView.sorts.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of activeView.sorts) {
          const cmp = compareFeesWithCtx(a, b, sort, ctx);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    const topIds = new Set(activeView.pinnedTop || []);
    const bottomIds = new Set(activeView.pinnedBottom || []);
    if (topIds.size > 0 || bottomIds.size > 0) {
      const pt: TranslatorFee[] = [], pb: TranslatorFee[] = [], mid: TranslatorFee[] = [];
      for (const item of result) {
        if (topIds.has(item.id)) pt.push(item);
        else if (bottomIds.has(item.id)) pb.push(item);
        else mid.push(item);
      }
      result = [...pt, ...mid, ...pb];
    }
    return result;
  }, [activeView]);

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
