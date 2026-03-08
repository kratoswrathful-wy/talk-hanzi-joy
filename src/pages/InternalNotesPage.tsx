/**
 * 內部註記 — full table view with FilterSortToolbar matching fee management pattern.
 * Executive-only by default.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, ExternalLink, Trash2, GripVertical } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { useRowSelection } from "@/hooks/use-row-selection";
import {
  useInternalNotesTableViews,
  internalNotesFieldMetas,
  type InternalNote,
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
import { cn } from "@/lib/utils";
import { useInternalNotes, internalNotesStore } from "@/stores/internal-notes-store";

/* ── Helpers ── */
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const emptyNote = (): InternalNote => ({
  id: `note-${Date.now()}`,
  title: "",
  relatedCase: "",
  noteId: "",
  createdAt: new Date().toISOString(),
  noteType: "",
  creator: "",
  status: "",
  internalAssignee: "",
  fileName: "",
  idRowCount: "",
  sourceText: "",
  translatedText: "",
  questionOrNote: "",
  reference: "",
  internalResolution: "",
  remarks: "",
});

const noteTypeOptions = ["交件備註", "內容提問", "客戶提問", "內部備註"];
const statusOptions = ["待處理", "處理中", "收到註記，文件轉達", "已回覆", "已關閉"];

/* ── Column defs ── */
interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (note: InternalNote) => React.ReactNode;
}

