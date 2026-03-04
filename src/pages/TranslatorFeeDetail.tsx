import { useParams, Link, useNavigate } from "react-router-dom";
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
import { useState, useRef, useEffect, useCallback } from "react";

type UserRole = "assignee" | "pm" | "executive";
const roleLabels: Record<UserRole, string> = {
  assignee: "開單對象",
  pm: "PM",
  executive: "執行官",
};

const taskTypeOptions: TaskType[] = ["翻譯", "審稿", "MTPE", "LQA"];
const billingUnitOptions: BillingUnit[] = ["字", "小時"];

interface EditLogEntry {
  id: string;
  changedBy: string;
  description: string;
  timestamp: string;
}

interface PendingChange {
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: number; // Date.now()
}

const COMMIT_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const fieldLabels: Record<string, string> = {
  taskType: "任務類型",
  billingUnit: "計費單位",
  unitPrice: "單價",
  unitCount: "計費單位數",
  title: "標題",
  assignee: "開單對象",
  internalNote: "關聯內部紀錄",
};

export default function TranslatorFeeDetail() {
  const { id } = useParams();
  const feeData = translatorFees.find((f) => f.id === id);

  const navigate = useNavigate();
  const [taskItems, setTaskItems] = useState<FeeTaskItem[]>(feeData?.taskItems ?? []);
  const [status, setStatus] = useState<FeeStatus>(feeData?.status ?? "draft");
  const [internalNote, setInternalNote] = useState(feeData?.internalNote ?? "");
  const [internalNoteUrl, setInternalNoteUrl] = useState(feeData?.internalNoteUrl ?? "");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState("");
  const [currentRole, setCurrentRole] = useState<UserRole>("pm");

  // Edit history tracking
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const snapshotRef = useRef<{ taskItems: FeeTaskItem[]; title: string; assignee: string; internalNote: string } | null>(null);
  const hasBeenSubmittedRef = useRef(feeData?.status === "finalized");

  // Commit pending changes that have persisted for 5+ minutes
  useEffect(() => {
    if (pendingChanges.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const ready = pendingChanges.filter((c) => now - c.changedAt >= COMMIT_DELAY_MS);
      if (ready.length > 0) {
        setEditLog((prev) => [
          ...prev,
          ...ready.map((c) => ({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            changedBy: roleLabels[currentRole],
            description: `${c.field} ${c.oldValue} → ${c.newValue}`,
            timestamp: new Date(c.changedAt).toLocaleString("zh-TW"),
          })),
        ]);
        setPendingChanges((prev) => prev.filter((c) => !ready.includes(c)));
        // Update snapshot to reflect committed values
        snapshotRef.current = {
          taskItems: [...taskItems],
          title: feeData?.title ?? "",
          assignee: feeData?.assignee ?? "",
          internalNote,
        };
      }
    }, 10000); // check every 10 seconds
    return () => clearInterval(timer);
  }, [pendingChanges, taskItems, internalNote, feeData]);

  const trackChange = useCallback((field: string, oldValue: string | number, newValue: string | number) => {
    if (!hasBeenSubmittedRef.current || String(oldValue) === String(newValue)) return;
    setPendingChanges((prev) => {
      const existing = prev.find((c) => c.field === field);
      if (existing) {
        // If reverted to original, remove the pending change
        if (String(existing.oldValue) === String(newValue)) {
          return prev.filter((c) => c.field !== field);
        }
        return prev.map((c) => c.field === field ? { ...c, newValue: String(newValue), changedAt: Date.now() } : c);
      }
      return [...prev, { field, oldValue: String(oldValue), newValue: String(newValue), changedAt: Date.now() }];
    });
  }, []);

  if (!feeData) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">找不到該筆稿費紀錄</p>
      </div>
    );
  }

  const isDraft = status === "draft";
  const isFinalized = status === "finalized";

  // Assignee cannot see draft at all
  if (currentRole === "assignee" && isDraft) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Role Switcher */}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium">測試角色：</span>
          {(Object.keys(roleLabels) as UserRole[]).map((role) => (
            <Button
              key={role}
              variant={currentRole === role ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2.5"
              onClick={() => setCurrentRole(role)}
            >
              {roleLabels[role]}
            </Button>
          ))}
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <p className="text-sm">此稿費單尚未送出，開單對象無法查看</p>
          <p className="text-xs">（實際環境中此紀錄不會出現在列表中）</p>
        </div>
      </div>
    );
  }

  // Role-based permissions — executive has same permissions as PM for now
  const isManager = currentRole === "pm" || currentRole === "executive";
  const canEdit = isManager && isDraft;
  const canSubmit = isManager && isDraft;
  const canRecall = isManager && isFinalized;
  const canDelete = isManager && isDraft;

  const handleUpdateItem = (itemId: string, field: keyof FeeTaskItem, value: any) => {
    if (hasBeenSubmittedRef.current && field !== "id") {
      const oldItem = (snapshotRef.current?.taskItems ?? taskItems).find((i) => i.id === itemId);
      if (oldItem) {
        const label = `${fieldLabels[field] ?? field}（項目 ${itemId.slice(-3)}）`;
        trackChange(label, oldItem[field], value);
      }
    }
    setTaskItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  };

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
    if (hasBeenSubmittedRef.current) {
      setPendingChanges((prev) => [
        ...prev,
        { field: "新增任務項目", oldValue: "-", newValue: "新項目已新增", changedAt: Date.now() },
      ]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    if (hasBeenSubmittedRef.current) {
      const removedItem = taskItems.find((i) => i.id === itemId);
      if (removedItem) {
        setPendingChanges((prev) => [
          ...prev,
          { field: "刪除任務項目", oldValue: `${removedItem.taskType}`, newValue: "已刪除", changedAt: Date.now() },
        ]);
      }
    }
    setTaskItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleNumberBlur = (itemId: string, field: "unitPrice" | "unitCount", rawValue: string) => {
    let cleaned = rawValue.replace(/^0+(\d)/, "$1");
    if (cleaned.startsWith(".")) cleaned = "0" + cleaned;
    if (cleaned === "" || cleaned === "0.") cleaned = "0";
    handleUpdateItem(itemId, field, Number(cleaned));
  };

  const handleSubmit = () => {
    // Take snapshot on first submit
    if (!hasBeenSubmittedRef.current) {
      snapshotRef.current = {
        taskItems: [...taskItems],
        title: feeData.title,
        assignee: feeData.assignee,
        internalNote,
      };
      hasBeenSubmittedRef.current = true;
    }
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
    (sum, item) => sum + Number(item.unitCount) * Number(item.unitPrice),
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
      {/* Role Switcher */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium">測試角色：</span>
        {(Object.keys(roleLabels) as UserRole[]).map((role) => (
          <Button
            key={role}
            variant={currentRole === role ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs px-2.5"
            onClick={() => setCurrentRole(role)}
          >
            {roleLabels[role]}
          </Button>
        ))}
      </div>

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
            disabled={!canEdit}
            className="text-lg font-semibold bg-transparent border-0 shadow-none px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="標題"
          />
          <div className="flex items-center gap-2 shrink-0">
            {canDelete && (
              <Button variant="destructive" size="sm" className="text-xs" onClick={() => setDeleteDialogOpen(true)}>
                刪除
              </Button>
            )}
            {canSubmit && (
              <Button size="sm" className="text-xs" onClick={handleSubmit}>
                送出
              </Button>
            )}
            {canRecall && (
              <Button variant="outline" size="sm" className="text-xs" onClick={handleRecall}>
                收回
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">開單對象</Label>
              <Select defaultValue={feeData.assignee} disabled={!canEdit}>
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
              <div className="flex items-center h-10">
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
                    disabled={!canEdit}
                    className="bg-secondary/50"
                    placeholder="輸入備註文字"
                  />
                )}
              </div>
              {canEdit && (
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
            {canEdit && (
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
                  {canEdit && <TableHead className="text-xs w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEdit ? 6 : 5}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      尚無任務項目
                    </TableCell>
                  </TableRow>
                ) : (
                  taskItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Select
                          value={item.taskType}
                          disabled={!canEdit}
                          onValueChange={(v) => handleUpdateItem(item.id, "taskType", v)}
                        >
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
                        <Select
                          value={item.billingUnit}
                          disabled={!canEdit}
                          onValueChange={(v) => handleUpdateItem(item.id, "billingUnit", v)}
                        >
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
                          type="text"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^[0-9]*\.?[0-9]*$/.test(v)) handleUpdateItem(item.id, "unitPrice", v as any);
                          }}
                          onBlur={(e) => handleNumberBlur(item.id, "unitPrice", e.target.value)}
                          disabled={!canEdit}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={item.unitCount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^[0-9]*\.?[0-9]*$/.test(v)) handleUpdateItem(item.id, "unitCount", v as any);
                          }}
                          onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                          disabled={!canEdit}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-24"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {(Number(item.unitCount) * Number(item.unitPrice)).toLocaleString()}
                      </TableCell>
                      {canEdit && (
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
                    {canEdit && <TableCell />}
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

        {/* Edit History — only show when there are committed or pending entries */}
        {(editLog.length > 0 || pendingChanges.length > 0) && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">變更紀錄</Label>
              <div className="space-y-2">
                {editLog.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs space-y-0.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <span><span className="text-muted-foreground">變更者：</span>{entry.changedBy}</span>
                      <span><span className="text-muted-foreground">變更內容：</span>{entry.description}</span>
                      <span><span className="text-muted-foreground">變更時間：</span>{entry.timestamp}</span>
                    </div>
                  </div>
                ))}
                {pendingChanges.map((change, idx) => (
                  <div key={`pending-${idx}`} className="rounded-md border border-dashed border-border bg-secondary/15 px-3 py-2 text-xs space-y-0.5 opacity-60">
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 italic">
                      <span><span className="text-muted-foreground">變更者：</span>{roleLabels[currentRole]}</span>
                      <span><span className="text-muted-foreground">變更內容：</span>{change.field} {change.oldValue} → {change.newValue}</span>
                      <span><span className="text-muted-foreground">變更時間：</span>{new Date(change.changedAt).toLocaleString("zh-TW")}</span>
                      <span className="text-muted-foreground">（未滿 5 分鐘，尚未正式紀錄）</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
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

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>是否確認刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後將無法復原此稿費紀錄。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => navigate("/fees")}
            >
              確定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
