import { useState, useRef, useMemo } from "react";
import { Filter, ArrowUpDown, Plus, X, ChevronDown, Eye, Columns3, FolderPlus, Pin, PinOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type TableFilter, type TableSort, type TableView, type FilterOperator,
  type FieldMeta, type FilterGroup, type LogicOperator,
  countConditions, flattenConditions,
} from "@/lib/filter-types";
import { fieldMetas, translatorInvoiceStatusOptions, clientInvoiceStatusOptions } from "@/hooks/use-table-views";
import { cn } from "@/lib/utils";
import { useSelectOptions } from "@/stores/select-options-store";

const fieldToStoreKey: Record<string, string> = {
  assignee: "assignee",
  translator: "assignee",
  reviewer: "assignee",
  internalAssignee: "assignee",
  client: "client",
  status: "status",
  dispatchRoute: "dispatchRoute",
  category: "caseCategory",
  workType: "taskType",
  billingUnit: "billingUnit",
  executionTool: "executionTool",
  noteType: "noteNature",
};

const operatorLabels: Record<FilterOperator, string> = {
  equals: "等於",
  not_equals: "不等於",
  contains: "包含",
  is_checked: "已勾選",
  is_not_checked: "未勾選",
  gt: "大於",
  lt: "小於",
  is_empty: "空白",
};

const logicLabels: Record<LogicOperator, string> = {
  and: "且",
  or: "或",
};

function getOperatorsForType(type: string): FilterOperator[] {
  switch (type) {
    case "checkbox": return ["is_checked", "is_not_checked"];
    case "number": case "computed": return ["equals", "gt", "lt", "is_empty"];
    case "select": return ["equals", "contains", "is_empty"];
    default: return ["equals", "contains", "is_empty"];
  }
}

function needsValueInput(op: FilterOperator) {
  return !["is_checked", "is_not_checked", "is_empty"].includes(op);
}

interface Props {
  views: TableView[];
  activeView: TableView;
  activeViewId: string;
  onSetActiveView: (id: string) => void;
  onAddView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onAddCondition: (groupId: string, filter: Omit<TableFilter, "id">) => void;
  onRemoveFilterNode: (nodeId: string) => void;
  onUpdateCondition: (filterId: string, updates: Partial<TableFilter>) => void;
  onAddFilterGroup: (parentGroupId: string, logic?: LogicOperator) => void;
  onChangeGroupLogic: (groupId: string, logic: LogicOperator) => void;
  onAddSort: (sort: Omit<TableSort, "id">) => void;
  onRemoveSort: (id: string) => void;
  onUpdateSort: (id: string, updates: Partial<TableSort>) => void;
  onRenameView: (id: string, name: string) => void;
  onReorderViews: (fromId: string, toId: string) => void;
  visibleFieldKeys: string[];
  selectedCount: number;
  hiddenColumns: string[];
  onToggleColumn: (key: string) => void;
  fieldMetasList?: FieldMeta[];
  statusOptionsList?: { value: string; label: string }[];
  selectedIds?: string[];
  onPinTop?: (ids: string[]) => void;
  onPinBottom?: (ids: string[]) => void;
  onUnpinItem?: (id: string) => void;
  pinnedTop?: string[];
  pinnedBottom?: string[];
}

