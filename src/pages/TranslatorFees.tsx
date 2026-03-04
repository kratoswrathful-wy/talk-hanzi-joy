import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { feeStatusLabels } from "@/data/fee-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFees, feeStore } from "@/hooks/use-fee-store";

export default function TranslatorFees() {
  const navigate = useNavigate();
  const fees = useFees();

  const handleCreate = () => {
    const newFee = feeStore.createDraft();
    navigate(`/fees/${newFee.id}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">稿費管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理譯者稿費請款單</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新增稿費
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card"
      >
        <div className="divide-y divide-border">
          {fees.map((fee) => (
            <div
              key={fee.id}
              onClick={() => navigate(`/fees/${fee.id}`)}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-secondary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="truncate text-sm text-card-foreground">
                  {fee.title || <span className="text-muted-foreground italic">未命名稿費單</span>}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {fee.assignee || "—"}
                </span>
                <Badge
                  variant={fee.status === "draft" ? "outline" : "default"}
                  className={
                    fee.status === "finalized"
                      ? "bg-success/15 text-success border-success/30 hover:bg-success/20"
                      : ""
                  }
                >
                  {feeStatusLabels[fee.status]}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
