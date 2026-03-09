/**
 * 內部註記 — full table view with FilterSortToolbar matching fee management pattern.
 */
import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { TableFooterStats } from "@/components/TableFooterStats";
import { toast } from "sonner";
import { Plus, ExternalLink, Trash2, GripVertical } from "lucide-react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultilineInput } from "@/components/ui/multiline-input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { useRowSelection } from "@/hooks/use-row-selection";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import FileField from "@/components/FileField";
import { CommentInput } from "@/components/comments/CommentInput";
import { CommentContent } from "@/components/comments/CommentContent";
import {
  useInternalNotesTableViews,
  internalNotesFieldMetas,
  type InternalNote,
  type NoteComment,
} from "@/hooks/use-internal-notes-table-views";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useInternalNotes, internalNotesStore } from "@/stores/internal-notes-store";
import { useAuth } from "@/hooks/use-auth";
import { caseStore } from "@/hooks/use-case-store";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";

/* ── Helpers ── */
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

function generateNoteTitle(caseTitle: string): string {
  const baseId = caseTitle.replace(/[_\-]?\d{6,8}$/g, "").replace(/[_\-]?\d{4}[\-\/]?\d{2}[\-\/]?\d{2}$/, "").trim() || caseTitle;
  const prefix = `${baseId}_Note_`;
  const maxSeq = internalNotesStore.getMaxSeqForPrefix(prefix);
  const nextSeq = String(maxSeq + 1).padStart(5, "0");
  return `${prefix}${nextSeq}`;
}

/* ── Status color helper ── */
function StatusBadge({ status, invalidated }: { status: string; invalidated?: boolean }) {
  const { options } = useSelectOptions("noteStatus");
  if (invalidated) {
    return <Badge variant="destructive" className="text-xs whitespace-nowrap">已失效</Badge>;
  }
  const opt = options.find((o) => o.label === status);
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className="text-xs whitespace-nowrap border"
      style={opt ? { backgroundColor: opt.color, color: "#fff", borderColor: opt.color } : undefined}
    >
      {status}
    </Badge>
  );
}

function NatureBadge({ nature }: { nature: string }) {
  const { options } = useSelectOptions("noteNature");
  const opt = options.find((o) => o.label === nature);
  if (!nature) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className="text-xs whitespace-nowrap border"
      style={opt ? { backgroundColor: opt.color, color: "#fff", borderColor: opt.color } : undefined}
    >
      {nature}
    </Badge>
  );
}

/* ── Column defs ── */
interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (note: InternalNote) => React.ReactNode;
}

