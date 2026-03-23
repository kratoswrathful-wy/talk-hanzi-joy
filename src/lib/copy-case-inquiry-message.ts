import { toast } from "@/hooks/use-toast";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeInquiryBlocksToClipboard(
  plainText: string,
  html: string,
  toastDescription: string
) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    navigator.clipboard
      .write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ])
      .then(() => toast({ description: toastDescription }))
      .catch(() => {
        navigator.clipboard
          .writeText(plainText)
          .then(() => toast({ description: toastDescription }))
          .catch(() =>
            toast({
              title: "複製失敗",
              description: "請手動複製內容後再貼到 Slack",
              variant: "destructive",
            })
          );
      });
  } else {
    navigator.clipboard
      .writeText(plainText)
      .then(() => toast({ description: toastDescription }))
      .catch(() =>
        toast({
          title: "複製失敗",
          description: "請手動複製內容後再貼到 Slack",
          variant: "destructive",
        })
      );
  }
}

/** 複製案件詢案訊息至剪貼簿（與案件個別頁／總表共用） */
export function copyCaseInquiryMessageToClipboard(caseTitle: string, caseUrl: string) {
  const plainText = `請問這件可以做嗎？\n${caseTitle}\n${caseUrl}`;
  const html = `請問這件可以做嗎？<br><a href="${caseUrl}">${escapeHtml(caseTitle)}</a>`;
  writeInquiryBlocksToClipboard(plainText, html, "已複製詢案訊息至剪貼簿");
}

/** 案件總表多筆選取：依列表順序複製多段詢案訊息 */
export function copyMultipleCaseInquiryMessagesToClipboard(
  items: { title: string; caseUrl: string }[]
) {
  if (items.length === 0) return;
  const blocks = items.map((it) => {
    const t = it.title || "（無標題）";
    return {
      plain: `請問這件可以做嗎？\n${t}\n${it.caseUrl}`,
      html: `請問這件可以做嗎？<br><a href="${it.caseUrl}">${escapeHtml(t)}</a>`,
    };
  });
  const plainText = blocks.map((b) => b.plain).join("\n\n");
  const html = blocks.map((b) => b.html).join("<br><br>");
  const desc =
    items.length > 1
      ? `已複製 ${items.length} 筆詢案訊息至剪貼簿`
      : "已複製詢案訊息至剪貼簿";
  writeInquiryBlocksToClipboard(plainText, html, desc);
}
