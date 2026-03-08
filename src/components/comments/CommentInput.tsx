import { useState, useRef, useEffect } from "react";
import { AtSign, Image, Link2, Send, X, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";

interface MentionPage {
  id: string;
  title: string;
  type: "case" | "fee" | "invoice" | "client_invoice" | "internal_note";
  route: string;
}

const typeLabels: Record<MentionPage["type"], string> = {
  case: "案件",
  fee: "費用",
  invoice: "稿費請款",
  client_invoice: "客戶請款",
  internal_note: "內部註記",
};

export function CommentInput({
  draft,
  setDraft,
  placeholder,
  onSubmit,
}: {
  draft: string;
  setDraft: (v: string) => void;
  placeholder: string;
  onSubmit: (content: string, imageUrls?: string[], fileUrls?: { name: string; url: string }[]) => void;
}) {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [fileAttachments, setFileAttachments] = useState<{ name: string; url: string }[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionPages, setMentionPages] = useState<MentionPage[]>([]);
  const [mentionFilter, setMentionFilter] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Fetch all mentionable pages
  useEffect(() => {
    const env = getEnvironment();
    const pages: MentionPage[] = [];

    Promise.all([
      (supabase.from("cases").select("id, title") as any)
        .eq("env", env).order("created_at", { ascending: false })
        .then(({ data }: any) => {
          if (data) data.filter((p: any) => p.title).forEach((p: any) =>
            pages.push({ id: p.id, title: p.title, type: "case", route: `/cases/${p.id}` })
          );
        }),
      (supabase.from("fees").select("id, title") as any)
        .eq("env", env).order("created_at", { ascending: false })
        .then(({ data }: any) => {
          if (data) data.filter((p: any) => p.title).forEach((p: any) =>
            pages.push({ id: p.id, title: p.title, type: "fee", route: `/fees/${p.id}` })
          );
        }),
      (supabase.from("invoices").select("id, title") as any)
        .eq("env", env).order("created_at", { ascending: false })
        .then(({ data }: any) => {
          if (data) data.filter((p: any) => p.title).forEach((p: any) =>
            pages.push({ id: p.id, title: p.title, type: "invoice", route: `/invoices/${p.id}` })
          );
        }),
      (supabase.from("client_invoices").select("id, title") as any)
        .eq("env", env).order("created_at", { ascending: false })
        .then(({ data }: any) => {
          if (data) data.filter((p: any) => p.title).forEach((p: any) =>
            pages.push({ id: p.id, title: p.title, type: "client_invoice", route: `/client-invoices/${p.id}` })
          );
        }),
    ]).then(() => {
      setMentionPages(pages);
    });
  }, []);

  const filteredPages = mentionFilter
    ? mentionPages.filter((p) => p.title.toLowerCase().includes(mentionFilter.toLowerCase()))
    : mentionPages;

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      let before = draft.slice(0, start);
      const atIdx = before.lastIndexOf("@");
      if (atIdx >= 0) {
        before = before.slice(0, atIdx);
      }
      const newVal = before + text + draft.slice(end);
      setDraft(newVal);
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = before.length + text.length;
        el.focus();
      }, 0);
    } else {
      setDraft(draft + text);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);

    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx >= 0) {
      const afterAt = textBefore.slice(atIdx + 1);
      if (atIdx === 0 || /\s/.test(textBefore[atIdx - 1])) {
        if (!afterAt.includes("\n")) {
          setShowMentionPicker(true);
          setMentionFilter(afterAt);
          return;
        }
      }
    }
    setShowMentionPicker(false);
    setMentionFilter("");
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreviews((prev) => [...prev, e.target?.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const handleAttachFile = async (file: File) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `comment-files/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await supabase.storage.from("case-files").upload(path, file);
    if (error) return;
    const { data: urlData } = supabase.storage.from("case-files").getPublicUrl(path);
    if (urlData?.publicUrl) {
      setFileAttachments((prev) => [...prev, { name: file.name, url: urlData.publicUrl }]);
    }
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
    if (!draft.trim() && imagePreviews.length === 0 && fileAttachments.length === 0) return;
    onSubmit(
      draft.trim(),
      imagePreviews.length > 0 ? imagePreviews : undefined,
      fileAttachments.length > 0 ? fileAttachments : undefined,
    );
    setDraft("");
    setImagePreviews([]);
    setFileAttachments([]);
  };

  // Group filtered pages by type
  const groupedPages = filteredPages.reduce<Record<string, MentionPage[]>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});
  const typeOrder: MentionPage["type"][] = ["case", "internal_note", "fee", "invoice", "client_invoice"];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={handleTextChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="min-h-[60px] text-xs pr-2"
        />
        {showMentionPicker && (
          <div className="absolute bottom-full left-0 mb-1 z-10 rounded-md border border-border bg-popover p-1 shadow-md max-h-48 overflow-y-auto min-w-[240px]">
            {filteredPages.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">無符合的頁面</p>
            ) : (
              typeOrder.filter((t) => groupedPages[t]?.length).map((type) => (
                <div key={type}>
                  <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {typeLabels[type]}
                  </p>
                  {groupedPages[type].slice(0, 10).map((page) => (
                    <button
                      key={page.id}
                      className="block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors truncate"
                      onClick={() => {
                        const link = `[@${page.title}](${page.route})`;
                        insertAtCursor(link + " ");
                        setShowMentionPicker(false);
                        setMentionFilter("");
                      }}
                    >
                      {page.title}
                    </button>
                  ))}
                </div>
              ))
            )}
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

      {fileAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fileAttachments.map((f, idx) => (
            <div key={idx} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-xs">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <button
                className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                onClick={() => setFileAttachments((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X className="h-3 w-3" />
              </button>
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
          if (files) Array.from(files).forEach((file) => handleFileSelect(file));
          e.target.value = "";
        }}
      />

      <input
        ref={attachInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) Array.from(files).forEach((file) => handleAttachFile(file));
          e.target.value = "";
        }}
      />

      {showLinkDialog && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-3">
          <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="連結文字" className="text-xs h-8" />
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="text-xs h-8" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowLinkDialog(false)}>取消</Button>
            <Button
              size="sm"
              className="text-xs h-7"
              disabled={!linkText.trim() || !linkUrl.trim()}
              onClick={() => {
                const el = textareaRef.current;
                const start = el?.selectionStart ?? draft.length;
                const end = el?.selectionEnd ?? draft.length;
                const text = `[${linkText}](${linkUrl})`;
                const newVal = draft.slice(0, start) + text + draft.slice(end);
                setDraft(newVal);
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
            variant="ghost" size="icon" className="h-7 w-7" title="@提及頁面"
            onClick={() => {
              const el = textareaRef.current;
              if (el) {
                const start = el.selectionStart;
                const newVal = draft.slice(0, start) + "@" + draft.slice(el.selectionEnd);
                setDraft(newVal);
                setShowMentionPicker(true);
                setMentionFilter("");
                setTimeout(() => { el.selectionStart = el.selectionEnd = start + 1; el.focus(); }, 0);
              }
            }}
          >
            <AtSign className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="上傳圖片" onClick={() => fileInputRef.current?.click()}>
            <Image className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="上傳檔案" onClick={() => attachInputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7" title="插入超連結"
            onClick={() => { setShowLinkDialog(!showLinkDialog); setLinkText(""); setLinkUrl(""); }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          size="sm" className="gap-1 text-xs"
          disabled={!draft.trim() && imagePreviews.length === 0 && fileAttachments.length === 0}
          onClick={handleSubmit}
        >
          <Send className="h-3 w-3" />
          送出
        </Button>
      </div>
    </div>
  );
}