/* ── Detail view ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-3 py-1">
      <span className="text-sm text-muted-foreground pt-1">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function NoteDetailView({
  note,
  onUpdate,
  onBack,
  onDelete,
}: {
  note: InternalNote;
  onUpdate: (updates: Partial<InternalNote>) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [invalidateOpen, setInvalidateOpen] = useState(false);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const comments = note.comments || [];

  const handleInvalidate = () => {
    onUpdate({
      invalidated: true,
      invalidatedBy: profile?.display_name || "未知",
      invalidatedAt: new Date().toISOString(),
      invalidationReason: invalidateReason,
      status: "已失效",
    });
    setInvalidateOpen(false);
    setInvalidateReason("");
  };

  const handleNewSameCaseNote = () => {
    const title = generateNoteTitle(note.relatedCase);
    // Get case reviewer
    const cases = caseStore.getAll();
    const relatedCase = cases.find((c) => c.title === note.relatedCase);
    const reviewer = relatedCase?.reviewer || "";

    const newNote: InternalNote = {
      id: `note-${Date.now()}`,
      title,
      relatedCase: note.relatedCase,
      createdAt: new Date().toISOString(),
      creator: profile?.display_name || "",
      status: note.status,
      noteType: note.noteType,
      internalAssignee: reviewer ? [reviewer] : [],
      fileName: note.fileName,
      idRowCount: note.idRowCount,
      sourceText: note.sourceText,
      translatedText: note.translatedText,
      questionOrNote: note.questionOrNote,
      referenceFiles: note.referenceFiles.map((f) => ({ ...f })),
      comments: [],
      invalidated: false,
    };
    internalNotesStore.add(newNote);
    toast.success(`已建立新註記頁面「${title}」，現有內容複製自原頁面，請確實妥善編輯更改。`);
    navigate(`/internal-notes?noteId=${newNote.id}`);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>←</span> 返回列表
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs min-w-[88px]" onClick={handleNewSameCaseNote}>
            新增同案件註記
          </Button>
          <Button
            size="sm"
            className="text-xs min-w-[88px] text-white hover:opacity-80"
            style={{ backgroundColor: "#6B7280" }}
            onClick={() => setDeleteOpen(true)}
          >
            刪除
          </Button>
          {!note.invalidated && (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: "#383A3F" }}
              onClick={() => setInvalidateOpen(true)}
            >
              本註記已失效
            </Button>
          )}
        </div>
      </div>

      {/* Title — read-only */}
      <div className="text-lg font-semibold px-0">
        {note.title || <span className="text-muted-foreground italic">未命名</span>}
      </div>
      <Separator />

      <Field label="關聯案件">
        {note.relatedCase ? (
          <Link to={`/cases/${caseStore.getAll().find((c) => c.title === note.relatedCase)?.id || ""}`} className="text-sm text-primary hover:underline">
            {note.relatedCase}
          </Link>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </Field>

      <Field label="建立者">
        <span className="text-sm">{note.creator || "—"}</span>
      </Field>
      <Field label="建立時間">
        <span className="text-sm">{new Date(note.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </Field>

      <Field label="性質">
        <ColorSelect fieldKey="noteNature" value={note.noteType} onValueChange={(v) => onUpdate({ noteType: v })} />
      </Field>

      <Field label="狀態">
        {note.invalidated ? (
          <div className="space-y-1">
            <Badge variant="destructive" className="text-xs">已失效</Badge>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
              <div>變更者：{note.invalidatedBy || "—"}</div>
              <div>失效時間：{note.invalidatedAt ? new Date(note.invalidatedAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</div>
              <div>理由：{note.invalidationReason || "—"}</div>
            </div>
          </div>
        ) : (
          <ColorSelect fieldKey="noteStatus" value={note.status} onValueChange={(v) => onUpdate({ status: v })} />
        )}
      </Field>

      <Field label="內部指派對象">
        <MultiColorSelect fieldKey="assignee" values={Array.isArray(note.internalAssignee) ? note.internalAssignee : note.internalAssignee ? [note.internalAssignee] : []} onValuesChange={(v) => onUpdate({ internalAssignee: v })} />
      </Field>

      <Separator />

      <Field label="檔案名稱">
        <MultilineInput 
          value={note.fileName} 
          onChange={(e) => onUpdate({ fileName: e.target.value })} 
          className="max-w-md" 
          minRows={1}
          maxRows={3}
        />
      </Field>
      <Field label="ID / 行數">
        <MultilineInput 
          value={note.idRowCount} 
          onChange={(e) => onUpdate({ idRowCount: e.target.value })} 
          className="max-w-xs"
          minRows={1}
          maxRows={2}
        />
      </Field>
      <Field label="原文">
        <MultilineInput 
          value={note.sourceText} 
          onChange={(e) => onUpdate({ sourceText: e.target.value })} 
          className="min-h-[60px]"
          minRows={3}
          maxRows={8}
        />
      </Field>
      <Field label="譯文">
        <MultilineInput 
          value={note.translatedText} 
          onChange={(e) => onUpdate({ translatedText: e.target.value })} 
          className="min-h-[60px]"
          minRows={3}
          maxRows={8}
        />
      </Field>
      <Field label="問題或註記內容">
        <Suspense fallback={<div className="h-32 rounded-md border border-input bg-background animate-pulse" />}>
          <RichTextEditor
            initialContent={(() => {
              // Try parsing as JSON blocks; fall back to plain text paragraph
              if (Array.isArray((note as any).questionOrNoteBlocks) && (note as any).questionOrNoteBlocks.length > 0) {
                return (note as any).questionOrNoteBlocks;
              }
              return undefined;
            })()}
            onChange={(blocks) => onUpdate({ questionOrNoteBlocks: blocks } as any)}
          />
        </Suspense>
      </Field>

      <Field label="參考資料或截圖">
        <FileField
          value={note.referenceFiles || []}
          onChange={(v) => onUpdate({ referenceFiles: v })}
        />
      </Field>

      <Separator />

      {/* 留言與討論 */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">留言與討論</Label>
        <div className="space-y-2">
          {(() => {
            const topLevel = comments.filter((c) => !c.replyTo);
            const getReplies = (parentId: string) => comments.filter((c) => c.replyTo === parentId);
            return topLevel.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-TW")}</span>
                    </div>
                    <button className="text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors" onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}>回覆</button>
                  </div>
                  <CommentContent content={c.content} imageUrls={c.imageUrls} fileUrls={c.fileUrls} />
                </div>
                {getReplies(c.id).map((r) => (
                  <div key={r.id} className="ml-6 rounded-md border border-border/60 bg-secondary/15 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{r.author}</span>
                      <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString("zh-TW")}</span>
                    </div>
                    <CommentContent content={r.content} imageUrls={r.imageUrls} fileUrls={r.fileUrls} />
                  </div>
                ))}
                {replyingTo === c.id && (
                  <div className="ml-6">
                    <CommentInput
                      draft={commentDraft}
                      setDraft={setCommentDraft}
                      placeholder={`回覆 ${c.author}...`}
                      onSubmit={(content, imageUrls, fileUrls) => {
                        const newComment: NoteComment = {
                          id: `nc-${Date.now()}`,
                          author: profile?.display_name || "未知",
                          content,
                          imageUrls,
                          fileUrls,
                          replyTo: c.id,
                          createdAt: new Date().toISOString(),
                        };
                        onUpdate({ comments: [...comments, newComment] });
                        setReplyingTo(null);
                      }}
                    />
                  </div>
                )}
              </div>
            ));
          })()}
        </div>
        <CommentInput
          draft={replyingTo ? "" : commentDraft}
          setDraft={(v) => { if (!replyingTo) setCommentDraft(v); }}
          placeholder="輸入留言..."
          onSubmit={(content, imageUrls, fileUrls) => {
            const newComment: NoteComment = {
              id: `nc-${Date.now()}`,
              author: profile?.display_name || "未知",
              content,
              imageUrls,
              fileUrls,
              createdAt: new Date().toISOString(),
            };
            onUpdate({ comments: [...comments, newComment] });
          }}
        />
      </div>

      {/* Invalidation dialog */}
      <Dialog open={invalidateOpen} onOpenChange={setInvalidateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>標記為已失效</DialogTitle>
            <DialogDescription>請輸入理由，確認後此註記狀態將變為「已失效」，且無法回復。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={invalidateReason}
            onChange={(e) => setInvalidateReason(e.target.value)}
            placeholder="請輸入失效理由…"
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvalidateOpen(false)}>取消</Button>
            <Button onClick={handleInvalidate} disabled={!invalidateReason.trim()}>確認</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除此內部註記嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(); setDeleteOpen(false); }}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  ); // end NoteDetailView return
} // end NoteDetailView

