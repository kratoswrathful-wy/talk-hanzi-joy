import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type OpsIncidentRow = Database["public"]["Tables"]["ops_incidents"]["Row"];

const severityVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "major") return "destructive";
  if (s === "minor") return "secondary";
  return "outline";
};

function formatLocal(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function OpsIncidentsSection() {
  const [rows, setRows] = useState<OpsIncidentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("ops_incidents")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
        return;
      }
      setRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <Collapsible defaultOpen={false}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger
            className={cn(
              "group flex w-full items-center justify-between gap-2 rounded-md py-1 text-left",
              "outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
              "data-[state=open]:[&_svg.chevron-ops]:rotate-180",
            )}
            type="button"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="text-lg font-semibold leading-tight tracking-tight">
                重大故障／維運紀錄
              </span>
            </div>
            <ChevronDown className="chevron-ops h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <CardDescription>
              資料庫表 <code className="text-xs">ops_incidents</code> 與 repo 內{" "}
              <code className="text-xs">docs/HANDOFF.md</code>{" "}
              分工：此處為時間線與結論摘要；技術細節與勿還原項請以文件為準。
            </CardDescription>
            {rows === null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                載入中…
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">
                無法讀取紀錄（請確認已套用 supabase migration）：{error}
              </p>
            )}
            {rows && rows.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">尚無紀錄。</p>
            )}
            {rows?.map((row) => (
              <div key={row.id} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.title}</span>
                  <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                  <span className="text-muted-foreground">{formatLocal(row.occurred_at)}</span>
                </div>
                {row.affected_modules.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.affected_modules.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs font-normal">
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
                <Separator className="my-3" />
                <dl className="grid gap-2 text-muted-foreground">
                  <div>
                    <dt className="font-medium text-foreground">現象</dt>
                    <dd>{row.symptoms}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">根因</dt>
                    <dd>{row.root_cause}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">處理／狀態</dt>
                    <dd>{row.resolution}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
