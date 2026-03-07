import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionConfig } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

// ─── Permission structure definitions ───

interface PermissionItem {
  key: string;
  label: string;
  type: "view" | "edit" | "both"; // "both" = separate view & edit toggles
}

interface PermissionModule {
  key: string;
  label: string;
  listItems: PermissionItem[];   // List page operations
  detailItems: PermissionItem[]; // Detail page operations
}

const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: "fee_management",
    label: "費用管理",
    listItems: [
      { key: "fee_list_create", label: "新增費用", type: "both" },
      { key: "fee_list_delete", label: "刪除費用", type: "both" },
      { key: "fee_list_title", label: "標題（行內編輯）", type: "both" },
      { key: "fee_list_status", label: "狀態（行內編輯）", type: "both" },
      { key: "fee_list_assignee", label: "譯者（行內編輯）", type: "both" },
      { key: "fee_list_internalNote", label: "關聯案件（行內編輯）", type: "both" },
      { key: "fee_list_client", label: "客戶（行內編輯）", type: "both" },
      { key: "fee_list_contact", label: "聯絡人（行內編輯）", type: "both" },
      { key: "fee_list_clientCaseId", label: "關鍵字（行內編輯）", type: "both" },
      { key: "fee_list_clientPoNumber", label: "客戶 PO#（行內編輯）", type: "both" },
      { key: "fee_list_dispatchRoute", label: "派案途徑（行內編輯）", type: "both" },
      { key: "fee_list_taskSummary", label: "稿費總額", type: "both" },
      { key: "fee_list_clientRevenue", label: "營收總額", type: "both" },
      { key: "fee_list_profit", label: "利潤", type: "both" },
      { key: "fee_list_reconciled", label: "對帳完成（行內編輯）", type: "both" },
      { key: "fee_list_rateConfirmed", label: "費率無誤（行內編輯）", type: "both" },
      { key: "fee_list_invoiced", label: "請款完成（行內編輯）", type: "both" },
      { key: "fee_list_sameCase", label: "費用群組（行內編輯）", type: "both" },
      { key: "fee_list_invoice", label: "請款單", type: "both" },
      { key: "fee_list_createdBy", label: "建立者", type: "both" },
      { key: "fee_list_createdAt", label: "建立時間", type: "both" },
    ],
    detailItems: [
      { key: "fee_detail_title", label: "標題", type: "both" },
      { key: "fee_detail_assignee", label: "譯者", type: "both" },
      { key: "fee_detail_status", label: "狀態", type: "both" },
      { key: "fee_detail_internalNote", label: "相關案件", type: "both" },
      { key: "fee_detail_client", label: "客戶", type: "both" },
      { key: "fee_detail_contact", label: "聯絡人", type: "both" },
      { key: "fee_detail_taskItems", label: "稿費內容", type: "both" },
      { key: "fee_detail_addItem", label: "新增項目", type: "both" },
      { key: "fee_detail_deleteItem", label: "刪除項目", type: "both" },
      { key: "fee_detail_taskType", label: "譯者任務類型", type: "both" },
      { key: "fee_detail_billingUnit", label: "計費單位", type: "both" },
      { key: "fee_detail_unitPrice", label: "稿費單價", type: "both" },
      { key: "fee_detail_unitCount", label: "計費單位數", type: "both" },
      { key: "fee_detail_rateConfirmed", label: "費率無誤", type: "both" },
      { key: "fee_detail_finalize", label: "開立稿費條", type: "both" },
      { key: "fee_detail_recall", label: "收回為草稿", type: "both" },
      { key: "fee_detail_delete", label: "刪除", type: "both" },
      { key: "fee_detail_createNew", label: "建立新費用頁面", type: "both" },
      { key: "fee_detail_clientInfo", label: "客戶端資訊區塊", type: "both" },
      { key: "fee_detail_comments", label: "費用相關備註", type: "both" },
      { key: "fee_detail_internalComments", label: "費用內部備註", type: "both" },
      { key: "fee_detail_editLog", label: "變更紀錄", type: "both" },
      { key: "fee_detail_creatorInfo", label: "建立者 / 建立時間", type: "both" },
    ],
  },
  {
    key: "translator_invoice",
    label: "稿費請款",
    listItems: [
      { key: "inv_list_create", label: "新增稿費請款單", type: "both" },
      { key: "inv_list_delete", label: "刪除", type: "both" },
      { key: "inv_list_title", label: "標題", type: "both" },
      { key: "inv_list_translator", label: "譯者", type: "both" },
      { key: "inv_list_status", label: "狀態", type: "both" },
      { key: "inv_list_feeCount", label: "費用數", type: "both" },
      { key: "inv_list_totalAmount", label: "總金額", type: "both" },
      { key: "inv_list_transferDate", label: "匯款日期", type: "both" },
      { key: "inv_list_note", label: "備註", type: "both" },
      { key: "inv_list_createdBy", label: "建立者", type: "both" },
      { key: "inv_list_createdAt", label: "建立時間", type: "both" },
    ],
    detailItems: [
      { key: "inv_detail_title", label: "標題", type: "both" },
      { key: "inv_detail_translator", label: "請款人", type: "both" },
      { key: "inv_detail_status", label: "狀態", type: "both" },
      { key: "inv_detail_addFee", label: "加入費用", type: "both" },
      { key: "inv_detail_removeFee", label: "移除費用", type: "both" },
      { key: "inv_detail_payFull", label: "全額付款", type: "both" },
      { key: "inv_detail_payPartial", label: "部份付款", type: "both" },
      { key: "inv_detail_delete", label: "刪除", type: "both" },
      { key: "inv_detail_comments", label: "稿費請款備註", type: "both" },
      { key: "inv_detail_internalComments", label: "稿費請款內部備註", type: "both" },
      { key: "inv_detail_editLog", label: "變更紀錄", type: "both" },
      { key: "inv_detail_creatorInfo", label: "建立者 / 建立時間", type: "both" },
    ],
  },
  {
    key: "client_invoice",
    label: "客戶請款",
    listItems: [
      { key: "cinv_list_create", label: "新增客戶請款單", type: "both" },
      { key: "cinv_list_delete", label: "刪除", type: "both" },
      { key: "cinv_list_title", label: "標題", type: "both" },
      { key: "cinv_list_client", label: "客戶", type: "both" },
      { key: "cinv_list_status", label: "狀態", type: "both" },
      { key: "cinv_list_feeCount", label: "費用數", type: "both" },
      { key: "cinv_list_totalAmount", label: "總金額", type: "both" },
      { key: "cinv_list_transferDate", label: "匯款日期", type: "both" },
      { key: "cinv_list_note", label: "備註", type: "both" },
      { key: "cinv_list_createdBy", label: "建立者", type: "both" },
      { key: "cinv_list_createdAt", label: "建立時間", type: "both" },
    ],
    detailItems: [
      { key: "cinv_detail_title", label: "標題", type: "both" },
      { key: "cinv_detail_client", label: "客戶", type: "both" },
      { key: "cinv_detail_status", label: "狀態", type: "both" },
      { key: "cinv_detail_note", label: "客戶請款備註", type: "both" },
      { key: "cinv_detail_addFee", label: "加入費用", type: "both" },
      { key: "cinv_detail_removeFee", label: "移除費用", type: "both" },
      { key: "cinv_detail_payFull", label: "全額付款", type: "both" },
      { key: "cinv_detail_payPartial", label: "部份付款", type: "both" },
      { key: "cinv_detail_delete", label: "刪除", type: "both" },
      { key: "cinv_detail_comments", label: "客戶請款備註（留言）", type: "both" },
      { key: "cinv_detail_editLog", label: "變更紀錄", type: "both" },
      { key: "cinv_detail_creatorInfo", label: "建立者 / 建立時間", type: "both" },
    ],
  },
  {
    key: "members",
    label: "成員管理",
    listItems: [
      { key: "members_view", label: "檢視成員清單", type: "both" },
      { key: "members_invite", label: "邀請成員", type: "both" },
      { key: "members_changeRole", label: "變更角色", type: "both" },
      { key: "members_remove", label: "移除成員", type: "both" },
    ],
    detailItems: [],
  },
  {
    key: "permissions",
    label: "身分管理",
    listItems: [
      { key: "perm_view", label: "檢視權限設定", type: "both" },
      { key: "perm_addRole", label: "新增身分", type: "both" },
      { key: "perm_deleteRole", label: "刪除身分", type: "both" },
      { key: "perm_editPerms", label: "修改權限設定", type: "both" },
    ],
    detailItems: [],
  },
];

