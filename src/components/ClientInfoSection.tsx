import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { type ClientInfo, type ClientTaskItem, type TaskType, type BillingUnit } from "@/data/fee-mock-data";

interface ClientInfoSectionProps {
  clientInfo: ClientInfo;
  onChange: (info: ClientInfo) => void;
  canEdit: boolean;
  translatorTotal: number;
}

export default function ClientInfoSection({
  clientInfo,
  onChange,
  canEdit,
  translatorTotal,
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

  const revenueTotal = clientInfo.clientTaskItems.reduce(
    (sum, item) => sum + Number(item.unitCount) * Number(item.clientPrice),
    0
  );

  const profit = revenueTotal - translatorTotal;

  // Checkbox 2 (isFirstFee) disabled when: sameCase unchecked, OR notFirstFee checked
  const isFirstFeeDisabled = !canEdit || !clientInfo.sameCase || clientInfo.notFirstFee;
  // Checkbox 3 (notFirstFee) disabled when: sameCase unchecked, OR isFirstFee checked
  const notFirstFeeDisabled = !canEdit || !clientInfo.sameCase || clientInfo.isFirstFee;

  return (
    <div className="space-y-5">
      {/* Client Task Items Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">客戶端計費項目</Label>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={addItem}
            >
              <Plus className="h-3.5 w-3.5" />
              新增項目
            </Button>
          )}
        </div>

        <div className="rounded-lg border-2 border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs">客戶端任務類型</TableHead>
                <TableHead className="text-xs">計費單位</TableHead>
                <TableHead className="text-xs">客戶報價</TableHead>
                <TableHead className="text-xs">計費單位數</TableHead>
                <TableHead className="text-xs text-right">小計</TableHead>
                {canEdit && <TableHead className="text-xs w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientInfo.clientTaskItems.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <ColorSelect
                      fieldKey="clientTaskType"
                      value={item.taskType}
                      disabled={!canEdit || clientInfo.notFirstFee}
                      onValueChange={(v) => updateItem(item.id, "taskType", v)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <ColorSelect
                      fieldKey="clientBillingUnit"
                      value={item.billingUnit}
                      disabled={!canEdit || clientInfo.notFirstFee}
                      onValueChange={(v) => updateItem(item.id, "billingUnit", v)}
                      triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={clientInfo.notFirstFee ? "N/A" : item.clientPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "clientPrice", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "clientPrice", e.target.value)}
                      disabled={!canEdit || clientInfo.notFirstFee}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={clientInfo.notFirstFee ? "N/A" : item.unitCount}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "unitCount", v as any);
                      }}
                      onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                      disabled={!canEdit || clientInfo.notFirstFee}
                      className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-24 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {clientInfo.notFirstFee
                      ? "N/A"
                      : (Number(item.unitCount) * Number(item.clientPrice)).toLocaleString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {index > 0 && !clientInfo.notFirstFee ? (
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
                  營收總計
                </TableCell>
                <TableCell className="text-right text-sm font-bold">
                  {clientInfo.notFirstFee ? "N/A" : revenueTotal.toLocaleString()}
                </TableCell>
                {canEdit && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-sm font-medium text-right">
                  利潤（營收 − 稿費）
                </TableCell>
                <TableCell className={`text-right text-sm font-bold ${clientInfo.notFirstFee ? "" : profit >= 0 ? "text-success" : "text-destructive"}`}>
                  {clientInfo.notFirstFee ? "N/A" : profit.toLocaleString()}
                </TableCell>
                {canEdit && <TableCell />}
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
                  // Show confirmation before unchecking
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
                update("isFirstFee", !!checked);
              }}
            />
            <Label
              htmlFor="isFirstFee"
              className={`text-xs cursor-pointer ${isFirstFeeDisabled ? "text-muted-foreground/50" : ""}`}
            >
              為首筆費用（於總表列入營收統計）
            </Label>
          </div>
          <div className="flex items-center gap-2 ml-6">
            <Checkbox
              id="notFirstFee"
              checked={clientInfo.notFirstFee}
              disabled={notFirstFeeDisabled}
              onCheckedChange={(checked) => {
                update("notFirstFee", !!checked);
              }}
            />
            <Label
              htmlFor="notFirstFee"
              className={`text-xs cursor-pointer ${notFirstFeeDisabled ? "text-muted-foreground/50" : ""}`}
            >
              非首筆費用（於總表不列入營收統計）
            </Label>
          </div>
        </div>

        {/* Right-top: 財務狀態組 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="reconciled"
              checked={clientInfo.reconciled}
              disabled={!canEdit}
              onCheckedChange={(checked) => update("reconciled", !!checked)}
            />
            <Label htmlFor="reconciled" className="text-xs cursor-pointer whitespace-nowrap">
              對帳完成
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rateConfirmed"
              checked={clientInfo.rateConfirmed}
              disabled={!canEdit}
              onCheckedChange={(checked) => update("rateConfirmed", !!checked)}
            />
            <Label htmlFor="rateConfirmed" className="text-xs cursor-pointer whitespace-nowrap">
              費率無誤
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="invoiced"
              checked={clientInfo.invoiced}
              disabled={!canEdit}
              onCheckedChange={(checked) => update("invoiced", !!checked)}
            />
            <Label htmlFor="invoiced" className="text-xs cursor-pointer whitespace-nowrap">
              請款完成
            </Label>
          </div>
        </div>

        {/* Left-bottom: 客戶 + 聯絡人 */}
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶</Label>
            <ColorSelect
              fieldKey="client"
              value={clientInfo.client}
              disabled={!canEdit}
              onValueChange={(v) => update("client", v)}
              placeholder="選擇客戶"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">聯絡人</Label>
            <ColorSelect
              fieldKey="contact"
              value={clientInfo.contact}
              disabled={!canEdit}
              onValueChange={(v) => update("contact", v)}
              placeholder="選擇聯絡人"
            />
          </div>
        </div>

        {/* Right-bottom: 客戶端案號 + PO */}
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶端案號或關鍵字</Label>
            <Input
              value={clientInfo.eciKeywords || clientInfo.clientCaseId}
              onChange={(e) => {
                updateMultiple({ eciKeywords: e.target.value, clientCaseId: e.target.value });
              }}
              disabled={!canEdit}
              placeholder="輸入關鍵字或案號"
              className="text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">客戶 PO 編號</Label>
            <Input
              value={clientInfo.clientPoNumber}
              onChange={(e) => update("clientPoNumber", e.target.value)}
              disabled={!canEdit}
              placeholder="輸入 PO 編號"
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Confirmation dialog for unchecking sameCase */}
      <AlertDialog open={showUncheckWarning} onOpenChange={setShowUncheckWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定取消勾選？</AlertDialogTitle>
            <AlertDialogDescription>
              取消勾選「與他筆費用為同一案件」將會同時清除「為首筆費用」與「非首筆費用」的勾選狀態。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateMultiple({
                  sameCase: false,
                  isFirstFee: false,
                  notFirstFee: false,
                });
              }}
            >
              確定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
