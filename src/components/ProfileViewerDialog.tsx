import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, Smartphone, Globe, Clock, FileText } from "lucide-react";
import { getTimezoneInfo } from "@/data/timezone-options";
import { useNavigate } from "react-router-dom";

interface ProfileData {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  timezone: string | null;
  status_message: string | null;
  phone: string | null;
  mobile: string | null;
  bio: string | null;
}

interface ProfileViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** email to look up the profile */
  email: string | null;
}

export default function ProfileViewerDialog({ open, onOpenChange, email }: ProfileViewerDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !email) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url, timezone, status_message, phone, mobile, bio")
      .eq("email", email)
      .single()
      .then(({ data }) => {
        setProfile(data as ProfileData | null);
        setLoading(false);
      });
  }, [open, email]);

  const isOwnProfile = profile && user && profile.id === user.id;
  const defaultTz = getTimezoneInfo("Asia/Taipei");
  const tzInfo = profile?.timezone ? getTimezoneInfo(profile.timezone) : defaultTz;
  const initials = (profile?.display_name || profile?.email || "?").slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">個人檔案</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground text-center py-6">找不到此成員的資料</p>
        ) : (
          <div className="space-y-4">
            {/* Avatar + Name */}
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium truncate">{profile.display_name || profile.email}</p>
                {profile.display_name && (
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                )}
                {profile.status_message && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">「{profile.status_message}」</p>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2.5 text-sm">
              {tzInfo && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>{tzInfo.label}</span>
                </div>
              )}
              {profile.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.mobile && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" />
                  <span>{profile.mobile}</span>
                </div>
              )}
              {profile.bio && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{profile.bio}</span>
                </div>
              )}
            </div>

            {/* Edit button for own profile */}
            {isOwnProfile && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/profile");
                }}
              >
                編輯個人檔案
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
