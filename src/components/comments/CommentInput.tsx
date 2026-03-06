import { useState, useRef } from "react";
import { AtSign, Image, Link2, Send, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const mentionUsers = ["王小明", "李美玲", "張大偉", "陳雅婷"];

export function CommentInput({
  draft,
  setDraft,
  placeholder,
  onSubmit,
}: {
  draft: string;
  setDraft: (v: string) => void;
  placeholder: string;
  onSubmit: (content: string, imageUrls?: string[]) => void;
}) {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = draft.slice(0, start) + text + draft.slice(end);
      setDraft(newVal);
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + text.length;
        el.focus();
      }, 0);
    } else {
      setDraft(draft + text);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreviews((prev) => [...prev, e.target?.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleFileSelect(file);
        return;
      }
    }
  };

  const handleSubmit = () => {
    if (!draft.trim() && imagePreviews.length === 0) return;
    onSubmit(draft.trim(), imagePreviews.length > 0 ? imagePreviews : undefined);
    setDraft("");
    setImagePreviews([]);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="min-h-[60px] text-xs pr-2"
        />
        {showMentionPicker && (
          <div className="absolute bottom-full left-0 mb-1 z-10 rounded-md border border-border bg-popover p-1 shadow-md">
            {mentionUsers.map((user) => (
              <button
                key={user}
                className="block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
                  insertAtCursor(`@${user} `);
                  setShowMentionPicker(false);
                }}
              >
                {user}
              </button>
            ))}
          </div>
        )}
      </div>

      {imagePreviews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imagePreviews.map((img, idx) => (
            <div key={idx} className="relative inline-block">
              <img src={img} alt={`預覽 ${idx + 1}`} className="max-w-[120px] max-h-24 rounded-md border border-border" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                onClick={() => setImagePreviews((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            Array.from(files).forEach((file) => handleFileSelect(file));
          }
          e.target.value = "";
        }}
      />

      {showLinkDialog && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-3">
          <Input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="連結文字"
            className="text-xs h-8"
          />
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="text-xs h-8"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowLinkDialog(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="text-xs h-7"
              disabled={!linkText.trim() || !linkUrl.trim()}
              onClick={() => {
                insertAtCursor(`[${linkText}](${linkUrl})`);
                setLinkText("");
                setLinkUrl("");
                setShowLinkDialog(false);
              }}
            >
              插入
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="@提及使用者"
            onClick={() => setShowMentionPicker(!showMentionPicker)}
          >
            <AtSign className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="上傳圖片"
            onClick={() => fileInputRef.current?.click()}
          >
            <Image className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="插入超連結"
            onClick={() => {
              setShowLinkDialog(!showLinkDialog);
              setLinkText("");
              setLinkUrl("");
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          size="sm"
          className="gap-1 text-xs"
          disabled={!draft.trim() && imagePreviews.length === 0}
          onClick={handleSubmit}
        >
          <Send className="h-3 w-3" />
          送出
        </Button>
      </div>
    </div>
  );
}
