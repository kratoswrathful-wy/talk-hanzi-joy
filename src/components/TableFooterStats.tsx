import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type AggMode = "count" | "sum" | "avg";

const aggLabels: Record<AggMode, string> = {
  count: "項目數量",
  sum: "總和",
  avg: "平均",
};

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

export interface NumericColumnConfig {
  /** Column key that matches ColumnDef.key */
  key: string;
  /** Function that extracts the numeric value from a data item */
  getValue: (item: any, ...extra: any[]) => number | null;
  /** Whether to format as currency (default true) */
  isCurrency?: boolean;
}

interface TableFooterStatsProps {
  /** Number of visible items */
  itemCount: number;
  /** Ordered visible columns (must have `key` field) */
  orderedCols: { key: string }[];
  /** Column widths map */
  columnWidths: Record<string, number>;
  /** Numeric columns that support sum/avg */
  numericColumns?: NumericColumnConfig[];
  /** The visible data items */
  data: any[];
  /** Extra args to pass to getValue (e.g. for invoice totals) */
  getValueExtra?: Map<string, any[]>;
  /** Extra columns count at the end (e.g. comment/history icons in fees page) */
  extraColCount?: number;
}

export function TableFooterStats({
  itemCount,
  orderedCols,
  columnWidths,
  numericColumns = [],
  data,
  getValueExtra,
  extraColCount = 0,
}: TableFooterStatsProps) {
  const [aggModes, setAggModes] = useState<Record<string, AggMode>>({});

  const numericKeySet = new Set(numericColumns.map((c) => c.key));

  const getAgg = (key: string) => aggModes[key] || "sum";

  const setAgg = (key: string, mode: AggMode) => {
    setAggModes((prev) => ({ ...prev, [key]: mode }));
  };

  const computeValue = (config: NumericColumnConfig, mode: AggMode): string => {
    if (mode === "count") return `共 ${itemCount} 筆`;
    
    const values: number[] = [];
    for (const item of data) {
      const extra = getValueExtra?.get(item.id) || [];
      const v = config.getValue(item, ...extra);
      if (v !== null && !isNaN(v)) values.push(v);
    }

    if (values.length === 0) return "—";

    const total = values.reduce((s, v) => s + v, 0);
    const result = mode === "avg" ? total / values.length : total;
    
    const prefix = mode === "sum" ? "總計 " : "平均 ";
    if (config.isCurrency !== false) {
      return `${prefix}${formatCurrency(Math.round(result))}`;
    }
    return `${prefix}${mode === "avg" ? result.toFixed(1) : result.toLocaleString()}`;
  };

  if (itemCount === 0) return null;

  return (
    <tfoot>
      <tr className="border-t border-border bg-muted/20">
        {/* Checkbox column */}
        <td className="w-[40px] px-2 py-2 text-center" />
        {orderedCols.map((col) => {
          const isTitle = col.key === "title";
          const numConfig = numericColumns.find((c) => c.key === col.key);
          const isNumeric = !!numConfig;
          const width = columnWidths[col.key] ?? 100;

          if (isTitle) {
            return (
              <td
                key={col.key}
                style={{ width, maxWidth: width }}
                className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
              >
                共 {itemCount} 筆
              </td>
            );
          }

          if (isNumeric && numConfig) {
            const mode = getAgg(col.key);
            const value = computeValue(numConfig, mode);
            return (
              <td
                key={col.key}
                style={{ width, maxWidth: width }}
                className="px-3 py-2 text-right"
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground transition-colors group ml-auto">
                      <span>{value}</span>
                      <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-32 p-1" align="center">
                    {(["count", "sum", "avg"] as AggMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setAgg(col.key, m)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs rounded transition-colors",
                          mode === m
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {aggLabels[m]}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </td>
            );
          }

          return (
            <td
              key={col.key}
              style={{ width, maxWidth: width }}
              className="px-3 py-2"
            />
          );
        })}
        {/* Extra columns (e.g., comment/history icons) */}
        {Array.from({ length: extraColCount }).map((_, i) => (
          <td key={`extra-${i}`} className="px-2 py-2" />
        ))}
      </tr>
    </tfoot>
  );
}
