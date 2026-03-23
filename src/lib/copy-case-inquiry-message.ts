import { toast } from "@/hooks/use-toast";

/** 複製案件詢案訊息至剪貼簿（與案件個別頁／總表共用） */
export function copyCaseInquiryMessageToClipboard(caseTitle: string, caseUrl: string) {
  const plainText = `請問這件可以做嗎？\n${caseTitle}\n${caseUrl}`;
  const html = `請問這件可以做嗎？<br><a href="${caseUrl}">${caseTitle}</a>`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    navigator.clipboard
      .write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ])
      .then(() => toast({ description: "已複製詢案訊息至剪貼簿" }))
      .catch(() => {
        navigator.clipboard
          .writeText(plainText)
          .then(() => toast({ description: "已複製詢案訊息至剪貼簿" }))
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
      .then(() => toast({ description: "已複製詢案訊息至剪貼簿" }))
      .catch(() =>
        toast({
          title: "複製失敗",
          description: "請手動複製內容後再貼到 Slack",
          variant: "destructive",
        })
      );
  }
}
