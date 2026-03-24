import type { CSSProperties, ReactNode } from "react";
import {
  Plus,
  Copy,
  CheckSquare,
  MessageSquare,
  FileText,
  Trash2,
  Undo2,
  UserMinus,
  RotateCcw,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { SlackMarkIcon } from "@/components/icons/SlackMarkIcon";
import { getUiButtonDef } from "@/lib/ui-button-registry";
import { useUiButtonIconResolved } from "@/stores/ui-button-style-store";

const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  Plus,
  Copy,
  CheckSquare,
  MessageSquare,
  FileText,
  Trash2,
  Undo2,
  UserMinus,
  RotateCcw,
  ArrowLeft,
};

const ICON_CLASS = "h-4 w-4 shrink-0";

function parseKey(key: string | undefined): { kind: "lucide"; name: string } | { kind: "slack" } | null {
  if (!key?.trim()) return null;
  const t = key.trim();
  if (t === "custom:slack") return { kind: "slack" };
  if (t.startsWith("lucide:")) {
    const name = t.slice("lucide:".length).trim();
    if (name && LUCIDE_BY_NAME[name]) return { kind: "lucide", name };
  }
  return null;
}

/**
 * 渲染工具列按鈕左側圖示（內建 Lucide / Slack / 自訂 data URL），訂閱 store。
 */
export function UiToolbarButtonIcon({
  uiButtonId,
  className,
  style,
}: {
  uiButtonId: string;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const resolved = useUiButtonIconResolved(uiButtonId);
  const def = getUiButtonDef(uiButtonId);
  const customUrl = resolved?.customIconDataUrl;

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt=""
        className={className ?? `${ICON_CLASS} object-contain`}
        style={{ width: "1rem", height: "1rem", ...style }}
      />
    );
  }

  const key = resolved?.iconKey ?? def?.defaultIconKey;
  const parsed = parseKey(key);
  if (!parsed) return null;

  if (parsed.kind === "slack") {
    return <SlackMarkIcon className={className ?? `${ICON_CLASS} text-current`} style={style} />;
  }

  const Cmp = LUCIDE_BY_NAME[parsed.name];
  if (!Cmp) return null;
  return <Cmp className={className ?? ICON_CLASS} style={style} />;
}
