/**
 * TASK-002 第五事件：批次 AI 翻譯成功並存好後，退出 AI 輔助；
 * 檔案仍準備中才詢問是否準備完成。不在首批套用前再問「首次編輯」。
 */

export const PREP_AFTER_AI_TITLE = "準備完成";

export const PREP_AFTER_AI_OK_LABEL = "確認";

export const PREP_AFTER_AI_CANCEL_LABEL = "暫不";

export const PREP_AFTER_AI_MESSAGE = [
  "本次 AI 翻譯已完成並儲存。是否將此檔案設為「準備完成」？",
  "",
  "確認後，系統會記錄整個檔案目前的譯文（包含這次 AI 翻譯結果），作為追蹤修訂的比較基準。若本次只翻譯部分句段，請先確認其餘內容是否也已準備妥當。",
  "",
  "譯者通常可直接確認；若有明顯流程問題，例如 MTPE 檔案仍缺應有譯文，請先與 PM 確認。選擇「暫不」仍可繼續編輯或離開。",
].join("\n");

/**
 * 是否視為「本輪批次已正常完成且應套用譯文均已確認保存」。
 * @param {{
 *   jobStatus?: string,
 *   leftoverMissing?: number,
 *   saveFailed?: number,
 *   saveUnknown?: boolean,
 *   cancelled?: boolean,
 * }} [input]
 * @returns {boolean}
 */
export function isSuccessfulAiBatchCompletion(input) {
  const s = input || {};
  if (s.cancelled) return false;
  if (s.saveUnknown) return false;
  if (String(s.jobStatus || "success") !== "success") return false;
  if (Number(s.leftoverMissing || 0) > 0) return false;
  if (Number(s.saveFailed || 0) > 0) return false;
  return true;
}

/**
 * @param {{
 *   jobStatus?: string,
 *   leftoverMissing?: number,
 *   saveFailed?: number,
 *   saveUnknown?: boolean,
 *   cancelled?: boolean,
 *   currentFileId?: string|null,
 *   jobFileId?: string|null,
 *   jobToken?: string|number|null,
 *   lastPromptedJobToken?: string|number|null,
 *   prepActive?: boolean,
 *   alreadyPrepCompleted?: boolean,
 *   canConfirmPrep?: boolean,
 * }} [input]
 * @returns {{ exitAiMode: boolean, promptPrep: boolean, reason: string }}
 */
export function decideAfterSuccessfulBatch(input) {
  const s = input || {};
  if (!isSuccessfulAiBatchCompletion(s)) {
    return { exitAiMode: false, promptPrep: false, reason: "not-success" };
  }
  const jobFile = String(s.jobFileId || "");
  const currentFile = String(s.currentFileId || "");
  if (!jobFile || !currentFile || jobFile !== currentFile) {
    return { exitAiMode: false, promptPrep: false, reason: "file-changed" };
  }
  const alreadyPrompted = s.jobToken != null && s.jobToken === s.lastPromptedJobToken;
  if (alreadyPrompted) {
    return { exitAiMode: true, promptPrep: false, reason: "already-prompted" };
  }
  const prepDone = s.alreadyPrepCompleted === true || s.prepActive === false;
  if (prepDone) {
    return { exitAiMode: true, promptPrep: false, reason: "prep-already-done" };
  }
  if (s.canConfirmPrep === false) {
    return { exitAiMode: true, promptPrep: false, reason: "no-permission" };
  }
  return { exitAiMode: true, promptPrep: true, reason: "prompt-prep" };
}

/**
 * 同一批次 AI 套用期間，不要再攔一次「首次編輯」準備詢問。
 * @param {{ batchRunning?: boolean, suppressFirstEdit?: boolean }} [input]
 * @returns {boolean}
 */
export function shouldSkipFirstEditPromptForAiBatch(input) {
  return !!(input && (input.batchRunning || input.suppressFirstEdit));
}

/**
 * 確認準備完成時，他人已完成則不覆蓋基準。
 * @param {{ prepStatus?: string, confirmed?: boolean }} [input]
 * @returns {'apply'|'skip-already-done'|'skip-declined'}
 */
export function resolvePrepConfirmApplyAction(input) {
  if (!input || input.confirmed !== true) return "skip-declined";
  const status = String(input.prepStatus || "").trim();
  if (status === "completed") return "skip-already-done";
  if (status !== "active") return "skip-already-done";
  return "apply";
}

const AiBatchPrepPrompt = {
  PREP_AFTER_AI_TITLE,
  PREP_AFTER_AI_OK_LABEL,
  PREP_AFTER_AI_CANCEL_LABEL,
  PREP_AFTER_AI_MESSAGE,
  isSuccessfulAiBatchCompletion,
  decideAfterSuccessfulBatch,
  shouldSkipFirstEditPromptForAiBatch,
  resolvePrepConfirmApplyAction,
};

if (typeof globalThis !== "undefined") {
  globalThis.AiBatchPrepPrompt = AiBatchPrepPrompt;
}

export default AiBatchPrepPrompt;
