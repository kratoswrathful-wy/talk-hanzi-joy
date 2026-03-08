import { useState, useEffect } from "react";
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
import { invoiceStore } from "@/stores/invoice-store";
import { useInvoices } from "@/hooks/use-invoice-store";
import { type TranslatorFee } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvoiceActionsProps {
  selectedFees: TranslatorFee[];
  onDone: () => void;
}

interface TranslatorSetting {
  email: string;
  no_fee: boolean;
}

interface ValidationIssue {
  feeId: string;
  feeTitle: string;
  reason: string;
}

export function InvoiceActions({ selectedFees, onDone }: InvoiceActionsProps) {
  const navigate = useNavigate();
  const invoices = useInvoices();
  const [translatorSettings, setTranslatorSettings] = useState<TranslatorSetting[]>([]);
  const [showMultiConfirm, setShowMultiConfirm] = useState(false);
  const [showValidationWarning, setShowValidationWarning] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  // Load translator settings to filter no_fee
  useEffect(() => {
    supabase
      .from("member_translator_settings")
      .select("email, no_fee")
      .then(({ data }) => {
        if (data) setTranslatorSettings(data);
      });
  }, []);

  const linkedFeeIds = invoiceStore.getLinkedFeeIds();

  // Get unique translators from selected fees
  const translators = [...new Set(selectedFees.map((f) => f.assignee).filter(Boolean))];
  const isSingleTranslator = translators.length === 1;
  const isMultiTranslator = translators.length > 1;

  // No-fee translator emails
  const noFeeEmails = new Set(translatorSettings.filter((s) => s.no_fee).map((s) => s.email));

  // Validation: check which fees have issues
  const getValidationIssues = (): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (const fee of selectedFees) {
      if (!fee.assignee) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "譯者欄為空白，無法請款",
        });
      } else if (fee.status !== "finalized") {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "尚未開立完成",
        });
      } else if (linkedFeeIds.has(fee.id)) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "已收錄於其他稿費請款單",
        });
      } else if (noFeeEmails.has(fee.assignee)) {
        issues.push({
          feeId: fee.id,
          feeTitle: fee.title || "未命名稿費單",
          reason: "此譯者為不開單譯者",
        });
      }
    }
    return issues;
  };

  // Filter eligible fees
  const eligibleFees = selectedFees.filter(
    (f) =>
      f.assignee &&
      f.status === "finalized" &&
      !linkedFeeIds.has(f.id) &&
      !noFeeEmails.has(f.assignee)
  );

  const eligibleTranslators = [...new Set(eligibleFees.map((f) => f.assignee))];

  // Existing invoices for the translator (single select)
  const translatorInvoices = isSingleTranslator
    ? invoices.filter((inv) => inv.translator === translators[0] && inv.status !== "paid")
    : [];

  const handleActionClick = () => {
    const issues = getValidationIssues();
    if (issues.length > 0) {
      setValidationIssues(issues);
      setShowValidationWarning(true);
    }
  };

  const handleCreateNew = async () => {
    if (!isSingleTranslator) return;
    const feeIds = eligibleFees.map((f) => f.id);
    if (feeIds.length === 0) {
      handleActionClick();
      return;
    }
    const inv = await invoiceStore.createInvoice(translators[0], feeIds);
    if (inv) {
      toast.success("已建立請款單");
      navigate(`/invoices/${inv.id}`);
    }
    onDone();
  };

  const handleAddToExisting = async (invoiceId: string) => {
    const feeIds = eligibleFees.map((f) => f.id);
    if (feeIds.length === 0) {
      handleActionClick();
      return;
    }
    await invoiceStore.addFeesToInvoice(invoiceId, feeIds);
    toast.success("已收錄至請款單");
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
    // Group eligible fees by translator
    const byTranslator = new Map<string, string[]>();
    for (const fee of eligibleFees) {
      const arr = byTranslator.get(fee.assignee) || [];
      arr.push(fee.id);
      byTranslator.set(fee.assignee, arr);
    }

    let count = 0;
    for (const [translator, feeIds] of byTranslator) {
      const inv = await invoiceStore.createInvoice(translator, feeIds);
      if (inv) count++;
    }

    toast.success(`已為 ${count} 位譯者建立請款單`);
    setShowMultiConfirm(false);
    onDone();
  };

  if (selectedFees.length === 0) return null; // handled by parent

  // Single translator: dropdown with new + existing options
  if (isSingleTranslator) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <FileText className="h-4 w-4" />
              譯者請款
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCreateNew}>
              <FilePlus className="h-4 w-4 mr-2" />
              新建請款單
            </DropdownMenuItem>
            {translatorInvoices.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">收錄至現有請款單</DropdownMenuLabel>
                {translatorInvoices.map((inv) => (
                  <DropdownMenuItem key={inv.id} onClick={() => handleAddToExisting(inv.id)}>
                    <FileText className="h-4 w-4 mr-2" />
                    {inv.translator} — {inv.feeIds.length} 筆
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
                  <p>以下項目不符合譯者請款條件：</p>
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

  // Multi translator: only batch create option
  if (isMultiTranslator) {
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
          譯者批次請款
        </Button>

        <AlertDialog open={showValidationWarning} onOpenChange={setShowValidationWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>部分項目無法處理</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>以下項目不符合譯者請款條件：</p>
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
              <AlertDialogTitle>批次建立譯者請款單</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    即將為以下 {eligibleTranslators.length} 位譯者各建立一張請款單：
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {eligibleTranslators.map((t) => {
                      const count = eligibleFees.filter((f) => f.assignee === t).length;
                      return (
                        <li key={t} className="text-sm">
                          <span className="font-medium">{t}</span>
                          <span className="text-muted-foreground ml-1">（{count} 筆費用）</span>
                        </li>
                      );
                    })}
                  </ul>
                  {skippedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ※ 已自動排除 {skippedCount} 筆（已收錄於其他請款單、未開立完成或不開單譯者的項目）
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

  // No assignee on any selected fee - still show button but trigger validation warning
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9"
        onClick={handleActionClick}
      >
        <FileText className="h-4 w-4" />
        譯者請款
      </Button>

      <AlertDialog open={showValidationWarning} onOpenChange={setShowValidationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>無法處理</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>以下項目不符合譯者請款條件：</p>
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
