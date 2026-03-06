import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, FilePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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

export function InvoiceActions({ selectedFees, onDone }: InvoiceActionsProps) {
  const navigate = useNavigate();
  const invoices = useInvoices();
  const [translatorSettings, setTranslatorSettings] = useState<TranslatorSetting[]>([]);
  const [showPickInvoice, setShowPickInvoice] = useState(false);
  const [showMultiConfirm, setShowMultiConfirm] = useState(false);

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

  // Filter eligible fees for multi-translator batch:
  // exclude already linked fees and no_fee translator fees
  const eligibleFees = selectedFees.filter(
    (f) => !linkedFeeIds.has(f.id) && f.assignee && !noFeeEmails.has(f.assignee)
  );

  const eligibleTranslators = [...new Set(eligibleFees.map((f) => f.assignee))];

  // Existing invoices for the translator (single select)
  const translatorInvoices = isSingleTranslator
    ? invoices.filter((inv) => inv.translator === translators[0] && inv.status !== "paid")
    : [];

  const handleCreateNew = async () => {
    if (!isSingleTranslator) return;
    const feeIds = selectedFees.filter((f) => !linkedFeeIds.has(f.id)).map((f) => f.id);
    const inv = await invoiceStore.createInvoice(translators[0], feeIds);
    if (inv) {
      toast.success("已建立請款單");
      navigate(`/invoices/${inv.id}`);
    }
    onDone();
  };

  const handleAddToExisting = async (invoiceId: string) => {
    const feeIds = selectedFees.filter((f) => !linkedFeeIds.has(f.id)).map((f) => f.id);
    await invoiceStore.addFeesToInvoice(invoiceId, feeIds);
    toast.success("已收錄至請款單");
    setShowPickInvoice(false);
    onDone();
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

  if (selectedFees.length === 0) return null;

  // If ALL selected fees already have invoices, hide the button entirely
  const allAlreadyLinked = selectedFees.every((f) => linkedFeeIds.has(f.id));
  if (allAlreadyLinked) return null;

  // Single translator: dropdown with new + existing options
  if (isSingleTranslator) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <FileText className="h-4 w-4" />
              請款
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
          onClick={() => setShowMultiConfirm(true)}
          disabled={eligibleFees.length === 0}
        >
          <FileText className="h-4 w-4" />
          批次請款
        </Button>

        <AlertDialog open={showMultiConfirm} onOpenChange={setShowMultiConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>批次建立請款單</AlertDialogTitle>
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
                      ※ 已自動排除 {skippedCount} 筆（已收錄於其他請款單或不開單譯者的項目）
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

  // No assignee on any selected fee
  return (
    <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled title="選取的費用尚未指定譯者">
      <FileText className="h-4 w-4" />
      請款單
    </Button>
  );
}
