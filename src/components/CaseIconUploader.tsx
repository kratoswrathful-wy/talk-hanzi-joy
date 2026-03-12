import { useState, useCallback, useRef } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const OUTPUT_SIZE = 512; // output px
const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "image/bmp", "image/tiff", "image/x-icon", "image/avif",
];
const ACCEPT_STRING = ".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.tif,.ico,.avif";

/** Crop an image via canvas and return a Blob */
async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    image.onload = () => res();
    image.onerror = rej;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

interface CaseIconUploaderProps {
  caseId: string;
  currentIconUrl: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}

export function CaseIconUploader({ caseId, currentIconUrl, onUploaded, onRemoved }: CaseIconUploaderProps) {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "檔案過大", description: "檔案大小不得超過 2MB", variant: "destructive" });
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "不支援的格式", description: "請上傳 JPEG、PNG、GIF、WebP、SVG、BMP、TIFF、ICO 或 AVIF 格式", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setOpen(true);
    };
    reader.readAsDataURL(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!imageSrc || !croppedArea) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      const filePath = `${caseId}/icon.png`;

      // Upload (upsert)
      const { error } = await supabase.storage
        .from("case-icons")
        .upload(filePath, blob, { contentType: "image/png", upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from("case-icons").getPublicUrl(filePath);
      // Append cache-bust
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      onUploaded(publicUrl);
      setOpen(false);
      setImageSrc(null);
      toast({ title: "圖示已更新" });
    } catch (err: any) {
      toast({ title: "上傳失敗", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await supabase.storage.from("case-icons").remove([`${caseId}/icon.png`]);
      onRemoved();
      toast({ title: "圖示已移除" });
    } catch (err: any) {
      toast({ title: "移除失敗", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={ACCEPT_STRING} className="hidden" onChange={handleFileSelect} />

      {/* Trigger: show current icon or add button */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-7 px-2 rounded flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="上傳圖示"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          <span>{currentIconUrl ? "更換圖示" : "新增圖示"}</span>
        </button>
        {currentIconUrl && (
          <button
            type="button"
            onClick={handleRemove}
            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            title="移除圖示"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Crop dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!uploading) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>裁切圖示</DialogTitle>
          </DialogHeader>

          <div className="relative w-full aspect-square bg-muted rounded-md overflow-hidden">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid={false}
              />
            )}
          </div>

          <div className="flex items-center gap-3 px-1">
            <span className="text-xs text-muted-foreground shrink-0">縮放</span>
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              className="flex-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>取消</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              確定上傳
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
