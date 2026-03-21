import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_DUPLICATE_SORT,
  type DuplicateSortKey,
  type DuplicateSortDir,
} from "@/lib/case-title-duplicate";
import type { CaseDuplicateSort } from "@/stores/case-store";

export function DuplicateCaseSortDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sort: CaseDuplicateSort) => void;
}) {
  const [sortKey, setSortKey] = useState<DuplicateSortKey>(DEFAULT_DUPLICATE_SORT.key);
  const [sortDir, setSortDir] = useState<DuplicateSortDir>(DEFAULT_DUPLICATE_SORT.dir);

  useEffect(() => {
    if (open) {
      setSortKey(DEFAULT_DUPLICATE_SORT.key);
      setSortDir(DEFAULT_DUPLICATE_SORT.dir);
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>同日同系列案件排序</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>複製後需為同日案件重新編排區隔符號。請選擇排序方式，系統會依序指派標題（自 A 起：A、B、C…）。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">排序依據</Label>
                  <Select
                    value={sortKey}
                    onValueChange={(v) => setSortKey(v as DuplicateSortKey)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">建單時間</SelectItem>
                      <SelectItem value="translation_deadline">翻譯交期</SelectItem>
                      <SelectItem value="review_deadline">審稿交期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">順序</Label>
                  <Select value={sortDir} onValueChange={(v) => setSortDir(v as DuplicateSortDir)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">升序</SelectItem>
                      <SelectItem value="desc">降序</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm({ key: sortKey, dir: sortDir });
              onOpenChange(false);
            }}
          >
            確認複製
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
