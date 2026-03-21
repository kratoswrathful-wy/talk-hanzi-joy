import { useState } from "react";
import { Plus, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";
import { useToolbarButtonUiPropsMaybe } from "@/stores/ui-button-style-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePageTemplates, pageTemplateStore, type PageModule } from "@/stores/page-template-store";
import type { PageTemplate } from "@/stores/page-template-store";

interface CreateWithTemplateButtonProps {
  module: PageModule;
  onCreate: (templateFieldValues: Record<string, any>) => void;
  /** Button size variant */
  size?: "sm" | "default";
  /** Custom label */
  label?: string;
  /** Extra class */
  className?: string;
  /** 對應「設定 → 工具列按鈕顏色」的按鈕 id */
  uiButtonId?: string;
}

/**
 * A split button: click main area to create with default template,
 * click dropdown arrow to pick a specific template.
 */
export function CreateWithTemplateButton({
  module,
  onCreate,
  size = "sm",
  label = "新增案件",
  className,
  uiButtonId,
}: CreateWithTemplateButtonProps) {
  const uiProps = useToolbarButtonUiPropsMaybe(uiButtonId);
  const templates = usePageTemplates(module);
  const [open, setOpen] = useState(false);

  const defaultTemplate = templates.find((t) => t.isDefault);
  const customTemplates = templates.filter((t) => !t.isDefault);
  const hasCustomTemplates = customTemplates.length > 0;

  const handleCreate = (tpl?: PageTemplate) => {
    const fieldValues = tpl?.fieldValues || defaultTemplate?.fieldValues || {};
    // Only pass non-empty values
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v !== undefined && v !== null && v !== "") {
        filtered[k] = v;
      }
    }
    onCreate(filtered);
    setOpen(false);
  };

  const mainBtnClass = cn(MODULE_TOOLBAR_BTN, uiProps?.className, className);

  // If no custom templates, just a simple button using default template
  if (!hasCustomTemplates) {
    return (
      <Button size={size} className={mainBtnClass} style={uiProps?.style} onClick={() => handleCreate()}>
        <Plus className="h-4 w-4 shrink-0" />
        {label}
      </Button>
    );
  }

  // Split button with dropdown
  return (
    <div className="inline-flex items-center">
      <Button
        size={size}
        className={cn(MODULE_TOOLBAR_BTN, "rounded-r-none", uiProps?.className, className)}
        style={uiProps?.style}
        onClick={() => handleCreate()}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {label}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size={size}
            className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1.5" align="end">
          <p className="text-[10px] text-muted-foreground px-2 py-1">選擇範本</p>
          {/* Default template */}
          <button
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors text-xs"
            onClick={() => handleCreate(defaultTemplate)}
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span>預設</span>
          </button>
          {customTemplates.map((tpl) => (
            <button
              key={tpl.id}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors text-xs"
              onClick={() => handleCreate(tpl)}
            >
              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{tpl.name}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
