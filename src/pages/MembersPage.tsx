import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus, X, GripVertical, Pencil, Snowflake } from "lucide-react";
import { selectOptionsStore } from "@/stores/select-options-store";
import ProfileViewerDialog from "@/components/ProfileViewerDialog";
import { cn } from "@/lib/utils";

type AppRole = string;
const DEFAULT_ROLE_LABELS: Record<string, string> = { member: "譯者", pm: "PM", executive: "執行官" };

interface Member {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  role: AppRole;
  isInvitation?: boolean;
  invitationId?: string;
  // translator settings
  note: string;
  no_fee: boolean;
  frozen: boolean;
  sort_order: number;
}

// ─── Multi-email Tag Input ───
function EmailTagInput({
  emails,
  setEmails,
}: {
  emails: string[];
  setEmails: (emails: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(`無效的電子信箱：${email}`);
      return;
    }
    if (emails.includes(email)) {
      toast.error(`已新增：${email}`);
      return;
    }
    setEmails([...emails, email]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
      e.preventDefault();
      if (inputValue.trim()) {
        addEmail(inputValue);
        setInputValue("");
      }
    }
    if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      setEmails(emails.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const parts = text.split(/[,;\s\n]+/).filter(Boolean);
    const newEmails = [...emails];
    for (const part of parts) {
      const email = part.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !newEmails.includes(email)) {
        newEmails.push(email);
      }
    }
    setEmails(newEmails);
    setInputValue("");
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 min-h-[40px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {email}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeEmail(email);
            }}
            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          if (inputValue.trim()) {
            addEmail(inputValue);
            setInputValue("");
          }
        }}
        placeholder={emails.length === 0 ? "輸入電子信箱，按 Enter 新增" : ""}
        className="flex-1 min-w-[150px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export default function MembersPage() {
  const { isAdmin, user, roles } = useAuth();
  const { allRoles: permRoles, checkPerm } = usePermissions();
  const isExecutive = roles.some((r) => r.role === "executive");
  const getRoleLabel = (key: string) => {
    const found = permRoles.find((r) => r.key === key);
    return found?.label || DEFAULT_ROLE_LABELS[key] || key;
  };
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removeStep, setRemoveStep] = useState<1 | 2>(1);
  // Note editing
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Drag reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [profileViewerEmail, setProfileViewerEmail] = useState<string | null>(null);

  const canViewFrozen = checkPerm("team_members", "members_showFrozen", "view");
  const canInvite = checkPerm("team_members", "members_invite", "edit");
  const canChangeRole = checkPerm("team_members", "members_changeRole", "edit");
  const canRemove = checkPerm("team_members", "members_remove", "edit");
  const canSort = checkPerm("team_members", "members_sort", "edit");
  const canViewNote = checkPerm("team_members", "members_note", "view");
  const canEditNote = checkPerm("team_members", "members_note", "edit");
  const canEditNoFee = checkPerm("team_members", "members_noFee", "edit");
  const canFreeze = checkPerm("team_members", "members_freeze", "edit");

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: rolesData }, { data: invitations }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, email, avatar_url"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("invitations").select("*").is("accepted_at", null),
      supabase.from("member_translator_settings").select("*"),
    ]);

    const roleMap = new Map<string, AppRole>();
    (rolesData || []).forEach((r: any) => roleMap.set(r.user_id, r.role));

    const settingsMap = new Map<string, { note: string; no_fee: boolean; frozen: boolean; sort_order: number }>();
    (settings || []).forEach((s: any) => settingsMap.set(s.email, {
      note: s.note || "",
      no_fee: s.no_fee || false,
      frozen: s.frozen || false,
      sort_order: s.sort_order ?? 0,
    }));

    const registeredMembers: Member[] = (profiles || []).map((p: any) => {
      const s = settingsMap.get(p.email) || { note: "", no_fee: false, frozen: false, sort_order: 0 };
      return {
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        avatar_url: p.avatar_url,
        role: roleMap.get(p.id) || "member",
        note: s.note,
        no_fee: s.no_fee,
        frozen: s.frozen,
        sort_order: s.sort_order,
      };
    });

    const registeredEmails = new Set((profiles || []).map((p: any) => p.email));
    const pendingMembers: Member[] = (invitations || []).filter((inv: any) => !registeredEmails.has(inv.email)).map((inv: any) => {
      const s = settingsMap.get(inv.email) || { note: "", no_fee: false, frozen: false, sort_order: 0 };
      return {
        id: inv.id,
        display_name: null,
        email: inv.email,
        avatar_url: null,
        role: inv.role,
        isInvitation: true,
        invitationId: inv.id,
        note: s.note,
        no_fee: s.no_fee,
        frozen: s.frozen,
        sort_order: s.sort_order,
      };
    });

    const allMembers = [...registeredMembers, ...pendingMembers];
    allMembers.sort((a, b) => a.sort_order - b.sort_order);
    setMembers(allMembers);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async () => {
    if (inviteEmails.length === 0) return;
    setInviting(true);
    let successCount = 0;
    for (const email of inviteEmails) {
      const { error } = await supabase.from("invitations").insert({
        email,
        role: "member" as "member" | "pm" | "executive",
        invited_by: user?.id,
      });
      if (error) {
        if (error.code === "23505") toast.error(`${email} 已被邀請`);
        else toast.error(`${email}: ${error.message}`);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) {
      toast.success(`已成功邀請 ${successCount} 人`);
      setInviteEmails([]);
      setInviteOpen(false);
      fetchMembers();
    }
    setInviting(false);
  };

  const handleRoleChange = async (member: Member, newRole: AppRole) => {
    if (member.isInvitation) return;
    await supabase.from("user_roles").update({ role: newRole as "member" | "pm" | "executive" }).eq("user_id", member.id);
    fetchMembers();
    toast.success("角色已更新");
  };

  const handleRemoveStep1 = () => setRemoveStep(2);
  const handleRemove = async () => {
    if (!removeTarget) return;
    if (removeTarget.isInvitation) {
      await supabase.from("invitations").delete().eq("id", removeTarget.invitationId!);
      toast.success("邀請已移除");
    } else {
      const { error } = await supabase.functions.invoke("delete-user", { body: { user_id: removeTarget.id } });
      if (error) {
        toast.error("移除失敗：" + error.message);
        setRemoveTarget(null);
        setRemoveStep(1);
        return;
      }
      toast.success("成員已移除");
    }
    setRemoveTarget(null);
    setRemoveStep(1);
    fetchMembers();
  };

  // ─── Translator settings helpers ───
  const upsertSetting = async (email: string, updates: { note?: string; no_fee?: boolean; frozen?: boolean }) => {
    const existing = members.find((m) => m.email === email);
    const { error } = await supabase.from("member_translator_settings").upsert(
      {
        email,
        note: updates.note ?? existing?.note ?? "",
        no_fee: updates.no_fee ?? existing?.no_fee ?? false,
        frozen: updates.frozen ?? existing?.frozen ?? false,
      },
      { onConflict: "email" }
    );
    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.email === email
            ? { ...m, ...updates }
            : m
        )
      );
      // Reload assignee options in store to sync everywhere
      selectOptionsStore.loadAssignees();
    }
  };

  const handleSaveNote = (email: string) => {
    upsertSetting(email, { note: editValue.trim() });
    setEditingEmail(null);
  };

  const handleToggleNoFee = (email: string, checked: boolean) => {
    upsertSetting(email, { no_fee: checked });
  };

  const handleToggleFrozen = (email: string, frozen: boolean) => {
    upsertSetting(email, { frozen });
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
      frozen: m.frozen || false,
    }));
    for (const u of updates) {
      await supabase.from("member_translator_settings").upsert(u, { onConflict: "email" });
    }
    selectOptionsStore.loadAssignees();
  };

  const canViewMembers = checkPerm("team_members", "members_view", "view");

  if (!canViewMembers) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        您沒有權限檢視此頁面
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">團隊成員</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理團隊成員、排序、備註與權限</p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            邀請成員
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成員清單</CardTitle>
          {canSort && <p className="text-xs text-muted-foreground">拖曳調整成員順序，變更會套用到所有人員下拉選單</p>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">尚無成員</p>
          ) : (
            <div className="space-y-1">
              {members.map((member, idx) => {
                if (member.frozen && !canViewFrozen) return null;
                const initials = (member.display_name || member.email || "?").slice(0, 2).toUpperCase();
                const displayLabel = member.display_name || member.email;
                const isEditing = editingEmail === member.email;

                return (
                  <div
                    key={member.id}
                    draggable={canSort}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx); }}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={cn(
                      "px-2 py-2.5 rounded-md transition-colors space-y-1.5",
                      canSort && "cursor-grab active:cursor-grabbing",
                      dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
                      dragIndex === idx && "opacity-50",
                      dragOverIndex !== idx && "hover:bg-secondary/30",
                      member.frozen && "opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {canSort && <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <Avatar className="h-8 w-8 shrink-0 cursor-pointer hover:opacity-80" onClick={() => setProfileViewerEmail(member.email)}>
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{displayLabel}</span>
                            {member.isInvitation && (
                              <Badge variant="outline" className="text-xs shrink-0">待接受</Badge>
                            )}
                            {member.frozen && (
                              <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                                <Snowflake className="h-3 w-3" />
                                已凍結
                              </Badge>
                            )}
                          </div>
                          {member.display_name && (
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditNoFee && (
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`no-fee-${member.email}`}
                              checked={member.no_fee}
                              onCheckedChange={(checked) => handleToggleNoFee(member.email, !!checked)}
                            />
                            <Label htmlFor={`no-fee-${member.email}`} className="text-xs cursor-pointer text-muted-foreground">
                              不開單
                            </Label>
                          </div>
                        )}
                        {canFreeze && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={member.frozen ? "secondary" : "ghost"}
                                size="sm"
                                className={cn("h-7 text-xs gap-1", member.frozen && "text-blue-400")}
                                onClick={() => handleToggleFrozen(member.email, !member.frozen)}
                              >
                                <Snowflake className="h-3 w-3" />
                                {member.frozen ? "解凍" : "凍結"}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>凍結人員會從所有人員下拉式選單隱藏</TooltipContent>
                          </Tooltip>
                        )}
                        {member.isInvitation ? (
                          <Badge variant="secondary" className="text-xs">
                            {getRoleLabel(member.role)}
                          </Badge>
                        ) : canChangeRole ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member, v as AppRole)}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {permRoles.map((r) => (
                                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {getRoleLabel(member.role)}
                          </Badge>
                        )}
                        {canEditNote && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => { setEditingEmail(member.email); setEditValue(member.note); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>編輯人員備註</TooltipContent>
                          </Tooltip>
                        )}
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setRemoveTarget(member)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Note display / editing */}
                    {isEditing ? (
                      <div className="space-y-2 pl-10">
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="輸入備註..."
                          className="text-xs min-h-[60px]"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Escape") setEditingEmail(null); }}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingEmail(null)}>取消</Button>
                          <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveNote(member.email)}>儲存</Button>
                        </div>
                      </div>
                    ) : (canViewNote && member.note) ? (
                      <div className="pl-10">
                        <p className="text-xs text-muted-foreground px-1">{member.note}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>邀請新成員</DialogTitle>
            <DialogDescription>
              輸入電子信箱後按 Enter 新增，可同時邀請多人。新成員預設角色為「譯者」，加入後可調整。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <EmailTagInput emails={inviteEmails} setEmails={setInviteEmails} />
            {inviteEmails.length > 0 && (
              <p className="text-xs text-muted-foreground">
                將邀請 {inviteEmails.length} 人，預設角色：譯者
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>取消</Button>
            <Button onClick={handleInvite} disabled={inviting || inviteEmails.length === 0}>
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              送出邀請（{inviteEmails.length}）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation - Step 1 */}
      <AlertDialog open={!!removeTarget && removeStep === 1} onOpenChange={(open) => { if (!open && removeStep === 1) { setRemoveTarget(null); setRemoveStep(1); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認移除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要移除 {removeTarget?.display_name || removeTarget?.email} 嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRemoveStep1(); }}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Confirmation - Step 2 */}
      <AlertDialog open={!!removeTarget && removeStep === 2} onOpenChange={(open) => { if (!open) { setRemoveTarget(null); setRemoveStep(1); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>再次確認</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原。確定要永久移除 {removeTarget?.display_name || removeTarget?.email} 嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確認移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
