import { useState, useCallback, useMemo, useEffect } from "react";
import { type CaseRecord } from "@/data/case-types";
import { getStatusSortIndex, CASE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree, smartCompare,
  flattenConditions,
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

  { key: "createdBy", label: "建立者", type: "select" },

  // (1.3) Case list extra filters/sorts
  { key: "client", label: "客戶", type: "select" },
  { key: "dispatchRoute", label: "派案途徑", type: "select" },
  { key: "contact", label: "聯絡人", type: "text" },
  { key: "keyword", label: "關鍵字", type: "text" },
  { key: "clientPoNumber", label: "客戶 PO#", type: "text" },
  
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
    case "createdBy": return c.createdBy;
    case "client": return c.client;
    case "dispatchRoute": return c.dispatchRoute;
    case "contact": return c.contact;
    case "keyword": return c.keyword;
    case "clientPoNumber": return c.clientPoNumber;

    case "executionTool": return c.executionTool;
    case "deliveryMethod": return c.deliveryMethod;
    case "createdAt": return c.createdAt;
    default: return "";
  }
}

function matchFilter(c: CaseRecord, filter: TableFilter, viewerDisplayName?: string): boolean {
  const val = getFieldValue(c, filter.field, viewerDisplayName);
  const meta = caseFieldMetas.find((m) => m.key === filter.field);
  const isDate = meta?.type === "date";
  let result: boolean;
  switch (filter.operator) {
    case "between": {
      if (!isDate) {
        result = false;
        break;
      }
      const [startRaw = "", endRaw = ""] = String(filter.value || "").split("|");
      const startTs = Date.parse(startRaw);
      const endTs = Date.parse(endRaw);
      const vTs = Date.parse(String(val));
      if (Number.isNaN(startTs) || Number.isNaN(endTs) || Number.isNaN(vTs)) {
        result = false;
      } else {
        const lo = Math.min(startTs, endTs);
        const hi = Math.max(startTs, endTs);
        result = vTs >= lo && vTs <= hi;
      }
      break;
    }
    case "equals": {
      if (isDate) result = Date.parse(String(val)) === Date.parse(filter.value);
      else result = String(val) === filter.value;
      break;
    }
    case "not_equals": {
      if (isDate) result = Date.parse(String(val)) !== Date.parse(filter.value);
      else result = String(val) !== filter.value;
      break;
    }
    case "contains": result = String(val).toLowerCase().includes(filter.value.toLowerCase()); break;
    case "gt": {
      if (isDate) result = Date.parse(String(val)) > Date.parse(filter.value);
      else result = Number(val) > Number(filter.value);
      break;
    }
    case "lt": {
      if (isDate) result = Date.parse(String(val)) < Date.parse(filter.value);
      else result = Number(val) < Number(filter.value);
      break;
    }
    case "is_empty": result = String(val ?? "").trim() === ""; break;
    default: result = true;
  }
  return filter.negated ? !result : result;
}

function compareCases(a: CaseRecord, b: CaseRecord, sort: TableSort, viewerDisplayName?: string): number {
  if (sort.field === "status") {
    const aLabel = CASE_STATUS_LABEL_MAP[a.status] || a.status;
    const bLabel = CASE_STATUS_LABEL_MAP[b.status] || b.status;
    const cmp = getStatusSortIndex(aLabel) - getStatusSortIndex(bLabel);
    return sort.direction === "desc" ? -cmp : cmp;
  }
  const meta = caseFieldMetas.find((m) => m.key === sort.field);
  const av = getFieldValue(a, sort.field, viewerDisplayName);
  const bv = getFieldValue(b, sort.field, viewerDisplayName);
  const cmp = smartCompare(av, bv, meta?.type);
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = caseFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 200,
  category: 90,
  workType: 130,
  billingUnit: 80,
  unitCount: 90,
  translator: 100,
  translationDeadline: 140,
  reviewer: 100,
  reviewDeadline: 140,
  createdBy: 110,
  client: 110,
  dispatchRoute: 120,
  contact: 110,
  keyword: 120,
  clientPoNumber: 110,
  executionTool: 100,
  deliveryMethod: 100,
  createdAt: 110,
};
const defaultHiddenColumns = ["executionTool", "deliveryMethod"];

