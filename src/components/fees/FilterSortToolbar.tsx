import { useState } from "react";
import { Filter, ArrowUpDown, Plus, X, ChevronDown, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  type TableFilter, type TableSort, type TableView, type FilterOperator,
  fieldMetas,
} from "@/hooks/use-table-views";
import { cn } from "@/lib/utils";

const operatorLabels: Record<FilterOperator, string> = {
  equals: "等於",
  not_equals: "不等於",
  contains: "包含",
  is_checked: "已勾選",
  is_not_checked: "未勾選",
  gt: "大於",
  lt: "小於",
};

function getOperatorsForType(type: string): FilterOperator[] {
  switch (type) {
    case "checkbox": return ["is_checked", "is_not_checked"];
    case "number": case "computed": return ["equals", "not_equals", "gt", "lt"];
    case "select": return ["equals", "not_equals"];
    default: return ["equals", "not_equals", "contains"];
  }
}

function needsValueInput(op: FilterOperator) {
  return !["is_checked", "is_not_checked"].includes(op);
}

interface Props {
  views: TableView[];
  activeView: TableView;
  activeViewId: string;
  onSetActiveView: (id: string) => void;
  onAddView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onAddFilter: (filter: Omit<TableFilter, "id">) => void;
  onRemoveFilter: (id: string) => void;
  onUpdateFilter: (id: string, updates: Partial<TableFilter>) => void;
  onAddSort: (sort: Omit<TableSort, "id">) => void;
  onRemoveSort: (id: string) => void;
  onUpdateSort: (id: string, updates: Partial<TableSort>) => void;
  visibleFieldKeys: string[];
  selectedCount: number;
}

export function FilterSortToolbar({
  views, activeView, activeViewId,
  onSetActiveView, onAddView, onDeleteView,
  onAddFilter, onRemoveFilter, onUpdateFilter,
  onAddSort, onRemoveSort, onUpdateSort,
  visibleFieldKeys,
  selectedCount,
}: Props) {
  const [newViewName, setNewViewName] = useState("");
  const visibleFields = fieldMetas.filter((f) => visibleFieldKeys.includes(f.key));

  return (
    <div className="space-y-2">
      {/* View tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {views.map((view) => (
          <button
            key={view.id}
            onClick={() => onSetActiveView(view.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
              activeViewId === view.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Eye className="h-3 w-3" />
            {view.name}
            {!view.isDefault && activeViewId === view.id && (
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

      {/* Filter/Sort bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <Filter className="h-3 w-3" />
              篩選
              {activeView.filters.length > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {activeView.filters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">篩選條件</p>
              {activeView.filters.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">尚未新增篩選條件</p>
              )}
              {activeView.filters.map((filter) => {
                const meta = fieldMetas.find((f) => f.key === filter.field);
                const ops = meta ? getOperatorsForType(meta.type) : [];
                return (
                  <div key={filter.id} className="flex items-center gap-1.5">
                    <Select value={filter.field} onValueChange={(v) => onUpdateFilter(filter.id, { field: v, value: "" })}>
                      <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {visibleFields.map((f) => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filter.operator} onValueChange={(v) => onUpdateFilter(filter.id, { operator: v as FilterOperator })}>
                      <SelectTrigger className="h-7 text-xs w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ops.map((op) => (
                          <SelectItem key={op} value={op} className="text-xs">{operatorLabels[op]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {needsValueInput(filter.operator) && (
                      <Input
                        value={filter.value}
                        onChange={(e) => onUpdateFilter(filter.id, { value: e.target.value })}
                        className="h-7 text-xs flex-1"
                        placeholder="值"
                      />
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemoveFilter(filter.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
              <Separator />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 w-full justify-start text-muted-foreground"
                onClick={() => onAddFilter({ field: visibleFields[0]?.key || "title", operator: "contains", value: "" })}
              >
                <Plus className="h-3 w-3" />
                新增篩選
              </Button>
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

        {/* Active filter/sort pills */}
        {activeView.filters.map((filter) => {
          const meta = fieldMetas.find((f) => f.key === filter.field);
          return (
            <Badge key={filter.id} variant="secondary" className="h-6 gap-1 text-xs font-normal">
              {meta?.label} {operatorLabels[filter.operator]} {needsValueInput(filter.operator) ? `"${filter.value}"` : ""}
              <button onClick={() => onRemoveFilter(filter.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {activeView.sorts.map((sort) => {
          const meta = fieldMetas.find((f) => f.key === sort.field);
          return (
            <Badge key={sort.id} variant="secondary" className="h-6 gap-1 text-xs font-normal">
              {meta?.label} {sort.direction === "asc" ? "↑" : "↓"}
              <button onClick={() => onRemoveSort(sort.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}

        {/* Selection indicator */}
        {selectedCount > 0 && (
          <Badge variant="default" className="h-6 text-xs ml-auto">
            已選取 {selectedCount} 項
          </Badge>
        )}
      </div>
    </div>
  );
}
