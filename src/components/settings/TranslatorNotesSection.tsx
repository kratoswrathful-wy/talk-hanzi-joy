import { useState, useCallback, useEffect } from "react";
import { GripVertical, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClickOutsideCancel } from "@/hooks/use-click-outside";
import { selectOptionsStore } from "@/stores/select-options-store";

interface MemberWithSettings {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  isInvitation: boolean;
  note: string;
  no_fee: boolean;
}

/** 設定 → 譯者備註／不開單／拖曳排序（寫入 member_translator_settings） */
export function TranslatorNotesSection() {
  const [members, setMembers] = useState<MemberWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const cancelEditing = useCallback(() => {
    setEditingEmail(null);
    setEditValue("");
  }, []);
  const editingRef = useClickOutsideCancel(!!editingEmail, cancelEditing);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [{ data: profiles }, { data: invitations }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("email, display_name, avatar_url"),
      supabase.from("invitations").select("email, role").is("accepted_at", null),
      supabase.from("member_translator_settings").select("*"),
    ]);

    const settingsMap = new Map<string, { note: string; no_fee: boolean; sort_order: number }>();
    (settings || []).forEach((s: { email: string; note?: string; no_fee?: boolean; sort_order?: number }) =>
      settingsMap.set(s.email, { note: s.note || "", no_fee: s.no_fee || false, sort_order: s.sort_order ?? 0 })
    );

    const result: MemberWithSettings[] = [];

    (profiles || []).forEach((p: { email: string; display_name: string | null; avatar_url: string | null }) => {
      const s = settingsMap.get(p.email) || { note: "", no_fee: false, sort_order: 0 };
      result.push({
        email: p.email,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        isInvitation: false,
        note: s.note,
        no_fee: s.no_fee,
      });
    });

    const registeredEmails = new Set((profiles || []).map((p: { email: string }) => p.email));
    (invitations || []).forEach((inv: { email: string }) => {
      if (!registeredEmails.has(inv.email)) {
        const s = settingsMap.get(inv.email) || { note: "", no_fee: false, sort_order: 0 };
        result.push({
          email: inv.email,
          display_name: null,
          avatar_url: null,
          isInvitation: true,
          note: s.note,
          no_fee: s.no_fee,
        });
      }
    });

    result.sort((a, b) => {
      const orderA = settingsMap.get(a.email)?.sort_order ?? 0;
      const orderB = settingsMap.get(b.email)?.sort_order ?? 0;
      return orderA - orderB;
    });

    setMembers(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const upsertSetting = async (email: string, updates: { note?: string; no_fee?: boolean }) => {
    const existing = members.find((m) => m.email === email);
    const currentNote = existing?.note || "";
    const currentNoFee = existing?.no_fee || false;

    const { error } = await supabase.from("member_translator_settings").upsert(
      {
        email,
        note: updates.note ?? currentNote,
        no_fee: updates.no_fee ?? currentNoFee,
      },
      { onConflict: "email" }
    );

    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.email === email ? { ...m, note: updates.note ?? m.note, no_fee: updates.no_fee ?? m.no_fee } : m
        )
      );
    }
  };

  const handleSaveNote = (email: string) => {
    upsertSetting(email, { note: editValue.trim() });
    setEditingEmail(null);
  };

  const handleToggleNoFee = (email: string, checked: boolean) => {
    upsertSetting(email, { no_fee: checked });
  };

  const handleDrop = async (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx) return;
    const reordered = [...members];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIdx, 0, moved);
    setMembers(reordered);
    setDragIndex(null);
    setDragOverIndex(null);

    const updates = reordered.map((m, i) => ({
      email: m.email,
      sort_order: i + 1,
      note: m.note || "",
      no_fee: m.no_fee || false,
    }));
    for (const u of updates) {
      await supabase.from("member_translator_settings").upsert(u, { onConflict: "email" });
    }
    selectOptionsStore.loadAssignees();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">譯者備註</h2>
        <p className="text-xs text-muted-foreground mt-0.5">拖曳調整譯者順序，變更會套用到所有譯者下拉選單</p>
      </div>

      <div className="space-y-1">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">載入中…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">尚無團隊成員</p>
        ) : (
          members.map((member, idx) => {
            const displayLabel = member.display_name || member.email;
            const initials = displayLabel.slice(0, 2).toUpperCase();
            const isEditing = editingEmail === member.email;

            return (
              <div
                key={member.email}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
                }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={cn(
                  "px-2 py-2 rounded-md transition-colors space-y-1.5 cursor-grab active:cursor-grabbing",
                  dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
                  dragIndex === idx && "opacity-50",
                  dragOverIndex !== idx && "hover:bg-secondary/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{displayLabel}</span>
                    {member.isInvitation && (
                      <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">待接受</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={`no-fee-${member.email}`}
                        checked={member.no_fee}
                        onCheckedChange={(checked) => handleToggleNoFee(member.email, !!checked)}
                      />
                      <Label htmlFor={`no-fee-${member.email}`} className="text-xs cursor-pointer text-muted-foreground">
                        不開單譯者
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={() => {
                        setEditingEmail(member.email);
                        setEditValue(member.note);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <div ref={editingRef} className="space-y-2 pl-8">
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="輸入備註..."
                      className="text-xs min-h-[60px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingEmail(null);
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveNote(member.email);
                      }}
                    />
                  </div>
                ) : (
                  <div className="pl-8">
                    {member.note ? (
                      <p className="text-xs text-muted-foreground px-1">{member.note}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 px-1 italic">尚未設定備註</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
