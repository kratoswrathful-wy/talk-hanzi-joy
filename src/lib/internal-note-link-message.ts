import { escapeSlackLinkLabel } from "@/lib/inquiry-slack-message";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function internalNoteUrl(origin: string, noteId: string): string {
  return `${origin.replace(/\/$/, "")}/internal-notes/${noteId}`;
}

/** Clipboard plain text: Slack mrkdwn `<url|title>` to reduce unfurl when pasted. */
export function buildInternalNoteLinkMessagePlain(origin: string, noteTitle: string, noteId: string): string {
  const url = internalNoteUrl(origin, noteId);
  const title = noteTitle.trim() || "（無標題）";
  return `請問可以幫我看一下這則註記嗎？\n<${url}|${escapeSlackLinkLabel(title)}>`;
}

/** Clipboard HTML for rich clients (email, etc.). */
export function buildInternalNoteLinkMessageHtml(origin: string, noteTitle: string, noteId: string): string {
  const url = internalNoteUrl(origin, noteId);
  const title = noteTitle.trim() || "（無標題）";
  return `請問可以幫我看一下這則註記嗎？<br><a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
}
