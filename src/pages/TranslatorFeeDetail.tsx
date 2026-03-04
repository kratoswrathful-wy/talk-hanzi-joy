import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, X, Link as LinkIcon } from "lucide-react";
import { motion } from "framer-motion";
import { translatorFees, feeStatusLabels, type FeeTaskItem, type TaskType, type BillingUnit, type FeeStatus } from "@/data/fee-mock-data";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

const taskTypeOptions: TaskType[] = ["翻譯", "審稿", "MTPE", "LQA"];
const billingUnitOptions: BillingUnit[] = ["字", "小時"];

export default function TranslatorFeeDetail() {
  const { id } = useParams();
  const feeData = translatorFees.find((f) => f.id === id);

  const [taskItems, setTaskItems] = useState<FeeTaskItem[]>(feeData?.taskItems ?? []);
  const [status, setStatus] = useState<FeeStatus>(feeData?.status ?? "draft");
  const [internalNote, setInternalNote] = useState(feeData?.internalNote ?? "");
  const [internalNoteUrl, setInternalNoteUrl] = useState(feeData?.internalNoteUrl ?? "");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState("");

  if (!feeData) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">找不到該筆稿費紀錄</p>
      </div>
    );
  }

  const isDraft = status === "draft";
  const isFinalized = status === "finalized";

  const handleAddItem = () => {
    setTaskItems((prev) => [
      ...prev,
      {
        id: `item-new-${Date.now()}`,
        taskType: "翻譯",
        billingUnit: "字",
        unitCount: 0,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveItem = (itemId: string) => {
    setTaskItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleSubmit = () => {
    setStatus("finalized");
  };

  const handleRecall = () => {
    setStatus("draft");
  };

  const handleOpenLinkDialog = () => {
    setTempUrl(internalNoteUrl);
    setLinkDialogOpen(true);
  };

  const handleSaveLink = () => {
    setInternalNoteUrl(tempUrl);
    setLinkDialogOpen(false);
  };

  const totalAmount = taskItems.reduce(
    (sum, item) => sum + item.unitCount * item.unitPrice,
    0
  );

  const formattedDate = new Date(feeData.createdAt).toLocaleString("zh-TW", {
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
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <Input
            defaultValue={feeData.title}
            disabled={isFinalized}
            className="text-lg font-semibold bg-transparent border-0 shadow-none px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="標題"
          />
          <div className="flex items-center gap-2 shrink-0">
            {isDraft && (
              <>
                <Button variant="destructive" size="sm" className="text-xs">
                  刪除
                </Button>
                <Button size="sm" className="text-xs" onClick={handleSubmit}>
                  送出
                </Button>
              </>
            )}
            {isFinalized && (
              <Button variant="outline" size="sm" className="text-xs" onClick={handleRecall}>
                收回
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid gap-5">
          {/* 開單對象 + 狀態 same row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">開單對象</Label>
              <Select defaultValue={feeData.assignee} disabled={isFinalized}>
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
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">狀態</Label>
              <div className="flex items-center h-10 px-3 rounded-md bg-secondary/50 border border-input">
                <Badge
                  variant={isDraft ? "outline" : "default"}
                  className={
                    isFinalized
                      ? "bg-success/15 text-success border-success/30"
                      : ""
                  }
                >
                  {feeStatusLabels[status]}
                </Badge>
              </div>
            </div>
          </div>

          {/* 關聯內部紀錄 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">關聯內部紀錄</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {internalNoteUrl && internalNote ? (
                  <a
                    href={internalNoteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center h-10 w-full rounded-md border border-input bg-secondary/50 px-3 text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
                  >
                    {internalNote}
                  </a>
                ) : (
                  <Input
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    disabled={isFinalized}
                    className="bg-secondary/50"
                    placeholder="輸入備註文字"
                  />
                )}
              </div>
              {!isFinalized && (
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleOpenLinkDialog}
                  title="設定超連結"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                  <TableHead className="text-xs">單價</TableHead>
                  <TableHead className="text-xs">計費單位數</TableHead>
                  <TableHead className="text-xs text-right">小計</TableHead>
                  {isDraft && <TableHead className="text-xs w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isDraft ? 6 : 5}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      尚無任務項目
                    </TableCell>
                  </TableRow>
                ) : (
                  taskItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Select defaultValue={item.taskType} disabled={isFinalized}>
                          <SelectTrigger className="h-8 text-xs bg-transparent border-0 shadow-none px-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {taskTypeOptions.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
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
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={item.unitPrice}
                          disabled={isFinalized}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={item.unitCount}
                          disabled={isFinalized}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-24"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {(item.unitCount * item.unitPrice).toLocaleString()}
                      </TableCell>
                      {isDraft && (
                        <TableCell>
                          {index > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <div className="h-7 w-7" />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
              {taskItems.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm font-medium text-right">
                      總額
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold">
                      {totalAmount.toLocaleString()}
                    </TableCell>
                    {isDraft && <TableCell />}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>

        <Separator />

        {/* Meta info */}
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>建立者：{feeData.createdBy}</span>
          <span>建立時間：{formattedDate}</span>
        </div>
      </motion.div>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>設定超連結</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">連結網址</Label>
            <Input
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSaveLink}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
