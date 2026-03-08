/**
 * 內部註記 — prototype based on Notion "通用提問/備註表單" structure.
 * Executive-only by default.
 */
import { useState } from "react";
import { Plus, Search, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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

/* ── Types ── */
interface InternalNote {
  id: string;
  title: string;
  relatedCase: string;
  noteId: string;
  createdAt: string;
  noteType: string;
  creator: string;
  status: string;
  internalAssignee: string;
  fileName: string;
  idRowCount: string;
  sourceText: string;
  translatedText: string;
  questionOrNote: string;
  reference: string;
  internalResolution: string;
  remarks: string;
}

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

/* ── Field component ── */
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

/* ── List view ── */
function NoteListView({
  notes,
  onSelect,
  onCreate,
  searchQuery,
  setSearchQuery,
}: {
  notes: InternalNote[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const filtered = searchQuery.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.noteId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.relatedCase.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">內部提問及備註</h1>
        <Button size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <div className="flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded-md border border-input bg-background">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋標題、編號或關聯案件…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {notes.length === 0 ? "尚無任何提問或備註紀錄。" : "沒有符合搜尋條件的結果。"}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">標題</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[140px]">註記編號</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[120px]">性質</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[140px]">狀態</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[140px]">關聯案件</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[100px]">建立時間</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((note) => (
                <tr
                  key={note.id}
                  className="hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => onSelect(note.id)}
                >
                  <td className="px-4 py-2 font-medium">
                    {note.title || <span className="text-muted-foreground italic">未命名</span>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{note.noteId || "—"}</td>
                  <td className="px-4 py-2">
                    {note.noteType ? (
                      <Badge variant="outline" className="text-xs">{note.noteType}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {note.status ? (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">{note.status}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-[140px]">{note.relatedCase || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground tabular-nums">
                    {new Date(note.createdAt).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Detail view ── */
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
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>←</span>
          返回列表
        </button>
        <Button
          size="sm"
          className="text-xs min-w-[88px] text-white hover:opacity-80"
          style={{ backgroundColor: "#6B7280" }}
          onClick={() => setDeleteOpen(true)}
        >
          刪除
        </Button>
      </div>

      <Input
        value={note.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="輸入標題…"
      />

      <Separator />

      <Field label="關聯案件" icon="↗">
        <Input value={note.relatedCase} onChange={(e) => onUpdate({ relatedCase: e.target.value })} placeholder="案件名稱或 ID" className="max-w-md" />
      </Field>
      <Field label="註記編號" icon="№">
        <Input value={note.noteId} onChange={(e) => onUpdate({ noteId: e.target.value })} placeholder="例：COMMON-3949" className="max-w-xs" />
      </Field>
      <Field label="建立時間" icon="🕐">
        <span className="text-sm">{new Date(note.createdAt).toLocaleString("zh-TW")}</span>
      </Field>
      <Field label="性質" icon="◎">
        <div className="flex flex-wrap gap-1.5">
          {noteTypeOptions.map((opt) => (
            <Badge
              key={opt}
              variant={note.noteType === opt ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => onUpdate({ noteType: note.noteType === opt ? "" : opt })}
            >
              {opt}
            </Badge>
          ))}
        </div>
      </Field>
      <Field label="建立者" icon="👤">
        <Input value={note.creator} onChange={(e) => onUpdate({ creator: e.target.value })} className="max-w-xs" />
      </Field>
      <Field label="狀態" icon="☆">
        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => (
            <Badge
              key={opt}
              variant={note.status === opt ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => onUpdate({ status: note.status === opt ? "" : opt })}
            >
              {opt}
            </Badge>
          ))}
        </div>
      </Field>
      <Field label="內部指派對象" icon="👥">
        <Input value={note.internalAssignee} onChange={(e) => onUpdate({ internalAssignee: e.target.value })} className="max-w-xs" />
      </Field>

      <Separator />

      <Field label="檔案名稱" icon="≡">
        <Input value={note.fileName} onChange={(e) => onUpdate({ fileName: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="ID / 行數" icon="≡">
        <Input value={note.idRowCount} onChange={(e) => onUpdate({ idRowCount: e.target.value })} className="max-w-xs" />
      </Field>
      <Field label="原文" icon="≡">
        <Textarea value={note.sourceText} onChange={(e) => onUpdate({ sourceText: e.target.value })} className="min-h-[60px]" />
      </Field>
      <Field label="譯文" icon="≡">
        <Textarea value={note.translatedText} onChange={(e) => onUpdate({ translatedText: e.target.value })} className="min-h-[60px]" />
      </Field>
      <Field label="問題或註記內容" icon="≡">
        <Textarea value={note.questionOrNote} onChange={(e) => onUpdate({ questionOrNote: e.target.value })} className="min-h-[80px]" />
      </Field>
      <Field label="參考資料" icon="📎">
        <Input value={note.reference} onChange={(e) => onUpdate({ reference: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="內部處理結論" icon="≡">
        <Textarea value={note.internalResolution} onChange={(e) => onUpdate({ internalResolution: e.target.value })} className="min-h-[60px]" />
      </Field>
      <Field label="備註" icon="≡">
        <Textarea value={note.remarks} onChange={(e) => onUpdate({ remarks: e.target.value })} className="min-h-[60px]" />
      </Field>

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
  // Local state prototype — will be persisted to DB later
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedNote = notes.find((n) => n.id === selectedId);

  const handleCreate = () => {
    const n = emptyNote();
    setNotes([n, ...notes]);
    setSelectedId(n.id);
  };

  const handleUpdate = (updates: Partial<InternalNote>) => {
    if (!selectedId) return;
    setNotes(notes.map((n) => (n.id === selectedId ? { ...n, ...updates } : n)));
  };

  const handleDelete = () => {
    if (!selectedId) return;
    setNotes(notes.filter((n) => n.id !== selectedId));
    setSelectedId(null);
  };

  if (selectedNote) {
    return (
      <NoteDetailView
        note={selectedNote}
        onUpdate={handleUpdate}
        onBack={() => setSelectedId(null)}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <NoteListView
      notes={notes}
      onSelect={setSelectedId}
      onCreate={handleCreate}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
    />
  );
}