// ─── Helpers to read/write permission values from config ───

interface ModulePerms {
  visible: boolean;
  items: Record<string, { view: boolean; edit: boolean }>;
}

function getModulePerms(config: any, roleKey: string, moduleKey: string): ModulePerms {
  const perms = config?.module_permissions?.[roleKey]?.[moduleKey];
  return perms || { visible: true, items: {} };
}

function getItemPerm(modulePerms: ModulePerms, itemKey: string, permType: "view" | "edit"): boolean {
  return modulePerms.items?.[itemKey]?.[permType] ?? true; // default: enabled
}

export default function PermissionsPage() {
  const { roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { config, loading, updateConfig } = usePermissions();

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

  const saveConfig = useCallback(async (newConfig: any) => {
    setSaving(true);
    const error = await updateConfig(newConfig);
    setSaving(false);
    return error;
  }, [updateConfig]);

  const saveCustomRoles = useCallback(async (newCustomRoles: RoleDefinition[]) => {
    return saveConfig({ ...config, custom_roles: newCustomRoles });
  }, [config, saveConfig]);

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

  const handleDeleteStep1 = () => setDeleteStep(2);

  const handleDeleteStep2 = async () => {
    if (deleteTarget) {
      const updated = customRoles.filter((r) => r.key !== deleteTarget.key);
      // Also remove module_permissions for deleted role
      const newModulePerms = { ...(config as any).module_permissions };
      delete newModulePerms[deleteTarget.key];
      const error = await saveConfig({ ...config, custom_roles: updated, module_permissions: newModulePerms });
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

  // Toggle module visibility
  const handleToggleModuleVisible = async (roleKey: string, moduleKey: string, visible: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newModulePerms = {
      ...(config as any).module_permissions,
      [roleKey]: {
        ...((config as any).module_permissions?.[roleKey] || {}),
        [moduleKey]: { ...modulePerms, visible },
      },
    };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  // Toggle individual item permission
  const handleToggleItemPerm = async (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const currentItem = modulePerms.items?.[itemKey] || { view: true, edit: true };
    const newItem = { ...currentItem, [permType]: value };
    // If edit is turned off, keep view as-is. If view is turned off, also turn off edit.
    if (permType === "view" && !value) {
      newItem.edit = false;
    }
    const newModulePerms = {
      ...(config as any).module_permissions,
      [roleKey]: {
        ...((config as any).module_permissions?.[roleKey] || {}),
        [moduleKey]: {
          ...modulePerms,
          items: { ...modulePerms.items, [itemKey]: newItem },
        },
      },
    };
    await saveConfig({ ...config, module_permissions: newModulePerms });
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
                          <RolePermissionPanel
                            roleKey={role.key}
                            roleLabel={role.label}
                            config={config}
                            onToggleModuleVisible={handleToggleModuleVisible}
                            onToggleItemPerm={handleToggleItemPerm}
                          />
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

// ─── Helper: check if all items in a module have all perms enabled ───

function isAllPermsEnabled(modulePerms: ModulePerms, mod: PermissionModule): boolean {
  const allItems = [...mod.listItems, ...mod.detailItems];
  return allItems.every((item) => {
    const view = getItemPerm(modulePerms, item.key, "view");
    const edit = getItemPerm(modulePerms, item.key, "edit");
    return view && edit;
  });
}

// ─── Per-role permission panel ───

function RolePermissionPanel({
  roleKey,
  roleLabel,
  config,
  onToggleModuleVisible,
  onToggleItemPerm,
  onToggleAllPerms,
}: {
  roleKey: string;
  roleLabel: string;
  config: any;
  onToggleModuleVisible: (roleKey: string, moduleKey: string, visible: boolean) => void;
  onToggleItemPerm: (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => void;
  onToggleAllPerms: (roleKey: string, moduleKey: string, value: boolean) => void;
}) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  return (
    <div className="space-y-1 border rounded-lg p-3 bg-muted/20">
      <p className="text-xs text-muted-foreground mb-2">「{roleLabel}」的模組權限</p>
      {PERMISSION_MODULES.map((mod) => {
        const isExpanded = expandedModule === mod.key;
        const modulePerms = getModulePerms(config, roleKey, mod.key);
        const isVisible = modulePerms.visible;
        const allEnabled = isVisible && isAllPermsEnabled(modulePerms, mod);

        return (
          <Collapsible key={mod.key} open={isExpanded} onOpenChange={(open) => setExpandedModule(open ? mod.key : null)}>
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/40">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer flex-1">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="text-sm">{mod.label}</span>
                </div>
              </CollapsibleTrigger>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">所有權限</Label>
                  <Switch
                    checked={allEnabled}
                    onCheckedChange={(v) => {
                      if (v && !isVisible) {
                        onToggleModuleVisible(roleKey, mod.key, true);
                      }
                      onToggleAllPerms(roleKey, mod.key, v);
                    }}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">可見</Label>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={(v) => onToggleModuleVisible(roleKey, mod.key, v)}
                    className="scale-75"
                  />
                </div>
              </div>
            </div>
            <CollapsibleContent>
              {isVisible ? (
                <div className="ml-6 mt-1 mb-2 space-y-3 border-l-2 border-border pl-3">
                  {/* List items */}
                  {mod.listItems.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">總表操作</p>
                      <div className="space-y-1">
                        {mod.listItems.map((item) => (
                          <PermissionItemRow
                            key={item.key}
                            item={item}
                            modulePerms={modulePerms}
                            onToggle={(permType, value) => onToggleItemPerm(roleKey, mod.key, item.key, permType, value)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detail items */}
                  {mod.detailItems.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">詳情頁操作</p>
                      <div className="space-y-1">
                        {mod.detailItems.map((item) => (
                          <PermissionItemRow
                            key={item.key}
                            item={item}
                            modulePerms={modulePerms}
                            onToggle={(permType, value) => onToggleItemPerm(roleKey, mod.key, item.key, permType, value)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ml-6 mt-1 mb-2 px-2 py-2 text-xs text-muted-foreground border-l-2 border-border">
                  此角色無法看見此模組，展開後無可設定項目。
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function PermissionItemRow({
  item,
  modulePerms,
  onToggle,
}: {
  item: PermissionItem;
  modulePerms: ModulePerms;
  onToggle: (permType: "view" | "edit", value: boolean) => void;
}) {
  const viewEnabled = getItemPerm(modulePerms, item.key, "view");
  const editEnabled = getItemPerm(modulePerms, item.key, "edit");

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/30 text-xs">
      <span className="text-foreground/80">{item.label}</span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">檢視</span>
          <Switch
            checked={viewEnabled}
            onCheckedChange={(v) => onToggle("view", v)}
            className="scale-[0.6]"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">編輯</span>
          <Switch
            checked={editEnabled}
            onCheckedChange={(v) => onToggle("edit", v)}
            className="scale-[0.6]"
            disabled={!viewEnabled}
          />
        </div>
      </div>
    </div>
  );
}
