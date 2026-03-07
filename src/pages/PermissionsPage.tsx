import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type AppRole = "member" | "pm" | "executive";
const BUILT_IN_ROLES: AppRole[] = ["member", "pm", "executive"];
const BUILT_IN_LABELS: Record<string, string> = {
  member: "譯者",
  pm: "PM",
  executive: "執行官",
};

export interface RoleDefinition {
  key: string;
  label: string;
  builtIn: boolean;
}

export default function PermissionsPage() {
  const { roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { config, loading, updateConfig } = usePermissions();

  // Derive role definitions from config
  const customRoles: RoleDefinition[] = (config as any).custom_roles || [];

  const allRoles: RoleDefinition[] = [
    ...BUILT_IN_ROLES.map((r) => ({ key: r, label: BUILT_IN_LABELS[r], builtIn: true })),
    ...customRoles,
  ];

  const [newRoleName, setNewRoleName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [rolesSectionOpen, setRolesSectionOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const saveCustomRoles = useCallback(async (newCustomRoles: RoleDefinition[]) => {
    setSaving(true);
    const newConfig = { ...config, custom_roles: newCustomRoles } as any;
    const error = await updateConfig(newConfig);
    setSaving(false);
    return error;
  }, [config, updateConfig]);

  const handleAddRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    if (allRoles.some((r) => r.label === name || r.key === name)) {
      toast.error("此身分已存在");
      return;
    }
    const key = `custom_${Date.now()}`;
    const newRole: RoleDefinition = { key, label: name, builtIn: false };
    const error = await saveCustomRoles([...customRoles, newRole]);
    if (!error) {
      setNewRoleName("");
      toast.success(`已新增身分「${name}」`);
    } else {
      toast.error("儲存失敗");
    }
  };

  const handleDeleteClick = (role: RoleDefinition) => {
    setDeleteTarget(role);
    setDeleteStep(1);
  };

  const handleDeleteStep1 = () => {
    setDeleteStep(2);
  };

  const handleDeleteStep2 = async () => {
    if (deleteTarget) {
      const updated = customRoles.filter((r) => r.key !== deleteTarget.key);
      const error = await saveCustomRoles(updated);
      if (!error) {
        toast.success(`已刪除身分「${deleteTarget.label}」`);
      } else {
        toast.error("刪除失敗");
      }
    }
    setDeleteTarget(null);
    setDeleteStep(1);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
    setDeleteStep(1);
  };

  if (!isExecutive) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        您沒有權限檢視此頁面
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">權限管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理角色身分與各模組權限設定</p>
      </div>

      {/* Role Management */}
      <Card>
        <Collapsible open={rolesSectionOpen} onOpenChange={setRolesSectionOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                {rolesSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                身分管理
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="新增身分名稱…"
                  className="max-w-xs text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddRole(); }}
                />
                <Button size="sm" onClick={handleAddRole} disabled={!newRoleName.trim() || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  新增
                </Button>
              </div>

              <div className="divide-y divide-border">
                {allRoles.map((role) => {
                  const isExpanded = expandedRole === role.key;
                  return (
                    <div key={role.key} className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpandedRole(isExpanded ? null : role.key)}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                          <span className="text-sm font-medium">{role.label}</span>
                          {role.builtIn && (
                            <Badge variant="outline" className="text-xs">內建</Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteClick(role)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="ml-9 mt-3 space-y-2">
                          <RolePermissionPanel roleKey={role.key} roleLabel={role.label} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Delete Confirmation - Step 1 */}
      <AlertDialog open={!!deleteTarget && deleteStep === 1} onOpenChange={(open) => { if (!open) handleCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除身分</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除「{deleteTarget?.label}」這個身分嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep1} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              繼續
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation - Step 2 */}
      <AlertDialog open={!!deleteTarget && deleteStep === 2} onOpenChange={(open) => { if (!open) handleCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>再次確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              您即將永久刪除「{deleteTarget?.label}」身分。所有擁有此身分的成員將失去相關權限，且此操作無法復原。是否確定？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep2} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Per-role permission panel ───

const MODULE_KEYS = [
  { key: "fee_management", label: "費用管理" },
  { key: "translator_invoice", label: "稿費請款" },
  { key: "client_invoice", label: "客戶請款" },
  { key: "members", label: "成員管理" },
  { key: "permissions", label: "身分管理" },
] as const;

function RolePermissionPanel({ roleKey, roleLabel }: { roleKey: string; roleLabel: string }) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  return (
    <div className="space-y-1 border rounded-lg p-3 bg-muted/20">
      <p className="text-xs text-muted-foreground mb-2">「{roleLabel}」的模組權限</p>
      {MODULE_KEYS.map((mod) => {
        const isExpanded = expandedModule === mod.key;
        return (
          <Collapsible key={mod.key} open={isExpanded} onOpenChange={(open) => setExpandedModule(open ? mod.key : null)}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/40 cursor-pointer">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="text-sm">{mod.label}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  即將實作
                </Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-6 mt-1 mb-2 px-2 py-2 text-xs text-muted-foreground border-l-2 border-border">
                此模組的細部權限設定將在下一階段實作。
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
