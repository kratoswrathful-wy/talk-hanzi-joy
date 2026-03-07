import { useState, useCallback, useMemo } from "react";
import { type Invoice, type InvoiceStatus } from "@/data/invoice-types";

export type FilterOperator = "equals" | "not_equals" | "contains" | "is_checked" | "is_not_checked" | "gt" | "lt";

export interface TableFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
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
  filters: TableFilter[];
  sorts: TableSort[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  createdByRole?: string;
}

export interface FieldMeta {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "date" | "checkbox" | "computed";
}

export const invoiceFieldMetas: FieldMeta[] = [
  { key: "title", label: "標題", type: "text" },
  { key: "translator", label: "譯者", type: "select" },
  { key: "status", label: "狀態", type: "select" },
  { key: "feeCount", label: "費用數", type: "computed" },
  { key: "totalAmount", label: "總金額", type: "computed" },
  { key: "transferDate", label: "匯款日期", type: "date" },
  { key: "note", label: "備註", type: "text" },
  { key: "createdBy", label: "建立者", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

/** Gets a comparable value from an invoice for filtering/sorting */
function getFieldValue(
  inv: Invoice,
  field: string,
  feeTotal?: (ids: string[]) => number
): string | number | boolean {
  switch (field) {
    case "title": return inv.title;
    case "translator": return inv.translator;
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

function matchFilter(
  inv: Invoice,
  filter: TableFilter,
  feeTotal?: (ids: string[]) => number
): boolean {
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
}

function compareInvoices(
  a: Invoice,
  b: Invoice,
  sort: TableSort,
  feeTotal?: (ids: string[]) => number
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

const defaultColumnOrder = invoiceFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 220, translator: 150, status: 100, feeCount: 80, totalAmount: 120,
  transferDate: 120, note: 200, createdBy: 100, createdAt: 120,
};
const defaultHiddenColumns = ["createdBy", "transferDate"];

function createDefaultView(): TableView {
  return {
    id: "default",
    name: "預設視圖",
    isDefault: true,
    filters: [],
    sorts: [],
    columnOrder: [...defaultColumnOrder],
    columnWidths: { ...defaultColumnWidths },
    hiddenColumns: [...defaultHiddenColumns],
  };
}

export function useInvoiceTableViews(currentRole?: string) {
  const [views, setViews] = useState<TableView[]>(() => [createDefaultView()]);
  const [activeViewId, setActiveViewId] = useState("default");

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

  const addFilter = useCallback((filter: Omit<TableFilter, "id">) => {
    const id = `f-${Date.now()}`;
    updateView(activeViewId, { filters: [...activeView.filters, { ...filter, id }] });
  }, [activeViewId, activeView, updateView]);

  const removeFilter = useCallback((filterId: string) => {
    updateView(activeViewId, { filters: activeView.filters.filter((f) => f.id !== filterId) });
  }, [activeViewId, activeView, updateView]);

  const updateFilter = useCallback((filterId: string, updates: Partial<TableFilter>) => {
    updateView(activeViewId, {
      filters: activeView.filters.map((f) => f.id === filterId ? { ...f, ...updates } : f),
    });
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
    (invoices: Invoice[], feeTotal?: (ids: string[]) => number): Invoice[] => {
      let result = invoices;
      if (activeView.filters.length > 0) {
        result = result.filter((inv) => activeView.filters.every((f) => matchFilter(inv, f, feeTotal)));
      }
      if (activeView.sorts.length > 0) {
        result = [...result].sort((a, b) => {
          for (const sort of activeView.sorts) {
            const cmp = compareInvoices(a, b, sort, feeTotal);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
      return result;
    },
    [activeView]
  );

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
    addFilter,
    removeFilter,
    updateFilter,
    addSort,
    removeSort,
    updateSort,
    setColumnOrder,
    setColumnWidth,
    toggleColumnVisibility,
    applyFiltersAndSorts,
  };
}