/* ── Detail view ── */
function Field({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-3 py-1.5">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        {icon && <span className="text-xs">{icon}</span>}
        {label}
      </span>
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>←</span> 返回列表
        </button>
        <Button size="sm" className="text-xs min-w-[88px] text-white hover:opacity-80" style={{ backgroundColor: "#6B7280" }} onClick={() => setDeleteOpen(true)}>
          刪除
        </Button>
      </div>

      <Input value={note.title} onChange={(e) => onUpdate({ title: e.target.value })} className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0" placeholder="輸入標題…" />
      <Separator />

      <Field label="關聯案件" icon="↗"><Input value={note.relatedCase} onChange={(e) => onUpdate({ relatedCase: e.target.value })} placeholder="案件名稱或 ID" className="max-w-md" /></Field>
      <Field label="註記編號" icon="№"><Input value={note.noteId} onChange={(e) => onUpdate({ noteId: e.target.value })} placeholder="例：COMMON-3949" className="max-w-xs" /></Field>
      <Field label="建立時間" icon="🕐"><span className="text-sm">{new Date(note.createdAt).toLocaleString("zh-TW")}</span></Field>
      <Field label="性質" icon="◎">
        <div className="flex flex-wrap gap-1.5">
          {noteTypeOptions.map((opt) => (
            <Badge key={opt} variant={note.noteType === opt ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => onUpdate({ noteType: note.noteType === opt ? "" : opt })}>{opt}</Badge>
          ))}
        </div>
      </Field>
      <Field label="建立者" icon="👤"><Input value={note.creator} onChange={(e) => onUpdate({ creator: e.target.value })} className="max-w-xs" /></Field>
      <Field label="狀態" icon="☆">
        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => (
            <Badge key={opt} variant={note.status === opt ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => onUpdate({ status: note.status === opt ? "" : opt })}>{opt}</Badge>
          ))}
        </div>
      </Field>
      <Field label="內部指派對象" icon="👥"><Input value={note.internalAssignee} onChange={(e) => onUpdate({ internalAssignee: e.target.value })} className="max-w-xs" /></Field>
      <Separator />
      <Field label="檔案名稱" icon="≡"><Input value={note.fileName} onChange={(e) => onUpdate({ fileName: e.target.value })} className="max-w-md" /></Field>
      <Field label="ID / 行數" icon="≡"><Input value={note.idRowCount} onChange={(e) => onUpdate({ idRowCount: e.target.value })} className="max-w-xs" /></Field>
      <Field label="原文" icon="≡"><Textarea value={note.sourceText} onChange={(e) => onUpdate({ sourceText: e.target.value })} className="min-h-[60px]" /></Field>
      <Field label="譯文" icon="≡"><Textarea value={note.translatedText} onChange={(e) => onUpdate({ translatedText: e.target.value })} className="min-h-[60px]" /></Field>
      <Field label="問題或註記內容" icon="≡"><Textarea value={note.questionOrNote} onChange={(e) => onUpdate({ questionOrNote: e.target.value })} className="min-h-[80px]" /></Field>
      <Field label="參考資料" icon="📎"><Input value={note.reference} onChange={(e) => onUpdate({ reference: e.target.value })} className="max-w-md" /></Field>
      <Field label="內部處理結論" icon="≡"><Textarea value={note.internalResolution} onChange={(e) => onUpdate({ internalResolution: e.target.value })} className="min-h-[60px]" /></Field>
      <Field label="備註" icon="≡"><Textarea value={note.remarks} onChange={(e) => onUpdate({ remarks: e.target.value })} className="min-h-[60px]" /></Field>

      <Separator />
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>建立時間：{new Date(note.createdAt).toLocaleString("zh-TW")}</span>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，確定要刪除此紀錄嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Main page ── */
export default function InternalNotesPage() {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tableViews = useInternalNotesTableViews("executive");
  const { activeView } = tableViews;
  const visibleFieldKeys = internalNotesFieldMetas.map((f) => f.key);

  const visibleNotes = tableViews.applyFiltersAndSorts(notes);
  const rowSelection = useRowSelection(visibleNotes.map((n) => n.id));

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
    { key: "noteId", label: "註記編號", minWidth: 100, render: (n) => <span className="text-sm text-muted-foreground">{n.noteId || "—"}</span> },
    {
      key: "noteType", label: "性質", minWidth: 80,
      render: (n) => n.noteType ? <Badge variant="outline" className="text-xs">{n.noteType}</Badge> : <span className="text-sm text-muted-foreground">—</span>,
    },
    {
      key: "status", label: "狀態", minWidth: 100,
      render: (n) => n.status ? <Badge variant="secondary" className="text-xs whitespace-nowrap">{n.status}</Badge> : <span className="text-sm text-muted-foreground">—</span>,
    },
    { key: "relatedCase", label: "關聯案件", minWidth: 120, render: (n) => <span className="text-sm text-muted-foreground truncate">{n.relatedCase || "—"}</span> },
    { key: "creator", label: "建立者", minWidth: 80, render: (n) => <span className="text-sm">{n.creator || "—"}</span> },
    { key: "internalAssignee", label: "內部指派", minWidth: 80, render: (n) => <span className="text-sm">{n.internalAssignee || "—"}</span> },
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
    setNotes((prev) => prev.filter((n) => !rowSelection.selectedIds.has(n.id)));
    rowSelection.deselectAll();
    setShowDeleteConfirm(false);
  }, [rowSelection]);

  const handleCreate = () => {
    const n = emptyNote();
    setNotes([n, ...notes]);
    setSelectedId(n.id);
  };

  const selectedNote = notes.find((n) => n.id === selectedId);

  if (selectedNote) {
    return (
      <NoteDetailView
        note={selectedNote}
        onUpdate={(updates) => setNotes(notes.map((n) => n.id === selectedId ? { ...n, ...updates } : n))}
        onBack={() => setSelectedId(null)}
        onDelete={() => { setNotes(notes.filter((n) => n.id !== selectedId)); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">內部註記</h1>
        <Button size="sm" className="gap-1.5" onClick={handleCreate}>
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
        statusOptionsList={statusOptions.map((s) => ({ value: s, label: s }))}
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
                    <td key={col.key} style={{ width: activeView.columnWidths[col.key] ?? 100, maxWidth: activeView.columnWidths[col.key] ?? 100 }} className="px-3 py-1.5 overflow-hidden">
                      {col.render(note)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleNotes.length === 0 && (
              <tr><td colSpan={orderedCols.length + 1} className="h-24 text-center text-muted-foreground">尚無任何提問或備註紀錄。</td></tr>
            )}
          </tbody>
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
    </div>
  );
}
