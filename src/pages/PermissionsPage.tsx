import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionConfig, type RoleDefinition, getAllRolesOrdered } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2, GripVertical } from "lucide-react";
import { toast } from "sonner";

// ??? Permission structure definitions ???

interface PermissionItem {
  key: string;
  label: string;
  type: "view" | "edit" | "both";
  attribute?: string;
}

interface DetailSection {
  label: string;
  isHeaderOnly?: boolean;
  items: PermissionItem[];
}

interface PermissionModule {
  key: string;
  label: string;
  listItems: PermissionItem[];
  detailSections: DetailSection[];
}

function getAllDetailItems(mod: PermissionModule): PermissionItem[] {
  return mod.detailSections.flatMap((s) => s.items);
}

const PERMISSION_MODULES: PermissionModule[] = [
  // 1. ????
  {
    key: "case_management",
    label: "????",
    listItems: [
      
      { key: "case_list_create", label: "????", type: "both", attribute: "??" },
      { key: "case_list_delete", label: "??", type: "both", attribute: "??" },
      { key: "case_list_viewDraft", label: "????", type: "view" },
    ],
    detailSections: [
      {
        label: "??????",
        items: [
          { key: "case_detail_viewDraft", label: "????", type: "view" },
        ],
      },
      {
        label: "??????",
        items: [
          { key: "case_detail_title", label: "????", type: "both", attribute: "??" },
          { key: "case_detail_category", label: "??", type: "both", attribute: "??" },
          { key: "case_detail_workType", label: "????", type: "both", attribute: "??" },
          
          { key: "case_detail_translator", label: "??", type: "both", attribute: "??????" },
          { key: "case_detail_reviewer", label: "????", type: "both", attribute: "??????" },
        ],
      },
      {
        label: "??",
        items: [
          { key: "case_detail_toolSelect", label: "????", type: "both", attribute: "??" },
          { key: "case_detail_toolAdd", label: "????", type: "both", attribute: "??" },
          { key: "case_detail_toolRemove", label: "????", type: "both", attribute: "??" },
          { key: "case_detail_toolFieldAdd", label: "??????", type: "both", attribute: "??" },
          { key: "case_detail_toolFieldRemove", label: "??????", type: "both", attribute: "??" },
          { key: "case_detail_toolTemplate", label: "??", type: "both", attribute: "??" },
        ],
      },
      {
        label: "????",
        items: [
          { key: "case_fee_generate_button", label: "???????", type: "both", attribute: "??" },
          { key: "case_fee_warning", label: "?????????", type: "view" },
          { key: "case_fee_badges", label: "????????", type: "view" },
          { key: "case_fee_links", label: "???????", type: "view" },
          { key: "case_detail_client", label: "??", type: "both", attribute: "??" },
          { key: "case_detail_contact", label: "???", type: "both", attribute: "??" },
          { key: "case_detail_keyword", label: "??? / ?? PO# / ??????? / ????", type: "both", attribute: "?? / ?? / ??" },
        ],
      },
    ],
  },
  // 2. ????
  {
    key: "internal_notes",
    label: "????",
    listItems: [
      { key: "inotes_list_view", label: "????", type: "both" },
      { key: "inotes_list_create", label: "????", type: "both", attribute: "??" },
      { key: "inotes_list_delete", label: "????", type: "both", attribute: "??" },
    ],
    detailSections: [
      {
        label: "????",
        items: [
          { key: "inotes_detail_title", label: "??", type: "both", attribute: "??" },
          { key: "inotes_detail_relatedCase", label: "????", type: "both", attribute: "??" },
          { key: "inotes_detail_noteType", label: "??", type: "both", attribute: "??" },
          { key: "inotes_detail_status", label: "??", type: "both", attribute: "??" },
          { key: "inotes_detail_assignee", label: "??????", type: "both", attribute: "??????" },
          { key: "inotes_detail_content", label: "???????", type: "both", attribute: "???" },
          { key: "inotes_detail_resolution", label: "??????", type: "both", attribute: "???" },
          { key: "inotes_detail_remarks", label: "??", type: "both", attribute: "???" },
        ],
      },
    ],
  },
  // 3. ????
  {
    key: "fee_management",
    label: "????",
    listItems: [
      { key: "fee_list_create", label: "????", type: "both", attribute: "??" },
      { key: "fee_list_delete", label: "????", type: "both", attribute: "??" },
      { key: "fee_list_viewDraft", label: "????", type: "view" },
      { key: "fee_list_batchFinalize", label: "?????????", type: "both", attribute: "??" },
      { key: "table_field_clientInvoiceStatus", label: "??????", type: "both", attribute: "??" },
    ],
    detailSections: [
      {
        label: "??????",
        items: [
          { key: "fee_detail_viewDraft", label: "????", type: "view" },
          { key: "fee_detail_delete", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_copy", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_createNew", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_finalize", label: "?????", type: "both", attribute: "??" },
          { key: "fee_detail_recall", label: "?????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "???????",
        items: [
          { key: "fee_detail_title", label: "??", type: "both", attribute: "??" },
          { key: "fee_detail_assignee", label: "??", type: "both", attribute: "??????" },
          { key: "fee_detail_status", label: "??????", type: "view", attribute: "??????????" },
          { key: "fee_detail_internalNote", label: "????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "????",
        isHeaderOnly: true,
        items: [
          { key: "fee_detail_taskType", label: "??????", type: "both", attribute: "??" },
          { key: "fee_detail_billingUnit", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_unitPrice", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_unitCount", label: "?????", type: "both", attribute: "??" },
          { key: "fee_detail_addItem", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_deleteItem", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_rateConfirmed", label: "????", type: "both", attribute: "????" },
        ],
      },
      {
        label: "????",
        isHeaderOnly: true,
        items: [
          { key: "fee_detail_client", label: "??", type: "both", attribute: "??" },
          { key: "fee_detail_contact", label: "???", type: "both", attribute: "??" },
          { key: "fee_detail_clientCaseId", label: "???", type: "both", attribute: "??" },
          { key: "fee_detail_clientPoNumber", label: "?? PO#", type: "both", attribute: "??" },
          { key: "fee_detail_dispatchRoute", label: "????", type: "both", attribute: "??" },
          { key: "fee_detail_clientRevenue", label: "????", type: "view", attribute: "??????????" },
          { key: "fee_detail_profit", label: "??", type: "view", attribute: "??????????" },
          { key: "fee_detail_reconciled", label: "????", type: "both", attribute: "????" },
          { key: "fee_detail_invoiced", label: "????", type: "both", attribute: "????" },
          { key: "fee_detail_sameCase", label: "????", type: "both", attribute: "????" },
          { key: "fee_detail_invoice", label: "???", type: "view", attribute: "??????????" },
        ],
      },
      {
        label: "??",
        items: [
          { key: "fee_detail_comments", label: "??", type: "both", attribute: "??" },
          { key: "fee_detail_internalComments", label: "????", type: "both", attribute: "??" },
        ],
      },
    ],
  },
  // 4. ????
  {
    key: "translator_invoice",
    label: "????",
    listItems: [
      { key: "inv_list_create", label: "???????", type: "both", attribute: "??" },
      { key: "inv_list_delete", label: "??", type: "both", attribute: "??" },
    ],
    detailSections: [
      {
        label: "??????",
        items: [
          { key: "inv_detail_delete", label: "????", type: "both", attribute: "??" },
          { key: "inv_detail_payFull", label: "????", type: "both", attribute: "??" },
          { key: "inv_detail_payPartial", label: "????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "???????",
        items: [
          { key: "inv_detail_title", label: "??", type: "both", attribute: "??" },
          { key: "inv_detail_translator", label: "???", type: "both", attribute: "??????" },
          { key: "inv_detail_status", label: "??", type: "view", attribute: "??????????" },
          { key: "inv_detail_addFee", label: "????", type: "both", attribute: "??" },
          { key: "inv_detail_removeFee", label: "????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "??",
        items: [
          { key: "inv_detail_comments", label: "??", type: "both", attribute: "??" },
          { key: "inv_detail_internalComments", label: "????", type: "both", attribute: "??" },
        ],
      },
    ],
  },
  // 5. ????
  {
    key: "client_invoice",
    label: "????",
    listItems: [
      { key: "cinv_list_create", label: "???????", type: "both", attribute: "??" },
      { key: "cinv_list_delete", label: "??", type: "both", attribute: "??" },
    ],
    detailSections: [
      {
        label: "??????",
        items: [
          { key: "cinv_detail_delete", label: "????", type: "both", attribute: "??" },
          { key: "cinv_detail_payFull", label: "????", type: "both", attribute: "??" },
          { key: "cinv_detail_payPartial", label: "????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "???????",
        items: [
          { key: "cinv_detail_title", label: "??", type: "both", attribute: "??" },
          { key: "cinv_detail_client", label: "??", type: "both", attribute: "??" },
          { key: "cinv_detail_status", label: "??", type: "view", attribute: "??????????" },
          { key: "cinv_detail_addFee", label: "????", type: "both", attribute: "??" },
          { key: "cinv_detail_removeFee", label: "????", type: "both", attribute: "??" },
        ],
      },
      {
        label: "??",
        items: [
          { key: "cinv_detail_comments", label: "??", type: "both", attribute: "??" },
        ],
      },
    ],
  },
  // 6. ????
  {
    key: "tool_management",
    label: "????",
    listItems: [
      { key: "tool_list_view", label: "??????", type: "both" },
      { key: "tool_list_edit", label: "??????", type: "both", attribute: "??" },
    ],
    detailSections: [],
  },
  // 7. ????
  {
    key: "team_members",
    label: "????",
    listItems: [
      { key: "members_view", label: "??????", type: "both" },
      { key: "members_invite", label: "????", type: "both", attribute: "??" },
      { key: "members_changeRole", label: "????", type: "both", attribute: "??" },
      { key: "members_remove", label: "????", type: "both", attribute: "??" },
      { key: "members_sort", label: "????", type: "edit", attribute: "????" },
      { key: "members_note", label: "????", type: "both", attribute: "?????" },
      { key: "members_noFee", label: "?????", type: "both", attribute: "????" },
      { key: "members_freeze", label: "????", type: "both", attribute: "??" },
      { key: "members_showFrozen", label: "????????", type: "view" },
    ],
    detailSections: [],
  },
  // 8. ????
  {
    key: "field_reference",
    label: "????",
    listItems: [
      { key: "field_ref_view", label: "???????", type: "view" },
    ],
    detailSections: [],
  },
];

// ??? Helpers ???

interface ModulePerms {
  visible: boolean;
  items: Record<string, { view: boolean; edit: boolean }>;
}

function getModulePerms(config: PermissionConfig, roleKey: string, moduleKey: string): ModulePerms {
  const perms = config.module_permissions?.[roleKey]?.[moduleKey];
  return { visible: perms?.visible ?? true, items: perms?.items ?? {} };
}

function getItemPerm(modulePerms: ModulePerms, itemKey: string, permType: "view" | "edit"): boolean {
  return modulePerms.items?.[itemKey]?.[permType] ?? true;
}

function isAllPermsEnabled(modulePerms: ModulePerms, mod: PermissionModule): boolean {
  const allItems = [...mod.listItems, ...getAllDetailItems(mod)];
  return allItems.every((item) => {
    const view = getItemPerm(modulePerms, item.key, "view");
    if (item.type === "view") return view;
    return view && getItemPerm(modulePerms, item.key, "edit");
  });
}

function isSectionAllView(modulePerms: ModulePerms, items: PermissionItem[]): boolean {
  return items.every((item) => getItemPerm(modulePerms, item.key, "view"));
}

function isSectionAllEdit(modulePerms: ModulePerms, items: PermissionItem[]): boolean {
  const editableItems = items.filter((item) => item.type !== "view");
  return editableItems.length > 0 && editableItems.every((item) => getItemPerm(modulePerms, item.key, "edit"));
}

function isSectionNoEdit(modulePerms: ModulePerms, items: PermissionItem[]): boolean {
  const editableItems = items.filter((item) => item.type !== "view");
  return editableItems.length === 0 || editableItems.every((item) => !getItemPerm(modulePerms, item.key, "edit"));
}

// ??? Main Component ???

export default function PermissionsPage() {
  const { roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { config, loading, updateConfig, allRoles } = usePermissions();

  const customRoles: RoleDefinition[] = config.custom_roles || [];

  const [newRoleName, setNewRoleName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [rolesSectionOpen, setRolesSectionOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [renamingRole, setRenamingRole] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const saveConfig = useCallback(async (newConfig: PermissionConfig) => {
    setSaving(true);
    const error = await updateConfig(newConfig);
    setSaving(false);
    return error;
  }, [updateConfig]);

  const saveCustomRoles = useCallback(async (newCustomRoles: RoleDefinition[]) => {
    const newOrder = getAllRolesOrdered({ ...config, custom_roles: newCustomRoles }).map((r) => r.key);
    return saveConfig({ ...config, custom_roles: newCustomRoles, role_order: newOrder });
  }, [config, saveConfig]);

  const handleAddRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    if (allRoles.some((r) => r.label === name || r.key === name)) {
      toast.error("??????");
      return;
    }
    const key = `custom_${Date.now()}`;
    const newRole: RoleDefinition = { key, label: name, builtIn: false };
    const error = await saveCustomRoles([...customRoles, newRole]);
    if (!error) {
      setNewRoleName("");
      toast.success(`??????${name}?`);
    } else {
      toast.error("????");
    }
  };

  const handleDeleteClick = (role: RoleDefinition) => { setDeleteTarget(role); setDeleteStep(1); };
  const handleDeleteStep1 = () => setDeleteStep(2);
  const handleDeleteStep2 = async () => {
    if (deleteTarget) {
      const updated = customRoles.filter((r) => r.key !== deleteTarget.key);
      const newModulePerms = { ...config.module_permissions };
      delete newModulePerms[deleteTarget.key];
      const error = await saveConfig({ ...config, custom_roles: updated, module_permissions: newModulePerms });
      if (!error) toast.success(`??????${deleteTarget.label}?`);
      else toast.error("????");
    }
    setDeleteTarget(null);
    setDeleteStep(1);
  };
  const handleCancelDelete = () => { setDeleteTarget(null); setDeleteStep(1); };

  const handleRenameStart = (role: RoleDefinition) => { setRenamingRole(role.key); setRenameValue(role.label); };
  const handleRenameConfirm = async () => {
    if (!renamingRole || !renameValue.trim()) { setRenamingRole(null); return; }
    const name = renameValue.trim();
    if (allRoles.some((r) => r.key !== renamingRole && r.label === name)) { toast.error("???????"); return; }
    const role = allRoles.find((r) => r.key === renamingRole);
    if (!role) return;
    if (role.builtIn) {
      const overrides = { ...(config.role_label_overrides || {}), [role.key]: name };
      await saveConfig({ ...config, role_label_overrides: overrides });
    } else {
      const updatedCustom = customRoles.map((r) => r.key === renamingRole ? { ...r, label: name } : r);
      await saveConfig({ ...config, custom_roles: updatedCustom });
    }
    setRenamingRole(null);
    toast.success(`?????${name}?`);
  };

  const handleDragEnd = async () => {
    if (draggedIdx === null || dragOverIdx === null || draggedIdx === dragOverIdx) { setDraggedIdx(null); setDragOverIdx(null); return; }
    const reordered = [...allRoles];
    const [moved] = reordered.splice(draggedIdx, 1);
    reordered.splice(dragOverIdx, 0, moved);
    const newOrder = reordered.map((r) => r.key);
    const newCustomRoles = reordered.filter((r) => !r.builtIn);
    setDraggedIdx(null);
    setDragOverIdx(null);
    await saveConfig({ ...config, custom_roles: newCustomRoles, role_order: newOrder });
    toast.success("?????");
  };

  const handleToggleModuleVisible = async (roleKey: string, moduleKey: string, visible: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newModulePerms = { ...config.module_permissions, [roleKey]: { ...(config.module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, visible } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleToggleItemPerm = async (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const currentItem = modulePerms.items?.[itemKey] || { view: true, edit: true };
    const newItem = { ...currentItem, [permType]: value };
    if (permType === "view" && !value) newItem.edit = false;
    const newModulePerms = { ...config.module_permissions, [roleKey]: { ...(config.module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: { ...modulePerms.items, [itemKey]: newItem } } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleToggleAllPerms = async (roleKey: string, moduleKey: string, value: boolean) => {
    const mod = PERMISSION_MODULES.find((m) => m.key === moduleKey);
    if (!mod) return;
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const allItems = [...mod.listItems, ...getAllDetailItems(mod)];
    const newItems: Record<string, { view: boolean; edit: boolean }> = { ...modulePerms.items };
    for (const item of allItems) {
      newItems[item.key] = item.type === "view" ? { view: value, edit: false } : { view: value, edit: value };
    }
    const newModulePerms = { ...config.module_permissions, [roleKey]: { ...(config.module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, visible: value ? true : modulePerms.visible, items: newItems } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleToggleSectionPerms = async (roleKey: string, moduleKey: string, items: PermissionItem[], permType: "view" | "edit", value: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newItems: Record<string, { view: boolean; edit: boolean }> = { ...modulePerms.items };
    for (const item of items) {
      const current = newItems[item.key] || { view: true, edit: true };
      if (permType === "view") {
        newItems[item.key] = { view: value, edit: value ? current.edit : false };
      } else {
        if (item.type === "view") continue;
        newItems[item.key] = { ...current, edit: value };
      }
    }
    const newModulePerms = { ...config.module_permissions, [roleKey]: { ...(config.module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: newItems } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleSetSectionViewOnly = async (roleKey: string, moduleKey: string, items: PermissionItem[]) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newItems: Record<string, { view: boolean; edit: boolean }> = { ...modulePerms.items };
    for (const item of items) {
      newItems[item.key] = { view: true, edit: false };
    }
    const newModulePerms = { ...config.module_permissions, [roleKey]: { ...(config.module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: newItems } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  if (!isExecutive) {
    return <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">??????????</div>;
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">????</h1>
        <p className="mt-1 text-sm text-muted-foreground">??????????????</p>
      </div>

      <Card>
        <Collapsible open={rolesSectionOpen} onOpenChange={setRolesSectionOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                {rolesSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                ????
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="???????" className="max-w-xs text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleAddRole(); }} />
                <Button size="sm" onClick={handleAddRole} disabled={!newRoleName.trim() || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  ??
                </Button>
              </div>

              <div className="divide-y divide-border">
                {allRoles.map((role, idx) => {
                  const isExpanded = expandedRole === role.key;
                  return (
                    <div
                      key={role.key}
                      className={`py-3 transition-colors ${dragOverIdx === idx ? "bg-accent/40" : ""}`}
                      draggable
                      onDragStart={() => setDraggedIdx(idx)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={(e) => { e.preventDefault(); handleDragEnd(); }}
                      onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedRole(isExpanded ? null : role.key)}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                          {renamingRole === role.key ? (
                            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRenameConfirm(); if (e.key === "Escape") setRenamingRole(null); }} onBlur={handleRenameConfirm} autoFocus className="h-7 w-32 text-sm" />
                          ) : (
                            <span className="text-sm font-medium cursor-pointer hover:underline" onClick={() => handleRenameStart(role)} title="?????">{role.label}</span>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteClick(role)}>
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
                            onToggleAllPerms={handleToggleAllPerms}
                            onToggleSectionPerms={handleToggleSectionPerms}
                            onSetSectionViewOnly={handleSetSectionViewOnly}
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

      <AlertDialog open={!!deleteTarget && deleteStep === 1} onOpenChange={(open) => { if (!open && deleteStep === 1) handleCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>??????</AlertDialogTitle>
            <AlertDialogDescription>??????{deleteTarget?.label}???????????????</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>??</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteStep1(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">??</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget && deleteStep === 2} onOpenChange={(open) => { if (!open) handleCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>??????</AlertDialogTitle>
            <AlertDialogDescription>????????{deleteTarget?.label}????????????????????????????????????</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>??</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep2} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">????</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ??? Per-role permission panel ???

function RolePermissionPanel({
  roleKey, roleLabel, config, onToggleModuleVisible, onToggleItemPerm, onToggleAllPerms, onToggleSectionPerms, onSetSectionViewOnly,
}: {
  roleKey: string; roleLabel: string; config: PermissionConfig;
  onToggleModuleVisible: (roleKey: string, moduleKey: string, visible: boolean) => void;
  onToggleItemPerm: (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => void;
  onToggleAllPerms: (roleKey: string, moduleKey: string, value: boolean) => void;
  onToggleSectionPerms: (roleKey: string, moduleKey: string, items: PermissionItem[], permType: "view" | "edit", value: boolean) => void;
  onSetSectionViewOnly: (roleKey: string, moduleKey: string, items: PermissionItem[]) => void;
}) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  return (
    <div className="space-y-1 border rounded-lg p-3 bg-muted/20">
      <p className="text-xs text-muted-foreground mb-2">?{roleLabel}??????</p>
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
                  <Label className="text-xs text-foreground font-medium">?????</Label>
                  <Switch checked={isVisible} onCheckedChange={(v) => onToggleModuleVisible(roleKey, mod.key, v)} className="scale-75 data-[state=checked]:bg-primary" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-foreground font-medium">???????????</Label>
                  <Switch checked={allEnabled} onCheckedChange={(v) => { if (v && !isVisible) onToggleModuleVisible(roleKey, mod.key, true); onToggleAllPerms(roleKey, mod.key, v); }} className="scale-75 data-[state=checked]:bg-primary" />
                </div>
              </div>
            </div>
            <CollapsibleContent>
              {isVisible ? (
                <div className="ml-6 mt-1 mb-2 space-y-3 border-l-2 border-border pl-3">
                  {/* List items */}
                  {mod.listItems.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-muted-foreground">????</p>
                        <SectionBulkButtons
                          level="list"
                          modulePerms={modulePerms}
                          items={mod.listItems}
                          onToggle={(permType, value) => onToggleSectionPerms(roleKey, mod.key, mod.listItems, permType, value)}
                          onToggleVisible={(v) => onToggleSectionPerms(roleKey, mod.key, mod.listItems, "view", v)}
                          onSetViewOnly={() => onSetSectionViewOnly(roleKey, mod.key, mod.listItems)}
                        />
                      </div>
                      <div>
                        {mod.listItems.map((item, i) => (
                          <div key={item.key}>
                            {i > 0 && <div className="border-t border-dashed border-border/50" />}
                            <PermissionItemRow item={item} modulePerms={modulePerms} onToggle={(permType, value) => onToggleItemPerm(roleKey, mod.key, item.key, permType, value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detail sections */}
                  {mod.detailSections.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">?????</p>
                      {mod.detailSections.map((section, sIdx) => (
                        <div key={section.label}>
                          {sIdx > 0 && <Separator className="my-3" />}
                          <div className="flex items-center justify-between mb-1 ml-1">
                            <p className="text-xs font-semibold text-foreground/70">{section.label}</p>
                            <SectionBulkButtons
                              level="detail"
                              modulePerms={modulePerms}
                              items={section.items}
                              onToggle={(permType, value) => onToggleSectionPerms(roleKey, mod.key, section.items, permType, value)}
                              onToggleVisible={(v) => onToggleSectionPerms(roleKey, mod.key, section.items, "view", v)}
                              onSetViewOnly={() => onSetSectionViewOnly(roleKey, mod.key, section.items)}
                            />
                          </div>
                          <div>
                            {section.items.map((item, i) => (
                              <div key={item.key}>
                                {i > 0 && <div className="border-t border-dashed border-border/50" />}
                                <PermissionItemRow item={item} modulePerms={modulePerms} onToggle={(permType, value) => onToggleItemPerm(roleKey, mod.key, item.key, permType, value)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="ml-6 mt-1 mb-2 px-2 py-2 text-xs text-muted-foreground border-l-2 border-border">
                  ?????????????????????
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ??? Section bulk buttons with color tiers ???

function SectionBulkButtons({
  level,
  modulePerms,
  items,
  onToggle,
  onToggleVisible,
  onSetViewOnly,
}: {
  level: "list" | "detail";
  modulePerms: ModulePerms;
  items: PermissionItem[];
  onToggle: (permType: "view" | "edit", value: boolean) => void;
  onToggleVisible?: (visible: boolean) => void;
  onSetViewOnly?: () => void;
}) {
  const allView = isSectionAllView(modulePerms, items);
  const allEdit = isSectionAllEdit(modulePerms, items);
  const noEdit = isSectionNoEdit(modulePerms, items);
  const hasEditableItems = items.some((item) => item.type !== "view");
  // "??" = at least one item is viewable
  const anyVisible = items.some((item) => getItemPerm(modulePerms, item.key, "view"));

  return (
    <div className="flex items-center gap-4">
      {onToggleVisible && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70">?????</Label>
          <Switch checked={anyVisible} onCheckedChange={(v) => onToggleVisible(v)} className="scale-75 data-[state=checked]:bg-primary/70" />
        </div>
      )}
      <div className="flex items-center gap-1">
        <Label className="text-xs text-foreground/70">????</Label>
        <Switch checked={allView} onCheckedChange={(v) => onToggle("view", v)} className="scale-75 data-[state=checked]:bg-primary/70" />
      </div>
      {hasEditableItems && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70 whitespace-nowrap">?????????</Label>
          <Switch
            checked={allView && noEdit}
            onCheckedChange={() => onSetViewOnly?.()}
            className="scale-75 data-[state=checked]:bg-primary/70"
          />
        </div>
      )}
      {hasEditableItems && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70">????</Label>
          <Switch checked={allEdit} onCheckedChange={(v) => onToggle("edit", v)} className="scale-75 data-[state=checked]:bg-primary/70" />
        </div>
      )}
    </div>
  );
}

// ??? Single permission item row ???

function PermissionItemRow({
  item, modulePerms, onToggle,
}: {
  item: PermissionItem; modulePerms: ModulePerms;
  onToggle: (permType: "view" | "edit", value: boolean) => void;
}) {
  const viewEnabled = getItemPerm(modulePerms, item.key, "view");
  const editEnabled = getItemPerm(modulePerms, item.key, "edit");
  const isViewOnly = item.type === "view";

  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-foreground/80">{item.label}</span>
        {item.attribute && (
          <span className="text-muted-foreground/70 text-[11px]">{item.attribute}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">??</span>
          <Switch checked={viewEnabled} onCheckedChange={(v) => onToggle("view", v)} className="scale-[0.6] data-[state=checked]:bg-primary/70" />
        </div>
        <div className={`flex items-center gap-1${isViewOnly ? " invisible" : ""}`}>
          <span className="text-muted-foreground">??</span>
          <Switch checked={editEnabled} onCheckedChange={(v) => onToggle("edit", v)} className="scale-[0.6] data-[state=checked]:bg-primary/70" disabled={!viewEnabled || isViewOnly} />
        </div>
      </div>
    </div>
  );
}
