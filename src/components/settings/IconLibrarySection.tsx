import { useState, useEffect, useSyncExternalStore } from "react";
import { Trash2, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { iconLibraryStore, type IconLibraryItem } from "@/stores/icon-library-store";
import { toast } from "sonner";

/** 設定 → 圖示庫（上傳後自動累積） */
export function IconLibrarySection() {
  const { confirmDelete } = useDeleteConfirm();
  useEffect(() => {
    iconLibraryStore.load();
  }, []);
  const items = useSyncExternalStore(iconLibraryStore.subscribe, iconLibraryStore.getAll);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleSaveName = (id: string) => {
    iconLibraryStore.update(id, { name: editName });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await iconLibraryStore.remove(id);
      toast.success("圖示已刪除");
    } catch {
      toast.error("刪除失敗");
    }
  };

  const handleDownload = async (item: IconLibraryItem) => {
    try {
      const resp = await fetch(item.url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${item.name || "icon"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("下載失敗");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">圖示庫</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">尚無圖示。上傳案件圖示後會自動儲存至此。</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col items-center gap-1.5 p-2 rounded-md border border-border bg-background">
              <img src={item.url} alt={item.name} className="w-8 h-8 rounded object-cover border border-border" />
              {editingId === item.id ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleSaveName(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName(item.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 text-[10px] text-center px-1"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground truncate max-w-full leading-tight cursor-text"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                  title="點擊編輯名稱"
                >
                  {item.name || "未命名"}
                </button>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(item)}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="下載"
                >
                  <Download className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(() => handleDelete(item.id), item.name || "此圖示")}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                  title="刪除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
