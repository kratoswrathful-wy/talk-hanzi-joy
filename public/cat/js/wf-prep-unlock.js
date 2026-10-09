/**
 * TASK-002 B：準備中不再鎖住合法編輯或離頁。
 * 完整四事件提醒仍後做；本模組只解鎖與離頁時「保持準備中」。
 */

/**
 * 準備未完成是否禁止已受派譯者編輯。B 為 false。
 * @returns {boolean}
 */
export function prepIncompleteForbidsAssignedEdit() {
  return false;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function editorPrepLeaveMessage(name) {
  const n = String(name || "目前檔案").trim() || "目前檔案";
  return `「${n}」仍在準備中。確定後將保持準備中並離開；取消則留在此頁。`;
}

/**
 * @param {string[]} names
 * @returns {string}
 */
export function projectPrepLeaveMessage(names) {
  const list = Array.isArray(names) ? names.map((n) => String(n || "").trim()).filter(Boolean) : [];
  if (list.length <= 1) {
    return editorPrepLeaveMessage(list[0] || "目前檔案");
  }
  return `以下檔案仍在準備中。確定後將保持準備中並離開；取消則留在此頁：\n${list.map((n) => `· ${n}`).join("\n")}`;
}

/**
 * 確定＝保持準備中並離開；取消＝留在此頁。不把確定當成標記準備完成。
 * @param {boolean} modalConfirmed
 * @returns {boolean}
 */
export function shouldLeaveKeepingPrep(modalConfirmed) {
  return modalConfirmed === true;
}

const WfPrepUnlock = {
  prepIncompleteForbidsAssignedEdit,
  editorPrepLeaveMessage,
  projectPrepLeaveMessage,
  shouldLeaveKeepingPrep,
};

if (typeof globalThis !== "undefined") {
  globalThis.WfPrepUnlock = WfPrepUnlock;
}

export default WfPrepUnlock;
