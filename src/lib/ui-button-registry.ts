/**
 * 可於「設定 → 工具列按鈕顏色」自訂的按鈕清單。
 * 每個 id 對應一組預設底色／字色，並標示出現位置（總表／個別頁）。
 */

export type UiButtonAppearance = "solid" | "outline" | "light" | "ghost";

export interface UiButtonDef {
  id: string;
  /** 按鈕在介面上的文字（或主要識別名稱） */
  label: string;
  /** 模組名稱（設定頁分組用） */
  module: string;
  /** 出現位置說明，例如「總表」「個別頁」 */
  locations: string[];
  /** 簡短說明（選填） */
  description?: string;
  defaultBg: string;
  defaultText: string;
  /** 影響套用時的 border／hover 行為 */
  appearance: UiButtonAppearance;
}

export const UI_BUTTON_REGISTRY: UiButtonDef[] = [
  // ── 案件管理 ──
  {
    id: "cases_add",
    label: "新增案件",
    module: "案件管理",
    locations: ["案件總表", "案件個別頁"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_list_mark_delivered",
    label: "交件完畢",
    module: "案件管理",
    locations: ["案件總表（批次）"],
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "cases_list_slack",
    label: "Slack 詢案",
    module: "案件管理",
    locations: ["案件總表"],
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "cases_list_copy_row",
    label: "複製本單",
    module: "案件管理",
    locations: ["案件總表"],
    defaultBg: "transparent",
    defaultText: "hsl(240 5% 64%)",
    appearance: "ghost",
  },
  {
    id: "cases_list_gen_fees",
    label: "產生費用單",
    module: "案件管理",
    locations: ["案件總表"],
    defaultBg: "transparent",
    defaultText: "hsl(240 5% 64%)",
    appearance: "ghost",
  },
  {
    id: "cases_detail_decline",
    label: "無法承接",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "transparent",
    defaultText: "hsl(0 84% 60%)",
    appearance: "outline",
  },
  {
    id: "cases_detail_neutral",
    label: "灰色操作（收回／取消指派／退回／刪除等）",
    module: "案件管理",
    locations: ["案件個別頁"],
    description: "收回為草稿、取消指派、退回修正、退回處理、刪除 等依狀態顯示的灰色按鈕",
    defaultBg: "#6B7280",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_publish",
    label: "公布",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_assign_primary",
    label: "承接本案／確定指派",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_task_complete",
    label: "任務完成",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "#0C5CB4",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_process_primary",
    label: "處理完畢／處理回饋",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_mark_delivered",
    label: "交件完畢（個別頁）",
    module: "案件管理",
    locations: ["案件個別頁"],
    description: "顏色僅由此處與下方預設決定，與「狀態標籤」中的「已派出」等設定互不相連；變更標籤色不會影響此按鈕。預設綠色僅為初始外觀，與標籤無執行期連動。",
    defaultBg: "#16A34A",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "cases_detail_inquiry_message",
    label: "詢案訊息",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "#FFFFFF",
    defaultText: "#0A0A0A",
    appearance: "light",
  },
  {
    id: "cases_detail_slack",
    label: "Slack 詢案",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "#FFFFFF",
    defaultText: "#0A0A0A",
    appearance: "light",
  },
  {
    id: "cases_detail_copy_page",
    label: "複製本頁",
    module: "案件管理",
    locations: ["案件個別頁"],
    defaultBg: "#FFFFFF",
    defaultText: "#0A0A0A",
    appearance: "light",
  },

  // ── 稿費請款 ──
  {
    id: "translator_invoices_add",
    label: "新增請款單",
    module: "稿費請款",
    locations: ["請款總表"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },

  // ── 客戶請款 ──
  {
    id: "client_invoices_add",
    label: "新增客戶請款單",
    module: "客戶請款",
    locations: ["客戶請款總表"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },

  // ── 費用管理 ──
  {
    id: "fees_add",
    label: "新增費用",
    module: "費用管理",
    locations: ["費用總表"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "fees_translator_invoice",
    label: "譯者請款",
    module: "費用管理",
    locations: ["費用總表"],
    description: "選取費用列後啟用之按鈕",
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "fees_client_invoice",
    label: "客戶請款",
    module: "費用管理",
    locations: ["費用總表"],
    description: "選取費用列後啟用之按鈕",
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },

  // ── 內部註記 ──
  {
    id: "internal_notes_add",
    label: "新增內部註記",
    module: "內部註記",
    locations: ["註記總表"],
    defaultBg: "hsl(0 70% 55%)",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "internal_notes_link_message",
    label: "產生連結訊息",
    module: "內部註記",
    locations: ["註記個別頁"],
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "internal_notes_same_case",
    label: "新增同案件註記",
    module: "內部註記",
    locations: ["註記個別頁"],
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "internal_notes_apply_template",
    label: "套用範本",
    module: "內部註記",
    locations: ["註記個別頁"],
    defaultBg: "hsl(240 6% 16%)",
    defaultText: "hsl(0 0% 98%)",
    appearance: "outline",
  },
  {
    id: "internal_notes_delete",
    label: "刪除",
    module: "內部註記",
    locations: ["註記個別頁"],
    defaultBg: "#6B7280",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
  {
    id: "internal_notes_invalidate",
    label: "本註記已失效",
    module: "內部註記",
    locations: ["註記個別頁"],
    defaultBg: "#383A3F",
    defaultText: "#FFFFFF",
    appearance: "solid",
  },
];

const byId = new Map(UI_BUTTON_REGISTRY.map((b) => [b.id, b]));

export function getUiButtonDef(id: string): UiButtonDef | undefined {
  return byId.get(id);
}

export function groupUiButtonsByModule(): Map<string, UiButtonDef[]> {
  const m = new Map<string, UiButtonDef[]>();
  for (const b of UI_BUTTON_REGISTRY) {
    const arr = m.get(b.module) || [];
    arr.push(b);
    m.set(b.module, arr);
  }
  return m;
}
