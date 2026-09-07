/**
 * CAT iframe → 父頁 postMessage 信任檢查（P0-B）。
 * 必須同時滿足：origin 與目前視窗相同，且 event.source 為該 iframe 的 contentWindow。
 */
export function isTrustedCatIframeMessage(
  event: MessageEvent,
  iframeWindow: Window | null | undefined,
): boolean {
  if (!iframeWindow) return false;
  if (event.origin !== window.location.origin) return false;
  return event.source === iframeWindow;
}
