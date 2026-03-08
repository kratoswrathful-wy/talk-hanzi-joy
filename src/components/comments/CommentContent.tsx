import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Paperclip, ExternalLink, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFees } from "@/hooks/use-fee-store";

/** Check if a route is accessible based on user role */
function useRouteAccessChecker() {
  const { primaryRole } = useAuth();
  const isMember = primaryRole === "member";
  const isPm = primaryRole === "pm";
  // Members can only see fees assigned to them (RLS already filters the list)
  const myFees = useFees();

  return (route: string): boolean => {
    if (isMember) {
      // For fee routes, check if the fee ID is in the member's own fee list
      const feeMatch = route.match(/^\/fees\/([0-9a-f-]+)/);
      if (feeMatch) {
        const feeId = feeMatch[1];
        return myFees.some((f) => f.id === feeId);
      }
      // Block all other fee list routes, client invoices, internal notes
      if (route.startsWith("/fees")) return false;
      if (route.startsWith("/client-invoices")) return false;
      if (route.startsWith("/internal-notes")) return false;
    }
    // PMs cannot access permissions page
    if (isPm) {
      if (route.startsWith("/permissions")) return false;
    }
    return true;
  };
}

export function CommentContent({
  content,
  imageUrls,
  fileUrls,
}: {
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const canAccessRoute = useRouteAccessChecker();

  // Match [@title](/route) links and plain @mentions
  const regex = /\[@([^\]]+)\]\(([^)]+)\)|(@\S+)|\[([^\]]+)\]\(([^)]+)\)/g;
  const rendered: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      rendered.push(<span key={`t-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
    }
    if (match[1] && match[2]) {
      // [@title](/route) — internal page mention
      const title = match[1];
      const route = match[2];
      const isInternal = route.startsWith("/");
      const hasAccess = !isInternal || canAccessRoute(route);

      if (hasAccess) {
        rendered.push(
          <a
            key={`l-${match.index}`}
            href={route}
            {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            className="text-primary font-medium bg-primary/10 rounded px-0.5 underline underline-offset-2 hover:text-primary/80"
          >
            @{title}
          </a>
        );
      } else {
        rendered.push(
          <span
            key={`l-${match.index}`}
            className="inline-flex items-center gap-0.5 text-muted-foreground bg-muted rounded px-1 py-0.5 text-xs"
          >
            <Lock className="h-3 w-3" />
            無權限檢視
          </span>
        );
      }
    } else if (match[3]) {
      // Plain @mention
      rendered.push(
        <span key={`m-${match.index}`} className="text-primary font-medium bg-primary/10 rounded px-0.5">
          {match[3]}
        </span>
      );
    } else if (match[4] && match[5]) {
      // [text](url) — plain markdown link
      rendered.push(
        <a key={`l2-${match.index}`} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
          {match[4]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    rendered.push(<span key="tail">{content.slice(lastIndex)}</span>);
  }

  const imgCount = imageUrls?.length ?? 0;
  const canPrev = lightboxIndex !== null && lightboxIndex > 0;
  const canNext = lightboxIndex !== null && lightboxIndex < imgCount - 1;

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft" && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
      if (e.key === "ArrowRight" && lightboxIndex < imgCount - 1) setLightboxIndex(lightboxIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, imgCount]);

  return (
    <div>
      <p className="whitespace-pre-wrap">{rendered}</p>
      {imageUrls && imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {imageUrls.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`附圖 ${idx + 1}`}
              className="max-w-xs max-h-48 rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightboxIndex(idx)}
            />
          ))}
        </div>
      )}
      {fileUrls && fileUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {fileUrls.map((f, idx) => (
            <a
              key={idx}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-xs hover:bg-secondary/50 transition-colors"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
      {lightboxIndex !== null && imageUrls && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 hover:bg-white/40 p-2 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={!canPrev}
            onClick={(e) => { e.stopPropagation(); if (canPrev) setLightboxIndex(lightboxIndex - 1); }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrls[lightboxIndex]}
              alt="原圖"
              className="max-w-[85vw] max-h-[80vh] rounded-lg shadow-2xl"
            />
            <div className="flex items-center gap-3 text-white/80 text-sm select-none">
              <span>{lightboxIndex + 1} / {imgCount}</span>
              {imgCount > 1 && (
                <span className="text-white/50 text-xs flex items-center gap-1">
                  ← → 鍵盤方向鍵可切換
                </span>
              )}
            </div>
          </div>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 hover:bg-white/40 p-2 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={!canNext}
            onClick={(e) => { e.stopPropagation(); if (canNext) setLightboxIndex(lightboxIndex + 1); }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
