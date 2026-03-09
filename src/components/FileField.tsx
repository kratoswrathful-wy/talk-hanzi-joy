import { useState, useRef, useCallback } from "react";
import { Upload, Link as LinkIcon, X, FileText, BookmarkPlus, GripVertical, Pencil, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useCommonLinks } from "@/stores/common-links-store";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export interface FileItem {
  name: string;
  url: string;
  size?: number; // bytes, only for uploaded files
}

interface FileFieldProps {
  value: FileItem[];
  onChange: (items: FileItem[]) => void;
}

export default function FileField({ value, onChange }: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cancelRef = useRef(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlNameDraft, setUrlNameDraft] = useState("");
  const [linksOpen, setLinksOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const commonLinks = useCommonLinks();

  // Use refs to always access latest value/onChange inside async upload
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    cancelRef.current = false;
    setUploading(true);
    setUploadProgress(0);
    setUploadTotal(files.length);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    setTotalBytes(total);
    setUploadedBytes(0);
    let doneBytes = 0;
    const newItems: FileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break;
      const file = files[i];
      setUploadProgress(i);
      // Sanitize file name: replace spaces and special chars to avoid storage "Invalid key" errors
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, "_");
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}/${safeName}`;
      const { error } = await supabase.storage.from("case-files").upload(path, file);
      if (cancelRef.current) break;
      if (error) {
        console.error("File upload error:", file.name, error);
      } else {
        const { data: urlData } = supabase.storage.from("case-files").getPublicUrl(path);
        newItems.push({ name: file.name, url: urlData.publicUrl, size: file.size });
      }
      doneBytes += file.size;
      setUploadedBytes(doneBytes);
    }
    if (newItems.length > 0 && !cancelRef.current) {
      onChangeRef.current([...valueRef.current, ...newItems]);
    }
    setUploading(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    uploadFiles(files);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
  }, [uploadFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const removeItem = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const addUrl = () => {
    if (!urlDraft.trim()) return;
    onChange([...value, { name: urlNameDraft.trim() || urlDraft.trim(), url: urlDraft.trim() }]);
    setUrlDraft("");
    setUrlNameDraft("");
    setUrlDialogOpen(false);
  };

  // Check which common links are already added (by url match)
  const existingUrls = new Set(value.map((v) => v.url));

  const toggleCommonLink = (link: { id: string; name: string; url: string }) => {
    if (existingUrls.has(link.url)) {
      onChange(value.filter((v) => v.url !== link.url));
    } else {
      onChange([...value, { name: link.name, url: link.url }]);
    }
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const handleItemDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...value];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const commitRename = (idx: number) => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== value[idx]?.name) {
      const next = [...value];
      next[idx] = { ...next[idx], name: trimmed };
      onChange(next);
    }
    setEditingIdx(null);
  };

  return (
    <div className="space-y-1.5">
      {/* Existing items */}
      {value.length > 0 && (
        <div className="space-y-0.5">
          {value.map((item, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx); }}
              onDrop={() => handleItemDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              className={`flex items-center gap-1.5 group rounded px-0.5 py-0.5 cursor-grab active:cursor-grabbing transition-colors ${
                dragOverIdx === idx ? "bg-primary/10 border border-dashed border-primary/30" : ""
              } ${dragIdx === idx ? "opacity-50" : ""}`}
            >
              <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
              {item.url.includes("/storage/v1/object/") ? (
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              {editingIdx === idx ? (
                <input
                  className="text-sm bg-transparent border-b border-primary outline-none flex-1 max-w-[280px]"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(idx);
                    if (e.key === "Escape") setEditingIdx(null);
                  }}
                  autoFocus
                />
              ) : (
                <>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate max-w-[200px]"
                  >
                    {item.name}
                  </a>
                  {item.size != null && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {item.size < 1024 ? `${item.size} B`
                        : item.size < 1024 * 1024 ? `${(item.size / 1024).toFixed(1)} KB`
                        : `${(item.size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                  )}
                </>
              )}
              <button
                onClick={() => { setEditingIdx(idx); setEditName(item.name); }}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 opacity-0 group-hover:opacity-100"
                title="重新命名"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => removeItem(idx)}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all shrink-0 opacity-0 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">
              正在上傳第 {uploadProgress + 1}/{uploadTotal} 個檔案（{formatBytes(uploadedBytes)}/{formatBytes(totalBytes)}）
            </span>
            <button
              onClick={() => { cancelRef.current = true; setUploading(false); }}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all shrink-0"
              title="取消上傳"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Progress value={(uploadedBytes / totalBytes) * 100} className="h-2" />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Collapsed: single add button / Expanded: overlay toolbar */}
      {!actionsExpanded && !uploading ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 border-dashed"
          onClick={() => setActionsExpanded(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <>
          {/* Backdrop overlay — click anywhere to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setActionsExpanded(false)}
          />
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative z-50 rounded-md border border-dashed transition-colors bg-background shadow-lg grid grid-cols-2 grid-rows-2 ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            {/* Top-left: 上傳檔案 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full min-h-[40px] text-xs gap-1 flex items-center justify-center rounded-none"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "上傳中…" : "上傳檔案"}
            </Button>
            {/* Top-right: 貼上網址 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full min-h-[40px] text-xs gap-1 flex items-center justify-center rounded-none"
              onClick={() => setUrlDialogOpen(true)}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              貼上網址
            </Button>
            {/* Bottom-left: 常用連結 */}
            <Popover open={linksOpen} onOpenChange={setLinksOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-full min-h-[40px] text-xs gap-1 flex items-center justify-center rounded-none"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  常用連結
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                {commonLinks.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">尚無常用連結，請至「工具管理」新增</p>
                ) : (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {commonLinks.map((link) => (
                      <label
                        key={link.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30 cursor-pointer"
                      >
                        <Checkbox
                          checked={existingUrls.has(link.url)}
                          onCheckedChange={() => toggleCommonLink(link)}
                        />
                        <span className="text-sm truncate flex-1">{link.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {/* Bottom-right: 或拖曳檔案至此 */}
            <div className="flex items-center justify-center min-h-[40px]">
              <span className="text-xs text-muted-foreground">或拖曳檔案至此</span>
            </div>
          </div>
        </>
      )}

      {/* URL dialog */}
      <AlertDialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>新增網址</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm text-muted-foreground">網址</label>
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://..."
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") addUrl(); }}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">顯示名稱</label>
              <Input
                value={urlNameDraft}
                onChange={(e) => setUrlNameDraft(e.target.value)}
                placeholder="（選填）"
                onKeyDown={(e) => { if (e.key === "Enter") addUrl(); }}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={!urlDraft.trim()} onClick={addUrl}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
