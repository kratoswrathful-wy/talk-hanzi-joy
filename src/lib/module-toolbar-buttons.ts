import { cn } from "@/lib/utils";

/**
 * 各模組列表／詳情頁頂部工具列按鈕統一尺寸（與「+ 新增案件」一致）。
 * 新模組請沿用此常數，保持寬高一致。
 */
export const MODULE_TOOLBAR_BTN =
  "h-9 min-h-9 min-w-[8.25rem] shrink-0 px-2 text-xs gap-1.5 justify-center inline-flex [&_svg]:shrink-0";

/** 需白底黑字／高對比圖示時（如詢案列）可與 outline 併用 */
export const MODULE_TOOLBAR_BTN_LIGHT =
  "border border-border bg-white text-black hover:bg-neutral-100 dark:bg-white dark:text-black dark:hover:bg-neutral-200";

export function moduleToolbarBtn(...parts: (string | undefined | false)[]): string {
  return cn(MODULE_TOOLBAR_BTN, ...parts);
}
