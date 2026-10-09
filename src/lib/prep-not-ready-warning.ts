/** LMS 案件頁：準備未完成改為非阻擋提醒，不再說句段會被鎖住。 */

export function prepNotReadyWarningDescription(
  isPmOrAbove: boolean,
  names: string[],
): string {
  const list = names.map((n) => String(n || "").trim()).filter(Boolean);
  if (isPmOrAbove) {
    const files = list.length ? list.join("、") : "部分檔案";
    return `以下 CAT 檔案尚未標記準備完成：${files}。指派已完成，譯者仍可編輯已受派範圍。就緒後請至 CAT 工具標記準備完成。`;
  }
  return "本案部分 CAT 作業檔尚未標記準備完成。你仍可編輯已受派範圍；如有疑問，請通知專案管理人員。";
}
