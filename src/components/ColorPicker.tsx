import { useState, useRef, useCallback, useEffect } from "react";
import { PRESET_COLORS } from "@/stores/select-options-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
import { Check, Plus, X } from "lucide-react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  customColors?: string[];
  onAddCustomColor?: (color: string) => void;
  onRemoveCustomColor?: (color: string) => void;
  /** Map of uppercase hex color → list of option labels using it */
  colorUsageMap?: Record<string, string[]>;
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function getUsageTooltip(labels: string[], colorHex: string): string {
  if (labels.length === 0) return `${colorHex}：目前沒有選項使用此顏色`;
  return `${colorHex}：${labels.join("、")}`;
}

function ColorSwatch({
  color,
  selected,
  labels,
  onSelect,
  onRemove,
}: {
  color: string;
  selected: boolean;
  labels: string[];
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const count = labels.length;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative group">
            <button
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center",
                selected ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: color }}
              onClick={onSelect}
            >
              {selected && !count ? (
                <Check className="h-3 w-3 text-white drop-shadow" />
              ) : count > 0 ? (
                <span className="text-[9px] font-bold text-white drop-shadow-md leading-none">{count}</span>
              ) : null}
            </button>
            {onRemove && (
              <button
                className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
              >
                <X className="h-2 w-2" />
              </button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {getUsageTooltip(labels, color)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ColorPicker({
  value,
  onChange,
  customColors = [],
  onAddCustomColor,
  onRemoveCustomColor,
  colorUsageMap = {},
}: ColorPickerProps) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value || "#FF0000"));
  const [hexInput, setHexInput] = useState(value || "#FF0000");
  const [showWheel, setShowWheel] = useState(false);
  const [deleteColorConfirm, setDeleteColorConfirm] = useState<string | null>(null);

  const wheelRef = useRef<HTMLCanvasElement>(null);
  const satSliderRef = useRef<HTMLCanvasElement>(null);
  const valSliderRef = useRef<HTMLCanvasElement>(null);

  const currentHex = hsvToHex(hsv[0], hsv[1], hsv[2]);

  const presetSet = new Set(PRESET_COLORS.map((c) => c.toUpperCase()));
  // Derive in-use non-preset colors from colorUsageMap
  const inUseCustomColors = Object.keys(colorUsageMap).filter(
    (c) => !presetSet.has(c.toUpperCase()) && (colorUsageMap[c]?.length ?? 0) > 0
  );
  // Merge explicit customColors + in-use colors, deduplicate
  const allCustomColors = Array.from(
    new Set([...customColors.map((c) => c.toUpperCase()), ...inUseCustomColors.map((c) => c.toUpperCase())])
  );

  const getLabels = (c: string) => colorUsageMap[c.toUpperCase()] || [];

  // Draw color wheel
  useEffect(() => {
    if (!showWheel) return;
    const canvas = wheelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, radius = size / 2;
    const imageData = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const sat = dist / radius;
          const hex = hsvToHex(angle, sat, hsv[2]);
          const idx = (y * size + x) * 4;
          imageData.data[idx] = parseInt(hex.slice(1, 3), 16);
          imageData.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
          imageData.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
          imageData.data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [showWheel, hsv[2]]);

  // Draw saturation slider (vertical)
  useEffect(() => {
    if (!showWheel) return;
    const canvas = satSliderRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width, h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, hsvToHex(hsv[0], 1, hsv[2]));
    gradient.addColorStop(1, hsvToHex(hsv[0], 0, hsv[2]));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, [showWheel, hsv[0], hsv[2]]);

  // Draw brightness slider (vertical)
  useEffect(() => {
    if (!showWheel) return;
    const canvas = valSliderRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width, h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, hsvToHex(hsv[0], hsv[1], 1));
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, [showWheel, hsv[0], hsv[1]]);

  const handleWheelInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = wheelRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const dx = (e.clientX - rect.left) * scale - cx;
    const dy = (e.clientY - rect.top) * scale - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = canvas.width / 2;
    if (dist > radius) return;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    const sat = dist / radius;
    const newHsv: [number, number, number] = [angle, sat, hsv[2]];
    setHsv(newHsv);
    const hex = hsvToHex(newHsv[0], newHsv[1], newHsv[2]);
    setHexInput(hex);
    onChange(hex);
  }, [hsv, onChange]);

  const handleSatSliderInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = satSliderRef.current!;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const s = Math.max(0, Math.min(1, 1 - y / rect.height));
    const newHsv: [number, number, number] = [hsv[0], s, hsv[2]];
    setHsv(newHsv);
    const hex = hsvToHex(newHsv[0], newHsv[1], newHsv[2]);
    setHexInput(hex);
    onChange(hex);
  }, [hsv, onChange]);

  const handleValSliderInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = valSliderRef.current!;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const v = Math.max(0, Math.min(1, 1 - y / rect.height));
    const newHsv: [number, number, number] = [hsv[0], hsv[1], v];
    setHsv(newHsv);
    const hex = hsvToHex(newHsv[0], newHsv[1], newHsv[2]);
    setHexInput(hex);
    onChange(hex);
  }, [hsv, onChange]);

  const startDrag = useCallback((handler: (e: React.MouseEvent<HTMLCanvasElement>) => void) => (e: React.MouseEvent<HTMLCanvasElement>) => {
    handler(e);
    const onMove = (ev: MouseEvent) => handler(ev as unknown as React.MouseEvent<HTMLCanvasElement>);
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleHexChange = (v: string) => {
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      setHsv(hexToHsv(v));
      onChange(v.toUpperCase());
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* Preset colors */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">預設色彩</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <ColorSwatch
                key={c}
                color={c}
                selected={value === c}
                labels={getLabels(c)}
                onSelect={() => {
                  onChange(c);
                  setHexInput(c);
                  setHsv(hexToHsv(c));
                }}
              />
            ))}
          </div>
        </div>

        {/* Custom colors */}
        {(customColors.length > 0 || onAddCustomColor) && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">自訂色彩</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {customColors.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={value === c}
                  labels={getLabels(c)}
                  onSelect={() => {
                    onChange(c);
                    setHexInput(c);
                    setHsv(hexToHsv(c));
                  }}
                  onRemove={onRemoveCustomColor ? () => setDeleteColorConfirm(c) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Toggle color wheel */}
        <Button
          variant="outline"
          size="sm"
          className="text-xs w-full"
          onClick={() => setShowWheel(!showWheel)}
        >
          {showWheel ? "收起調色盤" : "自訂顏色"}
        </Button>

        {showWheel && (
          <div className="space-y-2">
          <div className="flex gap-3 items-start">
            {/* Color wheel with position indicator */}
            <div className="relative flex justify-center">
              <canvas
                ref={wheelRef}
                width={180}
                height={180}
                className="w-[140px] h-[140px] rounded-full cursor-crosshair"
                onMouseDown={startDrag(handleWheelInteraction)}
              />
              {/* Wheel thumb */}
              {(() => {
                const wheelDisplaySize = 140;
                const radius = wheelDisplaySize / 2;
                const angleRad = hsv[0] * (Math.PI / 180);
                const dist = hsv[1] * radius;
                const tx = radius + dist * Math.cos(angleRad);
                const ty = radius + dist * Math.sin(angleRad);
                return (
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md pointer-events-none"
                    style={{
                      backgroundColor: currentHex,
                      left: tx - 6,
                      top: ty - 6,
                    }}
                  />
                );
              })()}
            </div>
            <div className="flex gap-1.5 h-[140px]">
              {/* Saturation slider with thumb */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground">彩</span>
                <div className="relative">
                  <canvas
                    ref={satSliderRef}
                    width={16}
                    height={120}
                    className="w-4 h-[124px] rounded cursor-pointer"
                    onMouseDown={startDrag(handleSatSliderInteraction)}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-5 h-1.5 rounded-full border border-white shadow-md pointer-events-none"
                    style={{
                      backgroundColor: hsvToHex(hsv[0], hsv[1], hsv[2]),
                      top: `${(1 - hsv[1]) * 124}px`,
                    }}
                  />
                </div>
              </div>
              {/* Brightness slider with thumb */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground">明</span>
                <div className="relative">
                  <canvas
                    ref={valSliderRef}
                    width={16}
                    height={120}
                    className="w-4 h-[124px] rounded cursor-pointer"
                    onMouseDown={startDrag(handleValSliderInteraction)}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-5 h-1.5 rounded-full border border-white shadow-md pointer-events-none"
                    style={{
                      backgroundColor: hsvToHex(hsv[0], hsv[1], hsv[2]),
                      top: `${(1 - hsv[2]) * 124}px`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-border shrink-0"
                style={{ backgroundColor: currentHex }}
              />
              <Input
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
                placeholder="#FF0000"
              />
              {onAddCustomColor && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0 gap-1"
                  onClick={() => {
                    if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
                      onAddCustomColor(hexInput.toUpperCase());
                    }
                  }}
                >
                  <Plus className="h-3 w-3" />
                  儲存
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete custom color confirmation */}
      <AlertDialog open={!!deleteColorConfirm} onOpenChange={(v) => { if (!v) setDeleteColorConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除自訂色彩</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除自訂色彩 {deleteColorConfirm} 嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteColorConfirm && onRemoveCustomColor) {
                  onRemoveCustomColor(deleteColorConfirm);
                }
                setDeleteColorConfirm(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