/** 預設排序：審稿交期由早到晚 */
const defaultCaseViewSorts: TableSort[] = [
  { id: "default-sort-review-deadline", field: "reviewDeadline", direction: "asc" },
];

/** 預設篩選：隱藏「已交件」，減少列表列數（仍會載入全部案件資料，僅減少畫面上渲染的筆數） */
function createDefaultFilterTree(): FilterGroup {
  const excludeDelivered: TableFilter = {
    id: "default-exclude-delivered",
    field: "status",
    operator: "not_equals",
    value: "delivered",
  };
  return addConditionToGroup(createRootGroup(), "root", excludeDelivered);
}

/** 舊版預設：單條 status ≠ feedback_completed */
function isLegacyV1DefaultCaseFilter(tree: FilterGroup): boolean {
  const flat = flattenConditions(tree);
  if (flat.length !== 1) return false;
  const f = flat[0];
  return (
    f.field === "status" &&
    f.operator === "not_equals" &&
    f.value === "feedback_completed"
  );
}

function createDefaultView(): TableView {
  return {
    id: "default",
    name: "預設視圖",
    isDefault: true,
    filterTree: createDefaultFilterTree(),
    sorts: [...defaultCaseViewSorts],
    pinnedTop: [],
    pinnedBottom: [],
    columnOrder: [...defaultColumnOrder],
    columnWidths: { ...defaultColumnWidths },
    hiddenColumns: [...defaultHiddenColumns],
  };
}

const BASE_STORAGE_KEY = "case-table-views";
const BASE_ACTIVE_VIEW_KEY = "case-table-active-view";
/** 一次性遷移：預設視圖改為「≠ 已交件」、審稿交期升序；並升級舊版單條 feedback_completed 預設 */
const DEFAULT_VIEW_FILTERS_V2_KEY = "case-table-default-filters-v2";

function migrateDefaultCaseViewIfNeeded(views: TableView[]): TableView[] {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(DEFAULT_VIEW_FILTERS_V2_KEY)) {
      return views;
    }
  } catch {
    return views;
  }

  const defaultView = views.find((v) => v.id === "default");
  if (!defaultView) {
    try {
      localStorage.setItem(DEFAULT_VIEW_FILTERS_V2_KEY, "1");
    } catch {
      /* ignore */
    }
    return views;
  }

  const emptyFilter = countConditions(defaultView.filterTree) === 0;
  const legacyV1 = isLegacyV1DefaultCaseFilter(defaultView.filterTree);

  let nextFilterTree = defaultView.filterTree;
  if (emptyFilter || legacyV1) {
    nextFilterTree = createDefaultFilterTree();
  }

  let nextSorts = defaultView.sorts;
  if (defaultView.sorts.length === 0) {
    nextSorts = [...defaultCaseViewSorts];
  }

  const next = views.map((v) =>
    v.id === "default"
      ? { ...v, filterTree: nextFilterTree, sorts: nextSorts }
      : v
  );
  try {
    localStorage.setItem(DEFAULT_VIEW_FILTERS_V2_KEY, "1");
  } catch {
    /* ignore */
  }
  return next;
}

function loadViewsFromStorage(key: string): TableView[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as TableView[];
      if (!parsed.some((v) => v.id === "default")) {
        return migrateDefaultCaseViewIfNeeded([createDefaultView(), ...parsed]);
      }
      return migrateDefaultCaseViewIfNeeded(parsed);
    }
  } catch (e) {
    console.warn("Failed to load case views from storage:", e);
  }
  return migrateDefaultCaseViewIfNeeded([createDefaultView()]);
}

function loadActiveViewFromStorage(key: string): string {
  try {
    return localStorage.getItem(key) || "default";
  } catch {
    return "default";
  }
}

export function useCaseTableViews(userId?: string, viewerDisplayName?: string) {
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
      result = result.filter((c) =>
        matchFilterTree(c, activeView.filterTree, (item, filter) =>
          matchFilter(item, filter, viewerDisplayName)
        )
      );
    }
    if (activeView.sorts.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of activeView.sorts) {
          const cmp = compareCases(a, b, sort, viewerDisplayName);
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
  }, [activeView, viewerDisplayName]);

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