export function FilterSortToolbar({
  views, activeView, activeViewId,
  onSetActiveView, onAddView, onDeleteView,
  onAddCondition, onRemoveFilterNode, onUpdateCondition,
  onAddFilterGroup, onChangeGroupLogic,
  onAddSort, onRemoveSort, onUpdateSort,
  onRenameView, onReorderViews,
  visibleFieldKeys,
  selectedCount,
  hiddenColumns,
  onToggleColumn,
  fieldMetasList,
  statusOptionsList,
  selectedIds,
  onPinTop,
  onPinBottom,
  onUnpinItem,
  pinnedTop,
  pinnedBottom,
}: Props) {
  const [newViewName, setNewViewName] = useState("");
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragViewRef = useRef<string | null>(null);
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null);
  const allFields = fieldMetasList || fieldMetas;
  const visibleFields = allFields.filter((f) => visibleFieldKeys.includes(f.key));
  const hiddenSet = new Set(hiddenColumns);
  const pinnedTopCount = (pinnedTop || []).length;
  const pinnedBottomCount = (pinnedBottom || []).length;
  const totalPinCount = pinnedTopCount + pinnedBottomCount;

  const filterCount = countConditions(activeView.filterTree);
  const flatFilters = flattenConditions(activeView.filterTree);

  return (
    <div className="space-y-2">
      {/* View tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {views.map((view) => (
          <button
            key={view.id}
            draggable={!view.isDefault && editingViewId !== view.id}
            onDragStart={(e) => { dragViewRef.current = view.id; e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); if (dragViewRef.current && dragViewRef.current !== view.id) setDragOverViewId(view.id); }}
            onDrop={(e) => { e.preventDefault(); if (dragViewRef.current && dragViewRef.current !== view.id) { onReorderViews(dragViewRef.current, view.id); } dragViewRef.current = null; setDragOverViewId(null); }}
            onDragEnd={() => { dragViewRef.current = null; setDragOverViewId(null); }}
            onClick={() => { if (editingViewId !== view.id) onSetActiveView(view.id); }}
            onDoubleClick={() => {
              if (!view.isDefault) {
                setEditingViewId(view.id);
                setEditingName(view.name);
                setTimeout(() => editInputRef.current?.focus(), 0);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
              activeViewId === view.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              dragOverViewId === view.id && "ring-2 ring-primary/40"
            )}
          >
            <Eye className="h-3 w-3" />
            {editingViewId === view.id ? (
              <input
                ref={editInputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => { onRenameView(view.id, editingName); setEditingViewId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onRenameView(view.id, editingName); setEditingViewId(null); }
                  if (e.key === "Escape") setEditingViewId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-primary outline-none w-16 text-xs"
              />
            ) : (
              view.name
            )}
            {!view.isDefault && activeViewId === view.id && editingViewId !== view.id && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteView(view.id); }}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium">新增個人視圖</p>
              <Input
                placeholder="視圖名稱"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                disabled={!newViewName.trim()}
                onClick={() => {
                  onAddView(newViewName.trim());
                  setNewViewName("");
                }}
              >
                建立
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Filter/Sort/Properties bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <Filter className="h-3 w-3" />
              篩選
              {filterCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {filterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[480px] p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">篩選條件</p>
              {activeView.filterTree.children.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">尚未新增篩選條件</p>
              )}
              <FilterGroupUI
                group={activeView.filterTree}
                isRoot={true}
                visibleFields={visibleFields}
                allFields={allFields}
                onAddCondition={onAddCondition}
                onRemoveNode={onRemoveFilterNode}
                onUpdateCondition={onUpdateCondition}
                onAddGroup={onAddFilterGroup}
                onChangeLogic={onChangeGroupLogic}
                statusOptionsList={statusOptionsList}
              />
              <Separator />
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 flex-1 justify-start text-muted-foreground"
                  onClick={() => onAddCondition("root", { field: allFields[0]?.key || "title", operator: "contains", value: "" })}
                >
                  <Plus className="h-3 w-3" />
                  新增條件
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 flex-1 justify-start text-muted-foreground"
                  onClick={() => onAddFilterGroup("root", "and")}
                >
                  <FolderPlus className="h-3 w-3" />
                  新增群組
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <ArrowUpDown className="h-3 w-3" />
              排序
              {activeView.sorts.length > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {activeView.sorts.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">排序規則</p>
              {activeView.sorts.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">尚未新增排序規則</p>
              )}
              {activeView.sorts.map((sort) => (
                <div key={sort.id} className="flex items-center gap-1.5">
                  <Select value={sort.field} onValueChange={(v) => onUpdateSort(sort.id, { field: v })}>
                    <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {visibleFields.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sort.direction} onValueChange={(v) => onUpdateSort(sort.id, { direction: v as "asc" | "desc" })}>
                    <SelectTrigger className="h-7 text-xs w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc" className="text-xs">升序</SelectItem>
                      <SelectItem value="desc" className="text-xs">降序</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveSort(sort.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Separator />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 w-full justify-start text-muted-foreground"
                onClick={() => onAddSort({ field: visibleFields[0]?.key || "title", direction: "asc" })}
              >
                <Plus className="h-3 w-3" />
                新增排序
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Pin to top/bottom buttons - show when items are selected */}
        {onPinTop && onPinBottom && selectedIds && selectedIds.length > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => onPinTop(selectedIds)}
            >
              <Pin className="h-3 w-3" />
              置頂
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => onPinBottom(selectedIds)}
            >
              <Pin className="h-3 w-3 rotate-180" />
              置底
            </Button>
          </>
        )}

        {/* Column visibility button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <Columns3 className="h-3 w-3" />
              屬性
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                {allFields.filter((f) => !hiddenSet.has(f.key)).length}/{allFields.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-3" align="start">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">顯示屬性</p>
              {allFields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-xs">
                  <Checkbox
                    checked={!hiddenSet.has(f.key)}
                    onCheckedChange={() => onToggleColumn(f.key)}
                    className="h-3.5 w-3.5"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filter/sort pills */}
        {flatFilters.map((filter) => {
          const meta = allFields.find((f) => f.key === filter.field);
          return (
            <Badge key={filter.id} variant="secondary" className="h-6 gap-1 text-xs font-normal">
              {meta?.label} {filter.negated ? "不" : ""}{operatorLabels[filter.operator]} {needsValueInput(filter.operator) ? `"${filter.value}"` : ""}
              <button onClick={() => onRemoveFilterNode(filter.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {activeView.sorts.map((sort) => {
          const meta = allFields.find((f) => f.key === sort.field);
          return (
            <Badge key={sort.id} variant="secondary" className="h-6 gap-1 text-xs font-normal">
              {meta?.label} {sort.direction === "asc" ? "↑" : "↓"}
              <button onClick={() => onRemoveSort(sort.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}

        {/* Pinned pills */}
        {totalPinCount > 0 && onUnpinItem && (
          <>
            {pinnedTopCount > 0 && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs font-normal">
                <Pin className="h-3 w-3" />
                置頂 {pinnedTopCount} 項
                <button onClick={() => (pinnedTop || []).forEach((id) => onUnpinItem(id))} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {pinnedBottomCount > 0 && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs font-normal">
                <Pin className="h-3 w-3 rotate-180" />
                置底 {pinnedBottomCount} 項
                <button onClick={() => (pinnedBottom || []).forEach((id) => onUnpinItem(id))} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </>
        )}

        {/* Selection indicator */}
        {selectedCount > 0 && (
          <Badge variant="default" className="h-6 text-xs">
            已選取 {selectedCount} 個項目
          </Badge>
        )}
      </div>
    </div>
  );
}

/* ── Filter Group UI (recursive) ── */

interface FilterGroupUIProps {
  group: FilterGroup;
  isRoot: boolean;
  visibleFields: FieldMeta[];
  allFields: FieldMeta[];
  onAddCondition: (groupId: string, filter: Omit<TableFilter, "id">) => void;
  onRemoveNode: (nodeId: string) => void;
  onUpdateCondition: (filterId: string, updates: Partial<TableFilter>) => void;
  onAddGroup: (parentGroupId: string, logic?: LogicOperator) => void;
  onChangeLogic: (groupId: string, logic: LogicOperator) => void;
  statusOptionsList?: { value: string; label: string }[];
}

function FilterGroupUI({
  group, isRoot, visibleFields, allFields,
  onAddCondition, onRemoveNode, onUpdateCondition, onAddGroup, onChangeLogic,
  statusOptionsList,
}: FilterGroupUIProps) {
  if (group.children.length === 0 && isRoot) return null;

  return (
    <div className={cn(
      "space-y-1",
      !isRoot && "ml-2 pl-3 border-l-2 border-primary/20 rounded-sm py-1.5"
    )}>
      {group.children.map((node, index) => (
        <div key={node.type === "condition" ? node.condition!.id : node.group!.id}>
          {/* Logic connector label between items */}
          {index > 0 && (
            <div className="flex items-center gap-1.5 py-0.5 pl-1">
              <button
                onClick={() => onChangeLogic(group.id, group.logic === "and" ? "or" : "and")}
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-colors",
                  group.logic === "and"
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "bg-accent text-accent-foreground hover:bg-accent/80"
                )}
              >
                {logicLabels[group.logic]}
              </button>
            </div>
          )}

          {node.type === "condition" && node.condition ? (
            <FilterRow
              filter={node.condition}
              meta={allFields.find((f) => f.key === node.condition!.field)}
              ops={allFields.find((f) => f.key === node.condition!.field)
                ? getOperatorsForType(allFields.find((f) => f.key === node.condition!.field)!.type)
                : []}
              visibleFields={visibleFields}
              onUpdateFilter={onUpdateCondition}
              onRemoveFilter={onRemoveNode}
              statusOptionsList={statusOptionsList}
            />
          ) : node.type === "group" && node.group ? (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium">群組</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveNode(node.group!.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <FilterGroupUI
                group={node.group}
                isRoot={false}
                visibleFields={visibleFields}
                allFields={allFields}
                onAddCondition={onAddCondition}
                onRemoveNode={onRemoveNode}
                onUpdateCondition={onUpdateCondition}
                onAddGroup={onAddGroup}
                onChangeLogic={onChangeLogic}
                statusOptionsList={statusOptionsList}
              />
              <div className="flex gap-1 mt-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-muted-foreground px-2"
                  onClick={() => onAddCondition(node.group!.id, { field: visibleFields[0]?.key || "title", operator: "contains", value: "" })}
                >
                  <Plus className="h-2.5 w-2.5" />
                  條件
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-muted-foreground px-2"
                  onClick={() => onAddGroup(node.group!.id, "and")}
                >
                  <FolderPlus className="h-2.5 w-2.5" />
                  子群組
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── Single filter condition row ── */

const statusOptions = [
  { value: "draft", label: "草稿" },
  { value: "finalized", label: "開立完成" },
];

interface FilterRowProps {
  filter: TableFilter;
  meta: FieldMeta | undefined;
  ops: FilterOperator[];
  visibleFields: FieldMeta[];
  onUpdateFilter: (id: string, updates: Partial<TableFilter>) => void;
  onRemoveFilter: (id: string) => void;
  statusOptionsList?: { value: string; label: string }[];
}

function FilterRow({ filter, meta, ops, visibleFields, onUpdateFilter, onRemoveFilter, statusOptionsList }: FilterRowProps) {
  const storeKey = meta ? fieldToStoreKey[meta.key] : undefined;
  const isSelectType = meta?.type === "select";

  const { options: storeOptions } = useSelectOptions(storeKey || "__noop__");

  const selectOpts: { value: string; label: string }[] | null = (() => {
    if (filter.field === "status") return statusOptionsList || statusOptions;
    if (filter.field === "translatorInvoiceStatus") return translatorInvoiceStatusOptions;
    if (filter.field === "clientInvoiceStatus") return clientInvoiceStatusOptions;
    if (isSelectType && storeKey) {
      return storeOptions.map((o) => ({ value: o.label, label: o.label }));
    }
    return null;
  })();

  const isCheckbox = meta?.type === "checkbox";

  return (
    <div className="flex items-center gap-1.5">
      <Select value={filter.field} onValueChange={(v) => onUpdateFilter(filter.id, { field: v, value: "" })}>
        <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {visibleFields.map((f) => (
            <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isCheckbox && (
        <Select value={filter.negated ? "not" : "plain"} onValueChange={(v) => onUpdateFilter(filter.id, { negated: v === "not" })}>
          <SelectTrigger className="h-7 text-xs w-[52px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="plain" className="text-xs">--</SelectItem>
            <SelectItem value="not" className="text-xs">不</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Select value={filter.operator} onValueChange={(v) => onUpdateFilter(filter.id, { operator: v as FilterOperator })}>
        <SelectTrigger className="h-7 text-xs w-[80px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op} className="text-xs">{operatorLabels[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValueInput(filter.operator) && (
        selectOpts ? (
          <Select value={filter.value} onValueChange={(v) => onUpdateFilter(filter.id, { value: v })}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="選擇..." /></SelectTrigger>
            <SelectContent>
              {selectOpts.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={filter.value}
            onChange={(e) => onUpdateFilter(filter.id, { value: e.target.value })}
            placeholder="值..."
            className="h-7 text-xs flex-1"
          />
        )
      )}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveFilter(filter.id)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
