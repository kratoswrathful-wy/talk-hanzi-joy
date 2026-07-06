/**
 * CAT 彈窗狀態唯讀查詢（W9 延伸）——供 __catAgent.modals 使用。
 * 純 DOM 讀取，不修改流程狀態。
 */

/** @typedef {'open'|'import'} MqRoleContext */

export const PREP_CONFIRM_TITLES = Object.freeze([
  '準備完成',
  '檔案準備中',
  '尚有檔案準備中',
]);

const PREP_COMPLETE_TITLE = '準備完成';
const PREP_IN_PROGRESS_TITLES = Object.freeze(['檔案準備中', '尚有檔案準備中']);

/**
 * @param {Element | null | undefined} el
 */
export function isElementVisible(el) {
  return !!(el && !el.classList.contains('hidden'));
}

/**
 * @param {Document | DocumentFragment} doc
 */
export function readOpenMqRoleState(doc = document) {
  const modal = doc.getElementById('mqRoleModal');
  const visible = isElementVisible(modal);
  const titleEl = doc.getElementById('mqRoleModalTitle');
  const checked = doc.querySelector('input[name="mqRoleChoice"]:checked');
  const selectedRole = checked ? String(checked.value || '') : null;
  return {
    context: /** @type {const} */ ('open'),
    visible,
    title: titleEl ? String(titleEl.textContent || '').trim() : '',
    selectedRole,
    defaultRole: selectedRole,
    options: Array.from(doc.querySelectorAll('input[name="mqRoleChoice"]')).map((input) => ({
      value: String(input.value || ''),
      checked: !!input.checked,
    })),
  };
}

/**
 * @param {Document | DocumentFragment} doc
 */
export function readImportMqRoleState(doc = document) {
  const wizard = doc.getElementById('wizardOverlay');
  const step = doc.getElementById('wizardStepBatchMq');
  const visible = isElementVisible(wizard) && isElementVisible(step);
  const titleEl = step ? step.querySelector('#batchMqRoleTitle') : null;
  const sameRoleCb = step ? step.querySelector('#batchMqSameRole') : null;
  const globalSel = step ? step.querySelector('#batchMqGlobalSelect') : null;
  const useSameRole = sameRoleCb ? !!sameRoleCb.checked : null;
  const globalRole = globalSel ? String(globalSel.value || '') : null;
  /** @type {Array<{ fileName: string, role: string }>} */
  const perFile = [];
  if (step) {
    step.querySelectorAll('.batch-mq-row').forEach((row) => {
      const nameEl = row.querySelector('span[title]');
      const sel = row.querySelector('.batch-mq-file-select');
      if (!sel) return;
      perFile.push({
        fileName: nameEl ? String(nameEl.getAttribute('title') || nameEl.textContent || '').trim() : '',
        role: String(sel.value || ''),
      });
    });
  }
  return {
    context: /** @type {const} */ ('import'),
    visible,
    title: titleEl ? String(titleEl.textContent || '').trim() : '',
    useSameRole,
    globalRole,
    perFile,
    defaultRole: useSameRole ? globalRole : (perFile[0]?.role ?? null),
    selectedRole: useSameRole ? globalRole : null,
  };
}

/**
 * 合併查詢：優先回傳目前可見的身分選擇彈窗（開啟 vs 匯入）。
 * @param {Document | DocumentFragment} doc
 */
export function readMqRoleState(doc = document) {
  const open = readOpenMqRoleState(doc);
  if (open.visible) return open;
  const imp = readImportMqRoleState(doc);
  if (imp.visible) return imp;
  return {
    context: null,
    visible: false,
    title: '',
    selectedRole: null,
    defaultRole: null,
  };
}

/**
 * @param {Document | DocumentFragment} doc
 */
export function readPrepConfirmState(doc = document) {
  const modal = doc.getElementById('catGenericConfirmModal');
  const visible = isElementVisible(modal);
  const titleEl = doc.getElementById('catGenericConfirmTitle');
  const msgEl = doc.getElementById('catGenericConfirmMsg');
  const title = titleEl ? String(titleEl.textContent || '').trim() : '';
  const message = msgEl ? String(msgEl.textContent || '') : '';
  const isPrepRelated = PREP_CONFIRM_TITLES.includes(title);
  return {
    visible,
    title,
    message,
    isPrepRelated,
    isPrepCompleteConfirm: visible && title === PREP_COMPLETE_TITLE,
    isPrepInProgressPrompt: visible && PREP_IN_PROGRESS_TITLES.includes(title),
  };
}

/**
 * @param {Window & typeof globalThis} [global]
 */
export function installCatModalStateBridge(global = window) {
  const bridge = {
    readMqRoleState,
    readOpenMqRoleState,
    readImportMqRoleState,
    readPrepConfirmState,
    getMqRoleState: () => readMqRoleState(global.document),
    getPrepConfirmState: () => readPrepConfirmState(global.document),
    PREP_CONFIRM_TITLES,
  };
  global.CatModalStateBridge = bridge;
  return bridge;
}

installCatModalStateBridge();
