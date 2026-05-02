import { toast } from "@/hooks/use-toast";
import { buildInquiryMessageForSlack } from "@/lib/inquiry-slack-message";
import type { CaseRecord } from "@/data/case-types";

function copyPlainToClipboard(plainText: string, toastDescription: string) {
  void navigator.clipboard
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

/** 複製案件詢案訊息至剪貼簿（mrkdwn `<url|標題>`，貼到 Slack 較不易觸發連結預覽） */
export function copyCaseInquiryMessageToClipboard(caseId: string, caseTitle: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const plainText = buildInquiryMessageForSlack(origin, [
    { id: caseId, title: caseTitle || "（無標題）" } as Pick<CaseRecord, "id" | "title">,
  ]);
  copyPlainToClipboard(plainText, "已複製詢案訊息至剪貼簿");
}

/** 案件總表多筆選取：依列表順序複製多段詢案訊息（單則 mrkdwn） */
export function copyMultipleCaseInquiryMessagesToClipboard(
  items: Pick<CaseRecord, "id" | "title">[]
) {
  if (items.length === 0) return;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const plainText = buildInquiryMessageForSlack(origin, items);
  const desc =
    items.length > 1
      ? `已複製 ${items.length} 筆詢案訊息至剪貼簿`
      : "已複製詢案訊息至剪貼簿";
  copyPlainToClipboard(plainText, desc);
}
