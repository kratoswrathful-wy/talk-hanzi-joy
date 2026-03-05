import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import ColorSelect from "@/components/ColorSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { type ClientInfo, type ClientTaskItem, type TaskType, type BillingUnit, type TranslatorFee } from "@/data/fee-mock-data";

interface ClientInfoSectionProps {
  clientInfo: ClientInfo;
  onChange: (info: ClientInfo) => void;
  canEdit: boolean;
  translatorTotal: number;
  allFees: TranslatorFee[];
  currentFeeId: string;
  currentInternalNote: string;
  onFirstFeeConflict?: () => void;
}

export default function ClientInfoSection({
  clientInfo,
  onChange,
  canEdit,
  translatorTotal,
  allFees,
  currentFeeId,
  currentInternalNote,
  onFirstFeeConflict,
}: ClientInfoSectionProps) {
  const [showUncheckWarning, setShowUncheckWarning] = useState(false);

  const update = <K extends keyof ClientInfo>(key: K, value: ClientInfo[K]) => {
    onChange({ ...clientInfo, [key]: value });
  };

  const updateMultiple = (updates: Partial<ClientInfo>) => {
    onChange({ ...clientInfo, ...updates });
  };

  const updateItem = (id: string, field: keyof ClientTaskItem, value: any) => {
    update(
      "clientTaskItems",
      clientInfo.clientTaskItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => {
    update("clientTaskItems", [
      ...clientInfo.clientTaskItems,
      {
        id: `ci-${Date.now()}`,
        taskType: "翻譯" as TaskType,
        billingUnit: "字" as BillingUnit,
        unitCount: 0,
        clientPrice: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (clientInfo.clientTaskItems.length <= 1) return;
    update(
      "clientTaskItems",
      clientInfo.clientTaskItems.filter((i) => i.id !== id)
    );
  };

  const handleNumberBlur = (itemId: string, field: "clientPrice" | "unitCount", rawValue: string) => {
    let cleaned = rawValue.replace(/^0+(\d)/, "$1");
    if (cleaned.startsWith(".")) cleaned = "0" + cleaned;
    if (cleaned === "" || cleaned === "0.") cleaned = "0";
    updateItem(itemId, field, Number(cleaned));
  };

  // Related fees: same internalNote, sameCase=true, excluding current
  const relatedFees = clientInfo.sameCase && currentInternalNote
    ? allFees.filter(
        (f) =>
          f.id !== currentFeeId &&
          f.clientInfo?.sameCase &&
          f.internalNote === currentInternalNote
      )
    : [];

  // Find the "first fee" page among related fees
  const firstFeePage = relatedFees.find((f) => f.clientInfo?.isFirstFee);

  // For notFirstFee pages, display the firstFeePage's client task items
  const displayClientTaskItems = clientInfo.notFirstFee && firstFeePage?.clientInfo
    ? firstFeePage.clientInfo.clientTaskItems
    : clientInfo.clientTaskItems;

  const revenueTotal = clientInfo.notFirstFee
    ? (firstFeePage?.clientInfo?.clientTaskItems.reduce(
        (sum, item) => sum + Number(item.unitCount) * Number(item.clientPrice), 0
      ) ?? 0)
    : clientInfo.clientTaskItems.reduce(
        (sum, item) => sum + Number(item.unitCount) * Number(item.clientPrice), 0
      );

  // All fees in the same case group (including current)
  const allSameCaseFees = clientInfo.sameCase && currentInternalNote
    ? allFees.filter(
        (f) =>
          f.clientInfo?.sameCase &&
          f.internalNote === currentInternalNote
      )
    : [];

  const totalTranslatorCost = clientInfo.sameCase
    ? allSameCaseFees.reduce((sum, f) => {
        return sum + f.taskItems.reduce(
          (s, item) => s + Number(item.unitCount) * Number(item.unitPrice), 0
        );
      }, 0)
    : translatorTotal;

  const profitFeeCount = allSameCaseFees.length;
  const profit = revenueTotal - totalTranslatorCost;

  const isFirstFeeDisabled = !canEdit || !clientInfo.sameCase || clientInfo.notFirstFee;
  const notFirstFeeDisabled = !canEdit || !clientInfo.sameCase || clientInfo.isFirstFee;
  const clientItemsLocked = clientInfo.notFirstFee;

  return (
    <div className="space-y-5">
      {/* Client Task Items Section */}
      <div className="space-y-3">
        <div className="space-y-1">
          {/* Row 1: Title + Add button */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">客戶端計費項目</Label>
            {canEdit && !clientItemsLocked && (
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" />
                新增項目
              </Button>
            )}
          </div>

          {/* Row 2: sameCase (left) + dispatch route (right) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sameCase"
                checked={clientInfo.sameCase}
                disabled={!canEdit}
                onCheckedChange={(checked) => {
                  if (!checked && clientInfo.sameCase) {
                    setShowUncheckWarning(true);
                  } else {
                    update("sameCase", !!checked);
                  }
                }}
              />
              <Label htmlFor="sameCase" className="text-xs cursor-pointer whitespace-nowrap">
                與他筆費用為同一案件
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">派案途徑</Label>
              <ColorSelect
                fieldKey="dispatchRoute"
                value={clientInfo.dispatchRoute || ""}
                onValueChange={(v) => update("dispatchRoute", v)}
                triggerClassName="h-7 text-xs min-w-[90px]"
                placeholder="選擇"
              />
            </div>
          </div>

          {/* Row 3: reconciled/invoiced (right-aligned) */}
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="reconciled"
                  checked={clientInfo.reconciled}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => update("reconciled", !!checked)}
                />
                <Label htmlFor="reconciled" className="text-xs cursor-pointer whitespace-nowrap">對帳完成</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="invoiced"
                  checked={clientInfo.invoiced}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => update("invoiced", !!checked)}
                />
                <Label htmlFor="invoiced" className="text-xs cursor-pointer whitespace-nowrap">請款完成</Label>
              </div>
            </div>
          </div>

          {/* Sub-options for sameCase */}
          {clientInfo.sameCase && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 ml-6">
                <Checkbox
                  id="isFirstFee"
                  checked={clientInfo.isFirstFee}
                  disabled={isFirstFeeDisabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const hasExisting = currentInternalNote && allFees.some(
                        (f) => f.id !== currentFeeId && f.clientInfo?.sameCase && f.clientInfo?.isFirstFee && f.internalNote === currentInternalNote
                      );
                      if (hasExisting) {
                        update("isFirstFee", true);
                        onFirstFeeConflict?.();
                        return;
                      }
                    }
                    update("isFirstFee", !!checked);
                  }}
                />
                <Label
                  htmlFor="isFirstFee"
                  className={`text-xs cursor-pointer ${isFirstFeeDisabled ? "text-muted-foreground/50" : ""}`}
                >
                  為主要營收紀錄（於總表列入營收統計）
                </Label>
              </div>
              <div className="flex items-center gap-2 ml-6">
                <Checkbox
                  id="notFirstFee"
                  checked={clientInfo.notFirstFee}
                  disabled={notFirstFeeDisabled}
                  onCheckedChange={(checked) => update("notFirstFee", !!checked)}
                />
                <Label
                  htmlFor="notFirstFee"
                  className={`text-xs cursor-pointer ${notFirstFeeDisabled ? "text-muted-foreground/50" : ""}`}
                >
                  非主要營收紀錄（於總表不列入營收統計）
                </Label>
              </div>

              {/* Related Fees list */}
              {currentInternalNote && (
                <div className="ml-6 mt-2">
                  <Label className="text-xs text-muted-foreground">
                    同案件費用頁面（{relatedFees.length} 筆）
                  </Label>
                  {relatedFees.length > 0 ? (
                    <div className="space-y-1 mt-1">
                      {relatedFees.map((f) => (
                        <Link
                          key={f.id}
                          to={`/fees/${f.id}`}
                          className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                        >
                          <span className="text-foreground font-medium truncate">
                            {f.title || "（未命名）"}
                          </span>
                          <span className="text-muted-foreground shrink-0 ml-2">
                            {f.clientInfo?.isFirstFee ? "主要" : f.clientInfo?.notFirstFee ? "非主要" : "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">無相關費用頁面</p>
                  )}
                </div>
              )}
              {!currentInternalNote && (
                <p className="ml-6 mt-2 text-xs text-muted-foreground">請先填寫「相關案件」欄位以比對同案件費用</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs text-center" style={{ width: '20%' }}>客戶端任務類型</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '14%' }}>計費單位</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '16%' }}>客戶報價</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '18%' }}>計費單位數</TableHead>
                <TableHead className="text-xs text-right" style={{ width: '16%' }}>小計</TableHead>
                {canEdit && <TableHead className="text-xs" style={{ width: '16%' }} />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayClientTaskItems.map((item, index) => (
                <TableRow key={item.id} className={clientItemsLocked ? "opacity-50" : ""}>
                  <TableCell className="text-center">
                    <ColorSelect
                      fieldKey="clientTaskType"
                      value={item.taskType}
                      onValueChange={(v) => updateItem(item.id, "taskType", v as TaskType)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                      disabled={clientItemsLocked}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <ColorSelect
                      fieldKey="clientBillingUnit"
                      value={item.billingUnit}
                      onValueChange={(v) => updateItem(item.id, "billingUnit", v as BillingUnit)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                      disabled={clientItemsLocked}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.clientPrice || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "clientPrice", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "clientPrice", e.target.value)}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                      disabled={clientItemsLocked}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.unitCount || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "unitCount", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                      disabled={clientItemsLocked}
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {(Number(item.unitCount) * Number(item.clientPrice)).toLocaleString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right px-6">
                      {!clientItemsLocked && index > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="h-7 w-7 ml-auto" />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="px-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">關鍵字</Label>
                    <Input
                      value={clientInfo.clientCaseId}
                      onChange={(e) => update("clientCaseId", e.target.value)}
                      placeholder="客戶端案號或關鍵字"
                      disabled={!canEdit}
                      className="h-7 text-xs bg-transparent border-0 shadow-none px-0 w-full"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium text-right">
                  營收總額
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right text-sm font-bold tabular-nums px-6">
                    {clientItemsLocked && !firstFeePage ? "N/A" : revenueTotal.toLocaleString()}
                  </TableCell>
                ) : (
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {clientItemsLocked && !firstFeePage ? "N/A" : revenueTotal.toLocaleString()}
                  </TableCell>
                )}
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="px-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">PO #</Label>
                    <Input
                      value={clientInfo.clientPoNumber}
                      onChange={(e) => update("clientPoNumber", e.target.value)}
                      placeholder="客戶PO編號"
                      disabled={!canEdit}
                      className="h-7 text-xs bg-transparent border-0 shadow-none px-0 w-full"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium text-right">
                  {clientInfo.sameCase && profitFeeCount > 0
                    ? `利潤（${profitFeeCount} 筆稿費）`
                    : "利潤"}
                </TableCell>
                {canEdit ? (
                  <TableCell className={`text-right text-sm font-bold px-6 ${clientItemsLocked && !firstFeePage ? "" : profit >= 0 ? "text-success" : "text-destructive"}`}>
                    {clientItemsLocked && !firstFeePage ? "N/A" : profit.toLocaleString()}
                  </TableCell>
                ) : (
                  <TableCell className={`text-right text-sm font-bold ${clientItemsLocked && !firstFeePage ? "" : profit >= 0 ? "text-success" : "text-destructive"}`}>
                    {clientItemsLocked && !firstFeePage ? "N/A" : profit.toLocaleString()}
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>


      <AlertDialog open={showUncheckWarning} onOpenChange={setShowUncheckWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定取消勾選？</AlertDialogTitle>
            <AlertDialogDescription>
              取消勾選「與他筆費用為同一案件」將會同時清除「主要營收紀錄」與「非主要營收紀錄」的勾選狀態。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => updateMultiple({ sameCase: false, isFirstFee: false, notFirstFee: false })}
            >
              確定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
