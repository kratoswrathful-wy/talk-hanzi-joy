import { useState } from "react";
import { Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { Button } from "@/components/ui/button";
import { groupUiButtonsByModule, type UiButtonDef } from "@/lib/ui-button-registry";
import { uiButtonStyleStore, useToolbarButtonUiProps, useUiButtonColors } from "@/stores/ui-button-style-store";
import { cn } from "@/lib/utils";

function getColorUsageMap(buttons: { bgColor: string; label: string }[]) {
  const map: Record<string, string[]> = {};
  for (const b of buttons) {
    const k = b.bgColor;
    if (!map[k]) map[k] = [];
    map[k].push(b.label);
  }
  return map;
}

function ButtonRow({ def }: { def: UiButtonDef }) {
  const colors = useUiButtonColors(def.id);
  const previewProps = useToolbarButtonUiProps(def.id);
  const [bgOpen, setBgOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);

  const usageButtons = [{ bgColor: colors.bgColor, label: def.label }];
  const colorUsageMap = getColorUsageMap(usageButtons);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">{def.label}</span>
          {def.locations.map((loc) => (
            <span
              key={loc}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
            >
              {loc}
            </span>
          ))}
        </div>
        {def.description ? (
          <p className="text-[10px] text-muted-foreground leading-snug">{def.description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="pointer-events-none rounded-md"
          title="預覽"
        >
          <span
            className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium min-w-[7rem]", previewProps.className)}
            style={previewProps.style}
          >
            預覽
          </span>
        </button>

        <Popover open={bgOpen} onOpenChange={(v) => { setBgOpen(v); if (v) setTextOpen(false); }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="底色">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-3" align="end">
            <p className="text-xs text-muted-foreground mb-2">底色</p>
            <ColorPicker
              value={colors.bgColor}
              onChange={(c) => uiButtonStyleStore.setButtonColors(def.id, { bgColor: c })}
              customColors={[]}
              onAddCustomColor={() => {}}
              onRemoveCustomColor={() => {}}
              colorUsageMap={colorUsageMap}
              onResetDefault={() => uiButtonStyleStore.setButtonColors(def.id, { bgColor: def.defaultBg })}
            />
          </PopoverContent>
        </Popover>

        <Popover open={textOpen} onOpenChange={(v) => { setTextOpen(v); if (v) setBgOpen(false); }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="文字顏色">
              <span className="text-[10px] font-bold text-muted-foreground">A</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-3" align="end">
            <p className="text-xs text-muted-foreground mb-2">文字顏色</p>
            <ColorPicker
              value={colors.textColor}
              onChange={(c) => uiButtonStyleStore.setButtonColors(def.id, { textColor: c })}
              customColors={[]}
              onAddCustomColor={() => {}}
              onRemoveCustomColor={() => {}}
              colorUsageMap={{}}
              onResetDefault={() => uiButtonStyleStore.setButtonColors(def.id, { textColor: def.defaultText })}
            />
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-[10px] text-muted-foreground"
          onClick={() => uiButtonStyleStore.resetButton(def.id)}
        >
          重設
        </Button>
      </div>
    </div>
  );
}

export function ToolbarButtonStyleSection() {
  const byModule = groupUiButtonsByModule();

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">工具列按鈕顏色</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            比照狀態標籤，自訂各模組總表與個別頁工具列按鈕的底色與字色。下列標籤標示按鈕出現的頁面位置。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            if (confirm("確定將所有工具列按鈕顏色還原為預設值？")) uiButtonStyleStore.resetAll();
          }}
        >
          全部重設
        </Button>
      </div>

      <div className="space-y-6 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
        {[...byModule.entries()].map(([module, buttons]) => (
          <div key={module} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">
              {module}
            </h3>
            <div className="space-y-2">
              {buttons.map((def) => (
                <ButtonRow key={def.id} def={def} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
