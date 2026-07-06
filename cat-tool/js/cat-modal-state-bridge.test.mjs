import { describe, it, expect, beforeEach } from 'vitest';
import {
  readMqRoleState,
  readOpenMqRoleState,
  readImportMqRoleState,
  readPrepConfirmState,
  isElementVisible,
} from './cat-modal-state-bridge.js';

function hidden(id, tag = 'div') {
  return `<${tag} id="${id}" class="hidden"></${tag}>`;
}

describe('cat-modal-state-bridge', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      ${hidden('mqRoleModal')}
      <h2 id="mqRoleModalTitle" class="hidden"></h2>
      <input type="radio" name="mqRoleChoice" value="T_ALLOW_R1" checked />
      <input type="radio" name="mqRoleChoice" value="R1" />
      ${hidden('wizardOverlay')}
      ${hidden('wizardStepBatchMq')}
      ${hidden('catGenericConfirmModal')}
      <h3 id="catGenericConfirmTitle" class="hidden"></h3>
      <p id="catGenericConfirmMsg"></p>
    `;
  });

  it('isElementVisible 判斷 hidden class', () => {
    const el = document.getElementById('mqRoleModal');
    expect(isElementVisible(el)).toBe(false);
    el.classList.remove('hidden');
    expect(isElementVisible(el)).toBe(true);
  });

  it('開啟編輯器身分彈窗：可見時回 selectedRole', () => {
    document.getElementById('mqRoleModal').classList.remove('hidden');
    document.getElementById('mqRoleModalTitle').textContent = '開啟時：選擇本次作業身分';
    const state = readOpenMqRoleState();
    expect(state.visible).toBe(true);
    expect(state.context).toBe('open');
    expect(state.selectedRole).toBe('T_ALLOW_R1');
    expect(state.title).toContain('開啟時');
  });

  it('匯入批次身分步驟：可見時回 globalRole 與 perFile', () => {
    document.getElementById('wizardOverlay').classList.remove('hidden');
    const step = document.getElementById('wizardStepBatchMq');
    step.classList.remove('hidden');
    step.innerHTML = `
      <h2 id="batchMqRoleTitle">匯入時：選擇本次作業身分</h2>
      <input type="checkbox" id="batchMqSameRole" checked />
      <select id="batchMqGlobalSelect"><option value="R1" selected>R1</option></select>
      <div class="batch-mq-row">
        <span title="a.mqxliff">a.mqxliff</span>
        <select class="batch-mq-file-select"><option value="R1" selected>R1</option></select>
      </div>`;
    const state = readImportMqRoleState();
    expect(state.visible).toBe(true);
    expect(state.context).toBe('import');
    expect(state.useSameRole).toBe(true);
    expect(state.globalRole).toBe('R1');
    expect(state.perFile).toEqual([{ fileName: 'a.mqxliff', role: 'R1' }]);
  });

  it('readMqRoleState 優先回傳可見的開啟彈窗', () => {
    document.getElementById('mqRoleModal').classList.remove('hidden');
    document.getElementById('wizardOverlay').classList.remove('hidden');
    document.getElementById('wizardStepBatchMq').classList.remove('hidden');
    expect(readMqRoleState().context).toBe('open');
  });

  it('準備完成確認彈窗：標題與旗標', () => {
    document.getElementById('catGenericConfirmModal').classList.remove('hidden');
    document.getElementById('catGenericConfirmTitle').textContent = '準備完成';
    document.getElementById('catGenericConfirmMsg').textContent = '仍要標記準備完成嗎？';
    const state = readPrepConfirmState();
    expect(state.visible).toBe(true);
    expect(state.isPrepCompleteConfirm).toBe(true);
    expect(state.isPrepInProgressPrompt).toBe(false);
    expect(state.isPrepRelated).toBe(true);
  });

  it('檔案準備中提示：isPrepInProgressPrompt', () => {
    document.getElementById('catGenericConfirmModal').classList.remove('hidden');
    document.getElementById('catGenericConfirmTitle').textContent = '檔案準備中';
    const state = readPrepConfirmState();
    expect(state.isPrepInProgressPrompt).toBe(true);
    expect(state.isPrepCompleteConfirm).toBe(false);
  });

  it('皆不可見時回 idle 形狀', () => {
    expect(readMqRoleState().visible).toBe(false);
    expect(readPrepConfirmState().visible).toBe(false);
  });
});