/* ── Case selection dialog for creating a note from the list ── */
function NewNoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState("");

  const cases = useMemo(() => caseStore.getAll(), [open]);
  const filtered = useMemo(() => {
    if (!search.trim()) return cases;
    return cases.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  }, [cases, search]);

  const handleConfirm = () => {
    if (!selectedCase) return;
    const caseRecord = cases.find((c) => c.title === selectedCase);
    const reviewer = caseRecord?.reviewer || "";
    const title = generateNoteTitle(selectedCase);
    const newNote: InternalNote = {
      id: `note-${Date.now()}`,
      title,
      relatedCase: selectedCase,
      createdAt: new Date().toISOString(),
      creator: profile?.display_name || "",
      status: "",
      noteType: "",
      internalAssignee: reviewer ? [reviewer] : [],
      fileName: "",
      idRowCount: "",
      sourceText: "",
      translatedText: "",
      questionOrNote: "",
      referenceFiles: [],
      comments: [],
      invalidated: false,
    };
    internalNotesStore.add(newNote);
    onOpenChange(false);
    setSearch("");
    setSelectedCase("");
    navigate(`/internal-notes?noteId=${newNote.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSearch(""); setSelectedCase(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增內部註記</DialogTitle>
          <DialogDescription>請選擇關聯案件，確定後將自動產生標題編號。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="搜尋案件編號…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto border rounded-md">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground p-3">找不到案件</p>}
            {filtered.map((c) => (
              <button
                key={c.id}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                  selectedCase === c.title && "bg-primary/10 font-medium"
                )}
                onClick={() => setSelectedCase(c.title)}
              >
                {c.title || <span className="italic text-muted-foreground">未命名</span>}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleConfirm} disabled={!selectedCase}>確定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main page ── */
export default function InternalNotesPage() {
  const notes = useInternalNotes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [newNoteOpen, setNewNoteOpen] = useState(false);

  // Auto-open note if ?noteId= is in URL
  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (noteId && notes.find((n) => n.id === noteId)) {
      setSelectedId(noteId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, notes]);

  const tableViews = useInternalNotesTableViews("executive");
  const { activeView } = tableViews;
  const visibleFieldKeys = internalNotesFieldMetas.map((f) => f.key);

  const visibleNotes = tableViews.applyFiltersAndSorts(notes);
  const rowSelection = useRowSelection(visibleNotes.map((n) => n.id));

  const statusOptions = useSelectOptions("noteStatus").options.map((o) => ({ value: o.label, label: o.label }));

  const allColumnDefs: ColumnDef[] = [
    {
      key: "title", label: "標題", minWidth: 120,
      render: (n) => (
        <div className="relative flex items-center group/title">
          <span className="text-sm font-medium truncate flex-1 min-w-0 pr-6">
            {n.title || <span className="text-muted-foreground italic">未命名</span>}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedId(n.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover/title:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
            title="開啟"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ),
    },
    { key: "relatedCase", label: "關聯案件", minWidth: 120, render: (n) => <span className="text-sm text-muted-foreground truncate">{n.relatedCase || "—"}</span> },
    {
      key: "status", label: "狀態", minWidth: 100,
      render: (n) => <StatusBadge status={n.status} invalidated={n.invalidated} />,
    },
    {
      key: "noteType", label: "性質", minWidth: 80,
      render: (n) => <NatureBadge nature={n.noteType} />,
    },
    { key: "creator", label: "建立者", minWidth: 80, render: (n) => <span className="text-sm">{n.creator || "—"}</span> },
    { key: "internalAssignee", label: "內部指派", minWidth: 80, render: (n) => <span className="text-sm">{(Array.isArray(n.internalAssignee) ? n.internalAssignee : n.internalAssignee ? [n.internalAssignee] : []).join(", ") || "—"}</span> },
    { key: "createdAt", label: "建立時間", minWidth: 100, render: (n) => <span className="text-sm text-muted-foreground tabular-nums">{formatDate(n.createdAt)}</span> },
  ];

  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const orderedCols = activeView.columnOrder
    .map((key) => allColumnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key));
  for (const col of allColumnDefs) {
    if (!activeView.columnOrder.includes(col.key) && !hiddenSet.has(col.key)) orderedCols.push(col);
  }
  const totalWidth = orderedCols.reduce((s, c) => s + (activeView.columnWidths[c.key] ?? 100), 0) + 60;

  // Column resize
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault(); e.stopPropagation();
    const startWidth = activeView.columnWidths[key] ?? 100;
    resizingRef.current = { key, startX: e.clientX, startWidth };
    const col = allColumnDefs.find((c) => c.key === key);
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const minW = col?.minWidth ?? 60;
      tableViews.setColumnWidth(resizingRef.current.key, Math.max(minW, resizingRef.current.startWidth + delta));
    };
    const onUp = () => { resizingRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [activeView.columnWidths, tableViews]);

  // Column drag reorder
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const handleDragStart = (e: React.DragEvent, key: string) => { dragColRef.current = key; e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, key: string) => { e.preventDefault(); if (dragColRef.current && dragColRef.current !== key) setDragOverCol(key); };
  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = dragColRef.current;
    if (!sourceKey || sourceKey === targetKey) return;
    const next = [...activeView.columnOrder];
    const srcIdx = next.indexOf(sourceKey);
    const tgtIdx = next.indexOf(targetKey);
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, sourceKey);
    tableViews.setColumnOrder(next);
    dragColRef.current = null; setDragOverCol(null);
  };
  const handleDragEnd = () => { dragColRef.current = null; setDragOverCol(null); };

  // Marquee selection
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const registerRowRef = useCallback((id: string, el: HTMLTableRowElement | null) => { if (el) rowRefsMap.current.set(id, el); else rowRefsMap.current.delete(id); }, []);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    let isMarquee = false; let startX = 0, startY = 0;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("input, button, [role=checkbox], a, [data-no-marquee]")) return;
      const rect = container.getBoundingClientRect();
      startX = e.clientX - rect.left + container.scrollLeft;
      startY = e.clientY - rect.top + container.scrollTop;
      isMarquee = false;
      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - rect.left + container.scrollLeft;
        const dy = ev.clientY - rect.top + container.scrollTop;
        if (!isMarquee && (Math.abs(dx - startX) > 5 || Math.abs(dy - startY) > 5)) isMarquee = true;
        if (isMarquee) setMarquee({ startX, startY, currentX: dx, currentY: dy });
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (isMarquee && marqueeRef.current) {
          const m = marqueeRef.current;
          const boxTop = Math.min(m.startY, m.currentY);
          const boxBottom = Math.max(m.startY, m.currentY);
          const containerRect = container.getBoundingClientRect();
          const hitIds: string[] = [];
          rowRefsMap.current.forEach((rowEl, id) => {
            const rowRect = rowEl.getBoundingClientRect();
            const rowTop = rowRect.top - containerRect.top + container.scrollTop;
            const rowBottom = rowTop + rowRect.height;
            if (rowBottom >= boxTop && rowTop <= boxBottom) hitIds.push(id);
          });
          if (hitIds.length > 0) rowSelection.setSelectedIds(new Set(hitIds));
        }
        setMarquee(null); isMarquee = false;
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
    container.addEventListener("mousedown", onMouseDown);
    return () => container.removeEventListener("mousedown", onMouseDown);
  }, [rowSelection]);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const handleDeleteSelected = useCallback(() => {
    internalNotesStore.removeMany(rowSelection.selectedIds);
    rowSelection.deselectAll();
    setShowDeleteConfirm(false);
  }, [rowSelection]);

  const selectedNote = notes.find((n) => n.id === selectedId);

  if (selectedNote) {
    return (
      <NoteDetailView
        note={selectedNote}
        onUpdate={(updates) => internalNotesStore.update(selectedId!, updates)}
        onBack={() => setSelectedId(null)}
        onDelete={() => { internalNotesStore.remove(selectedId!); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">內部註記</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setNewNoteOpen(true)}>
          <Plus className="h-4 w-4" />
          新增
        </Button>
        {rowSelection.selectedCount > 0 && (
          <>
            <span className="text-xs text-muted-foreground">已選取 {rowSelection.selectedCount} 個項目</span>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <FilterSortToolbar
        views={tableViews.views}
        activeView={activeView}
        activeViewId={tableViews.activeViewId}
        onSetActiveView={tableViews.setActiveViewId}
        onAddView={tableViews.addView}
        onDeleteView={tableViews.deleteView}
        onAddCondition={tableViews.addCondition}
        onRemoveFilterNode={tableViews.removeFilterNode}
        onUpdateCondition={tableViews.updateCondition}
        onAddFilterGroup={tableViews.addFilterGroup}
        onChangeGroupLogic={tableViews.changeGroupLogic}
        onAddSort={tableViews.addSort}
        onRemoveSort={tableViews.removeSort}
        onUpdateSort={tableViews.updateSort}
        onRenameView={tableViews.renameView}
        onReorderViews={tableViews.reorderViews}
        visibleFieldKeys={visibleFieldKeys}
        selectedCount={rowSelection.selectedCount}
        hiddenColumns={activeView.hiddenColumns || []}
        onToggleColumn={tableViews.toggleColumnVisibility}
        fieldMetasList={internalNotesFieldMetas}
        statusOptionsList={statusOptions}
      />

      <motion.div
        ref={tableContainerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto relative select-none"
        style={{ userSelect: marquee ? "none" : undefined }}
      >
        {marquee && (
          <div className="absolute border border-primary/50 bg-primary/10 pointer-events-none z-20" style={{
            left: Math.min(marquee.startX, marquee.currentX), top: Math.min(marquee.startY, marquee.currentY),
            width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY),
          }} />
        )}
        <table style={{ minWidth: totalWidth }} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-[40px] px-2 py-2.5 text-center">
                <Checkbox checked={rowSelection.isAllSelected} onCheckedChange={(checked) => { if (checked) rowSelection.selectAll(); else rowSelection.deselectAll(); }} className="mx-auto" />
              </th>
              {orderedCols.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.key)}
                  onDragOver={(e) => handleDragOver(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                  onDragEnd={handleDragEnd}
                  style={{ width: activeView.columnWidths[col.key] ?? 100 }}
                  className={cn(
                    "relative select-none px-3 py-2.5 text-center text-xs font-medium text-muted-foreground whitespace-nowrap group border-r border-border/40 last:border-r-0",
                    dragOverCol === col.key && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" />
                    <span>{col.label}</span>
                  </div>
                  <div onMouseDown={(e) => handleResizeStart(e, col.key)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-border/50 hover:bg-primary/40 transition-colors" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleNotes.map((note) => {
              const isSelected = rowSelection.selectedIds.has(note.id);
              return (
                <tr
                  key={note.id}
                  ref={(el) => registerRowRef(note.id, el)}
                  className={cn("border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer", isSelected && "bg-primary/5")}
                  onClick={() => setSelectedId(note.id)}
                >
                  <td className="w-[40px] px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={() => rowSelection.handleClick(note.id, { ctrlKey: true } as any)} className="mx-auto" />
                  </td>
                  {orderedCols.map((col) => (
                    <td key={col.key} style={{ width: activeView.columnWidths[col.key] ?? 100, maxWidth: activeView.columnWidths[col.key] ?? 100 }} className={cn("px-3 py-1.5 overflow-hidden", col.key !== "title" && col.key !== "note" && "text-center")}>
                      {col.render(note)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleNotes.length === 0 && (
              <tr><td colSpan={orderedCols.length + 1} className="h-24 text-center text-muted-foreground">尚無任何內部註記紀錄。</td></tr>
            )}
          </tbody>
          <TableFooterStats
            itemCount={visibleNotes.length}
            orderedCols={orderedCols}
            columnWidths={activeView.columnWidths}
            data={visibleNotes}
          />
        </table>
      </motion.div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除已選取的 {rowSelection.selectedCount} 筆紀錄嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewNoteDialog open={newNoteOpen} onOpenChange={setNewNoteOpen} />
    </div>
  );
}
