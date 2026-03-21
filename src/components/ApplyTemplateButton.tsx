import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";
import { useToolbarButtonUiPropsMaybe } from "@/stores/ui-button-style-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePageTemplates, type PageModule } from "@/stores/page-template-store";
import type { PageTemplate } from "@/stores/page-template-store";

interface ApplyTemplateButtonProps {
  module: PageModule;
  onApply: (fieldValues: Record<string, any>) => void;
  size?: "sm" | "default";
  className?: string;
}

/**
 * "套用範本" button: opens a popover to pick a template, then calls onApply with field values.
 */
export function ApplyTemplateButton({
  module,
  onApply,
  size = "sm",
  className,
  uiButtonId,
}: ApplyTemplateButtonProps) {
  const uiProps = useToolbarButtonUiPropsMaybe(uiButtonId);
  const templates = usePageTemplates(module);
  const [open, setOpen] = useState(false);

  // Only show templates that have at least one field value
  const usableTemplates = templates.filter(
    (t) => Object.keys(t.fieldValues).length > 0
  );

  if (usableTemplates.length === 0) return null;

  const handleApply = (tpl: PageTemplate) => {
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(tpl.fieldValues)) {
      if (v !== undefined && v !== null && v !== "") {
        filtered[k] = v;
      }
    }
    onApply(filtered);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size={size}
          className={cn(MODULE_TOOLBAR_BTN, uiProps?.className, className)}
          style={uiProps?.style}
        >
          套用範本
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="end">
        <p className="text-[10px] text-muted-foreground px-2 py-1">選擇範本</p>
        {usableTemplates.map((tpl) => (
          <button
            key={tpl.id}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors text-xs"
            onClick={() => handleApply(tpl)}
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate">{tpl.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
