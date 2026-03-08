import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FileText, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { clientInvoiceStore } from "@/stores/client-invoice-store";
import { useClientInvoices } from "@/hooks/use-client-invoice-store";
import { type TranslatorFee } from "@/data/fee-mock-data";
import { toast } from "sonner";

interface ClientInvoiceActionsProps {
  selectedFees: TranslatorFee[];
  onDone: () => void;
}

interface ValidationIssue {
  feeId: string;
  feeTitle: string;
  reason: string;
}

export function ClientInvoiceActions({ selectedFees, onDone }: ClientInvoiceActionsProps) {
  const navigate = useNavigate();
  const clientInvoices = useClientInvoices();
  const [showMultiConfirm, setShowMultiConfirm] = useState(false);
  const [showValidationWarning, setShowValidationWarning] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  const linkedFeeIds = clientInvoiceStore.getLinkedFeeIds();

  // Get unique clients from selected fees
  const clients = [...new Set(selectedFees.map((f) => f.clientInfo?.client).filter(Boolean))] as string[];
  const isSingleClient = clients.length === 1;
  const isMultiClient = clients.length > 1;

  // Validation: check which fees have issues
  const getValidationIssues = (): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (const fee of selectedFees) {
      if (!fee.clientInfo?.client) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "客戶欄為空白，無法請款",
        });
      } else if (!fee.clientInfo?.reconciled) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "尚未對帳完成，無法請款",
        });
      } else if (linkedFeeIds.has(fee.id)) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "已收錄於其他客戶請款單",
        });
      }
    }
    return issues;
  };

  // Filter eligible fees: must have client, reconciled, and not linked
  const eligibleFees = selectedFees.filter(
    (f) =>
      f.clientInfo?.client &&
      f.clientInfo?.reconciled &&
      !linkedFeeIds.has(f.id)
  );

  const eligibleClients = [...new Set(eligibleFees.map((f) => f.clientInfo?.client))] as string[];

  // Existing invoices for the client (single select)
  const clientInvoicesList = isSingleClient
    ? clientInvoices.filter((inv) => inv.client === clients[0] && inv.status !== "paid")
    : [];

  const handleActionClick = () => {
    const issues = getValidationIssues();
    if (issues.length > 0) {
      setValidationIssues(issues);
      setShowValidationWarning(true);
    }
  };

  const handleCreateNew = async () => {
    if (!isSingleClient) return;
    const feeIds = eligibleFees.map((f) => f.id);
    if (feeIds.length === 0) {
      handleActionClick();
      return;
    }
    const inv = await clientInvoiceStore.createInvoice(clients[0], feeIds);
    if (inv) {
      toast.success("已建立客戶請款單");
      navigate(`/client-invoices/${inv.id}`);
    }
    onDone();
  };

  const handleAddToExisting = async (invoiceId: string) => {
    const feeIds = eligibleFees.map((f) => f.id);
    if (feeIds.length === 0) {
      handleActionClick();
      return;
    }
    await clientInvoiceStore.addFeesToInvoice(invoiceId, feeIds);
    toast.success("已收錄至客戶請款單");
    onDone();
  };

  const handleBatchClick = () => {
    const issues = getValidationIssues();
    if (issues.length > 0 && eligibleFees.length === 0) {
      setValidationIssues(issues);
      setShowValidationWarning(true);
    } else if (issues.length > 0) {
      // Show warning but allow to proceed with eligible fees
      setValidationIssues(issues);
      setShowValidationWarning(true);
    } else {
      setShowMultiConfirm(true);
    }
  };

  const handleProceedWithEligible = () => {
    setShowValidationWarning(false);
    if (eligibleFees.length > 0) {
      setShowMultiConfirm(true);
    }
  };

  const handleBatchCreate = async () => {
    // Group eligible fees by client
    const byClient = new Map<string, string[]>();
    for (const fee of eligibleFees) {
      const client = fee.clientInfo?.client;
      if (!client) continue;
      const arr = byClient.get(client) || [];
      arr.push(fee.id);
      byClient.set(client, arr);
    }

    let count = 0;
    for (const [client, feeIds] of byClient) {
      const inv = await clientInvoiceStore.createInvoice(client, feeIds);
      if (inv) count++;
    }

    toast.success(`已為 ${count} 個客戶建立請款單`);
    setShowMultiConfirm(false);
    onDone();
  };

  if (selectedFees.length === 0) return null; // handled by parent

  // Single client: dropdown with new + existing options
  if (isSingleClient) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <FileText className="h-4 w-4" />
              客戶請款
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCreateNew}>
              <FilePlus className="h-4 w-4 mr-2" />
              新建客戶請款單
            </DropdownMenuItem>
            {clientInvoicesList.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">收錄至現有請款單</DropdownMenuLabel>
                {clientInvoicesList.map((inv) => (
                  <DropdownMenuItem key={inv.id} onClick={() => handleAddToExisting(inv.id)}>
                    <FileText className="h-4 w-4 mr-2" />
                    {inv.client} — {inv.feeIds.length} 筆
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={showValidationWarning} onOpenChange={setShowValidationWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>部分項目無法處理</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>以下項目不符合客戶請款條件：</p>
                  <ul className="list-disc pl-5 space-y-1.5 max-h-60 overflow-y-auto">
                    {validationIssues.map((issue) => (
                      <li key={issue.feeId} className="text-sm">
                        <Link
                          to={`/fees/${issue.feeId}`}
                          className="text-primary hover:underline font-medium"
                          onClick={() => setShowValidationWarning(false)}
                        >
                          {issue.feeTitle}
                        </Link>
                        <span className="text-muted-foreground ml-1">— {issue.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>關閉</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Multi client: only batch create option
  if (isMultiClient) {
    const skippedCount = selectedFees.length - eligibleFees.length;

    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9"
          onClick={handleBatchClick}
        >
          <FileText className="h-4 w-4" />
          客戶批次請款
        </Button>

        <AlertDialog open={showValidationWarning} onOpenChange={setShowValidationWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>部分項目無法處理</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>以下項目不符合客戶請款條件：</p>
                  <ul className="list-disc pl-5 space-y-1.5 max-h-60 overflow-y-auto">
                    {validationIssues.map((issue) => (
                      <li key={issue.feeId} className="text-sm">
                        <Link
                          to={`/fees/${issue.feeId}`}
                          className="text-primary hover:underline font-medium"
                          onClick={() => setShowValidationWarning(false)}
                        >
                          {issue.feeTitle}
                        </Link>
                        <span className="text-muted-foreground ml-1">— {issue.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {eligibleFees.length > 0 && (
                    <p className="text-sm font-medium">
                      仍有 {eligibleFees.length} 筆可處理項目，是否繼續？
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              {eligibleFees.length > 0 && (
                <AlertDialogAction onClick={handleProceedWithEligible}>
                  繼續處理 {eligibleFees.length} 筆
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showMultiConfirm} onOpenChange={setShowMultiConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>批次建立客戶請款單</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    即將為以下 {eligibleClients.length} 個客戶各建立一張請款單：
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {eligibleClients.map((c) => {
                      const count = eligibleFees.filter((f) => f.clientInfo?.client === c).length;
                      return (
                        <li key={c} className="text-sm">
                          <span className="font-medium">{c}</span>
                          <span className="text-muted-foreground ml-1">（{count} 筆費用）</span>
                        </li>
                      );
                    })}
                  </ul>
                  {skippedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ※ 已自動排除 {skippedCount} 筆（已收錄於其他請款單或尚未對帳完成的項目）
                    </p>
                  )}
                  <p className="text-sm">是否確定？</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleBatchCreate}>確定建立</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // No client on any selected fee - still show button but trigger validation warning
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9"
        onClick={handleActionClick}
      >
        <FileText className="h-4 w-4" />
        客戶請款
      </Button>

      <AlertDialog open={showValidationWarning} onOpenChange={setShowValidationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>無法處理</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>以下項目不符合客戶請款條件：</p>
                <ul className="list-disc pl-5 space-y-1.5 max-h-60 overflow-y-auto">
                  {validationIssues.map((issue) => (
                    <li key={issue.feeId} className="text-sm">
                      <Link
                        to={`/fees/${issue.feeId}`}
                        className="text-primary hover:underline font-medium"
                        onClick={() => setShowValidationWarning(false)}
                      >
                        {issue.feeTitle}
                      </Link>
                      <span className="text-muted-foreground ml-1">— {issue.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>關閉</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
