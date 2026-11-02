import { canDeleteComment, commentPreviewLabel, type CommentBase } from "@/lib/comment-model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CommentToolbar({
  author,
  timeLabel,
  comment,
  actorId,
  isPmPlus,
  showReply = true,
  onReply,
  onDelete,
}: {
  author: string;
  timeLabel: string;
  comment: CommentBase;
  actorId: string | null | undefined;
  isPmPlus: boolean;
  showReply?: boolean;
  onReply?: () => void;
  onDelete: (comment: CommentBase) => void;
}) {
  const canDelete = canDeleteComment({ comment, actorId, isPmPlus });
  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <span className="font-medium">{author}</span>
        <span className="text-muted-foreground">{timeLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        {showReply && !comment.deleted && onReply ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
            onClick={onReply}
          >
            回覆
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            data-comment-delete={comment.id}
            className="text-muted-foreground hover:text-destructive text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
            onClick={() => onDelete(comment)}
          >
            刪除
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CommentDeleteDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: CommentBase | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確定刪除這則留言？</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `將刪除「${commentPreviewLabel(target)}」。若這則還有回覆，回覆會留下，這裡改顯示「留言已刪除」。此操作無法復原。`
              : "此操作無法復原。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            data-comment-delete-confirm=""
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "刪除中…" : "確定刪除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
