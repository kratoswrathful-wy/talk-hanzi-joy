import { useState } from "react";
import { defaultPricingStore } from "@/stores/default-pricing-store";
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
      {/* Client Task Items Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">客戶端計費項目</Label>
          {canEdit && !clientItemsLocked && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" />
              新增項目
            </Button>
          )}
        </div>

        <div className="rounded-lg border-2 border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs w-[25%]">客戶端任務類型</TableHead>
                <TableHead className="text-xs w-[15%]">計費單位</TableHead>
                <TableHead className="text-xs w-[18%]">客戶報價</TableHead>
                <TableHead className="text-xs w-[22%]">計費單位數</TableHead>
                <TableHead className="text-xs text-right w-[20%]">小計</TableHead>
                {canEdit && !clientItemsLocked && <TableHead className="text-xs w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayClientTaskItems.map((item, index) => (
                <TableRow key={item.id} className={clientItemsLocked ? "opacity-50" : ""}>
                  <TableCell>
                    <ColorSelect
                      fieldKey="clientTaskType"
                      value={item.taskType}
                      disabled={!canEdit || clientItemsLocked}
                      onValueChange={(v) => updateItem(item.id, "taskType", v)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <ColorSelect
                      fieldKey="clientBillingUnit"
                      value={item.billingUnit}
                      disabled={!canEdit || clientItemsLocked}
                      onValueChange={(v) => updateItem(item.id, "billingUnit", v)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={clientItemsLocked ? (firstFeePage ? item.clientPrice : "N/A") : item.clientPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "clientPrice", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "clientPrice", e.target.value)}
                      disabled={!canEdit || clientItemsLocked}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={clientItemsLocked ? (firstFeePage ? item.unitCount : "N/A") : item.unitCount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "unitCount", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                      disabled={!canEdit || clientItemsLocked}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-24 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {clientItemsLocked && !firstFeePage
                      ? "N/A"
                      : (Number(item.unitCount) * Number(item.clientPrice)).toLocaleString()}
                  </TableCell>
                  {canEdit && !clientItemsLocked && (
                    <TableCell>
                      {index > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="h-7 w-7" />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-sm font-medium text-right">
                  營收總額
                </TableCell>
                <TableCell className="text-right text-sm font-bold">
                  {clientItemsLocked && !firstFeePage ? "N/A" : revenueTotal.toLocaleString()}
                </TableCell>
                {canEdit && !clientItemsLocked && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-sm font-medium text-right">
                  {clientInfo.sameCase && profitFeeCount > 0
                    ? `利潤（${profitFeeCount} 筆稿費）`
                    : "利潤"}
                </TableCell>
                <TableCell className={`text-right text-sm font-bold ${clientItemsLocked && !firstFeePage ? "" : profit >= 0 ? "text-success" : "text-destructive"}`}>
                  {clientItemsLocked && !firstFeePage ? "N/A" : profit.toLocaleString()}
                </TableCell>
                {canEdit && !clientItemsLocked && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      <Separator />

      {/* 4-quadrant layout */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {/* Left-top: 同一案件組 */}
        <div className="space-y-2">
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
          <div className="flex items-center gap-2 ml-6">
            <Checkbox
              id="isFirstFee"
              checked={clientInfo.isFirstFee}
              disabled={isFirstFeeDisabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  // Check if there's already a firstFee in the group
                  const hasExisting = currentInternalNote && allFees.some(
                    (f) => f.id !== currentFeeId && f.clientInfo?.sameCase && f.clientInfo?.isFirstFee && f.internalNote === currentInternalNote
                  );
                  if (hasExisting) {
                    // First apply the change, then trigger conflict dialog
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

          {/* Related Fees list — shown when sameCase is checked */}
          {clientInfo.sameCase && currentInternalNote && (
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
          {clientInfo.sameCase && !currentInternalNote && (
            <p className="ml-6 mt-2 text-xs text-muted-foreground">請先填寫「相關案件」欄位以比對同案件費用</p>
          )}
        </div>

        {/* Right-top: 財務狀態組 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="reconciled" checked={clientInfo.reconciled} disabled={!canEdit}
              onCheckedChange={(checked) => update("reconciled", !!checked)} />
            <Label htmlFor="reconciled" className="text-xs cursor-pointer whitespace-nowrap">對帳完成</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rateConfirmed" checked={clientInfo.rateConfirmed} disabled={!canEdit}
              onCheckedChange={(checked) => update("rateConfirmed", !!checked)} />
            <Label htmlFor="rateConfirmed" className="text-xs cursor-pointer whitespace-nowrap">費率無誤</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="invoiced" checked={clientInfo.invoiced} disabled={!canEdit}
              onCheckedChange={(checked) => update("invoiced", !!checked)} />
            <Label htmlFor="invoiced" className="text-xs cursor-pointer whitespace-nowrap">請款完成</Label>
          </div>
        </div>

        {/* Left-bottom: 客戶 + 聯絡人 */}
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶</Label>
            <ColorSelect fieldKey="client" value={clientInfo.client} disabled={!canEdit}
              onValueChange={(v) => {
                update("client", v);
                // Auto-fill default client price
                if (v) {
                  const defaultPrice = defaultPricingStore.getPrice("client", v);
                  if (defaultPrice !== undefined) {
                    const updated = clientInfo.clientTaskItems.map((item) =>
                      item.clientPrice === 0 ? { ...item, clientPrice: defaultPrice } : item
                    );
                    onChange({ ...clientInfo, client: v, clientTaskItems: updated });
                  }
                }
              }} placeholder="選擇客戶" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">聯絡人</Label>
            <ColorSelect fieldKey="contact" value={clientInfo.contact} disabled={!canEdit}
              onValueChange={(v) => update("contact", v)} placeholder="選擇聯絡人" />
          </div>
        </div>

        {/* Right-bottom: 客戶端案號 + PO */}
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶端案號或關鍵字</Label>
            <Input
              value={clientInfo.eciKeywords || clientInfo.clientCaseId}
              onChange={(e) => updateMultiple({ eciKeywords: e.target.value, clientCaseId: e.target.value })}
              disabled={!canEdit} placeholder="輸入關鍵字或案號" className="text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶 PO 編號</Label>
            <Input value={clientInfo.clientPoNumber}
              onChange={(e) => update("clientPoNumber", e.target.value)}
              disabled={!canEdit} placeholder="輸入 PO 編號" className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
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
