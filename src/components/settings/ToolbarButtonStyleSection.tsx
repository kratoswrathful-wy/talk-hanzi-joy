import { useState, useEffect, useRef } from "react";
import { Palette, ImagePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ColorPicker from "@/components/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupUiButtonsByModule, getUiButtonDef, type UiButtonDef } from "@/lib/ui-button-registry";
import { UiToolbarButtonIcon } from "@/lib/ui-button-icon-render";
import {
  mergeGroupsWithRegistry,
  type ModuleToolbarGroupsState,
  type ToolbarSettingsGroup,
} from "@/lib/ui-toolbar-groups-defaults";
import {
  uiButtonStyleStore,
  useToolbarButtonUiProps,
  useUiButtonColors,
  useUiButtonLabel,
  useToolbarLayoutWidthRem,
  useUiButtonIconResolved,
  useModuleToolbarGroups,
  isUiButtonLabelEditable,
  getUiButtonIconResolved,
} from "@/stores/ui-button-style-store";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_ICON_BYTES = 120_000;

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

function moveButtonToGroup(module: string, buttonId: string, targetGroupId: string) {
  const raw = uiButtonStyleStore.getLayout().groupsByModule?.[module];
  const state = mergeGroupsWithRegistry(module, raw);
  const groups = state.groups.map((g) => ({
    ...g,
    buttonIds: g.buttonIds.filter((id) => id !== buttonId),
  }));
  const target = groups.find((g) => g.id === targetGroupId);
  if (target && !target.buttonIds.includes(buttonId)) target.buttonIds.push(buttonId);
  uiButtonStyleStore.setModuleGroups(module, { groups });
}

function ButtonRow({
  def,
  module,
  currentGroupId,
}: {
  def: UiButtonDef;
  module: string;
  currentGroupId: string;
}) {
  const colors = useUiButtonColors(def.id);
  const previewProps = useToolbarButtonUiProps(def.id);
  const previewLabel = useUiButtonLabel(def.id) ?? def.label;
  const resolved = useUiButtonIconResolved(def.id);
  const [bgOpen, setBgOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(previewLabel);
  const [iconDraft, setIconDraft] = useState("");
  const [pendingCustomUrl, setPendingCustomUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editable = isUiButtonLabelEditable(def.id);
  const groupsState = useModuleToolbarGroups(module);

  const effectiveIconKey = resolved?.iconKey ?? def.defaultIconKey ?? "";

  useEffect(() => {
    setLabelDraft(previewLabel);
  }, [previewLabel]);

  useEffect(() => {
    setIconDraft(effectiveIconKey);
  }, [effectiveIconKey, def.id]);

  const usageButtons = [{ bgColor: colors.bgColor, label: def.label }];
  const colorUsageMap = getColorUsageMap(usageButtons);

  const previewPending = pendingCustomUrl !== null;

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > MAX_CUSTOM_ICON_BYTES) {
      window.alert(`圖檔請小於約 ${Math.round(MAX_CUSTOM_ICON_BYTES / 1024)} KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (url) setPendingCustomUrl(url);
    };
    reader.readAsDataURL(f);
  };

  const confirmCustomIcon = () => {
    if (pendingCustomUrl) {
      uiButtonStyleStore.setButtonPatch(def.id, { customIconDataUrl: pendingCustomUrl });
      setPendingCustomUrl(null);
    }
  };

  const cancelPendingCustom = () => setPendingCustomUrl(null);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3"
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

        <div className="pt-1 flex flex-wrap items-end gap-2">
          <div className="space-y-1 min-w-[140px] flex-1 max-w-xs">
            <Label className="text-[10px] text-muted-foreground">所屬群組</Label>
            <Select
              value={currentGroupId}
              onValueChange={(v) => moveButtonToGroup(module, def.id, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupsState.groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

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

        <div className="pt-1 space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            圖示（<code className="text-[9px]">lucide:圖示名</code> 或 <code className="text-[9px]">custom:slack</code>；留空則用預設）
          </Label>
          <Input
            className="h-8 text-xs max-w-md font-mono"
            value={iconDraft}
            onChange={(e) => setIconDraft(e.target.value)}
            onBlur={() => {
              uiButtonStyleStore.setButtonPatch(def.id, { iconKey: iconDraft });
            }}
            placeholder={def.defaultIconKey ?? "（無）"}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-3 w-3" />
              上傳自訂圖示
            </Button>
            {getUiButtonIconResolved(def.id)?.customIconDataUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-muted-foreground"
                onClick={() => uiButtonStyleStore.setButtonPatch(def.id, { customIconDataUrl: "" })}
              >
                清除自訂圖
              </Button>
            ) : null}
          </div>
          {previewPending && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 space-y-1.5">
              <p className="text-[10px] text-amber-200">預覽（尚未套用）</p>
              <div className="flex items-center gap-2">
                <img src={pendingCustomUrl!} alt="" className="h-6 w-6 object-contain rounded border border-border" />
                <Button type="button" size="sm" className="h-7 text-[10px]" onClick={confirmCustomIcon}>
                  確認套用
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={cancelPendingCustom}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-col sm:items-end">
        <button type="button" className="pointer-events-none rounded-md" title="預覽">
          <span
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium truncate",
              previewProps.className,
              previewPending && "ring-1 ring-amber-500/60"
            )}
            style={previewProps.style}
          >
            {pendingCustomUrl ? (
              <img src={pendingCustomUrl} alt="" className="h-4 w-4 object-contain shrink-0" />
            ) : (
              <UiToolbarButtonIcon uiButtonId={def.id} />
            )}
            {previewLabel}
          </span>
        </button>

        <div className="flex items-center gap-1">
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
    </div>
  );
}

function GroupTitleField({
  group,
  onSave,
}: {
  group: ToolbarSettingsGroup;
  onSave: (id: string, title: string) => void;
}) {
  const [v, setV] = useState(group.title);
  useEffect(() => {
    setV(group.title);
  }, [group.title, group.id]);
  return (
    <Input
      className="h-8 text-xs max-w-xs font-medium"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(group.id, v.trim() || group.title)}
    />
  );
}

function ModuleToolbarBlock({ module }: { module: string }) {
  const groupsState = useModuleToolbarGroups(module);

  const addGroup = () => {
    const raw = uiButtonStyleStore.getLayout().groupsByModule?.[module];
    const state = mergeGroupsWithRegistry(module, raw);
    const next: ModuleToolbarGroupsState = {
      groups: [
        ...state.groups,
        { id: crypto.randomUUID(), title: "新群組", description: "", buttonIds: [] },
      ],
    };
    uiButtonStyleStore.setModuleGroups(module, next);
  };

  const deleteGroup = (groupId: string) => {
    const raw = uiButtonStyleStore.getLayout().groupsByModule?.[module];
    const state = mergeGroupsWithRegistry(module, raw);
    const victim = state.groups.find((g) => g.id === groupId);
    if (!victim || state.groups.length <= 1) return;
    const rest = state.groups.filter((g) => g.id !== groupId);
    const first = rest[0];
    if (first) {
      first.buttonIds = [...first.buttonIds, ...victim.buttonIds];
    }
    uiButtonStyleStore.setModuleGroups(module, { groups: rest });
  };

  const updateGroupTitle = (groupId: string, title: string) => {
    const raw = uiButtonStyleStore.getLayout().groupsByModule?.[module];
    const state = mergeGroupsWithRegistry(module, raw);
    const next = {
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, title: title || g.title } : g)),
    };
    uiButtonStyleStore.setModuleGroups(module, next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1 flex-1">
          {module}
        </h3>
        <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={addGroup}>
          新增群組
        </Button>
      </div>

      {groupsState.groups.map((group) => (
        <div key={group.id} className="rounded-lg border border-border/50 bg-background/40 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <GroupTitleField group={group} onSave={(id, title) => updateGroupTitle(id, title)} />
            {group.description ? (
              <span className="text-[10px] text-muted-foreground">{group.description}</span>
            ) : null}
            {groupsState.groups.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-destructive ml-auto"
                onClick={() => {
                  if (confirm("確定移除此群組？群內按鈕將合併到第一個群組。")) deleteGroup(group.id);
                }}
              >
                移除群組
              </Button>
            ) : null}
          </div>
          <div className="space-y-2 pl-0">
            {group.buttonIds.map((bid) => {
              const def = getUiButtonDef(bid);
              if (!def) return null;
              return <ButtonRow key={bid} def={def} module={module} currentGroupId={group.id} />;
            })}
            {group.buttonIds.length === 0 ? (
              <p className="text-[10px] text-muted-foreground px-1">（此群組尚無按鈕，請從其他群組移入）</p>
            ) : null}
          </div>
        </div>
      ))}
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
            自訂寬度、底色、字色、圖示與文案；群組可新增／移除／調整內容。預覽即時反映（自訂圖示需確認後才套用）。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            if (
              confirm(
                "確定將所有工具列按鈕樣式（含寬度、顏色、自訂文字、圖示與群組版面）還原為預設值？"
              )
            )
              uiButtonStyleStore.resetAll();
          }}
        >
          全部重設
        </Button>
      </div>

      <ToolbarWidthControl />

      <div className="space-y-6 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
        {[...byModule.keys()].map((module) => (
          <ModuleToolbarBlock key={module} module={module} />
        ))}
      </div>
    </div>
  );
}
