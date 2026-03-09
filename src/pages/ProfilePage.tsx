import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Loader2, Camera, ZoomIn, ZoomOut, Move } from "lucide-react";
import { TIMEZONE_OPTIONS } from "@/data/timezone-options";

const AVATAR_SIZE = 256;
const MIN_DIMENSION = 128;

// ─── Avatar Cropper Dialog ───
function AvatarCropper({
  open, onOpenChange, imageSrc, onCrop,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; imageSrc: string; onCrop: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (!imageSrc) return;
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setZoom(1); setOffset({ x: 0, y: 0 }); setImgLoaded(true); };
    img.src = imageSrc;
  }, [imageSrc]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const viewSize = 280; canvas.width = viewSize; canvas.height = viewSize;
    ctx.clearRect(0, 0, viewSize, viewSize);
    ctx.save(); ctx.beginPath(); ctx.arc(viewSize / 2, viewSize / 2, viewSize / 2, 0, Math.PI * 2); ctx.clip();
    const scale = Math.max(viewSize / img.naturalWidth, viewSize / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale; const dh = img.naturalHeight * scale;
    const dx = (viewSize - dw) / 2 + offset.x; const dy = (viewSize - dh) / 2 + offset.y;
    ctx.drawImage(img, dx, dy, dw, dh); ctx.restore();
    ctx.strokeStyle = "hsl(217 91% 60%)"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(viewSize / 2, viewSize / 2, viewSize / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  }, [imgLoaded, zoom, offset]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) });
  }, [dragging]);
  const handleMouseUp = useCallback(() => setDragging(false), []);
  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove); window.addEventListener("mouseup", handleMouseUp);
      return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]; setDragging(true);
    dragStart.current = { x: touch.clientX, y: touch.clientY, ox: offset.x, oy: offset.y };
  };
  useEffect(() => {
    if (!dragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      setOffset({ x: dragStart.current.ox + (touch.clientX - dragStart.current.x), y: dragStart.current.oy + (touch.clientY - dragStart.current.y) });
    };
    const handleTouchEnd = () => setDragging(false);
    window.addEventListener("touchmove", handleTouchMove); window.addEventListener("touchend", handleTouchEnd);
    return () => { window.removeEventListener("touchmove", handleTouchMove); window.removeEventListener("touchend", handleTouchEnd); };
  }, [dragging]);

  const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); setZoom((z) => Math.max(1, Math.min(5, z - e.deltaY * 0.002))); };

  const handleCrop = () => {
    const img = imgRef.current; if (!img) return;
    const outCanvas = document.createElement("canvas"); outCanvas.width = AVATAR_SIZE; outCanvas.height = AVATAR_SIZE;
    const ctx = outCanvas.getContext("2d"); if (!ctx) return;
    const viewSize = 280; const scale = Math.max(viewSize / img.naturalWidth, viewSize / img.naturalHeight) * zoom;
    const ratio = AVATAR_SIZE / viewSize;
    const dw = img.naturalWidth * scale * ratio; const dh = img.naturalHeight * scale * ratio;
    const dx = (AVATAR_SIZE - dw) / 2 + offset.x * ratio; const dy = (AVATAR_SIZE - dh) / 2 + offset.y * ratio;
    ctx.beginPath(); ctx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    outCanvas.toBlob((blob) => { if (blob) onCrop(blob); }, "image/png", 0.95);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>裁切頭像</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div ref={containerRef} className="relative cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onWheel={handleWheel}>
            <canvas ref={canvasRef} width={280} height={280} className="rounded-full" style={{ width: 280, height: 280 }} />
            <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground pointer-events-none">
              <Move className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-center gap-3 w-full px-4">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider value={[zoom]} onValueChange={([v]) => setZoom(v)} min={1} max={5} step={0.05} className="flex-1" />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground">拖曳調整位置，滑鼠滾輪或滑桿調整縮放</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleCrop}>確認裁切</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Profile Page ───
export default function ProfilePage() {
  const { user, profile, refetchProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Taipei");
  const [statusMessage, setStatusMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string>("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setEmail(profile.email || "");
      setAvatarUrl(profile.avatar_url);
      setTimezone(profile.timezone || "Asia/Taipei");
      setStatusMessage(profile.status_message || "");
      setPhone(profile.phone || "");
      setMobile(profile.mobile || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth < MIN_DIMENSION || img.naturalHeight < MIN_DIMENSION) {
          toast.error(`圖片太小，最低 ${MIN_DIMENSION}×${MIN_DIMENSION} 像素`); return;
        }
        setRawImageSrc(src); setCropperOpen(true);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user) return;
    setCropperOpen(false); setUploading(true);
    const path = `${user.id}/avatar.png`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/png" });
    if (error) { toast.error("上傳失敗：" + error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url); refetchProfile?.(); setUploading(false); toast.success("頭像已更新");
  };

  const handleSave = async () => {
    if (!user) return;
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("請輸入有效的電子信箱格式");
      return;
    }
    setSaving(true);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        timezone,
        status_message: statusMessage,
        phone,
        mobile,
        bio,
      })
      .eq("id", user.id);

    if (profileError) { toast.error(profileError.message); setSaving(false); return; }

    if (email !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({ email });
      if (emailError) { toast.error("信箱更新失敗：" + emailError.message); setSaving(false); return; }
      toast.info("已寄送驗證信至新信箱，請確認後生效");
    }

    refetchProfile?.(); setSaving(false); toast.success("個人檔案已更新");
  };

  const initials = (displayName || email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">個人檔案</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理您的個人資訊</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">頭像</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>
          <p className="text-sm text-muted-foreground">點擊相機圖示上傳新頭像，可裁切選取顯示區域</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">基本資訊</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">顯示名稱</Label>
            <MultilineInput 
              id="displayName" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
              minRows={1}
              maxRows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">電子信箱</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">變更信箱後需至新信箱點擊驗證連結</p>
          </div>
          <div className="space-y-2">
            <Label>時區</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statusMessage">近期狀態</Label>
            <MultilineInput 
              id="statusMessage" 
              value={statusMessage} 
              onChange={(e) => setStatusMessage(e.target.value)} 
              placeholder="例如：出差中、休假至 3/15"
              minRows={1}
              maxRows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mobile">手機號碼</Label>
              <Input id="mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="例如：0912-345-678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">電話號碼</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例如：02-1234-5678" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">自我介紹</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="簡單介紹自己..." className="min-h-[80px]" />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            儲存變更
          </Button>
        </CardContent>
      </Card>

      <AvatarCropper open={cropperOpen} onOpenChange={setCropperOpen} imageSrc={rawImageSrc} onCrop={handleCroppedUpload} />
    </div>
  );
}
