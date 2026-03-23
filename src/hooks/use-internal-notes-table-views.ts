import { useState, useCallback, useMemo, useEffect } from "react";
import { getStatusSortIndex } from "@/stores/select-options-store";
import {
  type TableFilter, type TableSort, type TableView, type FilterGroup,
  type FilterOperator, type FieldMeta, type LogicOperator,
  createRootGroup, addConditionToGroup, addSubGroup, removeNode,
  updateConditionInTree, setGroupLogic, countConditions, matchFilterTree, smartCompare,
} from "@/lib/filter-types";

export type { TableFilter, TableSort, TableView, FilterOperator, FieldMeta, FilterGroup, LogicOperator };
export { countConditions };

export interface NoteComment {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string;
  createdAt: string;
}

export interface InternalNote {
  id: string;
  title: string;
  relatedCase: string;          // case title — locked once set
  createdAt: string;
  creator: string;
  status: string;               // single-select via noteStatus
  noteType: string;             // 性質 — single-select via noteNature
  internalAssignee: string[];    // default = [case reviewer]
  fileName: string;
  idRowCount: string;
  sourceText: string;
  translatedText: string;
  questionOrNote: string;
  questionOrNoteBlocks: any[]; // BlockNote JSON blocks for rich text
  referenceFiles: { name: string; url: string }[];
  comments: NoteComment[];
  // Invalidation
  invalidated: boolean;
  invalidatedBy?: string;
  invalidatedAt?: string;
  invalidationReason?: string;
}

export const internalNotesFieldMetas: FieldMeta[] = [
  { key: "title", label: "標題", type: "text" },
  { key: "relatedCase", label: "關聯案件", type: "text" },
  { key: "status", label: "狀態", type: "select" },
  { key: "noteType", label: "性質", type: "select" },
  { key: "creator", label: "建立者", type: "select" },
  { key: "internalAssignee", label: "內部指派", type: "text" },
  { key: "createdAt", label: "建立時間", type: "date" },
];

function getFieldValue(note: InternalNote, field: string): string | number | boolean {
  switch (field) {
    case "title": return note.title;
    case "relatedCase": return note.relatedCase;
    case "status": return note.invalidated ? "已失效" : note.status;
    case "noteType": return note.noteType;
    case "creator": return note.creator;
    case "internalAssignee": return (note.internalAssignee || []).join(", ");
    case "createdAt": return note.createdAt;
    default: return "";
  }
}

function matchFilter(note: InternalNote, filter: TableFilter): boolean {
  const val = getFieldValue(note, filter.field);
  const meta = internalNotesFieldMetas.find((m) => m.key === filter.field);
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
      if (Number.isNaN(startTs) || Number.isNaN(endTs) || Number.isNaN(vTs)) result = false;
      else {
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

function compareNotes(a: InternalNote, b: InternalNote, sort: TableSort): number {
  if (sort.field === "status") {
    const aLabel = a.invalidated ? "已失效" : a.status;
    const bLabel = b.invalidated ? "已失效" : b.status;
    const cmp = getStatusSortIndex(aLabel) - getStatusSortIndex(bLabel);
    return sort.direction === "desc" ? -cmp : cmp;
  }
  const meta = internalNotesFieldMetas.find((m) => m.key === sort.field);
  const av = getFieldValue(a, sort.field);
  const bv = getFieldValue(b, sort.field);
  const cmp = smartCompare(av, bv, meta?.type);
  return sort.direction === "desc" ? -cmp : cmp;
}

const defaultColumnOrder = internalNotesFieldMetas.map((f) => f.key);
const defaultColumnWidths: Record<string, number> = {
  title: 200, relatedCase: 140, status: 120, noteType: 100,
  creator: 100, internalAssignee: 100, createdAt: 110,
};
const defaultHiddenColumns: string[] = [];

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

const BASE_STORAGE_KEY = "internal-notes-table-views";
const BASE_ACTIVE_VIEW_KEY = "internal-notes-table-active-view";

function loadViewsFromStorage(key: string): TableView[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as TableView[];
      if (!parsed.some((v) => v.id === "default")) return [createDefaultView(), ...parsed];
      return parsed;
    }
  } catch {}
  return [createDefaultView()];
}

function loadActiveViewFromStorage(key: string): string {
  try { return localStorage.getItem(key) || "default"; } catch { return "default"; }
}

