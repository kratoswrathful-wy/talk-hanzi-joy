import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
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

interface DeleteConfirmContextValue {
  confirmDelete: (onConfirm: () => void, itemName?: string) => void;
}

const DeleteConfirmContext = createContext<DeleteConfirmContextValue>({
  confirmDelete: () => {},
});

// 同檔匯出 hook + Provider 元件（context 慣用寫法），fast refresh 隔離最佳化不適用，
// 拆檔案效益低於風險，故此處抑制而非拆分。
// eslint-disable-next-line react-refresh/only-export-components
export function useDeleteConfirm() {
  return useContext(DeleteConfirmContext);
}

export function DeleteConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ onConfirm: () => void; itemName?: string } | null>(null);

  const confirmDelete = useCallback((onConfirm: () => void, itemName?: string) => {
    setPending({ onConfirm, itemName });
  }, []);

  return (
    <DeleteConfirmContext.Provider value={{ confirmDelete }}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              確定刪除{pending?.itemName ? `「${pending.itemName}」` : "此項目"}？
            </AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { pending?.onConfirm(); setPending(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeleteConfirmContext.Provider>
  );
}
