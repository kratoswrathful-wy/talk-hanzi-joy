import type { CaseRecord } from "@/data/case-types";

export interface InquiryCaseLine {
  id: string;
  title: string;
  url: string;
}

export function buildInquiryCaseLines(origin: string, cases: Pick<CaseRecord, "id" | "title">[]): InquiryCaseLine[] {
  return cases.map((c) => ({
    id: c.id,
    title: c.title || "（無標題）",
    url: `${origin.replace(/\/$/, "")}/cases/${c.id}`,
  }));
}

/** Plain text inquiry message (same rules as CaseDetailPage「產生詢案訊息」) */
export function buildInquiryMessagePlainText(origin: string, cases: Pick<CaseRecord, "id" | "title">[]): string {
  const lines = buildInquiryCaseLines(origin, cases);
  const body = lines.map((l) => `${l.title}（${l.url}）`).join("\n");
  if (lines.length <= 1) {
    return `請問這件可以做嗎？\n${body}`;
  }
  return `請問這幾件可以做嗎？\n${body}`;
}

/** Escape user-controlled text for Slack mrkdwn (section text). */
export function escapeSlackMrkdwnText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Label in `<url|label>` must not contain raw `|` (breaks mrkdwn). */
function escapeSlackLinkLabel(text: string): string {
  return escapeSlackMrkdwnText(text).replace(/\|/g, "｜");
}

/**
 * Slack DM body: one `<url|案件標題>` per line (no separate「開啟案件」).
 * Use with chat.postMessage blocks + unfurl disabled.
 */
export function buildInquiryMessageForSlack(origin: string, cases: Pick<CaseRecord, "id" | "title">[]): string {
  const lines = buildInquiryCaseLines(origin, cases);
  const body = lines.map((l) => `<${l.url}|${escapeSlackLinkLabel(l.title || "（無標題）")}>`).join("\n");
  if (lines.length <= 1) {
    return `請問這件可以做嗎？\n${body}`;
  }
  return `請問這幾件可以做嗎？\n${body}`;
}

/** Short plain `text` for chat.postMessage (notifications); must not contain unfurl-able bare URLs. */
export function buildInquirySlackNotificationFallback(cases: Pick<CaseRecord, "id" | "title">[]): string {
  const n = cases.length;
  if (n <= 1) return "請問這件可以做嗎？（含案件連結）";
  return `請問這幾件可以做嗎？（${n} 筆案件連結）`;
}
