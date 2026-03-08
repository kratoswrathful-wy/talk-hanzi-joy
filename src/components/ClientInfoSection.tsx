import { useState, useRef, useEffect } from "react";
import { Plus, X, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { clientInvoiceStore } from "@/stores/client-invoice-store";
import { useClientInvoices } from "@/hooks/use-client-invoice-store";
import { toast } from "sonner";
import { selectOptionsStore } from "@/stores/select-options-store";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import ColorSelect from "@/components/ColorSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
  /** Called when a client price is first entered (was 0/empty, now has value) */
  onClientPriceEntered?: (itemIndex: number, clientPrice: number, taskType: string, billingUnit: string) => void;
  /** Linked client invoices for this fee */
  linkedClientInvoices?: { id: string; title: string }[];
  /** Whether this fee is listed in any client invoice (locks reconciled) */
  isInClientInvoice?: boolean;
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
  linkedClientInvoices = [],
  onClientPriceEntered,
  isInClientInvoice = false,
}: ClientInfoSectionProps) {
  const navigate = useNavigate();
  const allClientInvoices = useClientInvoices();
  const [showUncheckWarning, setShowUncheckWarning] = useState(false);
  const [showInvoiceNavPrompt, setShowInvoiceNavPrompt] = useState<{ invoiceId: string } | null>(null);
  const invoiceNavPromptRef = useRef<HTMLButtonElement>(null);
  const invoiceNavPromptContainerRef = useRef<HTMLDivElement>(null);
  const clientPriceOnFocusRef = useRef<Record<string, number>>({});

  // Click-outside to dismiss prompt
  useEffect(() => {
    if (!showInvoiceNavPrompt) return;
    const handleClick = (e: MouseEvent) => {
      if (invoiceNavPromptContainerRef.current && !invoiceNavPromptContainerRef.current.contains(e.target as Node)) {
        setShowInvoiceNavPrompt(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showInvoiceNavPrompt]);
  const storeSnapshot = useSyncExternalStore(selectOptionsStore.subscribe, selectOptionsStore.getSnapshot);
  const assigneeOptions = storeSnapshot.assignee.options;

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
    const numVal = Number(cleaned);
    updateItem(itemId, field, numVal);

    // Auto-fill translator price when client price is first entered
    if (field === "clientPrice" && numVal > 0 && onClientPriceEntered) {
      const prevVal = clientPriceOnFocusRef.current[itemId] ?? 0;
      if (!prevVal || prevVal === 0) {
        const itemIndex = clientInfo.clientTaskItems.findIndex((i) => i.id === itemId);
        if (itemIndex >= 0) {
          const item = clientInfo.clientTaskItems[itemIndex];
          onClientPriceEntered(itemIndex, numVal, item.taskType, item.billingUnit);
        }
      }
    }
  };

  const handleClientPriceFocus = (itemId: string) => {
    const item = clientInfo.clientTaskItems.find((i) => i.id === itemId);
    clientPriceOnFocusRef.current[itemId] = item ? Number(item.clientPrice) || 0 : 0;
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
          {/* Row 1: Title + checkboxes + Add button */}
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-3">
              <Label className="text-sm font-medium leading-none">營收內容</Label>
              {linkedClientInvoices.length > 0 && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-muted-foreground leading-none">客戶請款單</span>
                  {linkedClientInvoices.map((inv, idx) => (
                    <span key={inv.id}>
                      <Link to={`/client-invoices/${inv.id}`} className="text-xs text-primary hover:underline leading-none">{inv.title || "未命名"}</Link>
                      {idx < linkedClientInvoices.length - 1 && <span className="text-xs text-muted-foreground">、</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Show "收錄至客戶請款單" when fee can be added to client invoice, otherwise "新增項目" when editing */}
              {(() => {
                const canAddToClientInvoice = clientInfo.client && clientInfo.reconciled && !isInClientInvoice;
                const canAddItem = canEdit && !clientItemsLocked && !clientInfo.reconciled;
                
                // Get existing unpaid invoices for this client
                const existingInvoices = allClientInvoices.filter(
                  (inv) => inv.client === clientInfo.client && inv.status !== "paid"
                );
                
                if (canAddToClientInvoice) {
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          <FileText className="h-3.5 w-3.5" />
                          收錄至客戶請款單
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={async () => {
                            const inv = await clientInvoiceStore.createInvoice(clientInfo.client, [currentFeeId]);
                            if (inv) {
                              toast.success("已收錄至客戶請款單");
                              setShowInvoiceNavPrompt({ invoiceId: inv.id });
                              setTimeout(() => invoiceNavPromptRef.current?.focus(), 100);
                            }
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          新建請款單
                        </DropdownMenuItem>
                        {existingInvoices.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs text-muted-foreground">收錄至現有請款單</DropdownMenuLabel>
                            {existingInvoices.map((inv) => (
                              <DropdownMenuItem
                                key={inv.id}
                                onClick={async () => {
                                  await clientInvoiceStore.addFeesToInvoice(inv.id, [currentFeeId]);
                                  toast.success("已收錄至客戶請款單");
                                  setShowInvoiceNavPrompt({ invoiceId: inv.id });
                                  setTimeout(() => invoiceNavPromptRef.current?.focus(), 100);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                {inv.title || inv.client} — {inv.feeIds.length} 筆
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }
                
                if (canAddItem) {
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={addItem}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新增項目
                    </Button>
                  );
                }
                
                return null;
              })()}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="reconciled"
                      checked={clientInfo.reconciled}
                      disabled={isInClientInvoice || !clientInfo.client}
                      onCheckedChange={(checked) => update("reconciled", !!checked)}
                    />
                    <Label htmlFor="reconciled" className={`text-xs cursor-pointer whitespace-nowrap ${isInClientInvoice || !clientInfo.client ? 'text-muted-foreground/50' : ''}`}>對帳完成</Label>
                  </div>
                </TooltipTrigger>
                {!clientInfo.client && <TooltipContent>客戶欄為空白，無法對帳</TooltipContent>}
                {clientInfo.client && isInClientInvoice && <TooltipContent>此費用已列入客戶請款單，無法修改對帳狀態</TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="invoiced"
                      checked={clientInfo.invoiced || isInClientInvoice}
                      disabled={isInClientInvoice || !clientInfo.reconciled}
                      onCheckedChange={(checked) => update("invoiced", !!checked)}
                    />
                    <Label htmlFor="invoiced" className={`text-xs cursor-pointer whitespace-nowrap ${isInClientInvoice || !clientInfo.reconciled ? 'text-muted-foreground/50' : ''}`}>請款完成</Label>
                  </div>
                </TooltipTrigger>
                {!clientInfo.reconciled && !isInClientInvoice && <TooltipContent>尚未對帳完成，無法請款</TooltipContent>}
                {isInClientInvoice && <TooltipContent>此費用已列入客戶請款單，不得修改請款狀態</TooltipContent>}
              </Tooltip>
            </div>
          </div>

          {/* Client invoice navigation prompt */}
          {showInvoiceNavPrompt && (
            <div ref={invoiceNavPromptContainerRef} className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs text-foreground">是否前往客戶請款單？（按空白鍵或點選按鈕前往，或點選畫面任意處取消）</span>
              <Button
                ref={invoiceNavPromptRef}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => {
                  const invId = showInvoiceNavPrompt.invoiceId;
                  setShowInvoiceNavPrompt(null);
                  navigate(`/client-invoices/${invId}`);
                }}
              >
                前往請款單
              </Button>
            </div>
          )}
          {/* Row 2: sameCase (left) + dispatch route (right) */}
          <div className="flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sameCase"
                    checked={clientInfo.sameCase}
                    disabled={!canEdit || clientInfo.reconciled}
                    onCheckedChange={(checked) => {
                      if (!checked && clientInfo.sameCase) {
                        setShowUncheckWarning(true);
                      } else {
                        update("sameCase", !!checked);
                      }
                    }}
                  />
                  <Label htmlFor="sameCase" className="text-xs cursor-pointer whitespace-nowrap">
                    費用群組（勾選後系統會自動以「相關案件」相同者判定群組所屬費用）
                  </Label>
                </div>
              </TooltipTrigger>
              {clientInfo.reconciled && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">派案途徑</Label>
                  <ColorSelect
                    fieldKey="dispatchRoute"
                    value={clientInfo.dispatchRoute || ""}
                    onValueChange={(v) => update("dispatchRoute", v)}
                    triggerClassName="h-7 text-xs min-w-[90px]"
                    placeholder="選擇"
                    disabled={clientInfo.reconciled}
                  />
                </div>
              </TooltipTrigger>
              {clientInfo.reconciled && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
            </Tooltip>
          </div>

          {/* Sub-options for sameCase - immediately below parent */}
          {clientInfo.sameCase && (
            <>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 ml-6">
                  <Checkbox
                    id="isFirstFee"
                    checked={clientInfo.isFirstFee}
                    disabled={isFirstFeeDisabled || clientInfo.reconciled}
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
                    disabled={notFirstFeeDisabled || clientInfo.reconciled}
                    onCheckedChange={(checked) => update("notFirstFee", !!checked)}
                  />
                  <Label
                    htmlFor="notFirstFee"
                    className={`text-xs cursor-pointer ${notFirstFeeDisabled ? "text-muted-foreground/50" : ""}`}
                  >
                    非主要營收紀錄（於總表不列入營收統計）
                  </Label>
                </div>
              </div>

              {/* Related Fees list */}
              {currentInternalNote && (
                <div className="ml-6 mt-1">
                  <Label className="text-xs text-muted-foreground">
                    同案件費用頁面（{relatedFees.length} 筆）
                  </Label>
                  {relatedFees.length > 0 ? (
                    <div className="space-y-1 mt-1">
                      {relatedFees.map((f) => {
                        const assigneeOpt = assigneeOptions.find((o) => o.email === f.assignee);
                        const assigneeLabel = assigneeOpt?.label || f.assignee || "—";
                        const assigneeAvatar = assigneeOpt?.avatarUrl;
                        return (
                          <Link
                            key={f.id}
                            to={`/fees/${f.id}`}
                            className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-foreground font-medium truncate">
                                {f.title || "（未命名）"}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Avatar className="h-4 w-4">
                                  {assigneeAvatar && <AvatarImage src={assigneeAvatar} alt={assigneeLabel} />}
                                  <AvatarFallback className="text-[8px]">
                                    {assigneeLabel.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-muted-foreground text-[11px]">{assigneeLabel}</span>
                              </div>
                            </div>
                            <span className="text-muted-foreground shrink-0 ml-2">
                              {f.clientInfo?.isFirstFee ? "主要" : f.clientInfo?.notFirstFee ? "非主要" : "—"}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">無相關費用頁面</p>
                  )}
                </div>
              )}
              {!currentInternalNote && (
                <p className="ml-6 mt-1 text-xs text-muted-foreground">請先填寫「相關案件」欄位以比對同案件費用</p>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>客戶端任務類型</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>計費單位</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>客戶報價</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>計費單位數</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>小計</TableHead>
                <TableHead className="text-xs text-center" style={{ width: '8%' }}>刪除</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayClientTaskItems.map((item, index) => (
                <TableRow key={item.id} className={clientItemsLocked ? "opacity-50" : ""}>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <ColorSelect
                            fieldKey="taskType"
                            value={item.taskType}
                            onValueChange={(v) => updateItem(item.id, "taskType", v as TaskType)}
                            triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                            disabled={clientItemsLocked || clientInfo.reconciled}
                          />
                        </div>
                      </TooltipTrigger>
                      {clientInfo.reconciled && !clientItemsLocked && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <ColorSelect
                            fieldKey="billingUnit"
                            value={item.billingUnit}
                            onValueChange={(v) => updateItem(item.id, "billingUnit", v as BillingUnit)}
                            triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                            disabled={clientItemsLocked || clientInfo.reconciled}
                          />
                        </div>
                      </TooltipTrigger>
                      {clientInfo.reconciled && !clientItemsLocked && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.clientPrice}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "clientPrice", v as any);
                            }}
                            onFocus={() => handleClientPriceFocus(item.id)}
                            onBlur={(e) => handleNumberBlur(item.id, "clientPrice", e.target.value)}
                            className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                            disabled={clientItemsLocked || clientInfo.reconciled}
                          />
                        </div>
                      </TooltipTrigger>
                      {clientInfo.reconciled && !clientItemsLocked && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.unitCount}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^[0-9]*\.?[0-9]*$/.test(v)) updateItem(item.id, "unitCount", v as any);
                            }}
                            onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                            className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                            disabled={clientItemsLocked || clientInfo.reconciled}
                          />
                        </div>
                      </TooltipTrigger>
                      {clientInfo.reconciled && !clientItemsLocked && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {clientInfo.notFirstFee ? <span className="text-muted-foreground">N/A</span> : (Number(item.unitCount) * Number(item.clientPrice)).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-2">
                    <div className="flex justify-center">
                      {canEdit && !clientInfo.reconciled && !clientItemsLocked && clientInfo.clientTaskItems.length > 1 ? (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="px-[18px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap min-w-[3rem]">關鍵字</Label>
                        <Input
                          value={clientInfo.clientCaseId}
                          onChange={(e) => update("clientCaseId", e.target.value)}
                          placeholder="客戶端案號或關鍵字"
                          disabled={!canEdit || clientInfo.reconciled}
                          className="h-7 text-xs bg-transparent border-0 shadow-none px-0 w-full"
                        />
                      </div>
                    </TooltipTrigger>
                    {clientInfo.reconciled && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                  </Tooltip>
                </TableCell>
                <TableCell className="text-sm font-medium text-right">
                  營收總額
                </TableCell>
                <TableCell className="text-right text-sm font-bold tabular-nums">
                  <Tooltip><TooltipTrigger asChild>
                    <span className="cursor-default">{clientItemsLocked && !firstFeePage ? "N/A" : revenueTotal.toLocaleString()}</span>
                  </TooltipTrigger><TooltipContent className="text-xs">自動計算/填入</TooltipContent></Tooltip>
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="px-[18px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap min-w-[3rem]">PO #</Label>
                        <Input
                          value={clientInfo.clientPoNumber}
                          onChange={(e) => update("clientPoNumber", e.target.value)}
                          placeholder="客戶PO編號"
                          disabled={!canEdit || clientInfo.reconciled}
                          className="h-7 text-xs bg-transparent border-0 shadow-none px-0 w-full"
                        />
                      </div>
                    </TooltipTrigger>
                    {clientInfo.reconciled && <TooltipContent>已對帳完成，不得修改營收內容</TooltipContent>}
                  </Tooltip>
                </TableCell>
                <TableCell className="text-sm font-medium text-right">
                  {clientInfo.sameCase && profitFeeCount > 0
                    ? `利潤（${profitFeeCount} 筆稿費）`
                    : "利潤"}
                </TableCell>
                <TableCell className={`text-right text-sm font-bold ${clientItemsLocked && !firstFeePage ? "" : profit >= 0 ? "text-success" : "text-destructive"}`}>
                  <Tooltip><TooltipTrigger asChild>
                    <span className="cursor-default">{clientItemsLocked && !firstFeePage ? "N/A" : profit.toLocaleString()}</span>
                  </TooltipTrigger><TooltipContent className="text-xs">自動計算/填入</TooltipContent></Tooltip>
                </TableCell>
                <TableCell />
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
              取消勾選「費用群組」將會同時清除「主要營收紀錄」與「非主要營收紀錄」的勾選狀態。
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
