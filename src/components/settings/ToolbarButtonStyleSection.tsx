import { useState, useEffect } from "react";
import { Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupUiButtonsByModule, type UiButtonDef } from "@/lib/ui-button-registry";
import {
  uiButtonStyleStore,
  useToolbarButtonUiProps,
  useUiButtonColors,
  useUiButtonLabel,
  useToolbarLayoutWidthRem,
  isUiButtonLabelEditable,
} from "@/stores/ui-button-style-store";
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

function ToolbarWidthControl() {
  const widthRem = useToolbarLayoutWidthRem();
  const [local, setLocal] = useState(String(widthRem));
  useEffect(() => {
    setLocal(String(widthRem));
  }, [widthRem]);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5 min-w-[200px]">
          <Label className="text-xs font-medium">工具列按鈕共用寬度（rem）</Label>
          <p className="text-[10px] text-muted-foreground">
            所有模組頂部工具列按鈕使用相同寬度，可即時預覽；預設 8.25（約等同原 min-w-[8.25rem]）。
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={4}
              max={24}
              step={0.25}
              className="h-8 w-24 text-xs"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              onBlur={() => {
                const n = parseFloat(local);
                if (!Number.isFinite(n)) {
                  setLocal(String(widthRem));
                  return;
                }
                uiButtonStyleStore.setLayoutWidthRem(n);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => uiButtonStyleStore.setLayoutWidthRem(8.25)}
            >
              還原預設寬度
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">預覽</span>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium bg-background"
            )}
            style={{ width: `${widthRem}rem`, minWidth: `${widthRem}rem`, maxWidth: `${widthRem}rem` }}
          >
            預覽寬度
          </span>
        </div>
      </div>
    </div>
  );
}

function ButtonRow({ def }: { def: UiButtonDef }) {
  const colors = useUiButtonColors(def.id);
  const previewProps = useToolbarButtonUiProps(def.id);
  const previewLabel = useUiButtonLabel(def.id) ?? def.label;
  const [bgOpen, setBgOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(previewLabel);
  const editable = isUiButtonLabelEditable(def.id);

  useEffect(() => {
    setLabelDraft(previewLabel);
  }, [previewLabel]);

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
        {editable ? (
          <div className="pt-1 space-y-1">
            <Label className="text-[10px] text-muted-foreground">按鈕文字（留空則用預設）</Label>
            <Input
              className="h-8 text-xs max-w-md"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => {
                uiButtonStyleStore.setButtonPatch(def.id, { label: labelDraft });
              }}
              placeholder={def.label}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <button type="button" className="pointer-events-none rounded-md" title="預覽">
          <span
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium truncate",
              previewProps.className
            )}
            style={previewProps.style}
          >
            {previewLabel}
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
              onChange={(c) => uiButtonStyleStore.setButtonPatch(def.id, { bgColor: c })}
              customColors={[]}
              onAddCustomColor={() => {}}
              onRemoveCustomColor={() => {}}
              colorUsageMap={colorUsageMap}
              onResetDefault={() => uiButtonStyleStore.setButtonPatch(def.id, { bgColor: def.defaultBg })}
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
              onChange={(c) => uiButtonStyleStore.setButtonPatch(def.id, { textColor: c })}
              customColors={[]}
              onAddCustomColor={() => {}}
              onRemoveCustomColor={() => {}}
              colorUsageMap={{}}
              onResetDefault={() => uiButtonStyleStore.setButtonPatch(def.id, { textColor: def.defaultText })}
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
          <h2 className="text-base font-semibold">工具列按鈕樣式</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            自訂各模組總表與個別頁工具列按鈕的寬度、底色、字色與可編輯按鈕的文案；下列標籤標示按鈕出現的頁面位置。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            if (confirm("確定將所有工具列按鈕樣式（含寬度、顏色、自訂文字）還原為預設值？")) uiButtonStyleStore.resetAll();
          }}
        >
          全部重設
        </Button>
      </div>

      <ToolbarWidthControl />

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