export function useInternalNotesTableViews(userId?: string) {
  const storageKey = userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
  const activeKey = userId ? `${BASE_ACTIVE_VIEW_KEY}:${userId}` : BASE_ACTIVE_VIEW_KEY;

  const [views, setViews] = useState<TableView[]>(() => loadViewsFromStorage(storageKey));
  const [activeViewId, setActiveViewId] = useState(() => loadActiveViewFromStorage(activeKey));

  useEffect(() => {
    setViews(loadViewsFromStorage(storageKey));
    setActiveViewId(loadActiveViewFromStorage(activeKey));
  }, [storageKey, activeKey]);

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(views)); } catch {} }, [views, storageKey]);
  useEffect(() => { try { localStorage.setItem(activeKey, activeViewId); } catch {} }, [activeViewId, activeKey]);

  const activeView = useMemo(() => views.find((v) => v.id === activeViewId) || views[0], [views, activeViewId]);

  const updateView = useCallback((viewId: string, updates: Partial<TableView>) => {
    setViews((prev) => prev.map((v) => v.id === viewId ? { ...v, ...updates } : v));
  }, []);

  const toggleColumnVisibility = useCallback((key: string) => {
    const hidden = activeView.hiddenColumns || [];
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    updateView(activeViewId, { hiddenColumns: next });
  }, [activeViewId, activeView, updateView]);

  const addView = useCallback((name: string) => {
    const newView: TableView = { ...createDefaultView(), id: `view-${Date.now()}`, name, isDefault: false, createdByUserId: userId };
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
    updateView(activeViewId, { filterTree: addConditionToGroup(activeView.filterTree, groupId, { ...filter, id }) });
  }, [activeViewId, activeView, updateView]);

  const removeFilterNode = useCallback((nodeId: string) => {
    updateView(activeViewId, { filterTree: removeNode(activeView.filterTree, nodeId) });
  }, [activeViewId, activeView, updateView]);

  const updateCondition = useCallback((filterId: string, updates: Partial<TableFilter>) => {
    updateView(activeViewId, { filterTree: updateConditionInTree(activeView.filterTree, filterId, updates) });
  }, [activeViewId, activeView, updateView]);

  const addFilterGroup = useCallback((parentGroupId: string, logic: LogicOperator = "and") => {
    updateView(activeViewId, { filterTree: addSubGroup(activeView.filterTree, parentGroupId, logic) });
  }, [activeViewId, activeView, updateView]);

  const changeGroupLogic = useCallback((groupId: string, logic: LogicOperator) => {
    updateView(activeViewId, { filterTree: setGroupLogic(activeView.filterTree, groupId, logic) });
  }, [activeViewId, activeView, updateView]);

  const addSort = useCallback((sort: Omit<TableSort, "id">) => {
    const id = `s-${Date.now()}`;
    updateView(activeViewId, { sorts: [...activeView.sorts, { ...sort, id }] });
  }, [activeViewId, activeView, updateView]);

  const removeSort = useCallback((sortId: string) => {
    updateView(activeViewId, { sorts: activeView.sorts.filter((s) => s.id !== sortId) });
  }, [activeViewId, activeView, updateView]);

  const updateSort = useCallback((sortId: string, updates: Partial<TableSort>) => {
    updateView(activeViewId, { sorts: activeView.sorts.map((s) => s.id === sortId ? { ...s, ...updates } : s) });
  }, [activeViewId, activeView, updateView]);

  const setColumnOrder = useCallback((order: string[]) => {
    updateView(activeViewId, { columnOrder: order });
  }, [activeViewId, updateView]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    updateView(activeViewId, { columnWidths: { ...activeView.columnWidths, [key]: width } });
  }, [activeViewId, activeView, updateView]);

  const applyFiltersAndSorts = useCallback((items: InternalNote[]): InternalNote[] => {
    let result = items;
    if (activeView.filterTree.children.length > 0) {
      result = result.filter((n) => matchFilterTree(n, activeView.filterTree, matchFilter));
    }
    if (activeView.sorts.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of activeView.sorts) {
          const cmp = compareNotes(a, b, sort);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    const topIds = new Set(activeView.pinnedTop || []);
    const bottomIds = new Set(activeView.pinnedBottom || []);
    if (topIds.size > 0 || bottomIds.size > 0) {
      const pt: InternalNote[] = [], pb: InternalNote[] = [], mid: InternalNote[] = [];
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

  if (safeActiveViewId !== activeViewId) setActiveViewId(safeActiveViewId);

  return {
    views, activeView, activeViewId: safeActiveViewId,
    setActiveViewId, addView, deleteView, renameView, reorderViews,
    addCondition, removeFilterNode, updateCondition, addFilterGroup, changeGroupLogic,
    addSort, removeSort, updateSort, setColumnOrder, setColumnWidth,
    toggleColumnVisibility, applyFiltersAndSorts, pinTop, pinBottom, unpinItem,
  };
}
