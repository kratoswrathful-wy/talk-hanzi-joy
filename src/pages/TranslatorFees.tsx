import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { translatorFees, feeStatusLabels } from "@/data/fee-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TranslatorFees() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">稿費管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理譯者稿費請款單</p>
        </div>
        <Button size="sm" className="gap-1.5" asChild>
          <Link to="/fees/new">
            <Plus className="h-4 w-4" />
            新增稿費
          </Link>
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card"
      >
        <div className="divide-y divide-border">
          {translatorFees.map((fee) => (
            <Link
              key={fee.id}
              to={`/fees/${fee.id}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                  {fee.id}
                </span>
                <span className="truncate text-sm text-card-foreground">
                  {fee.title}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {fee.assignee}
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
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
