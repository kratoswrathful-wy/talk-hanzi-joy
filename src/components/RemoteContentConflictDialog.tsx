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

export function RemoteContentConflictDialog({
  open,
  onKeepLocal,
  onReloadRemote,
}: {
  open: boolean;
  onKeepLocal: () => void;
  onReloadRemote: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>內容已有新版本</AlertDialogTitle>
          <AlertDialogDescription>
            這份內容在別處已更新。你正在編輯、尚未儲存的文字不會被覆蓋。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={onKeepLocal}>
            保留我的編輯
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onReloadRemote}>
            改看最新版本
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
