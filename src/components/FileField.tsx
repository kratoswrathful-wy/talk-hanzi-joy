import { useState, useRef, useCallback } from "react";
import { Upload, Link as LinkIcon, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

export interface FileItem {
  name: string;
  url: string;
}

interface FileFieldProps {
  value: FileItem[];
  onChange: (items: FileItem[]) => void;
}

export default function FileField({ value, onChange }: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlNameDraft, setUrlNameDraft] = useState("");

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const newItems: FileItem[] = [];
    for (const file of files) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}/${file.name}`;
      const { error } = await supabase.storage.from("case-files").upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("case-files").getPublicUrl(path);
        newItems.push({ name: file.name, url: urlData.publicUrl });
      }
    }
    if (newItems.length > 0) {
      onChange([...value, ...newItems]);
    }
    setUploading(false);
  }, [value, onChange]);

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

  return (
    <div className="space-y-1.5">
      {/* Existing items */}
      {value.length > 0 && (
        <div className="space-y-1">
          {value.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 group">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate max-w-[320px]"
              >
                {item.name}
              </a>
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

      {/* Drop zone + actions */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex items-center gap-2 rounded-md border border-dashed px-3 py-2 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "上傳中…" : "上傳檔案"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setUrlDialogOpen(true)}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          貼上網址
        </Button>
        {value.length === 0 && !uploading && (
          <span className="text-xs text-muted-foreground ml-1">拖曳檔案至此或點擊上傳</span>
        )}
      </div>

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
            <AlertDialogAction disabled={!urlDraft.trim()} onClick={addUrl}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
