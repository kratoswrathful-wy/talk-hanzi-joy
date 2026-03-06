import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CommentContent({ content, imageUrls }: { content: string; imageUrls?: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const regex = /(@\S+)|\[([^\]]+)\]\(([^)]+)\)/g;
  const rendered: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      rendered.push(<span key={`t-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      rendered.push(
        <span key={`m-${match.index}`} className="text-primary font-medium bg-primary/10 rounded px-0.5">
          {match[1]}
        </span>
      );
    } else if (match[2] && match[3]) {
      rendered.push(
        <a key={`l-${match.index}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
          {match[2]}
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
