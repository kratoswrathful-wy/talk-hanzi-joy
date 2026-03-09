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

// ─── Permission structure definitions ───

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
  // 1. 案件管理
  {
    key: "case_management",
    label: "案件管理",
    listItems: [
      
      { key: "case_list_create", label: "新增案件", type: "both", attribute: "按鈕" },
      { key: "case_list_delete", label: "刪除", type: "both", attribute: "按鈕" },
      { key: "case_list_viewDraft", label: "檢視草稿", type: "view" },
    ],
    detailSections: [
      {
        label: "頁面一般操作",
        items: [
          { key: "case_detail_viewDraft", label: "檢視草稿", type: "view" },
        ],
      },
      {
        label: "案件基本資訊",
        items: [
          { key: "case_detail_title", label: "案件編號", type: "both", attribute: "文字" },
          { key: "case_detail_category", label: "類型", type: "both", attribute: "單選" },
          { key: "case_detail_workType", label: "工作類型", type: "both", attribute: "單選" },
          
          { key: "case_detail_translator", label: "譯者", type: "both", attribute: "人員（多選）" },
          { key: "case_detail_reviewer", label: "審稿人員", type: "both", attribute: "人員（單選）" },
        ],
      },
      {
        label: "工具",
        items: [
          { key: "case_detail_toolSelect", label: "執行工具", type: "both", attribute: "單選" },
          { key: "case_detail_toolAdd", label: "新增工具", type: "both", attribute: "按鈕" },
          { key: "case_detail_toolRemove", label: "移除工具", type: "both", attribute: "按鈕" },
          { key: "case_detail_toolFieldAdd", label: "新增工具欄位", type: "both", attribute: "按鈕" },
          { key: "case_detail_toolFieldRemove", label: "移除工具欄位", type: "both", attribute: "按鈕" },
          { key: "case_detail_toolTemplate", label: "範本", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "本案費用",
        items: [
          { key: "case_fee_generate_button", label: "新增費用單按鈕", type: "both", attribute: "按鈕" },
          { key: "case_fee_warning", label: "費用單數目提示訊息", type: "view" },
          { key: "case_fee_badges", label: "主要／非主要標籤", type: "view" },
          { key: "case_fee_links", label: "相關費用單連結", type: "view" },
          { key: "case_detail_client", label: "客戶", type: "both", attribute: "單選" },
          { key: "case_detail_contact", label: "聯絡人", type: "both", attribute: "單選" },
          { key: "case_detail_keyword", label: "關鍵字 / 客戶 PO#", type: "both", attribute: "文字" },
        ],
      },
    ],
  },
  // 2. 內部註記
  {
    key: "internal_notes",
    label: "內部註記",
    listItems: [
      { key: "inotes_list_view", label: "檢視列表", type: "both" },
      { key: "inotes_list_create", label: "新增紀錄", type: "both", attribute: "按鈕" },
      { key: "inotes_list_delete", label: "刪除紀錄", type: "both", attribute: "按鈕" },
    ],
    detailSections: [
      {
        label: "紀錄詳情",
        items: [
          { key: "inotes_detail_title", label: "標題", type: "both", attribute: "文字" },
          { key: "inotes_detail_relatedCase", label: "關聯案件", type: "both", attribute: "關聯" },
          { key: "inotes_detail_noteType", label: "性質", type: "both", attribute: "單選" },
          { key: "inotes_detail_status", label: "狀態", type: "both", attribute: "單選" },
          { key: "inotes_detail_assignee", label: "內部指派對象", type: "both", attribute: "人員（單選）" },
          { key: "inotes_detail_content", label: "問題或註記內容", type: "both", attribute: "長文字" },
          { key: "inotes_detail_resolution", label: "內部處理結論", type: "both", attribute: "長文字" },
          { key: "inotes_detail_remarks", label: "備註", type: "both", attribute: "長文字" },
        ],
      },
    ],
  },
  // 3. 費用管理
  {
    key: "fee_management",
    label: "費用管理",
    listItems: [
      { key: "fee_list_create", label: "新增費用", type: "both", attribute: "按鈕" },
      { key: "fee_list_delete", label: "刪除費用", type: "both", attribute: "按鈕" },
      { key: "fee_list_viewDraft", label: "檢視草稿", type: "view" },
    ],
    detailSections: [
      {
        label: "頁面一般操作",
        items: [
          { key: "fee_detail_viewDraft", label: "檢視草稿", type: "view" },
          { key: "fee_detail_delete", label: "刪除頁面", type: "both", attribute: "按鈕" },
          { key: "fee_detail_copy", label: "複製頁面", type: "both", attribute: "按鈕" },
          { key: "fee_detail_createNew", label: "新增費用頁面", type: "both", attribute: "按鈕" },
          { key: "fee_detail_finalize", label: "開立稿費條", type: "both", attribute: "按鈕" },
          { key: "fee_detail_recall", label: "收回為草稿", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "費用單基本資料",
        items: [
          { key: "fee_detail_title", label: "標題", type: "both", attribute: "文字" },
          { key: "fee_detail_assignee", label: "譯者", type: "both", attribute: "人員（單選）" },
          { key: "fee_detail_status", label: "稿費開立狀態", type: "view", attribute: "自動填入（無法編輯）" },
          { key: "fee_detail_internalNote", label: "相關案件", type: "both", attribute: "文字" },
        ],
      },
      {
        label: "稿費內容",
        isHeaderOnly: true,
        items: [
          { key: "fee_detail_taskType", label: "譯者任務類型", type: "both", attribute: "單選" },
          { key: "fee_detail_billingUnit", label: "計費單位", type: "both", attribute: "單選" },
          { key: "fee_detail_unitPrice", label: "稿費單價", type: "both", attribute: "數字" },
          { key: "fee_detail_unitCount", label: "計費單位數", type: "both", attribute: "數字" },
          { key: "fee_detail_addItem", label: "新增項目", type: "both", attribute: "按鈕" },
          { key: "fee_detail_deleteItem", label: "刪除項目", type: "both", attribute: "按鈕" },
          { key: "fee_detail_rateConfirmed", label: "費率無誤", type: "both", attribute: "核取方塊" },
        ],
      },
      {
        label: "營收內容",
        isHeaderOnly: true,
        items: [
          { key: "fee_detail_client", label: "客戶", type: "both", attribute: "單選" },
          { key: "fee_detail_contact", label: "聯絡人", type: "both", attribute: "單選" },
          { key: "fee_detail_clientCaseId", label: "關鍵字", type: "both", attribute: "文字" },
          { key: "fee_detail_clientPoNumber", label: "客戶 PO#", type: "both", attribute: "文字" },
          { key: "fee_detail_dispatchRoute", label: "派案途徑", type: "both", attribute: "單選" },
          { key: "fee_detail_clientRevenue", label: "營收總額", type: "view", attribute: "自動計算（無法編輯）" },
          { key: "fee_detail_profit", label: "利潤", type: "view", attribute: "自動計算（無法編輯）" },
          { key: "fee_detail_reconciled", label: "對帳完成", type: "both", attribute: "核取方塊" },
          { key: "fee_detail_invoiced", label: "請款完成", type: "both", attribute: "核取方塊" },
          { key: "fee_detail_sameCase", label: "費用群組", type: "both", attribute: "核取方塊" },
          { key: "fee_detail_invoice", label: "請款單", type: "view", attribute: "自動填入（無法編輯）" },
        ],
      },
      {
        label: "備註",
        items: [
          { key: "fee_detail_comments", label: "備註", type: "both", attribute: "文字" },
          { key: "fee_detail_internalComments", label: "內部備註", type: "both", attribute: "文字" },
        ],
      },
    ],
  },
  // 4. 稿費請款
  {
    key: "translator_invoice",
    label: "稿費請款",
    listItems: [
      { key: "inv_list_create", label: "新增稿費請款單", type: "both", attribute: "按鈕" },
      { key: "inv_list_delete", label: "刪除", type: "both", attribute: "按鈕" },
    ],
    detailSections: [
      {
        label: "頁面一般操作",
        items: [
          { key: "inv_detail_delete", label: "刪除頁面", type: "both", attribute: "按鈕" },
          { key: "inv_detail_payFull", label: "全額付款", type: "both", attribute: "按鈕" },
          { key: "inv_detail_payPartial", label: "部份付款", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "請款單基本資料",
        items: [
          { key: "inv_detail_title", label: "標題", type: "both", attribute: "文字" },
          { key: "inv_detail_translator", label: "請款人", type: "both", attribute: "人員（單選）" },
          { key: "inv_detail_status", label: "狀態", type: "view", attribute: "自動填入（無法編輯）" },
          { key: "inv_detail_addFee", label: "加入費用", type: "both", attribute: "按鈕" },
          { key: "inv_detail_removeFee", label: "移除費用", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "備註",
        items: [
          { key: "inv_detail_comments", label: "備註", type: "both", attribute: "文字" },
          { key: "inv_detail_internalComments", label: "內部備註", type: "both", attribute: "文字" },
        ],
      },
    ],
  },
  // 5. 客戶請款
  {
    key: "client_invoice",
    label: "客戶請款",
    listItems: [
      { key: "cinv_list_create", label: "新增客戶請款單", type: "both", attribute: "按鈕" },
      { key: "cinv_list_delete", label: "刪除", type: "both", attribute: "按鈕" },
    ],
    detailSections: [
      {
        label: "頁面一般操作",
        items: [
          { key: "cinv_detail_delete", label: "刪除頁面", type: "both", attribute: "按鈕" },
          { key: "cinv_detail_payFull", label: "全額收齊", type: "both", attribute: "按鈕" },
          { key: "cinv_detail_payPartial", label: "部份到帳", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "請款單基本資料",
        items: [
          { key: "cinv_detail_title", label: "標題", type: "both", attribute: "文字" },
          { key: "cinv_detail_client", label: "客戶", type: "both", attribute: "單選" },
          { key: "cinv_detail_status", label: "狀態", type: "view", attribute: "自動填入（無法編輯）" },
          { key: "cinv_detail_addFee", label: "加入費用", type: "both", attribute: "按鈕" },
          { key: "cinv_detail_removeFee", label: "移除費用", type: "both", attribute: "按鈕" },
        ],
      },
      {
        label: "備註",
        items: [
          { key: "cinv_detail_comments", label: "備註", type: "both", attribute: "文字" },
        ],
      },
    ],
  },
  // 6. 工具管理
  {
    key: "tool_management",
    label: "工具管理",
    listItems: [
      { key: "tool_list_view", label: "檢視工具清單", type: "both" },
      { key: "tool_list_edit", label: "編輯工具選項", type: "both", attribute: "按鈕" },
    ],
    detailSections: [],
  },
  // 7. 團隊成員
  {
    key: "team_members",
    label: "團隊成員",
    listItems: [
      { key: "members_view", label: "檢視成員清單", type: "both" },
      { key: "members_invite", label: "邀請成員", type: "both", attribute: "按鈕" },
      { key: "members_changeRole", label: "變更角色", type: "both", attribute: "單選" },
      { key: "members_remove", label: "移除成員", type: "both", attribute: "按鈕" },
      { key: "members_sort", label: "調整排序", type: "edit", attribute: "拖曳手把" },
      { key: "members_note", label: "譯者備註", type: "both", attribute: "文字及按鈕" },
      { key: "members_noFee", label: "不開單設定", type: "both", attribute: "核取方塊" },
      { key: "members_freeze", label: "暫時凍結", type: "both", attribute: "按鈕" },
      { key: "members_showFrozen", label: "顯示暫時凍結人員", type: "view" },
    ],
    detailSections: [],
  },
  // 8. 內部資料
  {
    key: "field_reference",
    label: "內部資料",
    listItems: [
      { key: "field_ref_view", label: "檢視欄位對照表", type: "view" },
    ],
    detailSections: [],
  },
];

// ─── Helpers ───

interface ModulePerms {
  visible: boolean;
  items: Record<string, { view: boolean; edit: boolean }>;
}

function getModulePerms(config: any, roleKey: string, moduleKey: string): ModulePerms {
  const perms = config?.module_permissions?.[roleKey]?.[moduleKey];
  return perms || { visible: true, items: {} };
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

// ─── Main Component ───

export default function PermissionsPage() {
  const { roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { config, loading, updateConfig, allRoles } = usePermissions();

  const customRoles: RoleDefinition[] = (config as any).custom_roles || [];

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

  const saveConfig = useCallback(async (newConfig: any) => {
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

  const handleDeleteClick = (role: RoleDefinition) => { setDeleteTarget(role); setDeleteStep(1); };
  const handleDeleteStep1 = () => setDeleteStep(2);
  const handleDeleteStep2 = async () => {
    if (deleteTarget) {
      const updated = customRoles.filter((r) => r.key !== deleteTarget.key);
      const newModulePerms = { ...(config as any).module_permissions };
      delete newModulePerms[deleteTarget.key];
      const error = await saveConfig({ ...config, custom_roles: updated, module_permissions: newModulePerms });
      if (!error) toast.success(`已刪除身分「${deleteTarget.label}」`);
      else toast.error("刪除失敗");
    }
    setDeleteTarget(null);
    setDeleteStep(1);
  };
  const handleCancelDelete = () => { setDeleteTarget(null); setDeleteStep(1); };

  const handleRenameStart = (role: RoleDefinition) => { setRenamingRole(role.key); setRenameValue(role.label); };
  const handleRenameConfirm = async () => {
    if (!renamingRole || !renameValue.trim()) { setRenamingRole(null); return; }
    const name = renameValue.trim();
    if (allRoles.some((r) => r.key !== renamingRole && r.label === name)) { toast.error("此名稱已被使用"); return; }
    const role = allRoles.find((r) => r.key === renamingRole);
    if (!role) return;
    if (role.builtIn) {
      const overrides = { ...((config as any).role_label_overrides || {}), [role.key]: name };
      await saveConfig({ ...config, role_label_overrides: overrides });
    } else {
      const updatedCustom = customRoles.map((r) => r.key === renamingRole ? { ...r, label: name } : r);
      await saveConfig({ ...config, custom_roles: updatedCustom });
    }
    setRenamingRole(null);
    toast.success(`已更名為「${name}」`);
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
    toast.success("排序已更新");
  };

  const handleToggleModuleVisible = async (roleKey: string, moduleKey: string, visible: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newModulePerms = { ...(config as any).module_permissions, [roleKey]: { ...((config as any).module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, visible } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleToggleItemPerm = async (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const currentItem = modulePerms.items?.[itemKey] || { view: true, edit: true };
    const newItem = { ...currentItem, [permType]: value };
    if (permType === "view" && !value) newItem.edit = false;
    const newModulePerms = { ...(config as any).module_permissions, [roleKey]: { ...((config as any).module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: { ...modulePerms.items, [itemKey]: newItem } } } };
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
    const newModulePerms = { ...(config as any).module_permissions, [roleKey]: { ...((config as any).module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, visible: value ? true : modulePerms.visible, items: newItems } } };
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
    const newModulePerms = { ...(config as any).module_permissions, [roleKey]: { ...((config as any).module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: newItems } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  const handleSetSectionViewOnly = async (roleKey: string, moduleKey: string, items: PermissionItem[]) => {
    const modulePerms = getModulePerms(config, roleKey, moduleKey);
    const newItems: Record<string, { view: boolean; edit: boolean }> = { ...modulePerms.items };
    for (const item of items) {
      newItems[item.key] = { view: true, edit: false };
    }
    const newModulePerms = { ...(config as any).module_permissions, [roleKey]: { ...((config as any).module_permissions?.[roleKey] || {}), [moduleKey]: { ...modulePerms, items: newItems } } };
    await saveConfig({ ...config, module_permissions: newModulePerms });
  };

  if (!isExecutive) {
    return <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">您沒有權限檢視此頁面</div>;
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">權限管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理角色身分與各模組權限設定</p>
      </div>

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
                <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="新增身分名稱…" className="max-w-xs text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleAddRole(); }} />
                <Button size="sm" onClick={handleAddRole} disabled={!newRoleName.trim() || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  新增
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
                            <span className="text-sm font-medium cursor-pointer hover:underline" onClick={() => handleRenameStart(role)} title="點擊以更名">{role.label}</span>
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
            <AlertDialogTitle>確認刪除身分</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除「{deleteTarget?.label}」這個身分嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteStep1(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">繼續</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget && deleteStep === 2} onOpenChange={(open) => { if (!open) handleCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>再次確認刪除</AlertDialogTitle>
            <AlertDialogDescription>您即將永久刪除「{deleteTarget?.label}」身分。所有擁有此身分的成員將失去相關權限，且此操作無法復原。是否確定？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep2} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Per-role permission panel ───

function RolePermissionPanel({
  roleKey, roleLabel, config, onToggleModuleVisible, onToggleItemPerm, onToggleAllPerms, onToggleSectionPerms, onSetSectionViewOnly,
}: {
  roleKey: string; roleLabel: string; config: any;
  onToggleModuleVisible: (roleKey: string, moduleKey: string, visible: boolean) => void;
  onToggleItemPerm: (roleKey: string, moduleKey: string, itemKey: string, permType: "view" | "edit", value: boolean) => void;
  onToggleAllPerms: (roleKey: string, moduleKey: string, value: boolean) => void;
  onToggleSectionPerms: (roleKey: string, moduleKey: string, items: PermissionItem[], permType: "view" | "edit", value: boolean) => void;
  onSetSectionViewOnly: (roleKey: string, moduleKey: string, items: PermissionItem[]) => void;
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
                  <Label className="text-xs text-foreground font-medium">本區塊可見</Label>
                  <Switch checked={isVisible} onCheckedChange={(v) => onToggleModuleVisible(roleKey, mod.key, v)} className="scale-75 data-[state=checked]:bg-primary" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-foreground font-medium">賦予所有檢視及編輯權限</Label>
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
                        <p className="text-xs font-medium text-muted-foreground">總表操作</p>
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
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">詳情頁操作</p>
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

// ─── Section bulk buttons with color tiers ───

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
  // "可見" = at least one item is viewable
  const anyVisible = items.some((item) => getItemPerm(modulePerms, item.key, "view"));

  return (
    <div className="flex items-center gap-4">
      {onToggleVisible && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70">本區塊可見</Label>
          <Switch checked={anyVisible} onCheckedChange={(v) => onToggleVisible(v)} className="scale-75 data-[state=checked]:bg-primary/70" />
        </div>
      )}
      <div className="flex items-center gap-1">
        <Label className="text-xs text-foreground/70">全部可見</Label>
        <Switch checked={allView} onCheckedChange={(v) => onToggle("view", v)} className="scale-75 data-[state=checked]:bg-primary/70" />
      </div>
      {hasEditableItems && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70 whitespace-nowrap">全部可見但不可編輯</Label>
          <Switch
            checked={allView && noEdit}
            onCheckedChange={() => onSetViewOnly?.()}
            className="scale-75 data-[state=checked]:bg-primary/70"
          />
        </div>
      )}
      {hasEditableItems && (
        <div className="flex items-center gap-1">
          <Label className="text-xs text-foreground/70">全可編輯</Label>
          <Switch checked={allEdit} onCheckedChange={(v) => onToggle("edit", v)} className="scale-75 data-[state=checked]:bg-primary/70" />
        </div>
      )}
    </div>
  );
}

// ─── Single permission item row ───

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
          <span className="text-muted-foreground">檢視</span>
          <Switch checked={viewEnabled} onCheckedChange={(v) => onToggle("view", v)} className="scale-[0.6] data-[state=checked]:bg-primary/70" />
        </div>
        <div className={`flex items-center gap-1${isViewOnly ? " invisible" : ""}`}>
          <span className="text-muted-foreground">編輯</span>
          <Switch checked={editEnabled} onCheckedChange={(v) => onToggle("edit", v)} className="scale-[0.6] data-[state=checked]:bg-primary/70" disabled={!viewEnabled || isViewOnly} />
        </div>
      </div>
    </div>
  );
}
