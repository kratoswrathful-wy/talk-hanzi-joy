import { previewBodyText } from "@/lib/extract-block-text";

/**
 * 案件說明省略預覽。摘要計算必須在此子元件內執行，
 * 才能被 CaseBodyEditorBoundary 接住渲染錯誤，避免整頁黑畫面。
 */
export function CaseBodyOmittedPreview({
  body,
  fallbackNote = "",
}: {
  body: unknown;
  fallbackNote?: string;
}) {
  const omittedPreview = previewBodyText(body) || fallbackNote.trim();
  return (
    <div
      data-testid="case-detail-omitted-preview"
      className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap min-h-[4rem]"
    >
      {omittedPreview || "（完整內容尚未重新讀取，未開放編輯）"}
    </div>
  );
}
