import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Trash2, UserPlus, X } from "lucide-react";

type AppRole = "member" | "pm" | "executive";
const roleLabels: Record<AppRole, string> = { member: "譯者", pm: "PM", executive: "執行官" };

interface Member {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  role: AppRole;
  isInvitation?: boolean;
  invitationId?: string;
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
    // Basic email validation
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
  const isExecutive = roles.some((r) => r.role === "executive");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, email, avatar_url");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: invitations } = await supabase.from("invitations").select("*").is("accepted_at", null);

    const roleMap = new Map<string, AppRole>();
    (roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role));

    const registeredMembers: Member[] = (profiles || []).map((p: any) => ({
      id: p.id,
      display_name: p.display_name,
      email: p.email,
      avatar_url: p.avatar_url,
      role: roleMap.get(p.id) || "member",
    }));

    const pendingMembers: Member[] = (invitations || []).map((inv: any) => ({
      id: inv.id,
      display_name: null,
      email: inv.email,
      avatar_url: null,
      role: inv.role,
      isInvitation: true,
      invitationId: inv.id,
    }));

    setMembers([...registeredMembers, ...pendingMembers]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async () => {
    if (inviteEmails.length === 0) return;
    setInviting(true);

    let successCount = 0;
    let errorCount = 0;

    for (const email of inviteEmails) {
      const { error } = await supabase.from("invitations").insert({
        email,
        role: "member" as AppRole, // Always default to 譯者
        invited_by: user?.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error(`${email} 已被邀請`);
        } else {
          toast.error(`${email}: ${error.message}`);
        }
        errorCount++;
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
    // Only allow role change for registered members (not invitations)
    if (member.isInvitation) return;
    await supabase.from("user_roles").update({ role: newRole }).eq("user_id", member.id);
    fetchMembers();
    toast.success("角色已更新");
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    if (removeTarget.isInvitation) {
      await supabase.from("invitations").delete().eq("id", removeTarget.invitationId!);
    } else {
      await supabase.from("user_roles").delete().eq("user_id", removeTarget.id);
    }
    setRemoveTarget(null);
    fetchMembers();
    toast.success("成員已移除");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">成員管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理團隊成員與權限</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          邀請成員
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成員清單</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">尚無成員</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((member) => {
                const initials = (member.display_name || member.email || "?").slice(0, 2).toUpperCase();
                return (
                  <div key={member.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {member.display_name || member.email}
                          </span>
                          {member.isInvitation && (
                            <Badge variant="outline" className="text-xs shrink-0">待接受</Badge>
                          )}
                        </div>
                        {member.display_name && (
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {member.isInvitation ? (
                        <Badge variant="secondary" className="text-xs">
                          {roleLabels[member.role]}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => handleRoleChange(member, v as AppRole)}
                        >
                          <SelectTrigger className="w-24 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">譯者</SelectItem>
                            <SelectItem value="pm">PM</SelectItem>
                            <SelectItem value="executive">執行官</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoveTarget(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認移除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要移除 {removeTarget?.display_name || removeTarget?.email} 嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>確認移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
