import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, X, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { translatorFees, feeStatusLabels, type FeeTaskItem, type TaskType, type BillingUnit } from "@/data/fee-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

const taskTypeOptions: TaskType[] = ["翻譯", "審稿", "MTPE", "LQA"];
const billingUnitOptions: BillingUnit[] = ["字", "小時"];

export default function TranslatorFeeDetail() {
  const { id } = useParams();
  const fee = translatorFees.find((f) => f.id === id);

  const [taskItems, setTaskItems] = useState<FeeTaskItem[]>(fee?.taskItems ?? []);

  if (!fee) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">找不到該筆稿費紀錄</p>
      </div>
    );
  }

  const isDraft = fee.status === "draft";
  const isFinalized = fee.status === "finalized";

  const handleAddItem = () => {
    setTaskItems((prev) => [
      ...prev,
      {
        id: `item-new-${Date.now()}`,
        taskType: "翻譯",
        billingUnit: "字",
        unitCount: 0,
      },
    ]);
  };

  const handleRemoveItem = (itemId: string) => {
    setTaskItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const formattedDate = new Date(fee.createdAt).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/fees"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回稿費列表
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-6 space-y-6"
      >
        {/* Header with status & actions */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Badge
              variant={isDraft ? "outline" : "default"}
              className={
                isFinalized
                  ? "bg-success/15 text-success border-success/30"
                  : ""
              }
            >
              {feeStatusLabels[fee.status]}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">{fee.id}</span>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <>
                <Button variant="destructive" size="sm" className="text-xs">
                  刪除本筆費用
                </Button>
                <Button size="sm" className="text-xs">
                  確定開單
                </Button>
              </>
            )}
            {isFinalized && (
              <Button variant="outline" size="sm" className="text-xs">
                收回
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid gap-5">
          {/* 標題 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">標題</Label>
            <Input
              defaultValue={fee.title}
              disabled={isFinalized}
              className="bg-secondary/50"
            />
          </div>

          {/* 開單對象 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">開單對象（人員）</Label>
            <Select defaultValue={fee.assignee} disabled={isFinalized}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="王小明">王小明</SelectItem>
                <SelectItem value="李美玲">李美玲</SelectItem>
                <SelectItem value="張大偉">張大偉</SelectItem>
                <SelectItem value="陳雅婷">陳雅婷</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 關聯內部紀錄 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">關聯內部紀錄</Label>
            <div className="flex items-center gap-2">
              <Input
                defaultValue={fee.internalNote}
                disabled={isFinalized}
                className="bg-secondary/50"
              />
              {fee.internalNoteUrl && (
                <a
                  href={fee.internalNoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* 狀態 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">狀態</Label>
            <Select defaultValue={fee.status} disabled>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="finalized">開立完成</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Task Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">任務項目</Label>
            {isDraft && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={handleAddItem}
              >
                <Plus className="h-3.5 w-3.5" />
                新增項目
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="text-xs">任務類型</TableHead>
                  <TableHead className="text-xs">計費單位</TableHead>
                  <TableHead className="text-xs">計費單位數</TableHead>
                  {isDraft && <TableHead className="text-xs w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isDraft ? 4 : 3}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      尚無任務項目
                    </TableCell>
                  </TableRow>
                ) : (
                  taskItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Select defaultValue={item.taskType} disabled={isFinalized}>
                          <SelectTrigger className="h-8 text-xs bg-transparent border-0 shadow-none px-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {taskTypeOptions.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select defaultValue={item.billingUnit} disabled={isFinalized}>
                          <SelectTrigger className="h-8 text-xs bg-transparent border-0 shadow-none px-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {billingUnitOptions.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={item.unitCount}
                          disabled={isFinalized}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-24"
                        />
                      </TableCell>
                      {isDraft && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* Meta info */}
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>建立者：{fee.createdBy}</span>
          <span>建立時間：{formattedDate}</span>
        </div>
      </motion.div>
    </div>
  );
}
