import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTimestamp24h } from "@/lib/format-timestamp";
import {
  fetchCatAiModelRegistryRows,
  type CatAiModelRegistryRow,
} from "@/lib/cat-ai-model-registry/list-registry-options";
import { GPT55_TEMPERATURE_HINT_ZH } from "@/lib/cat-ai-model-registry/model-capabilities";
import {
  FALLBACK_MODEL_ID,
  formatNullableZh,
  getRegistryRowFlags,
} from "@/lib/cat-ai-model-registry/registry-display";

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  return formatTimestamp24h(iso);
}

function RegistryBadges({ row }: { row: CatAiModelRegistryRow }) {
  const flags = getRegistryRowFlags(row);
  return (
    <div className="flex flex-wrap gap-1">
      {flags.isDefault && <Badge variant="default">目前 default</Badge>}
      {flags.isFallback && <Badge variant="secondary">fallback</Badge>}
      {flags.isEnabled ? (
        <Badge variant="outline">enabled</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          未啟用
        </Badge>
      )}
      {flags.providerUnavailable && (
        <Badge variant="destructive">provider 不可用</Badge>
      )}
      {flags.missingUsageHint && (
        <Badge variant="outline" className="border-amber-500 text-amber-700">
          缺 usage_hint
        </Badge>
      )}
      {flags.missingShortLabel && (
        <Badge variant="outline" className="border-amber-500 text-amber-700">
          缺 short_label
        </Badge>
      )}
      {flags.omitTemperature && (
        <Badge variant="outline" className="border-sky-600 text-sky-800">
          省略 temperature
        </Badge>
      )}
    </div>
  );
}

export default function CatAiModelRegistryPage() {
  const [rows, setRows] = useState<CatAiModelRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCatAiModelRegistryRows();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "讀取模型清單失敗");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const enabledRows = rows.filter((r) => r.enabled);
    const defaultRow = rows.find((r) => r.is_default);
    const fallbackRow = rows.find((r) => r.model_id === FALLBACK_MODEL_ID);
    return {
      total: rows.length,
      enabledCount: enabledRows.length,
      defaultModelId: defaultRow?.model_id ?? "—",
      fallbackEnabled: fallbackRow?.enabled ?? false,
    };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CAT AI 模型 registry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          唯讀檢視（Phase 3A）。僅 Executive 可見；尚不提供啟用、default 或文案編輯。
        </p>
      </div>

      <Alert>
        <AlertTitle>Phase 3A：唯讀模式</AlertTitle>
        <AlertDescription className="text-sm">
          本頁僅 SELECT registry 資料，不寫入資料庫、不提供 sync。後續 Phase 3B–3D 才會加入編輯與同步。
          CAT「AI 管理」入口連結將於 Phase 3E 補上。
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">模型選項總數</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">enabled=true</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.enabledCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">目前 default</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">{summary.defaultModelId}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">fallback（gpt-4.1-mini）</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {summary.fallbackEnabled ? "enabled" : "未 enabled"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>模型清單</CardTitle>
          <CardDescription>
            含 provider 可用性與 GPT-5.5 temperature 提示。production 預期 default 為 gpt-5.5。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              載入中…
            </div>
          )}
          {!loading && error && (
            <Alert variant="destructive">
              <AlertTitle>讀取失敗</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>顯示名稱</TableHead>
                  <TableHead>model_id</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>use_case</TableHead>
                  <TableHead>tier</TableHead>
                  <TableHead className="text-right">sort</TableHead>
                  <TableHead>provider</TableHead>
                  <TableHead>chat</TableHead>
                  <TableHead>responses</TableHead>
                  <TableHead>usage_hint_zh</TableHead>
                  <TableHead>short_label_zh</TableHead>
                  <TableHead>特殊限制</TableHead>
                  <TableHead>updated_at</TableHead>
                  <TableHead>last_seen_at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const flags = getRegistryRowFlags(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.display_name_zh}</TableCell>
                      <TableCell className="font-mono text-xs">{row.model_id}</TableCell>
                      <TableCell>
                        <RegistryBadges row={row} />
                      </TableCell>
                      <TableCell>{row.use_case}</TableCell>
                      <TableCell>{row.tier}</TableCell>
                      <TableCell className="text-right">{row.sort_order}</TableCell>
                      <TableCell>
                        {row.providerAvailable ? (
                          <span className="text-green-700">可用</span>
                        ) : (
                          <span className="text-destructive">不可用</span>
                        )}
                      </TableCell>
                      <TableCell>{row.supports_chat_completions ? "是" : "否"}</TableCell>
                      <TableCell>{row.supports_responses_api ? "是" : "否"}</TableCell>
                      <TableCell className="max-w-[200px] whitespace-normal text-xs">
                        {formatNullableZh(row.usage_hint_zh)}
                      </TableCell>
                      <TableCell className="text-xs">{formatNullableZh(row.short_label_zh)}</TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal text-xs">
                        {flags.omitTemperature ? GPT55_TEMPERATURE_HINT_ZH : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatTs(row.updated_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatTs(row.last_seen_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link to="/settings" className="text-primary underline underline-offset-4">
          返回設定
        </Link>
      </p>
    </div>
  );
}
