import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";

type AppRole = "member" | "pm" | "executive";
const roleLabels: Record<AppRole, string> = { member: "人員", pm: "PM", executive: "執行官" };

interface Member {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  role: AppRole;
  isInvitation?: boolean;
  invitationId?: string;
}

export default function MembersPage() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("member");
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);

    // Fetch registered users with roles
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
    if (!inviteEmail.trim()) return;
    setInviting(true);

    const { error } = await supabase.from("invitations").insert({
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("此信箱已被邀請");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success(`已邀請 ${inviteEmail}`);
      setInviteEmail("");
      setInviteOpen(false);
      fetchMembers();
    }
    setInviting(false);
  };

  const handleRoleChange = async (member: Member, newRole: AppRole) => {
    if (member.isInvitation) {
      await supabase.from("invitations").update({ role: newRole }).eq("id", member.invitationId!);
    } else {
      await supabase.from("user_roles").update({ role: newRole }).eq("user_id", member.id);
    }
    fetchMembers();
    toast.success("角色已更新");
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    if (removeTarget.isInvitation) {
      await supabase.from("invitations").delete().eq("id", removeTarget.invitationId!);
    } else {
      await supabase.from("user_roles").delete().eq("user_id", removeTarget.id);
      // Note: we don't delete the auth user, just remove their role
    }
    setRemoveTarget(null);
    fetchMembers();
    toast.success("成員已移除");
  };

  if (!isAdmin) {
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
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleRoleChange(member, v as AppRole)}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">人員</SelectItem>
                          <SelectItem value="pm">PM</SelectItem>
                          <SelectItem value="executive">執行官</SelectItem>
                        </SelectContent>
                      </Select>
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
            <DialogDescription>輸入對方的電子信箱，對方註冊後將自動獲得指定角色</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>電子信箱</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">人員</SelectItem>
                  <SelectItem value="pm">PM</SelectItem>
                  <SelectItem value="executive">執行官</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>取消</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              送出邀請
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
