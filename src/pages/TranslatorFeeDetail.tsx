import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, Send, AtSign, Image, Link2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { type FeeTaskItem, type TaskType, type BillingUnit, type FeeStatus, type ClientInfo, type TranslatorFee, defaultClientInfo } from "@/data/fee-mock-data";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";

const feeStatusLabels: Record<FeeStatus, string> = {
  draft: "草稿",
  finalized: "開立完成",
};
import ClientInfoSection from "@/components/ClientInfoSection";
import { useFee, useFees, feeStore } from "@/hooks/use-fee-store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ColorSelect from "@/components/ColorSelect";
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
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useRef, useEffect, useCallback } from "react";

type UserRole = "assignee" | "pm" | "executive";
const roleLabels: Record<UserRole, string> = {
  assignee: "譯者",
  pm: "PM",
  executive: "執行官",
};

function DetailStatusBadge({ status }: { status: FeeStatus }) {
  const labelStyles = useLabelStyles();
  const style = status === "finalized" ? labelStyles.statusFinalized : labelStyles.statusDraft;
  return (
    <Badge
      variant="default"
      className="border"
      style={{ backgroundColor: style.bgColor, color: style.textColor, borderColor: style.bgColor }}
    >
      {feeStatusLabels[status]}
    </Badge>
  );
}


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

interface CommentEntry {
  id: string;
  author: string;
  content: string; // supports markdown-like: @user, [text](url), ![img](url)
  imageUrls?: string[];
  timestamp: string;
}

const formatTimestamp = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

const mentionUsers = ["王小明", "李美玲", "張大偉", "陳雅婷"];

const COMMIT_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const fieldLabels: Record<string, string> = {
  taskType: "任務類型",
  billingUnit: "計費單位",
  unitPrice: "單價",
  unitCount: "計費單位數",
  title: "標題",
  assignee: "譯者",
  internalNote: "相關案件",
  client: "客戶",
  contact: "聯絡人",
};

// --- Rich Comment Components ---

