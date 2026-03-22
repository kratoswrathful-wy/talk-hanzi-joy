/**
 * 設定頁「工具列按鈕」依模組分組的預設結構（可持久化覆寫）。
 */
import { UI_BUTTON_REGISTRY, type UiButtonDef } from "@/lib/ui-button-registry";

export interface ToolbarSettingsGroup {
  id: string;
  title: string;
  description?: string;
  buttonIds: string[];
}

export interface ModuleToolbarGroupsState {
  groups: ToolbarSettingsGroup[];
}

/** 案件個別頁灰色按鈕（依狀態擇一） */
export const CASE_DETAIL_GREY_BUTTON_IDS = [
  "cases_detail_revert_to_draft",
  "cases_detail_cancel_dispatch",
  "cases_detail_revert_revision",
  "cases_detail_revert_to_feedback",
  "cases_detail_delete_draft",
] as const;

const GREY_SET = new Set<string>(CASE_DETAIL_GREY_BUTTON_IDS);

function idsForModule(module: string): string[] {
  return UI_BUTTON_REGISTRY.filter((b) => b.module === module).map((b) => b.id);
}

/** 產生單一模組的預設群組（含「灰色操作」與其餘按鈕） */
export function defaultModuleGroups(module: string): ModuleToolbarGroupsState {
  const all = idsForModule(module);
  const greyInModule = CASE_DETAIL_GREY_BUTTON_IDS.filter((id) => all.includes(id));
  const rest = all.filter((id) => !GREY_SET.has(id));

  if (module === "案件管理" && greyInModule.length > 0) {
    return {
      groups: [
        {
          id: "preset-grey-ops",
          title: "灰色操作（案件個別頁）",
          description: "收回為草稿、取消指派、退回修正、退回處理、刪除等依狀態擇一顯示",
          buttonIds: greyInModule,
        },
        {
          id: "preset-rest",
          title: "其他按鈕",
          description: "",
          buttonIds: rest,
        },
      ],
    };
  }

  return {
    groups: [
      {
        id: "preset-all",
        title: "全部",
        buttonIds: all,
      },
    ],
  };
}

export function buildDefaultGroupsByModule(): Record<string, ModuleToolbarGroupsState> {
  const modules = new Set(UI_BUTTON_REGISTRY.map((b) => b.module));
  const out: Record<string, ModuleToolbarGroupsState> = {};
  for (const m of modules) {
    out[m] = defaultModuleGroups(m);
  }
  return out;
}

/**
 * 將持久化的群組與 registry 合併：補上新增的按鈕 id 至「未分組」概念（附在 groups 最後一個「其餘」群組或新建一個）。
 */
export function mergeGroupsWithRegistry(
  module: string,
  persisted: ModuleToolbarGroupsState | undefined
): ModuleToolbarGroupsState {
  const defs = UI_BUTTON_REGISTRY.filter((b) => b.module === module);
  const allIds = new Set(defs.map((d) => d.id));
  const defaultState = defaultModuleGroups(module);

  if (!persisted?.groups?.length) {
    return defaultState;
  }

  const seen = new Set<string>();
  const groups: ToolbarSettingsGroup[] = persisted.groups.map((g) => {
    const buttonIds = g.buttonIds.filter((id) => {
      if (!allIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { ...g, buttonIds };
  });

  const missing = [...allIds].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    const last = groups[groups.length - 1];
    if (last) {
      last.buttonIds = [...last.buttonIds, ...missing];
    } else {
      groups.push({ id: `ungrouped-${module}`, title: "未分組", buttonIds: missing });
    }
  }

  return { groups };
}

export function defsByIdInOrder(buttonIds: string[], defs: UiButtonDef[]): UiButtonDef[] {
  const map = new Map(defs.map((d) => [d.id, d]));
  return buttonIds.map((id) => map.get(id)).filter((d): d is UiButtonDef => !!d);
}