function CommentContent({ content, imageUrls }: { content: string; imageUrls?: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const regex = /(@\S+)|\[([^\]]+)\]\(([^)]+)\)/g;
  const rendered: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      rendered.push(<span key={`t-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      rendered.push(
        <span key={`m-${match.index}`} className="text-primary font-medium bg-primary/10 rounded px-0.5">
          {match[1]}
        </span>
      );
    } else if (match[2] && match[3]) {
      rendered.push(
        <a key={`l-${match.index}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    rendered.push(<span key="tail">{content.slice(lastIndex)}</span>);
  }

  const imgCount = imageUrls?.length ?? 0;
  const canPrev = lightboxIndex !== null && lightboxIndex > 0;
  const canNext = lightboxIndex !== null && lightboxIndex < imgCount - 1;

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft" && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
      if (e.key === "ArrowRight" && lightboxIndex < imgCount - 1) setLightboxIndex(lightboxIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, imgCount]);

  return (
    <div>
      <p className="whitespace-pre-wrap">{rendered}</p>
      {imageUrls && imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {imageUrls.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`附圖 ${idx + 1}`}
              className="max-w-xs max-h-48 rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightboxIndex(idx)}
            />
          ))}
        </div>
      )}
      {/* Lightbox overlay */}
      {lightboxIndex !== null && imageUrls && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Left arrow */}
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 hover:bg-white/40 p-2 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={!canPrev}
            onClick={(e) => { e.stopPropagation(); if (canPrev) setLightboxIndex(lightboxIndex - 1); }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Image + counter */}
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrls[lightboxIndex]}
              alt="原圖"
              className="max-w-[85vw] max-h-[80vh] rounded-lg shadow-2xl"
            />
            <div className="flex items-center gap-3 text-white/80 text-sm select-none">
              <span>{lightboxIndex + 1} / {imgCount}</span>
              {imgCount > 1 && (
                <span className="text-white/50 text-xs flex items-center gap-1">
                  ← → 鍵盤方向鍵可切換
                </span>
              )}
            </div>
          </div>

          {/* Right arrow */}
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 hover:bg-white/40 p-2 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={!canNext}
            onClick={(e) => { e.stopPropagation(); if (canNext) setLightboxIndex(lightboxIndex + 1); }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

function CommentInput({
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
        {/* Mention picker dropdown */}
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

      {/* Image previews */}
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

      {/* Hidden file input */}
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

      {/* Link insertion dialog */}
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

export default function TranslatorFeeDetail() {

  const { id } = useParams();
  const feeData = useFee(id);
  const allFees = useFees();

  const navigate = useNavigate();
  const [title, setTitle] = useState(feeData?.title ?? "");
  const [taskItems, setTaskItems] = useState<FeeTaskItem[]>(
    feeData?.taskItems && feeData.taskItems.length > 0
      ? feeData.taskItems
      : [{ id: `item-${Date.now()}`, taskType: "翻譯", billingUnit: "字", unitCount: 0, unitPrice: 0 }]
  );
  const [status, setStatus] = useState<FeeStatus>(feeData?.status ?? "draft");
  const [assignee, setAssignee] = useState(feeData?.assignee ?? "");
  const [internalNote, setInternalNote] = useState(feeData?.internalNote ?? "");
  const [internalNoteUrl, setInternalNoteUrl] = useState(feeData?.internalNoteUrl ?? "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notionUrlInput, setNotionUrlInput] = useState(internalNoteUrl || "");
  const [currentRole, setCurrentRole] = useState<UserRole>("pm");

  // Comments — initialize from feeData
  const [comments, setComments] = useState<CommentEntry[]>(() =>
    (feeData?.notes ?? []).map((n) => ({ id: n.id, author: n.author, content: n.text, timestamp: formatTimestamp(n.createdAt) }))
  );
  const [internalComments, setInternalComments] = useState<CommentEntry[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [notionLoading, setNotionLoading] = useState(false);
  const [isNoFeeTranslator, setIsNoFeeTranslator] = useState(false);
  const [creatorName, setCreatorName] = useState(feeData?.createdBy || "");
  const [clientInfo, setClientInfo] = useState<ClientInfo>(feeData?.clientInfo ?? { ...defaultClientInfo });

  // Edit history tracking — initialize from feeData
  const [editLog, setEditLog] = useState<EditLogEntry[]>(() =>
    (feeData?.editLogs ?? []).map((l) => ({ id: l.id, changedBy: l.author, description: l.field ? `${l.field} ${l.oldValue} → ${l.newValue}` : l.newValue, timestamp: formatTimestamp(l.timestamp) }))
  );
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const snapshotRef = useRef<{ taskItems: FeeTaskItem[]; title: string; assignee: string; internalNote: string } | null>(null);
  const hasBeenSubmittedRef = useRef(feeData?.status === "finalized");
  const [duplicateDialogStep, setDuplicateDialogStep] = useState<null | "choose" | "assignRole" | "confirmSwap">(null);
  const [disableOption12A, setDisableOption12A] = useState(false);
  const [swapResolved, setSwapResolved] = useState(false);
  const confirmSwapOriginRef = useRef<"choose" | "assignRole">("choose");
  const [multiTranslatorPages, setMultiTranslatorPages] = useState<{ id: string; title: string; assignee: string }[] | null>(null);
  const [autoCreatedOptions, setAutoCreatedOptions] = useState<{ field: string; label: string }[] | null>(null);
  const [showPricingTip, setShowPricingTip] = useState(true);

  // Find the other fee that is firstFee in the same case group
  const otherFirstFee = (() => {
    if (!clientInfo.sameCase || !internalNote) return undefined;
    return allFees.find(
      (f) =>
        f.id !== id &&
        f.clientInfo?.sameCase &&
        f.clientInfo?.isFirstFee &&
        f.internalNote === internalNote
    );
  })();

  // Detect duplicate isFirstFee in the same case group
  const hasDuplicateFirstFee = clientInfo.sameCase && clientInfo.isFirstFee && !!otherFirstFee;

  // Detect sameCase checked but no role assigned (neither isFirstFee nor notFirstFee)
  const needsRoleAssignment = clientInfo.sameCase && !clientInfo.isFirstFee && !clientInfo.notFirstFee;

  // Combined blocking condition
  const isNavigationBlocked = hasDuplicateFirstFee || needsRoleAssignment;

  // Load assignees from DB on mount
  useEffect(() => {
    selectOptionsStore.loadAssignees();
  }, []);

  // Resolve creator UUID to display name
  useEffect(() => {
    const uid = feeData?.createdBy;
    if (!uid || uid.length !== 36) return; // not a UUID
    supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (data) setCreatorName(data.display_name || data.email);
      });
  }, [feeData?.createdBy]);

  // Check no-fee translator status
  useEffect(() => {
    if (!assignee) {
      setIsNoFeeTranslator(false);
      return;
    }
    // Find the email from the assignee option
    const opt = selectOptionsStore.getField("assignee").options.find(
      o => o.label === assignee || o.email === assignee
    );
    const email = opt?.email || assignee;

    const checkNoFee = async () => {
      const { data } = await supabase
        .from("member_translator_settings")
        .select("no_fee")
        .eq("email", email)
        .maybeSingle();
      setIsNoFeeTranslator(data?.no_fee || false);
    };
    checkNoFee();
  }, [assignee]);

  // Show warning on mount if duplicate detected (but not after a successful swap)
  useEffect(() => {
    if (hasDuplicateFirstFee && !swapResolved) {
      setDisableOption12A(false);
      setDuplicateDialogStep("choose");
    }
  }, [hasDuplicateFirstFee, swapResolved]);

  // Block browser back/forward and sidebar navigation when isNavigationBlocked
  useEffect(() => {
    if (!isNavigationBlocked) return;

    // Block browser back/forward via popstate
    const handlePopState = (e: PopStateEvent) => {
      // Push state back to prevent leaving
      window.history.pushState(null, "", window.location.href);
      if (needsRoleAssignment) {
        toast.error("請將本頁面指定為相關案件的主要或非主要營收紀錄。");
        setDuplicateDialogStep("assignRole");
      } else {
        toast.error("同一案件中有多個「主要營收紀錄」，請先更改勾選內容再離開此頁面");
        setDisableOption12A(false);
        setDuplicateDialogStep("choose");
      }
    };

    // Push an extra history entry so we can intercept back
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    // Block clicks on sidebar links and any internal <a> tags
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && href.startsWith("/")) {
        e.preventDefault();
        e.stopPropagation();
        if (needsRoleAssignment) {
          toast.error("請將本頁面指定為相關案件的主要或非主要營收紀錄。");
          setDuplicateDialogStep("assignRole");
        } else {
          toast.error("同一案件中有多個「主要營收紀錄」，請先更改勾選內容再離開此頁面");
          setDisableOption12A(false);
          setDuplicateDialogStep("choose");
        }
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isNavigationBlocked, needsRoleAssignment]);

  // Commit pending changes that have persisted for 5+ minutes
  useEffect(() => {
    if (pendingChanges.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const ready = pendingChanges.filter((c) => now - c.changedAt >= COMMIT_DELAY_MS);
      if (ready.length > 0) {
        setEditLog((prev) => {
          const newEntries = ready.map((c) => ({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            changedBy: roleLabels[currentRole],
            description: `${c.field} ${c.oldValue} → ${c.newValue}`,
            timestamp: formatTimestamp(new Date(c.changedAt)),
          }));
          const updated = [...prev, ...newEntries];
          // Sync to store
          if (id) {
            feeStore.updateFee(id, {
              editLogs: updated.map((e) => ({ id: e.id, field: "", oldValue: "", newValue: e.description, author: e.changedBy, timestamp: e.timestamp })),
            });
          }
          return updated;
        });
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
        {/* Role Switcher — dev only */}
        {import.meta.env.DEV && (
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
        )}
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <p className="text-sm">此稿費單尚未送出，譯者無法查看</p>
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
    setTaskItems((prev) => {
      const updated = prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item));
      if (id) feeStore.updateFee(id, { taskItems: updated });
      return updated;
    });
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
    // Force-commit all pending changes immediately
    if (pendingChanges.length > 0) {
      const newEntries = pendingChanges.map((c) => ({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        changedBy: roleLabels[currentRole],
        description: `${c.field} ${c.oldValue} → ${c.newValue}`,
        timestamp: formatTimestamp(new Date(c.changedAt)),
      }));
      setEditLog((prev) => {
        const updated = [...prev, ...newEntries];
        if (id) {
          feeStore.updateFee(id, {
            editLogs: updated.map((e) => ({ id: e.id, field: "", oldValue: "", newValue: e.description, author: e.changedBy, timestamp: e.timestamp })),
          });
        }
        return updated;
      });
      setPendingChanges([]);
    }

    // Take snapshot on first submit
    if (!hasBeenSubmittedRef.current) {
      snapshotRef.current = {
        taskItems: [...taskItems],
        title: feeData.title,
        assignee,
        internalNote,
      };
      hasBeenSubmittedRef.current = true;
    } else {
      // Log status change (finalize) after first submission
      const statusEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        changedBy: roleLabels[currentRole],
        description: `狀態 草稿 → 開立完成`,
        timestamp: formatTimestamp(new Date()),
      };
      setEditLog((prev) => {
        const updated = [...prev, statusEntry];
        if (id) {
          feeStore.updateFee(id, {
            editLogs: updated.map((e) => ({ id: e.id, field: "", oldValue: "", newValue: e.description, author: e.changedBy, timestamp: e.timestamp })),
          });
        }
        return updated;
      });
      // Update snapshot after force-commit
      snapshotRef.current = {
        taskItems: [...taskItems],
        title: feeData.title,
        assignee,
        internalNote,
      };
    }
    setStatus("finalized");
    if (id) feeStore.updateFee(id, { status: "finalized" });
  };

  const handleRecall = () => {
    // Log status change (recall) — always log after first submission
    if (hasBeenSubmittedRef.current) {
      const statusEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        changedBy: roleLabels[currentRole],
        description: `狀態 開立完成 → 草稿`,
        timestamp: formatTimestamp(new Date()),
      };
      setEditLog((prev) => {
        const updated = [...prev, statusEntry];
        if (id) {
          feeStore.updateFee(id, {
            editLogs: updated.map((e) => ({ id: e.id, field: "", oldValue: "", newValue: e.description, author: e.changedBy, timestamp: e.timestamp })),
          });
        }
        return updated;
      });
    }
    setStatus("draft");
    if (id) feeStore.updateFee(id, { status: "draft" });
  };

  const extractNotionPageId = (url: string): string | null => {
    // Match Notion URLs like: https://www.notion.so/workspace/Page-Title-<32-hex-id>
    // or https://notion.so/<32-hex-id>
    const match = url.match(/([a-f0-9]{32})/);
    return match ? match[1] : null;
  };

  const handleFetchFromUrl = async () => {
    const url = notionUrlInput.trim();
    if (!url) return;

    setInternalNoteUrl(url);
    if (id) feeStore.updateFee(id, { internalNoteUrl: url });

    // If it's a database URL (contains ?v=), strip ?v= and everything after, then retry
    let cleanedUrl = url;
    if (url.includes("notion.so") && url.includes("?v=")) {
      cleanedUrl = url.split("?v=")[0];
      toast.info("偵測到資料庫連結，已自動嘗試擷取頁面資料");
      setNotionUrlInput(cleanedUrl);
      setInternalNoteUrl(cleanedUrl);
      if (id) feeStore.updateFee(id, { internalNoteUrl: cleanedUrl });
    }

    // Auto-detect Notion URL and fetch data
    const pageId = extractNotionPageId(cleanedUrl);
    if (!pageId || !cleanedUrl.includes("notion.so")) {
      toast.info("已儲存連結");
      return;
    }

    setNotionLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-notion-page", {
        body: { page_id: pageId },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const knownTaskTypes: TaskType[] = ["翻譯", "校對", "MTPE", "LQA"];
      const taskTypeAliases: Record<string, TaskType> = { "審稿": "校對", "Review": "校對", "Translation": "翻譯", "Proofreading": "校對" };
      const autoCreated: { field: string; label: string }[] = [];

      const matchTaskType = (wt: string): string => {
        const direct = knownTaskTypes.find((t) => wt.includes(t));
        if (direct) return direct;
        for (const [alias, mapped] of Object.entries(taskTypeAliases)) {
          if (wt.includes(alias)) return mapped;
        }
        // Unknown type — return raw string, will be auto-created as new option
        return wt;
      };

      const ensureTaskTypeOption = (taskType: string) => {
        const existingOptions = selectOptionsStore.getSortedOptions("taskType");
        if (!existingOptions.find((o) => o.label === taskType)) {
          const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
          selectOptionsStore.addOption("taskType", taskType, color);
          // Also add to clientTaskType
          selectOptionsStore.addOption("clientTaskType", taskType, color);
          autoCreated.push({ field: "任務類型", label: taskType });
        }
      };

      // Detect which database the page is from
      const isInternalFeeRecord = "費用編號" in data;

      if (isInternalFeeRecord) {
        // ===== 💹 內部費用紀錄 mapping =====
        const feeNumber = data["費用編號"] || "";
        const client = data["客戶"] || "";
        const contact = data["聯絡人"] || "";
        const clientCaseId = data["客戶端案號"] || "";
        const clientPo = data["客戶 PO#"] || "";
        const quoteRate = data["報價費率"] ?? null;
        const feeRate = data["稿費費率"] ?? null;
        const unitCount = data["計費單位數"] ?? null;
        const unit = data["單位"] || "";
        const dispatch = data["派案途徑"] || "";
        let people = data["譯者"] || data["審稿人員"] || [];
        const casePages = data["案件頁面"] || [];
        const reconciled = data["對帳完成"] === true;
        const invoiced = data["請款完成"] === true;
        const rateConfirmed = data["費率無誤"] === true;
        let workTypes = data["工作類型"] || [];

        // If IR page is missing work types or translators, fetch from the related case page
        const missingWorkTypes = !Array.isArray(workTypes) || workTypes.length === 0;
        const missingPeople = !Array.isArray(people) || people.length === 0;
        if ((missingWorkTypes || missingPeople) && Array.isArray(casePages) && casePages.length > 0) {
          const casePageId = casePages[0].id?.replace(/-/g, "");
          if (casePageId) {
            try {
              const { data: caseData, error: caseErr } = await supabase.functions.invoke("fetch-notion-page", {
                body: { page_id: casePageId },
              });
              if (!caseErr && caseData && !caseData.error) {
                if (missingWorkTypes) {
                  workTypes = caseData["工作類型"] || [];
                }
                if (missingPeople) {
                  people = caseData["譯者"] || caseData["審稿人員"] || [];
                }
              }
            } catch (e) {
              console.warn("Failed to fetch case page for supplementary data:", e);
            }
          }
        }

        // Map 單位 to BillingUnit
        const billingUnitMap: Record<string, BillingUnit> = { "字": "字", "小時": "小時" };
        const billingUnit: BillingUnit = billingUnitMap[unit] || "字";

        // 標題：PO_案件編號（優先用案件頁面標題，否則用費用編號）
        const caseName = (Array.isArray(casePages) && casePages.length > 0 && casePages[0].title)
          ? casePages[0].title
          : feeNumber;
        if (caseName) {
          const newTitle = `PO_${caseName}`;
          setTitle(newTitle);
          if (id) feeStore.updateFee(id, { title: newTitle });
        }

        // 譯者 > 開單對象 (match by email)
        if (Array.isArray(people) && people.length > 0) {
          const person = people[0];
          const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
          let matchedLabel = "";
          if (typeof person === "object" && person.email) {
            const match = assigneeOptions.find((o) => o.email === person.email);
            if (match) matchedLabel = match.label;
          }
          if (!matchedLabel && typeof person === "object" && person.name) {
            const match = assigneeOptions.find((o) => o.label === person.name);
            if (match) matchedLabel = match.label;
          }
          if (!matchedLabel && typeof person === "string") {
            const match = assigneeOptions.find((o) => o.label === person || o.email === person);
            matchedLabel = match ? match.label : person;
          }
          if (matchedLabel) {
            setAssignee(matchedLabel);
            if (id) feeStore.updateFee(id, { assignee: matchedLabel });
          }
        }

        // 案件頁面 > 相關案件（名稱 + 連結）
        if (Array.isArray(casePages) && casePages.length > 0 && casePages[0].title) {
          const cp = casePages[0];
          setInternalNote(cp.title);
          setInternalNoteUrl(cp.url || "");
          if (id) feeStore.updateFee(id, { internalNote: cp.title, internalNoteUrl: cp.url || "" });
        } else if (feeNumber) {
          // Fallback: use fee number
          setInternalNote(feeNumber);
          if (id) feeStore.updateFee(id, { internalNote: feeNumber });
        }

        // 稿費費率 + 計費單位數 > 任務項目（支援多工作類型）
        if (Array.isArray(workTypes) && workTypes.length > 0) {
          const mapped: FeeTaskItem[] = workTypes.map((wt: string, idx: number) => {
            const matchedType = matchTaskType(wt);
            ensureTaskTypeOption(matchedType);
            return {
              id: `item-ir-${Date.now()}-${idx}`,
              taskType: matchedType as TaskType,
              billingUnit,
              unitCount: idx === 0 && unitCount ? unitCount : 0,
              unitPrice: idx === 0 && feeRate !== null ? feeRate : 0,
            };
          });
          setTaskItems(mapped);
        } else if (feeRate !== null || unitCount !== null) {
          setTaskItems((prev) => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[0] = {
                ...updated[0],
                billingUnit,
                ...(unitCount !== null ? { unitCount } : {}),
                ...(feeRate !== null ? { unitPrice: feeRate } : {}),
              };
            }
            return updated;
          });
        }

        // Auto-create client/contact options if they don't exist
        if (client) {
          const existingClients = selectOptionsStore.getSortedOptions("client");
          if (!existingClients.find((o) => o.label === client)) {
            selectOptionsStore.addOption("client", client, PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
            autoCreated.push({ field: "客戶", label: client });
          }
        }
        if (contact) {
          const existingContacts = selectOptionsStore.getSortedOptions("contact");
          if (!existingContacts.find((o) => o.label === contact)) {
            selectOptionsStore.addOption("contact", contact, "#9CA3AF");
            autoCreated.push({ field: "聯絡人", label: contact });
          }
        }

        // 客戶資訊
        const updatedClientInfo: ClientInfo = {
          ...clientInfo,
          ...(client ? { client } : {}),
          ...(contact ? { contact } : {}),
          ...(clientCaseId ? { clientCaseId } : {}),
          ...(clientPo ? { clientPoNumber: clientPo } : {}),
          ...(dispatch ? { dispatchRoute: dispatch } : {}),
          reconciled,
          invoiced,
          rateConfirmed,
          clientTaskItems: (Array.isArray(workTypes) && workTypes.length > 0)
            ? workTypes.map((wt: string, idx: number) => {
                const matchedType = matchTaskType(wt);
                return {
                  id: `ci-ir-${Date.now()}-${idx}`,
                  taskType: matchedType as TaskType,
                  billingUnit,
                  unitCount: idx === 0 && unitCount ? unitCount : 0,
                  clientPrice: idx === 0 && quoteRate !== null ? quoteRate : 0,
                };
              })
            : clientInfo.clientTaskItems.map((item, idx) =>
                idx === 0
                  ? {
                      ...item,
                      billingUnit,
                      ...(unitCount !== null ? { unitCount } : {}),
                      ...(quoteRate !== null ? { clientPrice: quoteRate } : {}),
                    }
                  : item
              ),
        };
        setClientInfo(updatedClientInfo);
        if (id) feeStore.updateFee(id, { clientInfo: updatedClientInfo });

        // Multi-translator: create additional fee pages
        if (Array.isArray(people) && people.length > 1) {
          const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
          const resolveAssignee = (person: any): string => {
            if (typeof person === "object" && person.email) {
              const m = assigneeOptions.find((o: any) => o.email === person.email);
              if (m) return m.label;
            }
            if (typeof person === "object" && person.name) {
              const m = assigneeOptions.find((o: any) => o.label === person.name);
              if (m) return m.label;
              return person.name;
            }
            if (typeof person === "string") {
              const m = assigneeOptions.find((o: any) => o.label === person || o.email === person);
              return m ? m.label : person;
            }
            return "";
          };

          // Use the already-computed title, not stale React state
          const computedTitle = (() => {
            const cn = (Array.isArray(casePages) && casePages.length > 0 && casePages[0].title)
              ? casePages[0].title
              : feeNumber;
            return cn ? `PO_${cn}` : title;
          })();
          const baseTitle = computedTitle.endsWith("_01") ? computedTitle : computedTitle;
          const currentTitle = `${baseTitle}_01`;
          setTitle(currentTitle);
          if (id) feeStore.updateFee(id, { title: currentTitle });

          // Set current page as primary in case group
          const currentCaseNote = internalNote || caseName || feeNumber;
          const primaryClientInfo: ClientInfo = {
            ...updatedClientInfo,
            sameCase: true,
            isFirstFee: true,
            notFirstFee: false,
          };
          setClientInfo(primaryClientInfo);
          if (id) feeStore.updateFee(id, { clientInfo: primaryClientInfo });

          const createdPages: { id: string; title: string; assignee: string }[] = [
            { id: id || "", title: currentTitle, assignee: resolveAssignee(people[0]) },
          ];

          // Use the mapped task items we just built, not the stale store data
          const cloneTaskItems = (Array.isArray(workTypes) && workTypes.length > 0)
            ? workTypes.map((wt: string, idx: number) => ({
                id: `item-ir-base-${Date.now()}-${idx}`,
                taskType: matchTaskType(wt) as TaskType,
                billingUnit,
                unitCount: idx === 0 && unitCount ? unitCount : 0,
                unitPrice: idx === 0 && feeRate !== null ? feeRate : 0,
              }))
            : taskItems;

          for (let i = 1; i < people.length; i++) {
            const personAssignee = resolveAssignee(people[i]);
            const pageTitle = `${baseTitle}_${String(i + 1).padStart(2, "0")}`;
            const newFee: TranslatorFee = {
              id: crypto.randomUUID(),
              title: pageTitle,
              assignee: personAssignee,
              status: "draft" as const,
              internalNote: currentCaseNote,
              internalNoteUrl: updatedClientInfo.clientCaseId ? "" : (internalNoteUrl || ""),
              taskItems: cloneTaskItems.map((item, idx) => ({ ...item, id: `item-clone-${Date.now()}-${idx}-${i}` })),
              clientInfo: {
                ...updatedClientInfo,
                sameCase: true,
                isFirstFee: false,
                notFirstFee: true,
              },
              notes: [],
              editLogs: [],
              createdBy: (id ? feeStore.getFeeById(id)?.createdBy : "") || "",
              createdAt: new Date().toISOString(),
            };
            feeStore.addFee(newFee);
            createdPages.push({ id: newFee.id, title: pageTitle, assignee: personAssignee });
          }

          setMultiTranslatorPages(createdPages);
        }

        toast.success("已從 Notion 載入內部費用紀錄");
        if (autoCreated.length > 0) setAutoCreatedOptions(autoCreated);
      } else {
        // ===== 🖖 翻譯案件 mapping (original logic) =====
        // Extract fields
        const caseId = data["案件編號"] || data["Name"] || data["title"] || "";
        const people = data["譯者"] || data["審稿人員"] || [];
        const workTypes = data["工作類型"] || [];
        const unitCount = data["計費單位數"] || null;

        // 案件編號 > 標題（預填為「PO_案件編號」）
        if (caseId) {
          const newTitle = `PO_${caseId}`;
          setTitle(newTitle);
          if (id) feeStore.updateFee(id, { title: newTitle });
        }

        // 譯者 > 開單對象 (match by email from Notion people)
        if (Array.isArray(people) && people.length > 0) {
          const person = people[0];
          const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
          let matchedLabel = "";

          if (typeof person === "object" && person.email) {
            // Match by email
            const match = assigneeOptions.find((o) => o.email === person.email);
            if (match) matchedLabel = match.label;
          }
          if (!matchedLabel && typeof person === "object" && person.name) {
            // Fallback: match by name
            const match = assigneeOptions.find((o) => o.label === person.name);
            if (match) matchedLabel = match.label;
          }
          // Legacy: person is a plain string
          if (!matchedLabel && typeof person === "string") {
            const match = assigneeOptions.find((o) => o.label === person || o.email === person);
            matchedLabel = match ? match.label : person;
          }

          if (matchedLabel) {
            setAssignee(matchedLabel);
            if (id) feeStore.updateFee(id, { assignee: matchedLabel });
          }
        }

        // 案件編號 > 相關案件文字
        if (caseId) {
          setInternalNote(caseId);
          if (id) feeStore.updateFee(id, { internalNote: caseId });
        }

        // 工作類型 > 任務項目 + 計費單位數 > 第一項
        const getAutoPrice = (taskType: string, billingUnit: string = "字") => {
          if (clientInfo.client) {
            const cp = defaultPricingStore.getClientPrice(clientInfo.client, taskType);
            if (cp !== undefined) {
              const tp = defaultPricingStore.getTranslatorPrice(cp, taskType, billingUnit);
              return tp ?? 0;
            }
          }
          return 0;
        };

        if (Array.isArray(workTypes) && workTypes.length > 0) {
          const mapped: FeeTaskItem[] = workTypes.map((wt: string, idx: number) => {
            const matchedType = matchTaskType(wt);
            ensureTaskTypeOption(matchedType);
            return {
              id: `item-notion-${Date.now()}-${idx}`,
              taskType: matchedType as TaskType,
              billingUnit: "字" as BillingUnit,
              unitCount: idx === 0 && unitCount ? unitCount : 0,
              unitPrice: getAutoPrice(matchedType as string, "字"),
            };
          });
          setTaskItems(mapped);

          // 同步工作類型到客戶計費項目
          const mappedClientItems: import("@/data/fee-mock-data").ClientTaskItem[] = workTypes.map((wt: string, idx: number) => {
            const matchedType = matchTaskType(wt);
            const cp = clientInfo.client
              ? defaultPricingStore.getClientPrice(clientInfo.client, matchedType as string) ?? 0
              : 0;
            return {
              id: `ci-notion-${Date.now()}-${idx}`,
              taskType: matchedType as TaskType,
              billingUnit: "字" as BillingUnit,
              unitCount: idx === 0 && unitCount ? unitCount : 0,
              clientPrice: cp,
            };
          });
          const updatedClientInfo = { ...clientInfo, clientTaskItems: mappedClientItems };
          setClientInfo(updatedClientInfo);
          if (id) feeStore.updateFee(id, { clientInfo: updatedClientInfo });
        } else if (unitCount) {
          setTaskItems((prev) =>
            prev.map((item, idx) => idx === 0 ? { ...item, unitCount } : item)
          );
          // 同步計費單位數到客戶資訊
          setClientInfo((prev) => ({
            ...prev,
            clientTaskItems: prev.clientTaskItems.map((item, idx) =>
              idx === 0 ? { ...item, unitCount, billingUnit: "字" as BillingUnit } : item
            ),
          }));
          if (id) {
            const updatedClientInfo = {
              ...clientInfo,
              clientTaskItems: clientInfo.clientTaskItems.map((item, idx) =>
                idx === 0 ? { ...item, unitCount, billingUnit: "字" as BillingUnit } : item
              ),
            };
            feeStore.updateFee(id, { clientInfo: updatedClientInfo });
          }
        }

        // Multi-translator: create additional fee pages
        if (Array.isArray(people) && people.length > 1) {
          const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
          const resolveAssignee = (person: any): string => {
            if (typeof person === "object" && person.email) {
              const m = assigneeOptions.find((o: any) => o.email === person.email);
              if (m) return m.label;
            }
            if (typeof person === "object" && person.name) {
              const m = assigneeOptions.find((o: any) => o.label === person.name);
              if (m) return m.label;
              return person.name;
            }
            if (typeof person === "string") {
              const m = assigneeOptions.find((o: any) => o.label === person || o.email === person);
              return m ? m.label : person;
            }
            return "";
          };

          // Use the computed title, not stale React state
          const computedCaseTitle = caseId ? `PO_${caseId}` : title;
          const baseTitle = computedCaseTitle;
          const currentTitle = `${baseTitle}_01`;
          setTitle(currentTitle);
          if (id) feeStore.updateFee(id, { title: currentTitle });

          // Set current page as primary in case group
          const currentCaseNote = internalNote || caseId;
          const latestClientInfo = feeStore.getFeeById(id || "")?.clientInfo ?? clientInfo;
          const primaryClientInfo: ClientInfo = {
            ...latestClientInfo,
            sameCase: true,
            isFirstFee: true,
            notFirstFee: false,
          };
          setClientInfo(primaryClientInfo);
          if (id) feeStore.updateFee(id, { clientInfo: primaryClientInfo });

          const createdPages: { id: string; title: string; assignee: string }[] = [
            { id: id || "", title: currentTitle, assignee: resolveAssignee(people[0]) },
          ];

          // Use freshly mapped task items, not stale store data
          const cloneTaskItems = (Array.isArray(workTypes) && workTypes.length > 0)
            ? workTypes.map((wt: string, idx: number) => ({
                id: `item-case-base-${Date.now()}-${idx}`,
                taskType: matchTaskType(wt) as TaskType,
                billingUnit: "字" as BillingUnit,
                unitCount: idx === 0 && unitCount ? unitCount : 0,
                unitPrice: 0,
              }))
            : taskItems;

          for (let i = 1; i < people.length; i++) {
            const personAssignee = resolveAssignee(people[i]);
            const pageTitle = `${baseTitle}_${String(i + 1).padStart(2, "0")}`;
            const newFee: TranslatorFee = {
              id: crypto.randomUUID(),
              title: pageTitle,
              assignee: personAssignee,
              status: "draft" as const,
              internalNote: currentCaseNote,
              internalNoteUrl: internalNoteUrl || "",
              taskItems: cloneTaskItems.map((item, idx) => ({ ...item, id: `item-clone-${Date.now()}-${idx}-${i}` })),
              clientInfo: {
                ...latestClientInfo,
                sameCase: true,
                isFirstFee: false,
                notFirstFee: true,
              },
              notes: [],
              editLogs: [],
              createdBy: (id ? feeStore.getFeeById(id)?.createdBy : "") || "",
              createdAt: new Date().toISOString(),
            };
            feeStore.addFee(newFee);
            createdPages.push({ id: newFee.id, title: pageTitle, assignee: personAssignee });
          }

          setMultiTranslatorPages(createdPages);
        }

        toast.success("已從 Notion 載入案件資料");
        if (autoCreated.length > 0) setAutoCreatedOptions(autoCreated);
      }
    } catch (err: any) {
      console.error("Failed to fetch Notion data:", err);
      toast.error("Notion 資料載入失敗：" + (err.message || "未知錯誤"));
    } finally {
      setNotionLoading(false);
    }
  };

  const totalAmount = isNoFeeTranslator ? 0 : taskItems.reduce(
    (sum, item) => sum + Number(item.unitCount) * Number(item.unitPrice),
    0
  );

  const formattedDate = formatTimestamp(feeData.createdAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Role Switcher — dev only */}
      {import.meta.env.DEV && (
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
      )}

      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 py-3 flex items-center justify-between gap-4">
        {isNavigationBlocked ? (
          <button
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-not-allowed"
            onClick={(e) => {
              e.preventDefault();
              if (needsRoleAssignment) {
                toast.error("請將本頁面指定為相關案件的主要或非主要營收紀錄。");
                setDuplicateDialogStep("assignRole");
              } else {
                toast.error("同一案件中有多個「主要營收紀錄」，請先更改勾選內容再離開此頁面");
                setDisableOption12A(false);
                setDuplicateDialogStep("choose");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            返回費用清單
          </button>
        ) : (
          <Link
            to="/fees"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            返回費用清單
          </Link>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {canDelete && (
            <Button variant="destructive" size="sm" className="text-xs" onClick={() => setDeleteDialogOpen(true)}>
              刪除
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" className="text-xs" onClick={handleSubmit}>
              開立稿費條
            </Button>
          )}
          {canRecall && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleRecall}>
              收回
            </Button>
          )}
          {isManager && isDraft && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (isNavigationBlocked) {
                  if (needsRoleAssignment) {
                    toast.error("請將本頁面指定為相關案件的主要或非主要營收紀錄。");
                    setDuplicateDialogStep("assignRole");
                  } else {
                    toast.error("同一案件中有多個「主要營收紀錄」，請先更改勾選內容");
                    setDisableOption12A(false);
                    setDuplicateDialogStep("choose");
                  }
                  return;
                }
                // Clone current fee with incrementing copy count
                const copyCount = (window as any).__copyCount ?? 0;
                (window as any).__copyCount = copyCount + 1;
                const draft = feeStore.createDraft();
                feeStore.updateFee(draft.id, {
                  title: title ? `${title} 副本${copyCount + 1}` : "",
                  assignee,
                  taskItems: taskItems.map((item, idx) => ({ ...item, id: `item-clone-${Date.now()}-${idx}` })),
                  internalNote,
                  internalNoteUrl,
                  clientInfo: { ...clientInfo },
                });
                navigate(`/fees/${draft.id}`);
              }}
            >
              複製本頁
            </Button>
          )}
          {isManager && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (isNavigationBlocked) {
                  if (needsRoleAssignment) {
                    toast.error("請將本頁面指定為相關案件的主要或非主要營收紀錄。");
                    setDuplicateDialogStep("assignRole");
                  } else {
                    toast.error("同一案件中有多個「主要營收紀錄」，請先更改勾選內容");
                    setDisableOption12A(false);
                    setDuplicateDialogStep("choose");
                  }
                  return;
                }
                const draft = feeStore.createDraft();
                navigate(`/fees/${draft.id}`);
              }}
            >
              建立新費用頁面
            </Button>
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-6 space-y-6"
      >
        {/* Title */}
        <div className="flex items-start justify-between gap-4">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (id) feeStore.updateFee(id, { title: e.target.value });
            }}
            disabled={!canEdit}
            className="text-lg font-semibold bg-transparent border-0 shadow-none px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="輸入稿費單標題"
          />
          {notionLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在從 Notion 載入…</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">譯者</Label>
              <ColorSelect
                fieldKey="assignee"
                value={assignee}
                disabled={!canEdit}
                onValueChange={(v) => {
                  trackChange("譯者", assignee, v);
                  setAssignee(v);
                  if (id) feeStore.updateFee(id, { assignee: v });
                }}
                placeholder="選擇譯者"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">狀態</Label>
              <div className="flex items-center h-10">
                <DetailStatusBadge status={status} />
              </div>
            </div>
          </div>

          {/* 相關案件 */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">相關案件</Label>
            {canEdit ? (
              internalNote ? (
                <div className="flex items-center gap-2">
                  {internalNoteUrl ? (
                    <a
                      href={internalNoteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center h-10 flex-1 rounded-md border border-input bg-secondary/50 px-3 text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
                    >
                      {internalNote}
                    </a>
                  ) : (
                    <div className="flex items-center h-10 flex-1 rounded-md border border-input bg-secondary/50 px-3 text-sm">
                      {internalNote}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={() => {
                      setInternalNote("");
                      setInternalNoteUrl("");
                      setNotionUrlInput("");
                      if (id) feeStore.updateFee(id, { internalNote: "", internalNoteUrl: "" });
                    }}
                    title="清除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={notionUrlInput}
                    onChange={(e) => setNotionUrlInput(e.target.value)}
                    className="bg-secondary/50 flex-1"
                    placeholder="貼上 Notion 案件頁面網址"
                    onKeyDown={(e) => { if (e.key === "Enter") handleFetchFromUrl(); }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    disabled={!notionUrlInput.trim() || notionLoading}
                    onClick={handleFetchFromUrl}
                  >
                    {notionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "確認"}
                  </Button>
                </div>
              )
            ) : internalNoteUrl ? (
              <a
                href={internalNoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center h-10 w-full rounded-md border border-input bg-secondary/50 px-3 text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
              >
                {internalNote || internalNoteUrl}
              </a>
            ) : (
              <div className="flex items-center h-10 w-full rounded-md border border-input bg-secondary/50 px-3 text-sm text-muted-foreground">
                {internalNote || "未設定"}
              </div>
            )}
          </div>

          {/* 客戶 + 聯絡人 */}
          {isManager && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">客戶</Label>
                <ColorSelect
                  fieldKey="client"
                  value={clientInfo.client}
                  disabled={!canEdit}
                  onValueChange={(clientName) => {
                    trackChange("客戶", clientInfo.client, clientName);
                    const updatedInfo = { ...clientInfo, client: clientName };
                    if (clientName) {
                      // Auto-fill client task item prices (always overwrite on client change)
                      updatedInfo.clientTaskItems = updatedInfo.clientTaskItems.map(item => {
                        const price = defaultPricingStore.getClientPrice(clientName, item.taskType);
                        return price !== undefined ? { ...item, clientPrice: price } : item;
                      });
                      // Auto-fill translator task item prices via tiers (always overwrite)
                      const updatedTaskItems = taskItems.map(item => {
                        const cp = defaultPricingStore.getClientPrice(clientName, item.taskType);
                        if (cp === undefined) return item;
                        const tp = defaultPricingStore.getTranslatorPrice(cp, item.taskType, item.billingUnit);
                        return tp !== undefined ? { ...item, unitPrice: tp } : item;
                      });
                      setTaskItems(updatedTaskItems);
                      if (id) feeStore.updateFee(id, { taskItems: updatedTaskItems });
                    }
                    setClientInfo(updatedInfo);
                    if (id) feeStore.updateFee(id, { clientInfo: updatedInfo });
                  }}
                  placeholder="選擇客戶"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">聯絡人</Label>
                <ColorSelect
                  fieldKey="contact"
                  value={clientInfo.contact}
                  disabled={!canEdit}
                  onValueChange={(v) => {
                    trackChange("聯絡人", clientInfo.contact, v);
                    const updated = { ...clientInfo, contact: v };
                    setClientInfo(updated);
                    if (id) feeStore.updateFee(id, { clientInfo: updated });
                  }}
                  placeholder="選擇聯絡人"
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Task Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">稿費內容</Label>
              {isNoFeeTranslator && (
                <span className="text-xs text-warning bg-warning/10 border border-warning/30 rounded px-2 py-0.5">無須開立稿費</span>
              )}
              {(() => {
                const assigneeOpt = selectOptionsStore.getField("assignee").options.find(o => o.label === assignee || o.email === assignee);
                return assigneeOpt?.note ? (
                  <span className="text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-0.5">{assigneeOpt.note}</span>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              {isManager && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="rateConfirmed"
                    checked={isNoFeeTranslator ? true : clientInfo.rateConfirmed}
                    disabled={!canEdit || isNoFeeTranslator}
                    onCheckedChange={(checked) => {
                      const updated = { ...clientInfo, rateConfirmed: !!checked };
                      setClientInfo(updated);
                      if (id) feeStore.updateFee(id, { clientInfo: updated });
                    }}
                  />
                  <Label htmlFor="rateConfirmed" className="text-xs cursor-pointer whitespace-nowrap">費率無誤</Label>
                </div>
              )}
              {canEdit && !isNoFeeTranslator && (
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
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30">
                  <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>譯者任務類型</TableHead>
                  <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>計費單位</TableHead>
                  <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>稿費單價</TableHead>
                  <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>計費單位數</TableHead>
                  <TableHead className="text-xs text-center" style={{ width: '18.4%' }}>小計</TableHead>
                  {canEdit && <TableHead className="text-xs text-center" style={{ width: '8%' }}>刪除</TableHead>}
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
                    <TableRow key={item.id} className={isNoFeeTranslator ? "opacity-50" : ""}>
                      <TableCell className="text-center">
                        <ColorSelect
                          fieldKey="taskType"
                          value={item.taskType}
                          disabled={!canEdit || isNoFeeTranslator}
                          onValueChange={(v) => handleUpdateItem(item.id, "taskType", v)}
                          triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <ColorSelect
                          fieldKey="billingUnit"
                          value={item.billingUnit}
                          disabled={!canEdit || isNoFeeTranslator}
                          onValueChange={(v) => handleUpdateItem(item.id, "billingUnit", v)}
                          triggerClassName="h-8 text-xs bg-transparent border-0 shadow-none px-0 justify-center"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={isNoFeeTranslator ? "N/A" : item.unitPrice}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^[0-9]*\.?[0-9]*$/.test(v)) handleUpdateItem(item.id, "unitPrice", v as any);
                          }}
                          onFocus={() => setShowPricingTip(false)}
                          onBlur={(e) => handleNumberBlur(item.id, "unitPrice", e.target.value)}
                          disabled={!canEdit || isNoFeeTranslator}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={item.unitCount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^[0-9]*\.?[0-9]*$/.test(v)) handleUpdateItem(item.id, "unitCount", v as any);
                          }}
                          onBlur={(e) => handleNumberBlur(item.id, "unitCount", e.target.value)}
                          disabled={!canEdit || isNoFeeTranslator}
                          className="h-8 text-xs bg-transparent border-0 shadow-none px-0 w-full text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {isNoFeeTranslator ? 0 : (Number(item.unitCount) * Number(item.unitPrice)).toLocaleString()}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="px-2">
                          <div className="flex justify-center">
                            {taskItems.length > 1 ? (
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
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
              {taskItems.length > 0 && (
                <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="px-[18px]">
                        <span className={`text-xs font-medium text-primary transition-opacity duration-500 ${showPricingTip ? "opacity-100" : "opacity-0"}`}>
                          {showPricingTip && "首度填寫客戶報價時，系統會自動按照級距表（見「設定」）填入單價。"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        稿費總額
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

        {/* Client Info Section — PM+ only */}
        {isManager && (
          <>
            <Separator />
            <div className="space-y-3">
              <ClientInfoSection
                clientInfo={clientInfo}
                onChange={(info) => {
                  setClientInfo(info);
                  if (id) feeStore.updateFee(id, { clientInfo: info });
                }}
                canEdit={canEdit}
                translatorTotal={totalAmount}
                allFees={allFees}
                currentFeeId={id ?? ""}
                currentInternalNote={internalNote}
                onFirstFeeConflict={() => {
                  setSwapResolved(false);
                  setDisableOption12A(false);
                  setDuplicateDialogStep("choose");
                }}
                onClientPriceEntered={(itemIndex, clientPrice, taskType, billingUnit) => {
                  setShowPricingTip(false);
                  // Auto-fill translator unit price if empty
                  if (itemIndex < taskItems.length) {
                    const item = taskItems[itemIndex];
                    if (!item.unitPrice || item.unitPrice === 0) {
                      const tp = defaultPricingStore.getTranslatorPrice(clientPrice, taskType, billingUnit);
                      if (tp !== undefined && tp > 0) {
                        const updated = taskItems.map((ti, idx) =>
                          idx === itemIndex ? { ...ti, unitPrice: tp } : ti
                        );
                        setTaskItems(updated);
                        if (id) feeStore.updateFee(id, { taskItems: updated });
                      }
                    }
                  }
                }}
              />
            </div>
          </>
        )}

        <Separator />

        {/* Meta info */}
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>建立者：{creatorName}</span>
          <span>建立時間：{formattedDate}</span>
        </div>

        {/* Edit History — only show when there are committed or pending entries */}
        {(() => {
          const clientInfoKeywords = ["客戶", "聯絡人", "案號", "PO", "硬碟", "對帳", "費率", "請款", "同一案件", "主要營收", "營收", "利潤", "客戶端"];
          const isClientLog = (desc: string) => clientInfoKeywords.some((kw) => desc.includes(kw));
          const filteredEditLog = isManager ? editLog : editLog.filter((e) => !isClientLog(e.description));
          const filteredPending = isManager ? pendingChanges : pendingChanges.filter((c) => !isClientLog(c.field));
          if (filteredEditLog.length === 0 && filteredPending.length === 0) return null;
          return (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">變更紀錄</Label>
                <div className="space-y-2">
                  {filteredEditLog.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs space-y-0.5">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        <span><span className="text-muted-foreground">變更者：</span>{entry.changedBy}</span>
                        <span><span className="text-muted-foreground">變更內容：</span>{entry.description}</span>
                        <span><span className="text-muted-foreground">變更時間：</span>{entry.timestamp}</span>
                      </div>
                    </div>
                  ))}
                  {filteredPending.map((change, idx) => (
                    <div key={`pending-${idx}`} className="rounded-md border border-dashed border-border bg-secondary/15 px-3 py-2 text-xs space-y-0.5 opacity-60">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 italic">
                        <span><span className="text-muted-foreground">變更者：</span>{roleLabels[currentRole]}</span>
                        <span><span className="text-muted-foreground">變更內容：</span>{change.field} {change.oldValue} → {change.newValue}</span>
                        <span><span className="text-muted-foreground">變更時間：</span>{formatTimestamp(new Date(change.changedAt))}</span>
                        <span className="text-muted-foreground">（未滿 5 分鐘，尚未正式紀錄）</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}

        {/* 留言與備註 — visible to assignee + PM+ */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-sm font-medium">留言與備註</Label>
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{c.author}</span>
                  <span className="text-muted-foreground">{c.timestamp}</span>
                </div>
                <CommentContent content={c.content} imageUrls={c.imageUrls} />
              </div>
            ))}
          </div>
          <CommentInput
            draft={commentDraft}
            setDraft={setCommentDraft}
            placeholder="輸入留言..."
            onSubmit={(content, imageUrls) => {
              const newNote = {
                id: `comment-${Date.now()}`,
                author: roleLabels[currentRole],
                content,
                imageUrls,
                timestamp: formatTimestamp(new Date()),
              };
              setComments((prev) => [...prev, newNote]);
              // Sync to store
              if (id) {
                const storeNote = { id: newNote.id, text: content, author: newNote.author, createdAt: new Date().toISOString() };
                const currentFee = feeStore.getFeeById(id);
                if (currentFee) {
                  feeStore.updateFee(id, { notes: [...currentFee.notes, storeNote] });
                }
              }
            }}
          />
        </div>

        {/* 內部備註 — visible to PM+ only */}
        {isManager && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">內部備註</Label>
              <div className="space-y-2">
                {internalComments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-muted-foreground">{c.timestamp}</span>
                    </div>
                    <CommentContent content={c.content} imageUrls={c.imageUrls} />
                  </div>
                ))}
              </div>
              <CommentInput
                draft={internalCommentDraft}
                setDraft={setInternalCommentDraft}
                placeholder="輸入內部備註..."
                onSubmit={(content, imageUrls) => {
                  setInternalComments((prev) => [...prev, {
                    id: `icomment-${Date.now()}`,
                    author: roleLabels[currentRole],
                    content,
                    imageUrls,
                    timestamp: formatTimestamp(new Date()),
                  }]);
                }}
              />
            </div>
          </>
        )}
      </motion.div>

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
              onClick={() => { if (id) feeStore.deleteFee(id); navigate("/fees"); }}
            >
              確定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate isFirstFee Warning — Step 1: Choose */}
      <AlertDialog open={duplicateDialogStep === "choose"} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>同一案件中有多個「主要營收紀錄」</AlertDialogTitle>
            <AlertDialogDescription>
              同一案件群組中已有其他費用頁面被設為主要營收紀錄。請選擇本頁的角色：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              disabled={disableOption12A}
              onClick={() => { confirmSwapOriginRef.current = "choose"; setDuplicateDialogStep("confirmSwap"); }}
            >
              將本頁設為主要營收紀錄
            </Button>
            <Button
              onClick={() => {
                // Set this page as notFirstFee
                const updated = { ...clientInfo, isFirstFee: false, notFirstFee: true };
                setClientInfo(updated);
                if (id) feeStore.updateFee(id, { clientInfo: updated });
                setDuplicateDialogStep(null);
                setDisableOption12A(false);
                toast.success("已將本頁設為非主要營收紀錄");
              }}
            >
              將本頁設為非主要營收紀錄
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate isFirstFee Warning — Step 2: Confirm swap */}
      <AlertDialog open={duplicateDialogStep === "confirmSwap"} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認變更主要營收紀錄？</AlertDialogTitle>
            <AlertDialogDescription>
              原本的主要營收紀錄頁面「{otherFirstFee?.title || "（未命名）"}」將會自動變更為非主要營收紀錄，由本頁取代。是否確定？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => {
              setDisableOption12A(true);
              setDuplicateDialogStep(confirmSwapOriginRef.current);
            }}>
              否
            </Button>
            <Button onClick={() => {
              // Swap: other fee becomes notFirstFee, this page becomes isFirstFee
              setSwapResolved(true);
              if (otherFirstFee) {
                const otherClientInfo = { ...otherFirstFee.clientInfo!, isFirstFee: false, notFirstFee: true };
                feeStore.updateFee(otherFirstFee.id, { clientInfo: otherClientInfo });
              }
              // Ensure current page is set as primary and persisted
              const updatedClientInfo = { ...clientInfo, isFirstFee: true, notFirstFee: false };
              setClientInfo(updatedClientInfo);
              if (id) feeStore.updateFee(id, { clientInfo: updatedClientInfo });
              setDuplicateDialogStep(null);
              setDisableOption12A(false);
              toast.success("已將本頁設為主要營收紀錄");
            }}>
              是
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Role Dialog — sameCase checked but no role selected */}
      <AlertDialog open={duplicateDialogStep === "assignRole"} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>請指定營收紀錄角色</AlertDialogTitle>
            <AlertDialogDescription>
              請將本頁面指定為相關案件的主要或非主要營收紀錄。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (otherFirstFee) {
                  // There's already a primary — need to go through confirmSwap
                  confirmSwapOriginRef.current = "assignRole";
                  setDuplicateDialogStep("confirmSwap");
                } else {
                  const updated = { ...clientInfo, isFirstFee: true, notFirstFee: false };
                  setClientInfo(updated);
                  if (id) feeStore.updateFee(id, { clientInfo: updated });
                  setDuplicateDialogStep(null);
                  toast.success("已將本頁設為主要營收紀錄");
                }
              }}
            >
              將本頁設為主要營收紀錄
            </Button>
            <Button
              onClick={() => {
                const updated = { ...clientInfo, isFirstFee: false, notFirstFee: true };
                setClientInfo(updated);
                if (id) feeStore.updateFee(id, { clientInfo: updated });
                setDuplicateDialogStep(null);
                toast.success("已將本頁設為非主要營收紀錄");
              }}
            >
              將本頁設為非主要營收紀錄
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-translator pages created dialog */}
      <AlertDialog open={multiTranslatorPages !== null} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已建立多個費用頁面</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  因為譯者人數多於一位，系統已自動建立 {multiTranslatorPages?.length ?? 0} 個費用頁面。
                  目前開啟的頁面是「{multiTranslatorPages?.[0]?.title}」。
                </p>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground text-sm">群組內頁面：</p>
                  {multiTranslatorPages?.map((page, idx) => (
                    <div key={page.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{idx + 1}.</span>
                      <span className="font-medium">{page.title}</span>
                      <span className="text-muted-foreground">— {page.assignee}</span>
                      {idx === 0 && <Badge variant="outline" className="text-[10px] h-4 px-1">主要</Badge>}
                      {idx > 0 && (
                        <Link
                          to={`/fees/${page.id}`}
                          className="text-primary hover:underline text-xs"
                          onClick={() => setMultiTranslatorPages(null)}
                        >
                          前往
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setMultiTranslatorPages(null)}>
              我知道了
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-created options notification dialog */}
      <AlertDialog open={autoCreatedOptions !== null} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已自動建立新選項</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>從 Notion 匯入時偵測到以下尚未存在的選項，已自動建立：</p>
                <div className="space-y-1">
                  {autoCreatedOptions?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{item.field}：</span>
                      <span className="font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setAutoCreatedOptions(null)}>
              我知道了
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
