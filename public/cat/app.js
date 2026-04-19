// TM：js/tm-utils.js ｜ XLIFF 標籤：js/xliff-tag-pipeline.js ｜ XLIFF 匯入：js/xliff-import.js

// =====================================================
// LANG_OPTIONS：遵循 XLIFF / BCP 47 語言代碼規範
// =====================================================
const LANG_OPTIONS = [
    { code: 'en',    label: 'EN — English' },
    { code: 'en-US', label: 'EN-US — English (US)' },
    { code: 'en-GB', label: 'EN-GB — English (UK)' },
    { code: 'de',    label: 'DE — Deutsch' },
    { code: 'de-DE', label: 'DE-DE — Deutsch (Deutschland)' },
    { code: 'fr',    label: 'FR — Français' },
    { code: 'fr-FR', label: 'FR-FR — Français (France)' },
    { code: 'es',    label: 'ES — Español' },
    { code: 'it',    label: 'IT — Italiano' },
    { code: 'pt',    label: 'PT — Português' },
    { code: 'pt-BR', label: 'PT-BR — Português (Brasil)' },
    { code: 'nl',    label: 'NL — Nederlands' },
    { code: 'pl',    label: 'PL — Polski' },
    { code: 'ru',    label: 'RU — Русский' },
    { code: 'ja',    label: 'JA — 日本語' },
    { code: 'ja-JP', label: 'JA-JP — 日本語（日本）' },
    { code: 'ko',    label: 'KO — 한국어' },
    { code: 'ko-KR', label: 'KO-KR — 한국어（대한민국）' },
    { code: 'zh-TW', label: 'ZH-TW — 繁體中文（台灣）' },
    { code: 'zh-HK', label: 'ZH-HK — 繁體中文（香港）' },
    { code: 'zh-CN', label: 'ZH-CN — 簡體中文（中國）' },
    { code: 'zh',    label: 'ZH — 中文' },
    { code: 'ar',    label: 'AR — العربية' },
    { code: 'tr',    label: 'TR — Türkçe' },
    { code: 'th',    label: 'TH — ภาษาไทย' },
    { code: 'vi',    label: 'VI — Tiếng Việt' },
    { code: 'id',    label: 'ID — Bahasa Indonesia' },
    { code: 'ms',    label: 'MS — Bahasa Melayu' },
];

/** 語言代碼 → 顯示標籤（找不到就傳回代碼本身） */
function langLabel(code) {
    if (!code) return '—';
    const opt = LANG_OPTIONS.find(o => o.code.toLowerCase() === code.toLowerCase());
    return opt ? opt.label : code;
}

function countWords(text) {
    if (!text) return 0;
    let count = 0;
    const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
    if (cjk) count += cjk.length;
    const cleaned = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ');
    const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
    count += words.length;
    return count;
}

/** 渲染語言代碼為 badge HTML（供 innerHTML 插入） */
function langBadgeHtml(codes, dir = '') {
    if (!codes || !codes.length) return '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
    const badges = codes.map(c =>
        `<span style="display:inline-block; background:#e0f2fe; color:#0369a1; border-radius:4px; padding:1px 6px; font-size:0.78rem; white-space:nowrap; font-family:monospace;">${c.toUpperCase()}</span>`
    ).join(' ');
    return dir ? `<span style="color:#94a3b8; font-size:0.75rem;">${dir}</span> ${badges}` : badges;
}

/** 建立語言多選 UI（checkbox 列表），回傳 container element
 *  @param {string[]} selected - 已選中的語言代碼
 */
function buildLangCheckboxes(selected = []) {
    const wrap = document.createElement('div');

    // 搜尋框
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '搜尋語言…';
    search.autocomplete = 'off';
    search.style.cssText = 'width:100%; box-sizing:border-box; padding:0.3rem 0.5rem; margin-bottom:0.3rem; border:1px solid #cbd5e1; border-radius:5px; font-size:0.82rem;';
    wrap.appendChild(search);

    // Checkbox 容器
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-wrap:wrap; gap:0.35rem; max-height:160px; overflow-y:auto; padding:0.25rem; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc;';
    LANG_OPTIONS.forEach(opt => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:inline-flex; align-items:center; gap:0.25rem; cursor:pointer; padding:0.2rem 0.4rem; border-radius:4px; font-size:0.82rem; white-space:nowrap; background:#fff; border:1px solid #e2e8f0;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt.code;
        cb.checked = selected.includes(opt.code);
        cb.style.cursor = 'pointer';
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(opt.label));
        container.appendChild(lbl);
    });
    wrap.appendChild(container);

    // 即時搜尋過濾
    search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        container.querySelectorAll('label').forEach(lbl => {
            lbl.style.display = lbl.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    return wrap;
}

/** 從 buildLangCheckboxes 回傳的 container 取得已勾選的代碼陣列 */
function getCheckedLangs(container) {
    return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
}

document.addEventListener('DOMContentLoaded', async () => {
    const Xliff = window.CatToolXliffTags;
    const XliffImport = window.CatToolXliffImport;
    if (!Xliff) {
        console.error('my-cat-tool：請在 index.html 於 app.js 之前載入 js/xliff-tag-pipeline.js');
    }
    if (!XliffImport) {
        console.error('my-cat-tool：請在 index.html 於 app.js 之前載入 js/xliff-import.js');
    }
    try {
        const catStorage = (new URLSearchParams(window.location.search).get('catStorage') || '').toLowerCase();
        if (catStorage === 'team') {
            const sidebarTitle = document.querySelector('.sidebar-title');
            if (sidebarTitle) sidebarTitle.textContent = 'CAT Team';
        }
    } catch (_) { /* ignore */ }

    // 本檔案結構：(1) 畫面上元件的參照 (2) 共用小工具 (3) 畫面切換與資料載入 (4) 各功能區塊與事件
    // ---- DOM Elements ----
    // --- 導覽與版面（側欄、切換畫面） ---
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    let currentFileId = null;

    // 進度條統計範圍（null = 不限；1-based，依原始 rowIdx 排序後的位置）
    let progressRangeStart = null;
    let progressRangeEnd   = null;

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');

    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // --- 儀表板 ---
    const statProjects = document.getElementById('statProjects');
    const statTMs = document.getElementById('statTMs');
    const statTBs = document.getElementById('statTBs');
    const recentFilesList = document.getElementById('recentFilesList');
    // --- 專案清單與專案內頁 ---
    const projectsTableBody = document.getElementById('projectsTableBody');
    const projectsSelectAll = document.getElementById('projectsSelectAll');
    const projectsSelectAllLabel = document.getElementById('projectsSelectAllLabel');
    const btnProjectsDeleteSelected = document.getElementById('btnProjectsDeleteSelected');
    const filesListBody = document.getElementById('filesListBody');
    const projectFilesSelectAll = document.getElementById('projectFilesSelectAll');
    const projectFileAssignHint = document.getElementById('projectFileAssignHint');
    const btnProjectToolbarAssign = document.getElementById('btnProjectToolbarAssign');
    const btnProjectToolbarDelete = document.getElementById('btnProjectToolbarDelete');
    const btnProjectWordCount = document.getElementById('btnProjectWordCount');
    const btnProjectSplitAssign = document.getElementById('btnProjectSplitAssign');
    const wordCountModal = document.getElementById('wordCountModal');
    const btnCloseWordCountModal = document.getElementById('btnCloseWordCountModal');
    const btnDismissWordCountModal = document.getElementById('btnDismissWordCountModal');
    const wordCountIncludeLocked = document.getElementById('wordCountIncludeLocked');
    const wordCountTmCheckboxes = document.getElementById('wordCountTmCheckboxes');
    const btnRunWordCount = document.getElementById('btnRunWordCount');
    const btnSaveWordCountReport = document.getElementById('btnSaveWordCountReport');
    const wordCountResultBody = document.getElementById('wordCountResultBody');
    const wordCountReportHistory = document.getElementById('wordCountReportHistory');
    const splitAssignModal = document.getElementById('splitAssignModal');
    const btnCloseSplitAssignModal = document.getElementById('btnCloseSplitAssignModal');
    const btnCancelSplitAssign = document.getElementById('btnCancelSplitAssign');
    const splitHintPartsInput = document.getElementById('splitHintPartsInput');
    const btnSplitHintRun = document.getElementById('btnSplitHintRun');
    const splitHintQuotaContainer = document.getElementById('splitHintQuotaContainer');
    const splitAssignTableWrap = document.getElementById('splitAssignTableWrap');
    const highMatchGuardModal = document.getElementById('highMatchGuardModal');
    const highMatchGuardMessage = document.getElementById('highMatchGuardMessage');
    const btnHighMatchGuardOk = document.getElementById('btnHighMatchGuardOk');
    const btnHighMatchGuardCancel = document.getElementById('btnHighMatchGuardCancel');
    const btnHighMatchGuardClose = document.getElementById('btnHighMatchGuardClose');
    const assignedFilesBody = document.getElementById('assignedFilesBody');
    const collabPresenceBar = document.getElementById('collabPresenceBar');
    const fileAssignModal = document.getElementById('fileAssignModal');
    const fileAssignModalTitle = document.getElementById('fileAssignModalTitle');
    const fileAssignMembersList = document.getElementById('fileAssignMembersList');
    const btnCloseFileAssignModal = document.getElementById('btnCloseFileAssignModal');
    const btnCancelFileAssign = document.getElementById('btnCancelFileAssign');
    const btnSaveFileAssign = document.getElementById('btnSaveFileAssign');
    // --- TM 清單與 TM 內頁 ---
    const tmList = document.getElementById('tmList');
    const tmListSelectAll = document.getElementById('tmListSelectAll');
    const tmListSelectAllLabel = document.getElementById('tmListSelectAllLabel');
    const btnTmListDeleteSelected = document.getElementById('btnTmListDeleteSelected');
    // --- TB 術語庫與術語表內頁 ---
    const tbList = document.getElementById('tbList');
    const tbListSelectAll = document.getElementById('tbListSelectAll');
    const tbListSelectAllLabel = document.getElementById('tbListSelectAllLabel');
    const btnTbListDeleteSelected = document.getElementById('btnTbListDeleteSelected');
    const tbSearchInput = document.getElementById('tbSearchInput');
    let lastProjectsList = [];
    let lastTmListItems = [];
    let lastTbListItems = [];
    const tbTermSearchInput = document.getElementById('tbTermSearchInput');
    const tbTermsList = document.getElementById('tbTermsList');
    const tbTermSelectAll = document.getElementById('tbTermSelectAll');
    const tbTermSelectAllLabel = document.getElementById('tbTermSelectAllLabel');
    const btnTbDeleteSelected = document.getElementById('btnTbDeleteSelected');
    const tbTermCount = document.getElementById('tbTermCount');
    const tbChangeLog = document.getElementById('tbChangeLog');
    const btnTbChangeLogExpand = document.getElementById('btnTbChangeLogExpand');
    let tbChangeLogShowAll = false;

    const dashboardChangeLog = document.getElementById('dashboardChangeLog');
    const btnDashboardChangeLogExpand = document.getElementById('btnDashboardChangeLogExpand');
    let dashboardChangeLogShowAll = false;

    const projectsChangeLog = document.getElementById('projectsChangeLog');
    const btnProjectsChangeLogExpand = document.getElementById('btnProjectsChangeLogExpand');
    let projectsChangeLogShowAll = false;

    const projectDetailChangeLog = document.getElementById('projectDetailChangeLog');
    const btnProjectDetailChangeLogExpand = document.getElementById('btnProjectDetailChangeLogExpand');
    let projectDetailChangeLogShowAll = false;

    const tmListChangeLog = document.getElementById('tmListChangeLog');
    const btnTmListChangeLogExpand = document.getElementById('btnTmListChangeLogExpand');
    let tmListChangeLogShowAll = false;

    const tmDetailChangeLog = document.getElementById('tmDetailChangeLog');
    const btnTmDetailChangeLogExpand = document.getElementById('btnTmDetailChangeLogExpand');
    let tmDetailChangeLogShowAll = false;

    const tbListChangeLog = document.getElementById('tbListChangeLog');
    const btnTbListChangeLogExpand = document.getElementById('btnTbListChangeLogExpand');
    let tbListChangeLogShowAll = false;
    const tbTermEditModal = document.getElementById('tbTermEditModal');
    const btnCloseTbTermEdit = document.getElementById('btnCloseTbTermEdit');
    const btnCancelTbTermEdit = document.getElementById('btnCancelTbTermEdit');
    const btnSaveTbTermEdit = document.getElementById('btnSaveTbTermEdit');
    const tbTermEditSource = document.getElementById('tbTermEditSource');
    const tbTermEditTarget = document.getElementById('tbTermEditTarget');
    const tbTermEditNote = document.getElementById('tbTermEditNote');
    let lastTbTerms = [];
    let currentEditingTermIndex = -1;
    // --- 編輯器與翻譯畫面 ---
    const sidePanelWidthResizer = document.getElementById('sidePanelWidthResizer');
    const sidePanel = document.querySelector('.editor-side-panel');
    const segmentsContainer = document.getElementById('segmentsContainer');

    // Project Detail Header
    const detailProjectName = document.getElementById('detailProjectName');
    const btnBackToProjects = document.getElementById('btnBackToProjects');
    
    // --- 彈窗（命名、TB Excel 匯入、檔案匯入精靈等） ---
    const namingModal = document.getElementById('namingModal');
    const namingModalTitle = document.getElementById('namingModalTitle');
    const namingModalLabel = document.getElementById('namingModalLabel');
    const namingModalInput = document.getElementById('namingModalInput');
    const btnNamingModalConfirm = document.getElementById('btnNamingModalConfirm');
    const btnCloseNamingModal = document.getElementById('btnCloseNamingModal');

    // TB Detail header & controls
    const btnBackToTbs = document.getElementById('btnBackToTbs');
    const detailTbName = document.getElementById('detailTbName');
    const tbTypeManual = document.getElementById('tbTypeManual');
    const tbTypeOnline = document.getElementById('tbTypeOnline');
    const btnTbAddTerm = document.getElementById('btnTbAddTerm');
    const btnTbImportFile = document.getElementById('btnTbImportFile');
    const btnTbImportOnline = document.getElementById('btnTbImportOnline');
    const tbExcelImportModal = document.getElementById('tbExcelImportModal');
    const tbExcelSheetList = document.getElementById('tbExcelSheetList');
    const tbExcelSelectAll = document.getElementById('tbExcelSelectAll');
    const tbExcelSelectAllLabel = document.getElementById('tbExcelSelectAllLabel');
    const tbExcelSheetSelect = document.getElementById('tbExcelSheetSelect');
    const tbExcelUseSameConfig = document.getElementById('tbExcelUseSameConfig');
    const tbExcelSourceCol = document.getElementById('tbExcelSourceCol');
    const tbExcelTargetCol = document.getElementById('tbExcelTargetCol');
    const tbExcelNoteCols = document.getElementById('tbExcelNoteCols');
    const tbExcelCreatorCol = document.getElementById('tbExcelCreatorCol');
    const tbExcelCreatedAtCol = document.getElementById('tbExcelCreatedAtCol');
    const tbExcelRowsRange = document.getElementById('tbExcelRowsRange');
    const tbExcelImportError = document.getElementById('tbExcelImportError');
    const btnCloseTbExcelImport = document.getElementById('btnCloseTbExcelImport');
    const btnCancelTbExcelImport = document.getElementById('btnCancelTbExcelImport');
    const btnConfirmTbExcelImport = document.getElementById('btnConfirmTbExcelImport');
    const tbImportInput = document.getElementById('tbImportInput');
    let currentTbId = null;
    let currentTmId = null;

    const wizardOverlay = document.getElementById('wizardOverlay');
    const wizardStep1 = document.getElementById('wizardStep1');
    const wizardStep2 = document.getElementById('wizardStep2');
    const btnCloseWizard = document.getElementById('btnCloseWizard');
    const sourceFileInput = document.getElementById('sourceFileInput');
    const sheetList = document.getElementById('sheetList');
    const selectAllSheets = document.getElementById('selectAllSheets');
    const btnWizBack1 = document.getElementById('btnWizBack1');
    const btnWizFinish = document.getElementById('btnWizFinish');

    const configSourceCol = document.getElementById('configSourceCol');
    const configTargetCol = document.getElementById('configTargetCol');
    const configIdCol = document.getElementById('configIdCol');
    const configExtraCol = document.getElementById('configExtraCol');
    const configDirection = document.getElementById('configDirection');
    const configRows = document.getElementById('configRows');
    
    // Pro Editor Elements
    const btnExitEditor = document.getElementById('btnExitEditor');
    const editorFileName = document.getElementById('editorFileName');
    const gridBody = document.getElementById('gridBody');
    const progressFill = document.getElementById('progressFill');
    const exportBtn = document.getElementById('exportBtn');
    const viewSettingsModal = document.getElementById('viewSettingsModal');
    const btnSortMenu = document.getElementById('btnSortMenu');
    const sortDropdown = document.getElementById('sortDropdown');
    const btnCloseViewSettings = document.getElementById('btnCloseViewSettings');
    const colSettingsListContainer = document.getElementById('colSettingsListContainer');
    const btnSaveViewSettings = document.getElementById('btnSaveViewSettings');
    const btnResetViewSettings = document.getElementById('btnResetViewSettings');
    const btnColSettings = document.getElementById('btnColSettings');
    const emptySegModeSelect = document.getElementById('emptySegMode');
    const emptySegTmMinPctInput = document.getElementById('emptySegTmMinPct');

    const btnShortcuts = document.getElementById('btnShortcuts');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
    
    if (btnShortcuts) {
        btnShortcuts.addEventListener('click', () => shortcutsModal.classList.remove('hidden'));
        btnCloseShortcuts.addEventListener('click', () => shortcutsModal.classList.add('hidden'));
    }

    // ---- 將原文複製到譯文 / 清除譯文（單一 + 批次）----

    /**
     * 對指定 segment 套用操作（'copy-source' 或 'clear'），同步更新 DOM 與 DB。
     * - copy-source：同步複製 sourceText 與 sourceTags
     * - clear：清除 targetText 及 targetTags
     */
    async function applySegmentTextOp(seg, rowEl, op) {
        if (!seg || isDynamicForbidden(seg) || seg.isLockedUser) return;
        markEmptySegUserEdited(seg.id);

        const newText = op === 'copy-source' ? seg.sourceText : '';
        if (op === 'copy-source') {
            seg.targetTags = (seg.sourceTags || []).map(t => ({ ...t }));
        } else {
            seg.targetTags = [];
            seg.matchValue = undefined;
        }
        seg.targetText = newText;

        if (rowEl) {
            const editor = rowEl.querySelector('.grid-textarea');
            if (editor) {
                editor.innerHTML = buildTaggedHtml(newText, seg.targetTags || seg.sourceTags || []);
                updateTagColors(rowEl, newText);
            }
            if (op === 'clear') applyMatchCellVisual(rowEl, '');
            if (seg.status === 'confirmed') {
                seg.status = 'unconfirmed';
                const si = rowEl.querySelector('.status-icon');
                if (si) si.classList.remove('done');
                rowEl.style.backgroundColor = '';
                await DBService.updateSegmentStatus(seg.id, 'unconfirmed');
            }
        }
        const extra = { targetTags: seg.targetTags };
        if (op === 'clear') extra.matchValue = '';
        await DBService.updateSegmentTarget(seg.id, newText, extra);
    }

    async function runTextOpOnSelection(op) {
        const targetIds = new Set(selectedRowIds);
        isBatchOpInProgress = true;
        try {
            if (targetIds.size > 0) {
                const items = [];
                for (const seg of currentSegmentsList) {
                    if (targetIds.has(seg.id)) {
                        const rowEl = document.querySelector(`.grid-data-row[data-seg-id="${seg.id}"]`);
                        const beforeSnap = snapshotSegForUndo(seg);
                        await applySegmentTextOp(seg, rowEl, op);
                        items.push({ id: seg.id, beforeSnap, afterSnap: snapshotSegForUndo(seg) });
                    }
                }
                if (items.length) pushUndoEntry({ kind: 'segmentState', items });
            } else {
                const activeRow = document.querySelector('.grid-data-row.active-row');
                if (!activeRow) return;
                const segId = parseId(activeRow.dataset.segId);
                const seg = currentSegmentsList.find(s => s.id === segId);
                const beforeSnap = snapshotSegForUndo(seg);
                await applySegmentTextOp(seg, activeRow, op);
                const afterSnap = snapshotSegForUndo(seg);
                if (JSON.stringify(beforeSnap) !== JSON.stringify(afterSnap)) {
                    pushUndoEntry({ kind: 'segmentState', items: [{ id: seg.id, beforeSnap, afterSnap }] });
                }
            }
            updateProgress();
        } finally {
            isBatchOpInProgress = false;
        }
    }

    const btnCopySourceToTarget = document.getElementById('btnCopySourceToTarget');
    if (btnCopySourceToTarget) {
        btnCopySourceToTarget.addEventListener('mousedown', (e) => e.preventDefault());
        btnCopySourceToTarget.addEventListener('click', () => runTextOpOnSelection('copy-source'));
    }

    const btnClearTarget = document.getElementById('btnClearTarget');
    if (btnClearTarget) {
        btnClearTarget.addEventListener('mousedown', (e) => e.preventDefault());
        btnClearTarget.addEventListener('click', () => runTextOpOnSelection('clear'));
    }

    // 標籤展開/收起按鈕
    const btnTagCollapse = document.getElementById('btnTagCollapse');
    if (btnTagCollapse) {
        btnTagCollapse.addEventListener('click', () => {
            tagsExpanded = !tagsExpanded;
            const editorGrid = document.getElementById('editorGrid');
            if (editorGrid) {
                editorGrid.classList.toggle('tags-expanded', tagsExpanded);
                editorGrid.classList.toggle('tags-collapsed', !tagsExpanded);
            }
            btnTagCollapse.title = tagsExpanded ? '收起標籤 (Ctrl+Shift+T)' : '展開標籤 (Ctrl+Shift+T)';
        });
    }

    // 標籤群組插入模式切換按鈕
    const btnTagGroupMode = document.getElementById('btnTagGroupMode');
    if (btnTagGroupMode) {
        btnTagGroupMode.addEventListener('click', () => {
            tagGroupInsertMode = !tagGroupInsertMode;
            localStorage.setItem('tagGroupInsertMode', tagGroupInsertMode ? 'group' : 'single');
            btnTagGroupMode.classList.toggle('active', tagGroupInsertMode);
                btnTagGroupMode.title = tagGroupInsertMode
                    ? '標籤群組插入：已停用（F8 固定插入單一 tag）'
                    : '標籤群組插入：已停用（F8 固定插入單一 tag）';
        });
    }

    // --- Change Log Helpers ---
    function getCurrentUserName() {
        return localStorage.getItem('localCatUserProfile') || 'Unknown User';
    }

    // --- TMS 身分橋接 ---
    /** 將 TMS 傳入的身分資料套用到 CAT 工具的 UI。 */
    function applyTmsIdentityToUI(payload) {
        const { displayName, email, avatarUrl, role } = payload || {};
        window._tmsRole = role || '';
        window._tmsAvatarUrl = avatarUrl || null;

        // 更新 localStorage（讓 getCurrentUserName() 等全部呼叫點自動生效）
        if (displayName) localStorage.setItem('localCatUserProfile', displayName);

        // 更新左下角顯示名稱
        const nameEl = document.getElementById('displayUserName');
        if (nameEl && displayName) nameEl.textContent = displayName;

        // 更新 title tooltip
        const profileBtn = document.getElementById('btnUserProfile');
        if (profileBtn) profileBtn.title = '個人資訊（由 TMS 管理）';

        // 替換 👤 emoji 為頭像圖片（有 avatarUrl 時）
        const avatarEl = document.getElementById('userAvatarIcon');
        if (avatarEl) {
            if (avatarUrl) {
                avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${displayName || ''}"
                    style="width:1.4em;height:1.4em;border-radius:50%;object-fit:cover;vertical-align:middle;">`;
            } else {
                avatarEl.textContent = '👤';
            }
        }

        // 填寫卡片內容
        const cardAvatar = document.getElementById('tmsCardAvatar');
        if (cardAvatar) {
            cardAvatar.innerHTML = avatarUrl
                ? `<img src="${avatarUrl}" alt="${displayName || ''}" style="width:64px;height:64px;object-fit:cover;">`
                : '👤';
        }
        const cardName = document.getElementById('tmsCardName');
        if (cardName) cardName.textContent = displayName || '—';
        const cardEmail = document.getElementById('tmsCardEmail');
        if (cardEmail) cardEmail.textContent = email || '';
        const cardRole = document.getElementById('tmsCardRole');
        if (cardRole) {
            const roleLabel = { member: '成員', pm: '專案經理', executive: '主管' }[role] || role || '—';
            cardRole.textContent = roleLabel;
        }

        window._tmsManagedIdentity = true;
        enforceTeamRoleLayout();
    }

    /** 顯示 TMS 個人資訊唯讀卡片。 */
    function showTmsProfileCard() {
        const card = document.getElementById('tmsProfileCard');
        if (card) card.style.display = 'flex';
    }

    // 關閉 TMS 個人資訊卡片（點按鈕或點背景）
    const tmsProfileCard = document.getElementById('tmsProfileCard');
    const btnCloseTmsCard = document.getElementById('btnCloseTmsProfileCard');
    if (tmsProfileCard) {
        tmsProfileCard.addEventListener('click', (e) => {
            if (e.target === tmsProfileCard) tmsProfileCard.style.display = 'none';
        });
    }
    if (btnCloseTmsCard) {
        btnCloseTmsCard.addEventListener('click', () => {
            if (tmsProfileCard) tmsProfileCard.style.display = 'none';
        });
    }

    function isTeamMode() {
        try {
            return (new URLSearchParams(window.location.search).get('catStorage') || '').toLowerCase() === 'team';
        } catch (_) {
            return false;
        }
    }

    // In team mode, entity IDs are UUID strings; in offline mode they are Dexie auto-increment integers.
    function parseId(idAttr) {
        return isTeamMode() ? idAttr : parseInt(idAttr, 10);
    }

    const STATUS_LABELS_TMS = {
        assigned: '待開始',
        in_progress: '翻譯中',
        completed: '已完成',
        cancelled: '已取消'
    };
    const COLLAB_FOCUS_TTL_MS = 15000;
    const COLLAB_EDIT_TTL_MS = 20000;

    function collabPaletteFor(sessionId) {
        if (!sessionId) return '#64748b';
        if (sessionId === collabSelfSessionId) return '#2563eb';
        const palette = ['#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#8b5cf6', '#ec4899', '#0ea5e9', '#84cc16'];
        let hash = 0;
        for (let i = 0; i < sessionId.length; i++) hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
        return palette[Math.abs(hash) % palette.length];
    }

    function getCollabOverlay() {
        let overlay = document.getElementById('collabOutlineOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'collabOutlineOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8000;overflow:hidden;';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function clearCollabOutlines() {
        const overlay = document.getElementById('collabOutlineOverlay');
        if (overlay) overlay.innerHTML = '';
    }

    function findMemberBySession(sessionId) {
        return (collabMembers || []).find(m => String(m.sessionId || '') === String(sessionId || '')) || null;
    }

    function drawCollabOutlineOnOverlay(overlay, el, color, dashed) {
        if (!el || !overlay) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const div = document.createElement('div');
        div.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px ${dashed ? 'dashed' : 'solid'} ${color};border-radius:3px;pointer-events:none;box-sizing:border-box;`;
        overlay.appendChild(div);
    }

    function applyCollabFocusOutlines() {
        clearCollabOutlines();
        const overlay = getCollabOverlay();
        const now = Date.now();

        Object.values(collabFocusBySession || {}).forEach((focus) => {
            if (!focus || !focus.sessionId) return;
            if (focus.sessionId === collabSelfSessionId) return;
            const ts = Date.parse(focus.at || '');
            if (!Number.isFinite(ts) || (now - ts) > COLLAB_FOCUS_TTL_MS) return;
            const color = collabPaletteFor(focus.sessionId);
            let el = null;
            if (focus.targetType === 'segment' && focus.targetId != null) {
                el = document.querySelector(`.grid-data-row[data-seg-id="${focus.targetId}"]`);
            } else if (focus.targetType === 'control' && focus.targetId) {
                el = document.getElementById(String(focus.targetId));
                if (!el) el = document.querySelector(`.tab-btn[data-tab="${String(focus.targetId)}"]`);
            }
            drawCollabOutlineOnOverlay(overlay, el, color, false);
        });

        Object.values(collabEditBySession || {}).forEach((edit) => {
            if (!edit || !edit.sessionId) return;
            if (edit.sessionId === collabSelfSessionId) return;
            if (String(edit.state || '') === 'end') return;
            const ts = Date.parse(edit.at || '');
            if (!Number.isFinite(ts) || (now - ts) > COLLAB_EDIT_TTL_MS) return;
            if (edit.segmentId == null) return;
            const row = document.querySelector(`.grid-data-row[data-seg-id="${edit.segmentId}"]`);
            drawCollabOutlineOnOverlay(overlay, row, collabPaletteFor(edit.sessionId), true);
        });
    }

    function renderCollabPresence() {
        if (!collabPresenceBar) return;
        if (!isTeamMode() || !collabCurrentFileId) {
            collabPresenceBar.style.display = 'none';
            collabPresenceBar.innerHTML = '';
            return;
        }
        const members = Array.isArray(collabMembers) ? collabMembers : [];
        if (!members.length) {
            collabPresenceBar.style.display = 'none';
            collabPresenceBar.innerHTML = '';
            return;
        }
        collabPresenceBar.style.display = 'flex';
        collabPresenceBar.innerHTML = members.map((m) => {
            const sid = String(m.sessionId || '');
            const color = collabPaletteFor(sid);
            const displayName = (m.displayName || 'Unknown User').replace(/</g, '&lt;');
            const avatar = m.avatarUrl
                ? `<img src="${m.avatarUrl}" alt="${displayName}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;">`
                : '<span style="font-size:11px;">👤</span>';
            return `<span title="${displayName}" style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.1rem 0.35rem;border:1px solid ${color};border-radius:999px;background:#ffffffcc;font-size:0.72rem;color:#334155;">${avatar}<span>${displayName}</span></span>`;
        }).join('');
    }

    function joinCollabForFile(file) {
        if (!isTeamMode() || !file || !file.id) return;
        collabCurrentFileId = String(file.id);
        window.parent.postMessage({
            type: 'CAT_COLLAB_JOIN',
            payload: {
                fileId: String(file.id),
                sessionId: collabSelfSessionId,
                displayName: localStorage.getItem('localCatUserProfile') || 'Unknown User',
                avatarUrl: window._tmsAvatarUrl || null,
                role: window._tmsRole || null
            }
        }, window.location.origin);
    }

    function leaveCollabForCurrentFile() {
        if (!collabCurrentFileId) return;
        window.parent.postMessage({
            type: 'CAT_COLLAB_LEAVE',
            payload: {
                fileId: collabCurrentFileId,
                sessionId: collabSelfSessionId
            }
        }, window.location.origin);
        collabCurrentFileId = null;
        collabMembers = [];
        collabFocusBySession = {};
        collabEditBySession = {};
        collabSeenCommitKeys = new Set();
        renderCollabPresence();
        clearCollabOutlines();
    }

    function emitCollabFocus(targetType, targetId) {
        if (!isTeamMode() || !collabCurrentFileId) return;
        if (!targetType || targetId == null) return;
        window.parent.postMessage({
            type: 'CAT_COLLAB_FOCUS',
            payload: {
                fileId: collabCurrentFileId,
                sessionId: collabSelfSessionId,
                targetType,
                targetId: String(targetId)
            }
        }, window.location.origin);
    }

    function emitCollabEdit(state, seg, text) {
        if (!isTeamMode() || !collabCurrentFileId) return;
        if (!seg || !seg.id || !state) return;
        window.parent.postMessage({
            type: 'CAT_COLLAB_EDIT',
            payload: {
                fileId: collabCurrentFileId,
                sessionId: collabSelfSessionId,
                segmentId: seg.id,
                state: state,
                text: typeof text === 'string' ? text : null
            }
        }, window.location.origin);
    }

    function isSegmentBeingEditedByOthers(segId) {
        const now = Date.now();
        return Object.values(collabEditBySession || {}).some((edit) => {
            if (!edit || !edit.sessionId) return false;
            if (edit.sessionId === collabSelfSessionId) return false;
            if (String(edit.state || '') === 'end') return false;
            if (String(edit.segmentId || '') !== String(segId || '')) return false;
            const ts = Date.parse(edit.at || '');
            return Number.isFinite(ts) && (now - ts) <= COLLAB_EDIT_TTL_MS;
        });
    }

    function showRowWriteHint(segId, text) {
        const row = document.querySelector(`.grid-data-row[data-seg-id="${segId}"]`);
        if (!row) return;
        let hint = row.querySelector('.collab-write-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'collab-write-hint';
            hint.style.cssText = 'position:absolute;right:6px;top:4px;font-size:11px;padding:1px 6px;border-radius:999px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;z-index:2;';
            row.style.position = 'relative';
            row.appendChild(hint);
        }
        hint.textContent = text;
        if (collabRowWriteHintTimers[segId]) clearTimeout(collabRowWriteHintTimers[segId]);
        collabRowWriteHintTimers[segId] = setTimeout(() => {
            const node = row.querySelector('.collab-write-hint');
            if (node) node.remove();
            delete collabRowWriteHintTimers[segId];
        }, 4000);
    }

    const _collabNoticeBySegId = {};

    function showCollabActionNotice(message, actions, timeoutMs = 10000, segmentId) {
        let host = document.getElementById('collabNoticeHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'collabNoticeHost';
            host.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;max-width:min(460px,calc(100vw - 24px));';
            document.body.appendChild(host);
        }

        if (segmentId != null && _collabNoticeBySegId[segmentId]) {
            const old = _collabNoticeBySegId[segmentId];
            if (old._dismiss) old._dismiss('replaced');
        }

        return new Promise((resolve) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#111827;color:#f8fafc;border:1px solid #374151;border-radius:8px;padding:10px 10px 8px;box-shadow:0 6px 20px rgba(0,0,0,.28);font-size:12px;line-height:1.45;';
            const msg = document.createElement('div');
            msg.textContent = message;
            card.appendChild(msg);

            const actionsRow = document.createElement('div');
            actionsRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:8px;';
            card.appendChild(actionsRow);

            let finished = false;
            const done = (result) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                card.remove();
                if (segmentId != null && _collabNoticeBySegId[segmentId] === card) {
                    delete _collabNoticeBySegId[segmentId];
                }
                resolve(result);
            };
            card._dismiss = done;

            (actions || []).forEach((a) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = a.label || 'OK';
                btn.style.cssText = `border:1px solid ${a.primary ? '#60a5fa' : '#4b5563'};background:${a.primary ? '#1d4ed8' : '#111827'};color:#fff;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;`;
                btn.addEventListener('click', () => done(a.id));
                actionsRow.appendChild(btn);
            });

            host.appendChild(card);
            if (segmentId != null) _collabNoticeBySegId[segmentId] = card;
            const timer = setTimeout(() => done('timeout'), timeoutMs);
        });
    }

    function getSegmentById(segId) {
        return currentSegmentsList.find((s) => String(s.id) === String(segId || '')) || null;
    }

    function getSegmentEditor(segId) {
        const row = document.querySelector(`.grid-data-row[data-seg-id="${segId}"]`);
        if (!row) return { row: null, editor: null };
        const editor = row.querySelector('.grid-textarea');
        return { row, editor };
    }

    function applyRemoteTextToSegmentUiAndDb(seg, row, editor, remoteText) {
        seg.targetText = remoteText;
        seg.matchValue = undefined;
        pendingRemoteBySegId.delete(String(seg.id));
        if (editor) {
            editor.innerHTML = buildTaggedHtml(remoteText, seg.targetTags || seg.sourceTags || []);
        }
        if (row) {
            updateTagColors(row, remoteText);
            refreshTagNextHighlight(row);
            applyMatchCellVisual(row, '');
        }
    }

    async function applyRemoteCommit(edit, whoLabel) {
        const segId = edit && edit.segmentId;
        if (segId == null) return;
        if (!isTeamMode()) return;
        const remoteText = typeof edit.text === 'string' ? edit.text : null;
        if (remoteText == null) return;
        const seg = getSegmentById(segId);
        if (!seg) return;

        const { row, editor } = getSegmentEditor(segId);
        const activeEditor = document.activeElement && document.activeElement.classList
            && document.activeElement.classList.contains('grid-textarea')
            ? document.activeElement
            : null;
        const activeSegId = activeEditor && activeEditor.closest('.grid-data-row')
            ? activeEditor.closest('.grid-data-row').getAttribute('data-seg-id')
            : null;
        const isEditingSameSeg = String(activeSegId || '') === String(segId);

        const localText = isEditingSameSeg && editor
            ? (extractTextFromEditor(editor) || '')
            : (seg.targetText || '');
        if (localText === remoteText) {
            pendingRemoteBySegId.delete(String(segId));
            return;
        }

        if (isEditingSameSeg && editor) {
            const at = edit && edit.at ? String(edit.at) : '';
            const key = String(segId);
            const prev = pendingRemoteBySegId.get(key);
            const prevTs = prev && prev.at ? Date.parse(prev.at) : NaN;
            const newTs = at ? Date.parse(at) : Date.now();
            if (!prev || !Number.isFinite(prevTs) || (Number.isFinite(newTs) && newTs >= prevTs)) {
                pendingRemoteBySegId.set(key, {
                    text: remoteText,
                    whoLabel: whoLabel || '其他成員',
                    at: at || new Date().toISOString()
                });
            }
            showRowWriteHint(segId, `${whoLabel} 有新版本（離開或確認時選擇要保留的版本）`);
            return;
        }

        applyRemoteTextToSegmentUiAndDb(seg, row, editor, remoteText);
        try {
            await DBService.updateSegmentTarget(seg.id, remoteText, { matchValue: '' });
        } catch (err) {
            console.error('[collab] apply remote commit failed', err);
        }
        showRowWriteHint(segId, `${whoLabel} 更新已套用`);
    }

    /**
     * 若有待處理的遠端譯文且與本機不同，顯示左右對照選擇。
     * @returns {Promise<boolean>} true = 可繼續 blur／確認流程；false = 使用者取消（呼叫端應 refocus 譯文欄）
     */
    async function resolvePendingRemoteConflict(seg, row, targetInput) {
        if (!isTeamMode()) return true;
        const key = String(seg.id);
        const pending = pendingRemoteBySegId.get(key);
        if (!pending) return true;
        const localText = extractTextFromEditor(targetInput) || '';
        if (localText === pending.text) {
            pendingRemoteBySegId.delete(key);
            return true;
        }

        const modal = document.getElementById('remoteConflictModal');
        const mineEl = document.getElementById('remoteConflictMine');
        const theirsEl = document.getElementById('remoteConflictTheirs');
        const whoEl = document.getElementById('remoteConflictWho');
        const radioMine = document.getElementById('remoteConflictRadioMine');
        const radioTheirs = document.getElementById('remoteConflictRadioTheirs');
        if (!modal || !mineEl || !theirsEl || !radioMine || !radioTheirs) {
            pendingRemoteBySegId.delete(key);
            return true;
        }

        if (whoEl) whoEl.textContent = pending.whoLabel || '其他成員';
        mineEl.innerHTML = buildTaggedHtml(localText, seg.targetTags || seg.sourceTags || []);
        theirsEl.innerHTML = buildTaggedHtml(pending.text, seg.targetTags || seg.sourceTags || []);
        radioMine.checked = true;
        radioTheirs.checked = false;

        return new Promise((resolve) => {
            const okBtn = document.getElementById('btnRemoteConflictOk');
            const cancelBtn = document.getElementById('btnRemoteConflictCancel');
            const finish = (proceed, pickTheirs) => {
                modal.classList.add('hidden');
                if (okBtn) okBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                if (!proceed) {
                    resolve(false);
                    return;
                }
                if (pickTheirs) {
                    applyRemoteTextToSegmentUiAndDb(seg, row, targetInput, pending.text);
                    DBService.updateSegmentTarget(seg.id, pending.text, { matchValue: '' }).catch((err) => {
                        console.error('[collab] apply chosen remote failed', err);
                    });
                    editorUndoEditStart[seg.id] = seg.targetText;
                    editorUndoMatchStart[seg.id] = seg.matchValue;
                    updateProgress();
                    renderLiveTmMatches(seg).catch(() => {});
                } else {
                    pendingRemoteBySegId.delete(key);
                }
                resolve(true);
            };
            modal.classList.remove('hidden');
            if (okBtn) okBtn.onclick = () => finish(true, radioTheirs.checked);
            if (cancelBtn) cancelBtn.onclick = () => finish(false);
        });
    }

    function enforceTeamRoleLayout() {
        if (!isTeamMode()) {
            if (btnProjectToolbarAssign) btnProjectToolbarAssign.style.display = 'none';
            if (btnProjectSplitAssign) btnProjectSplitAssign.style.display = '';
            return;
        }
        const role = (window._tmsRole || '').toLowerCase();
        const translatorOnly = role === 'member' || !!window._tmsTranslatorOnly;
        const nav = document.querySelector('.sidebar-nav');
        const sideTitle = document.querySelector('.sidebar-title');
        if (sideTitle && translatorOnly) sideTitle.textContent = 'CAT Team（受派）';
        if (projectFileAssignHint) {
            projectFileAssignHint.style.display = translatorOnly ? 'none' : '';
        }
        if (btnProjectToolbarAssign) {
            btnProjectToolbarAssign.style.display = translatorOnly || !window._tmsCanAssign ? 'none' : '';
        }
        if (btnProjectSplitAssign) {
            btnProjectSplitAssign.style.display = '';
        }
        if (nav) nav.style.display = translatorOnly ? 'none' : '';
        if (translatorOnly) {
            const ab = document.getElementById('dashboardAssignedBlock');
            if (ab) ab.style.display = '';
            const viewEditorEl = document.getElementById('viewEditor');
            const inEditor = !!(viewEditorEl && !viewEditorEl.classList.contains('hidden'));
            const hasOpenFile = currentFileId != null && currentFileId !== '';
            if (!inEditor && !hasOpenFile) {
                switchView('viewDashboard');
            }
        }
    }

    function renderAssignedFilesView(assignments) {
        if (!assignedFilesBody) return;
        const list = (assignments || []).filter(a => a && a.status !== 'cancelled');
        if (list.length === 0) {
            assignedFilesBody.innerHTML = '<tr><td colspan="5" style="padding:0.75rem; color:#64748b;">目前沒有受派檔案。</td></tr>';
            return;
        }
        assignedFilesBody.innerHTML = list.map(a => {
            const file = a.file || {};
            const status = STATUS_LABELS_TMS[a.status] || a.status || '—';
            const at = (a.updated_at || a.assigned_at) ? new Date(a.updated_at || a.assigned_at).toLocaleString('zh-TW') : '—';
            return `
                <tr>
                    <td style="padding:0.5rem; border:1px solid #e2e8f0;">${status}</td>
                    <td style="padding:0.5rem; border:1px solid #e2e8f0;">${(file.name || '').replace(/</g, '&lt;')}</td>
                    <td style="padding:0.5rem; border:1px solid #e2e8f0;">${(file.source_lang || '')} → ${(file.target_lang || '')}</td>
                    <td style="padding:0.5rem; border:1px solid #e2e8f0;">${at}</td>
                    <td style="padding:0.5rem; border:1px solid #e2e8f0;">
                        <button type="button" class="primary-btn btn-sm open-assigned-file-btn" data-assignment-id="${a.id}" data-file-id="${file.id || ''}" data-project-id="${file.project_id || ''}">開啟</button>
                    </td>
                </tr>
            `;
        }).join('');
        assignedFilesBody.querySelectorAll('.open-assigned-file-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fileId = btn.getAttribute('data-file-id');
                const projectId = btn.getAttribute('data-project-id');
                const assignmentId = btn.getAttribute('data-assignment-id');
                if (!fileId) return;
                if (projectId) {
                    currentProjectId = projectId;
                    await openProjectDetail(projectId);
                }
                await openEditor(fileId);
                if (assignmentId) {
                    window.parent.postMessage({
                        type: 'CAT_ASSIGNMENT_STATUS',
                        payload: { assignmentId, status: 'in_progress' }
                    }, window.location.origin);
                }
            });
        });
    }

    function closeFileAssignModal() {
        if (fileAssignModal) fileAssignModal.classList.add('hidden');
        currentAssignFileId = null;
        currentAssignFileName = '';
    }

    async function requestFileAssignments(fileId) {
        return await new Promise((resolve) => {
            const handler = (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data?.type !== 'TMS_FILE_ASSIGNMENTS') return;
                if (event.data?.payload?.fileId !== fileId) return;
                window.removeEventListener('message', handler);
                resolve(event.data.payload.assignments || []);
            };
            window.addEventListener('message', handler);
            window.parent.postMessage({ type: 'CAT_REQUEST_FILE_ASSIGNMENTS', payload: { fileId } }, window.location.origin);
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve([]);
            }, 15000);
        });
    }

    async function requestProjectAssignments(projectId) {
        if (!isTeamMode() || !projectId) {
            window._fileAssigneesByFileId = {};
            return;
        }
        await new Promise((resolve) => {
            const handler = (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data?.type !== 'TMS_PROJECT_ASSIGNMENTS') return;
                if (String(event.data?.payload?.projectId) !== String(projectId)) return;
                window.removeEventListener('message', handler);
                window._fileAssigneesByFileId = event.data.payload.byFile || {};
                resolve();
            };
            window.addEventListener('message', handler);
            window.parent.postMessage({ type: 'CAT_REQUEST_PROJECT_ASSIGNMENTS', payload: { projectId } }, window.location.origin);
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve();
            }, 12000);
        });
    }

    async function openFileAssignModal(fileId, fileName) {
        if (!fileAssignModal || !fileAssignMembersList) return;
        if (!window._tmsCanAssign) {
            alert('目前身分不可指派檔案。');
            return;
        }
        currentAssignFileId = fileId;
        currentAssignFileName = fileName || '';
        if (fileAssignModalTitle) {
            fileAssignModalTitle.textContent = `指派檔案：${currentAssignFileName || fileId}`;
        }
        const existing = await requestFileAssignments(fileId);
        const selectedSet = new Set(existing.map(a => String(a.assignee_user_id)));
        const members = window._tmsAssignableUsers || [];
        if (!members.length) {
            fileAssignMembersList.innerHTML = '<div style="color:#64748b; font-size:0.9rem;">尚無可指派人員。</div>';
        } else {
            fileAssignMembersList.innerHTML = members.map(m => {
                const checked = selectedSet.has(String(m.id)) ? 'checked' : '';
                const roleText = Array.isArray(m.roles) && m.roles.length ? `（${m.roles.join('/')})` : '';
                return `
                    <label style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.2rem; border-bottom:1px dashed #e5e7eb;">
                        <input type="checkbox" class="file-assign-user-cb" value="${m.id}" ${checked}>
                        <span style="flex:1;">${(m.displayName || m.email || '').replace(/</g, '&lt;')}</span>
                        <span style="font-size:0.8rem; color:#64748b;">${roleText}</span>
                    </label>
                `;
            }).join('');
        }
        fileAssignModal.classList.remove('hidden');
    }

    if (btnCloseFileAssignModal) btnCloseFileAssignModal.addEventListener('click', closeFileAssignModal);
    if (btnCancelFileAssign) btnCancelFileAssign.addEventListener('click', closeFileAssignModal);
    if (fileAssignModal) {
        fileAssignModal.addEventListener('click', (e) => {
            if (e.target === fileAssignModal) closeFileAssignModal();
        });
    }
    if (btnSaveFileAssign) {
        btnSaveFileAssign.addEventListener('click', async () => {
            if (!currentAssignFileId || !fileAssignMembersList) return;
            const selectedUserIds = Array.from(fileAssignMembersList.querySelectorAll('.file-assign-user-cb:checked')).map(cb => cb.value);
            const existing = await requestFileAssignments(currentAssignFileId);
            const existingIds = new Set(existing.map(a => String(a.assignee_user_id)));
            const selectedIds = new Set(selectedUserIds.map(x => String(x)));

            // add/update selected
            if (selectedUserIds.length > 0) {
                window.parent.postMessage({
                    type: 'CAT_ASSIGN_FILE',
                    payload: { fileId: currentAssignFileId, assigneeUserIds: selectedUserIds }
                }, window.location.origin);
            }
            // remove deselected
            existing.forEach(a => {
                const uid = String(a.assignee_user_id);
                if (!selectedIds.has(uid)) {
                    window.parent.postMessage({
                        type: 'CAT_UNASSIGN_FILE',
                        payload: { fileId: currentAssignFileId, assigneeUserId: uid }
                    }, window.location.origin);
                }
            });
            closeFileAssignModal();
            await loadFilesList();
        });
    }

    // postMessage 接收器：接收來自 TMS（父框架）的身分與指派資訊
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        if (event.origin !== window.location.origin) return;
        if (!event.data) return;

        if (event.data.type === 'TMS_IDENTITY') {
            applyTmsIdentityToUI(event.data.payload);
        } else if (event.data.type === 'TMS_ASSIGNMENTS') {
            const payload = event.data.payload || {};
            const assignments = payload.assignments || [];
            window._tmsAssignments = assignments;
            window._tmsTranslatorOnly = !!payload.translatorOnly;
            renderAssignedFilesView(assignments);
            const ab = document.getElementById('dashboardAssignedBlock');
            if (ab && window._tmsTranslatorOnly) ab.style.display = '';
            enforceTeamRoleLayout();
        } else if (event.data.type === 'TMS_ASSIGNABLE_USERS') {
            const payload = event.data.payload || {};
            window._tmsAssignableUsers = payload.members || [];
            window._tmsCanAssign = !!payload.canAssign;
            window._tmsTranslatorOnly = !!payload.translatorOnly;
            enforceTeamRoleLayout();
            if (currentProjectId) loadFilesList();
        } else if (event.data.type === 'TMS_COLLAB_STATE') {
            const payload = event.data.payload || {};
            if (!payload.fileId || String(payload.fileId) !== String(collabCurrentFileId || '')) return;
            collabMembers = Array.isArray(payload.members) ? payload.members : [];
            collabFocusBySession = payload.focusBySession || {};
            collabEditBySession = payload.editBySession || {};
            Object.values(collabEditBySession || {}).forEach((edit) => {
                if (!edit || edit.sessionId === collabSelfSessionId) return;
                if (String(edit.state || '') !== 'commit') return;
                if (edit.segmentId == null) return;
                const commitKey = `${edit.sessionId}:${edit.segmentId}:${edit.at || ''}`;
                if (collabSeenCommitKeys.has(commitKey)) return;
                collabSeenCommitKeys.add(commitKey);
                const m = findMemberBySession(edit.sessionId);
                const who = (m && m.displayName) ? m.displayName : '其他成員';
                applyRemoteCommit(edit, who);
            });
            renderCollabPresence();
            applyCollabFocusOutlines();
        }
    });

    setInterval(() => {
        if (!collabCurrentFileId) return;
        applyCollabFocusOutlines();
    }, 3000);

    const gridViewport = document.getElementById('editorGrid');
    if (gridViewport) {
        gridViewport.addEventListener('scroll', () => {
            if (collabCurrentFileId) applyCollabFocusOutlines();
        });
    }

    /** 將 ISO 時間字串轉成台灣格式（年/月/日 時:分）供變更紀錄顯示用 */
    function formatDateForLog(iso) {
        try {
            const d = new Date(iso);
            return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch (_) { return iso; }
    }

    /**
     * 將變更紀錄陣列渲染成 HTML 列表並更新展開按鈕。
     * @param {Object} opts - { listEl, expandBtn, display, totalCount, showAll, formatEntry(entry)=>string }
     */
    function renderChangeLogList(opts) {
        const { listEl, expandBtn, display, totalCount, showAll, formatEntry } = opts;
        if (!listEl) return;
        const emptyHtml = '<li style="color:#64748b;">尚無變更紀錄</li>';
        if (!display || display.length === 0) {
            listEl.innerHTML = emptyHtml;
        } else {
            listEl.innerHTML = display.map(e => '<li style="margin-bottom:0.2rem;">' + (formatEntry(e).replace(/</g, '&lt;')) + '</li>').join('');
        }
        if (listEl.style) listEl.style.maxHeight = showAll ? '300px' : '120px';
        if (expandBtn) {
            expandBtn.textContent = showAll ? '只看最近 20 筆' : '展開全部紀錄';
            expandBtn.style.visibility = (totalCount != null && totalCount <= 20) ? 'hidden' : 'visible';
        }
    }

    function makeBaseLogEntry(action, scope, overrides) {
        const base = {
            by: getCurrentUserName(),
            at: new Date().toISOString(),
            action: action || '',
            scope: scope || ''
        };
        return { ...base, ...(overrides || {}) };
    }

    async function appendProjectChangeLog(projectId, entry) {
        if (!projectId || !DBService) return;
        const project = await DBService.getProject(projectId);
        if (!project) return;
        const log = Array.isArray(project.changeLog) ? project.changeLog.slice() : [];
        log.push(entry);
        await DBService.patchProject(projectId, { changeLog: log });
    }

    async function appendTMChangeLog(tmId, entry) {
        if (!tmId || !DBService) return;
        const tm = await DBService.getTM(tmId);
        if (!tm) return;
        const log = Array.isArray(tm.changeLog) ? tm.changeLog.slice() : [];
        log.push(entry);
        await DBService.patchTM(tmId, { changeLog: log });
    }

    async function appendTBChangeLog(tbId, entry) {
        if (!tbId || !DBService) return;
        const tb = await DBService.getTB(tbId);
        if (!tb) return;
        const log = Array.isArray(tb.changeLog) ? tb.changeLog.slice() : [];
        log.push(entry);
        await DBService.patchTB(tbId, { changeLog: log });
    }

    // User Profile Feature
    const btnUserProfile = document.getElementById('btnUserProfile');
    if (btnUserProfile) {
        btnUserProfile.addEventListener('click', () => {
            if (window._tmsManagedIdentity) {
                // TMS 模式：顯示唯讀個人資訊卡
                showTmsProfileCard();
            } else {
                // Standalone 模式：開啟名稱設定 modal（原有行為）
                const currentName = localStorage.getItem('localCatUserProfile') || '';
                openNamingModal('setUserProfile', '設定使用者名稱', '請輸入您的名字 (將用於 TM 寫入紀錄)', null, currentName);
            }
        });

        // Initial setup（standalone 模式下若已設定名稱，顯示於左下角）
        const startName = localStorage.getItem('localCatUserProfile');
        if (startName && !window._tmsManagedIdentity) {
            document.getElementById('displayUserName').textContent = startName;
        }
    }

    // Editor Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const panelContents = document.querySelectorAll('.panel-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            panelContents.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            if (tabId) emitCollabFocus('control', tabId);
            if (tabId === 'tabNewTerm') {
                refreshNewTermPanel();
                const sel = window.getSelection();
                const selText = sel ? sel.toString().trim() : '';
                if (selText) {
                    const srcInput = document.getElementById('newTermSource');
                    if (srcInput && !srcInput.value.trim()) srcInput.value = selText;
                }
            }
        });
    });

    // 右欄：追蹤修訂區 ↔ 底部資訊區（Pointer 拖曳，位移與滑鼠一致）
    const catPanelResizerBottom = document.getElementById('catPanelResizerBottom');
    const livePanelFooter = document.getElementById('livePanelFooter');
    let ptrCatBottom = null;
    if (catPanelResizerBottom && livePanelFooter) {
        const endCatBottom = (e) => {
            if (ptrCatBottom && e.pointerId === ptrCatBottom.pid) {
                try { catPanelResizerBottom.releasePointerCapture(e.pointerId); } catch (_) {}
                ptrCatBottom = null;
                document.body.style.cursor = '';
            }
        };
        catPanelResizerBottom.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const tabCAT = document.getElementById('tabCAT');
            ptrCatBottom = {
                pid: e.pointerId,
                startY: e.clientY,
                startFooterH: livePanelFooter.offsetHeight,
                startTabCatH: tabCAT ? tabCAT.clientHeight : 0,
                startTrackH: catTrackChangePanel ? catTrackChangePanel.getBoundingClientRect().height : 0
            };
            catPanelResizerBottom.setPointerCapture(e.pointerId);
            document.body.style.cursor = 'ns-resize';
        });
        catPanelResizerBottom.addEventListener('pointermove', (e) => {
            if (!ptrCatBottom || e.pointerId !== ptrCatBottom.pid) return;
            e.preventDefault();
            const panel = document.querySelector('.editor-side-panel');
            if (!panel) return;
            const tabs = panel.querySelector('.panel-tabs');
            const tabBarH = tabs ? tabs.offsetHeight : 0;
            const rz = catPanelResizerBottom.offsetHeight || 6;
            const minFooter = 80;
            const minCatBlock = 130;
            const inner = panel.clientHeight - tabBarH;
            const maxFooter = Math.max(minFooter, inner - rz - minCatBlock);
            const dy = e.clientY - ptrCatBottom.startY;
            let nh = ptrCatBottom.startFooterH - dy;
            nh = Math.min(maxFooter, Math.max(minFooter, nh));
            livePanelFooter.style.height = `${nh}px`;
            /* 同步調整「追蹤修訂區」高度，使「比對↔追蹤」分界線不隨底部分割條移動 */
            const tabCAT = document.getElementById('tabCAT');
            if (tabCAT && catTrackChangePanel && ptrCatBottom.startTabCatH > 0) {
                const rzTop = catPanelResizerTop ? (catPanelResizerTop.offsetHeight || 6) : 6;
                const minConcord = 48;
                const minTrack = 56;
                const newTabH = tabCAT.clientHeight;
                const deltaTab = newTabH - ptrCatBottom.startTabCatH;
                let newTrackH = ptrCatBottom.startTrackH + deltaTab;
                const maxTrack = Math.max(minTrack, newTabH - minConcord - rzTop);
                newTrackH = Math.min(maxTrack, Math.max(minTrack, newTrackH));
                catTrackChangePanel.style.height = `${newTrackH}px`;
            }
        });
        catPanelResizerBottom.addEventListener('pointerup', endCatBottom);
        catPanelResizerBottom.addEventListener('pointercancel', endCatBottom);
    }

    const catPanelResizerTop = document.getElementById('catPanelResizerTop');
    const catTrackChangePanel = document.getElementById('catTrackChangePanel');
    let ptrCatTop = null;
    if (catPanelResizerTop && catTrackChangePanel) {
        const endCatTop = (e) => {
            if (ptrCatTop && e.pointerId === ptrCatTop.pid) {
                try { catPanelResizerTop.releasePointerCapture(e.pointerId); } catch (_) {}
                ptrCatTop = null;
                document.body.style.cursor = '';
            }
        };
        catPanelResizerTop.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            ptrCatTop = {
                pid: e.pointerId,
                startY: e.clientY,
                startH: catTrackChangePanel.getBoundingClientRect().height
            };
            catPanelResizerTop.setPointerCapture(e.pointerId);
            document.body.style.cursor = 'ns-resize';
        });
        catPanelResizerTop.addEventListener('pointermove', (e) => {
            if (!ptrCatTop || e.pointerId !== ptrCatTop.pid) return;
            e.preventDefault();
            const tab = document.getElementById('tabCAT');
            if (!tab) return;
            const minConcord = 48;
            const minTrack = 56;
            const rz = catPanelResizerTop.offsetHeight || 6;
            const maxTrack = Math.max(minTrack, tab.clientHeight - minConcord - rz);
            const dy = e.clientY - ptrCatTop.startY;
            // 與底部拖條一致：+dy 在 flex 側欄曾與手感相反，改為 −dy
            let nh = ptrCatTop.startH - dy;
            nh = Math.min(maxTrack, Math.max(minTrack, nh));
            catTrackChangePanel.style.height = `${nh}px`;
        });
        catPanelResizerTop.addEventListener('pointerup', endCatTop);
        catPanelResizerTop.addEventListener('pointercancel', endCatTop);
    }

    const tmSearchResultsEl = document.getElementById('tmSearchResults');
    if (tmSearchResultsEl) {
        tmSearchResultsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.cat-dup-toggle');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const wrap = btn.closest('.result-block');
            const panel = wrap && wrap.querySelector('.cat-tm-dupes-panel');
            if (!panel) return;
            const hidden = panel.classList.toggle('hidden');
            btn.textContent = hidden ? '▶' : '▼';
            btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        });
    }

    // ---- App State ----
    let colSettings = [];

    let activeView = 'viewDashboard';
    let currentProjectId = null;
    let workspaceNoteDraftTimer = null;
    let workspaceNoteRenameTargetId = null;
    let namingActionContext = null;
    let currentAssignFileId = null;
    let currentAssignFileName = '';
    window._tmsAssignableUsers = [];
    window._tmsCanAssign = false;
    window._tmsTranslatorOnly = false;
    window._fileAssigneesByFileId = {};
    let lastWordCountResult = null;
    let wordCountSelectedFileIds = [];
    const collabSelfSessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let collabCurrentFileId = null;
    let collabMembers = [];
    let collabFocusBySession = {};
    let collabEditBySession = {};
    let collabRowWriteHintTimers = {};
    let collabSeenCommitKeys = new Set();
    const pendingRemoteBySegId = new Map();

    // Repetition Confirmation Mode: 'after' | 'all' | 'none'
    let repMode = localStorage.getItem('catToolRepMode') || 'after';
    // Sync radio in view settings when modal opens
    const repModeRadio = () => document.querySelector(`input[name="repMode"][value="${repMode}"]`);
    if (repModeRadio()) repModeRadio().checked = true;
    document.querySelectorAll('input[name="repMode"]').forEach(r => {
        r.addEventListener('change', () => {
            repMode = r.value;
            localStorage.setItem('catToolRepMode', repMode);
        });
    });

    // Apply rep mode to all segments button
    const btnApplyRepMode = document.getElementById('btnApplyRepMode');
    if (btnApplyRepMode) {
        btnApplyRepMode.addEventListener('click', () => {
            currentSegmentsList.forEach(s => {
                s.repModeSeg = repMode;
            });
            renderEditorSegments();
            alert(`已將重複句段模式「${repMode === 'after' ? '確認其後' : repMode === 'all' ? '確認全部' : '停用'}」套用至所有句段。`);
        });
    } 

    // Extractor State
    let excelWorkbook = null;
    /** 供 Console 診斷用（見 docs/TEST_XLSX_RICH_TEXT.md）；非公開 API */
    if (typeof window !== 'undefined') {
        window.__CAT_GET_EXCEL_WORKBOOK = () => excelWorkbook;
    }
    let excelRawBuffer = null;
    let originalFileName = '';
    let excelDataBySheet = {};
    let debounceTimer = null;

    // --- Sort State ---
    const sortColSelect = document.getElementById('sortColSelect');
    const sortOrderSelect = document.getElementById('sortOrderSelect');

    function applySorting() {
        if(!currentSegmentsList || currentSegmentsList.length === 0) return;
        const colId = sortColSelect.value;
        const orderValue = sortOrderSelect.value; // 'asc', 'desc', 'len-asc', 'len-desc', 'text-asc', 'text-desc'
        
        currentSegmentsList.sort((a, b) => {
            let valA, valB;
            if (colId === 'col-id') {
                valA = a.globalId || a.rowIdx; valB = b.globalId || b.rowIdx;
            } else if (colId.startsWith('col-key-')) {
                const kIdx = parseInt(colId.replace('col-key-', ''), 10);
                valA = a.keys && a.keys[kIdx] ? a.keys[kIdx].toString() : '';
                valB = b.keys && b.keys[kIdx] ? b.keys[kIdx].toString() : '';
            } else if (colId === 'col-source') {
                valA = a.sourceText || ''; valB = b.sourceText || '';
            } else if (colId === 'col-target') {
                valA = a.targetText || ''; valB = b.targetText || '';
            }

            if (colId === 'col-source' || colId === 'col-target') {
                if (orderValue === 'len-asc') return valA.length - valB.length;
                if (orderValue === 'len-desc') return valB.length - valA.length;
                if (orderValue === 'text-asc') return valA.localeCompare(valB);
                if (orderValue === 'text-desc') return valB.localeCompare(valA);
            } else {
                if (orderValue === 'asc') return valA > valB ? 1 : (valA < valB ? -1 : 0);
                if (orderValue === 'desc') return valA < valB ? 1 : (valA > valB ? -1 : 0);
            }
            return 0;
        });
        renderEditorSegments();
    }

    if (sortColSelect && sortOrderSelect) {
        sortColSelect.addEventListener('change', () => {
            const val = sortColSelect.value;
            sortOrderSelect.innerHTML = '';
            if (val === 'col-source' || val === 'col-target') {
                sortOrderSelect.innerHTML = `
                    <option value="len-asc">長短 (短到長)</option>
                    <option value="len-desc">長短 (長到短)</option>
                    <option value="text-asc">文字 (升序)</option>
                    <option value="text-desc">文字 (降序)</option>
                `;
            } else {
                sortOrderSelect.innerHTML = `
                    <option value="asc">升序 (Asc)</option>
                    <option value="desc">降序 (Desc)</option>
                `;
            }
            applySorting();
        });
        sortOrderSelect.addEventListener('change', applySorting);
    }

    if (btnSortMenu && sortDropdown) {
        btnSortMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sortDropdown')) {
                sortDropdown.classList.remove('show');
            }
        });
    }

    // --- Init ---
    await loadDashboardData();

    // ==========================================
    // ROUTER
    // ==========================================
    function switchView(targetView) {
        activeView = targetView;
        navItems.forEach(nav => {
            if(nav.getAttribute('data-view') === targetView) nav.classList.add('active');
            else nav.classList.remove('active');
        });
        viewSections.forEach(sec => sec.classList.add('hidden'));
        document.getElementById(targetView).classList.remove('hidden');
        persistCatRoute();
    }

    function getSessionRouteStorageKey() {
        try {
            const s = (new URLSearchParams(window.location.search).get('catStorage') || 'offline').toLowerCase();
            return `catToolRouteV1_${s}`;
        } catch (_) {
            return 'catToolRouteV1_offline';
        }
    }

    function persistCatRoute() {
        try {
            const viewEditorEl = document.getElementById('viewEditor');
            const inEditor = !!(currentFileId != null && currentFileId !== '' && viewEditorEl && !viewEditorEl.classList.contains('hidden'));
            let payload = { view: 'viewDashboard' };
            if (inEditor) {
                payload = { view: 'viewEditor', fileId: currentFileId };
                if (currentProjectId != null && currentProjectId !== '') {
                    payload.projectId = currentProjectId;
                }
            } else if (activeView === 'viewProjectDetail' && currentProjectId != null) {
                payload = { view: 'viewProjectDetail', projectId: currentProjectId };
            } else if (activeView === 'viewTmDetail' && currentTmId != null) {
                payload = { view: 'viewTmDetail', tmId: currentTmId };
            } else if (activeView === 'viewTbDetail' && currentTbId != null) {
                payload = { view: 'viewTbDetail', tbId: currentTbId };
            } else if (['viewDashboard', 'viewProjects', 'viewTM', 'viewTB'].includes(activeView)) {
                payload = { view: activeView };
            } else {
                payload = { view: activeView || 'viewDashboard' };
            }
            sessionStorage.setItem(getSessionRouteStorageKey(), JSON.stringify(payload));
        } catch (_) { /* ignore */ }
    }

    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetView = item.getAttribute('data-view');
            const viewEditorEl = document.getElementById('viewEditor');
            const inEditor = !!(currentFileId && viewEditorEl && !viewEditorEl.classList.contains('hidden'));
            if (inEditor) {
                const ok = await ensureWorkspaceNoteLeaveResolved();
                if (!ok) return;
                leaveCollabForCurrentFile();
                currentFileId = null;
                currentSegmentsList = [];
                if (gridBody) gridBody.innerHTML = '';
                window.ActiveTmCache = [];
                window.ActiveTbTerms = [];
                sidebar.classList.remove('collapsed');
            }
            switchView(targetView);

            if(targetView === 'viewDashboard') await loadDashboardData();
            if(targetView === 'viewProjects') await loadProjectsList();
            if(targetView === 'viewTM') await loadTMList();
            if(targetView === 'viewTB') await loadTBList();
        });
    });

    window.addEventListener('beforeunload', (e) => {
        leaveCollabForCurrentFile();
        const viewEditorEl = document.getElementById('viewEditor');
        if (!currentFileId || !viewEditorEl || viewEditorEl.classList.contains('hidden')) return;
        // Auto-save notes, no custom modal possible on beforeunload
        autoSaveAllNotes().catch(() => {});
    });
    window.addEventListener('pagehide', () => {
        leaveCollabForCurrentFile();
        autoSaveAllNotes().catch(() => {});
    });

    // ==========================================
    // DATA LOADERS
    // ==========================================
    async function loadDashboardData() {
        const ps = await DBService.getProjects();
        const tms = await DBService.getTMs();
        const tbs = await DBService.getTBs();
        statProjects.textContent = ps.length;
        statTMs.textContent = tms.length;
        statTBs.textContent = tbs.length;

        // 最近使用的檔案（依 lastModified 由新到舊取前 10 筆）
        if (recentFilesList) {
            const recentFiles = await DBService.getRecentFiles(10);
            recentFilesList.innerHTML = '';
            if (!recentFiles.length) {
                recentFilesList.innerHTML = '<div style="color:#64748b; font-size:0.9rem;">尚未有任何檔案。</div>';
            } else {
                recentFiles.forEach(f => {
                    const row = document.createElement('div');
                    row.className = 'list-item-row';
                    row.innerHTML = `
                        <div class="list-item-info" data-file-id="${f.id}">
                            <div class="project-title">${f.name}</div>
                            <div class="project-meta">最後使用時間：${new Date(f.lastModified).toLocaleString()}</div>
                        </div>
                    `;
                    recentFilesList.appendChild(row);
                });
                // 點擊最近檔案直接開啟對應專案與檔案
                recentFilesList.querySelectorAll('.list-item-info').forEach(el => {
                    el.addEventListener('click', async () => {
                        const fileId = parseId(el.getAttribute('data-file-id'));
                        const file = await DBService.getFile(fileId);
                        if (!file) return;
                        await openProjectDetail(file.projectId);
                        await openEditor(fileId);
                    });
                });
            }
        }

        if (dashboardChangeLog) {
            const logsProjects = await DBService.getModuleLogs('projects', 0);
            const logsTm = await DBService.getModuleLogs('tm', 0);
            const logsTb = await DBService.getModuleLogs('tb', 0);
            const merged = [...logsProjects, ...logsTm, ...logsTb].sort((a, b) => new Date(b.at) - new Date(a.at));
            const display = dashboardChangeLogShowAll ? merged : merged.slice(0, 20);
            renderChangeLogList({
                listEl: dashboardChangeLog,
                expandBtn: btnDashboardChangeLogExpand,
                display,
                totalCount: merged.length,
                showAll: dashboardChangeLogShowAll,
                formatEntry: (e) => {
                    const at = formatDateForLog(e.at || '');
                    const who = (e.by || '').trim() || '—';
                    const name = e.entityName || '';
                    const action = e.action || '';
                    const module = e.module || '';
                    return `[${module}] ${name} ${action}；${who}，${at}`;
                }
            });
        }
    }

    // --- Projects CRUD (表格 + 勾選 + 刪除所選) ---
    function syncProjectsSelectAllLabel() {
        if (!projectsTableBody || !projectsSelectAll) return;
        const cbs = projectsTableBody.querySelectorAll('.project-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        projectsSelectAll.checked = total > 0 && checked === total;
        if (projectsSelectAllLabel) projectsSelectAllLabel.textContent = projectsSelectAll.checked ? '取消全選' : '全選';
    }

    async function loadProjectsList() {
        if (!projectsTableBody) return;
        const projects = await DBService.getProjects();
        lastProjectsList = projects;
        projectsTableBody.innerHTML = '';
        if (projects.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="6" style="padding:0.75rem; color:#64748b; font-size:0.9rem;">目前沒有專案，請點擊「新增專案」建立。</td>';
            projectsTableBody.appendChild(tr);
            syncProjectsSelectAllLabel();
        } else {
            projects.forEach((p, idx) => {
            const tr = document.createElement('tr');
            const nameEsc = (p.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const projSrcLangs = p.sourceLangs || [];
            const projTgtLangs = p.targetLangs || [];
            const projLangHtml = (projSrcLangs.length || projTgtLangs.length)
                ? `${langBadgeHtml(projSrcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(projTgtLangs)}`
                : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0; text-align:center;"><input type="checkbox" class="project-row-cb" data-id="${p.id}"></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${idx + 1}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">
                    <button class="link-btn resource-name" data-id="${p.id}" style="background:none;border:none;padding:0;color:var(--primary-color);cursor:pointer;text-decoration:underline;">${nameEsc}</button>
                </td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem;">${projLangHtml}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.85rem; color:#64748b;">${new Date(p.lastModified || p.createdAt).toLocaleString()}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; white-space:nowrap;">
                    <button class="secondary-btn btn-sm rename-btn" data-id="${p.id}" data-name="${(p.name || '').replace(/"/g, '&quot;')}">更名</button>
                </td>
            `;
            projectsTableBody.appendChild(tr);
            });
            syncProjectsSelectAllLabel();

            projectsTableBody.querySelectorAll('.resource-name').forEach(btn => {
            btn.addEventListener('click', () => {
                const idAttr = btn.getAttribute('data-id');
                const id = isTeamMode() ? idAttr : parseInt(idAttr, 10);
                openProjectDetail(id);
            });
        });
            projectsTableBody.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseId(btn.getAttribute('data-id'));
                    const name = (btn.getAttribute('data-name') || '').replace(/&quot;/g, '"');
                    openNamingModal('renameProject', '專案更名', '新專案名稱', id, name);
            });
        });
        }

        if (projectsChangeLog) {
            const logs = await DBService.getModuleLogs('projects', 0);
            const ordered = logs.sort((a, b) => new Date(b.at) - new Date(a.at));
            const display = projectsChangeLogShowAll ? ordered : ordered.slice(0, 20);
            renderChangeLogList({
                listEl: projectsChangeLog,
                expandBtn: btnProjectsChangeLogExpand,
                display,
                totalCount: ordered.length,
                showAll: projectsChangeLogShowAll,
                formatEntry: (e) => {
                    const at = formatDateForLog(e.at || '');
                    const who = (e.by || '').trim() || '—';
                    const name = e.entityName || '';
                    const action = e.action || '';
                    return `${name} ${action}；${who}，${at}`;
                }
            });
        }

    }

    if (projectsTableBody) {
        projectsTableBody.addEventListener('change', (e) => {
            if (e.target.matches('.project-row-cb')) syncProjectsSelectAllLabel();
        });
    }
    if (projectsSelectAll && projectsTableBody) {
        projectsSelectAll.addEventListener('change', () => {
            const checked = projectsSelectAll.checked;
            projectsTableBody.querySelectorAll('.project-row-cb').forEach(cb => { cb.checked = checked; });
            syncProjectsSelectAllLabel();
        });
    }
    if (btnProjectsDeleteSelected) {
    btnProjectsDeleteSelected.addEventListener('click', async () => {
            if (!projectsTableBody) return;
            const checkedIds = Array.from(projectsTableBody.querySelectorAll('.project-row-cb:checked'))
                .map(cb => parseId(cb.getAttribute('data-id')))
                .filter(id => id != null && id === id); // filter out NaN
        if (checkedIds.length === 0) {
                alert('請先勾選要刪除的專案。');
                return;
            }
            if (!confirm(`確定要刪除所選的 ${checkedIds.length} 個專案及其所有檔案與翻譯嗎？`)) return;
        for (const id of checkedIds) {
            const proj = await DBService.getProject(id);
            await DBService.deleteProject(id);
            const entry = makeBaseLogEntry('delete', 'project', {
                entityId: id,
                entityName: proj && proj.name ? proj.name : `Project #${id}`
            });
            await DBService.addModuleLog('projects', entry);
        }
            await loadProjectsList();
        });
    }

    // --- Project Detail (Files CRUD) ---
    async function openProjectDetail(projectId) {
        currentProjectId = projectId;
        const p = await DBService.getProject(projectId);
        if(!p) return switchView('viewProjects');
        detailProjectName.textContent = p.name;

        // 顯示專案語言標籤
        const langEl = document.getElementById('detailProjectLangs');
        if (langEl) {
            const srcLangs = p.sourceLangs || [];
            const tgtLangs = p.targetLangs || [];
            if (srcLangs.length || tgtLangs.length) {
                langEl.innerHTML = `<span style="color:#64748b; font-size:0.82rem;">語言對：</span>${langBadgeHtml(srcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tgtLangs)}`;
            } else {
                langEl.innerHTML = '<span style="color:#94a3b8; font-size:0.82rem;">（尚未設定語言對）</span>';
            }
        }

        switchView('viewProjectDetail');
        await updateProjectDetailChangeLog(p);
        await loadFilesList();
        await loadProjectTms(p);
        await loadProjectTbs(p);
    }

    btnBackToProjects.addEventListener('click', () => switchView('viewProjects'));

    async function commitProjectTmMounts(readTms, writeTms) {
        if (!currentProjectId) return;
        const project = await DBService.getProject(currentProjectId) || {};
        const prevRead = new Set(project.readTms || []);
        const prevWrite = new Set(project.writeTms || []);

        await DBService.updateProjectTMs(currentProjectId, readTms, writeTms);

        const nextRead = new Set(readTms);
        const nextWrite = new Set(writeTms);
        const allIds = new Set([...prevRead, ...prevWrite, ...nextRead, ...nextWrite]);
        const diffs = [];
        allIds.forEach(id => {
            const before = (prevRead.has(id) ? 'read' : '') + (prevWrite.has(id) ? 'write' : '');
            const after = (nextRead.has(id) ? 'read' : '') + (nextWrite.has(id) ? 'write' : '');
            if (before === after) return;
            const extra = { from: before || 'none', to: after || 'none', tmId: id };
            const action = after === 'none' ? 'detach' : before === 'none' ? 'attach' : 'update';
            diffs.push({ id, action, extra });
        });
        if (diffs.length) {
            for (const d of diffs) {
                const entry = makeBaseLogEntry(d.action, 'project-tm', {
                    entityId: d.id,
                    entityName: `TM #${d.id}`,
                    extra: d.extra
                });
                await appendProjectChangeLog(currentProjectId, entry);
                await DBService.addModuleLog('projects', entry);
            }
            const summary = makeBaseLogEntry('update', 'project-tm', {
                entityId: currentProjectId,
                entityName: project.name || `Project #${currentProjectId}`,
                extra: { changes: diffs.length }
            });
            await DBService.addModuleLog('projects', summary);
        }
        alert('翻譯記憶庫設定已儲存！');
    }

    async function commitProjectTbMounts(readTbs, writeTb) {
        if (!currentProjectId) return;
        const project = await DBService.getProject(currentProjectId) || {};
        const prevRead = new Set(project.readTbs || []);
        const prevWrite = project.writeTb ?? null;

        await DBService.updateProjectTBs(currentProjectId, readTbs, writeTb);

        const nextRead = new Set(readTbs);
        const allIds = new Set([...prevRead, ...nextRead, ...(prevWrite != null ? [prevWrite] : []), ...(writeTb != null ? [writeTb] : [])]);
        const diffs = [];
        allIds.forEach(id => {
            const beforeR = prevRead.has(id);
            const afterR = nextRead.has(id);
            const beforeW = prevWrite === id;
            const afterW = writeTb === id;
            const before = (beforeR ? 'read' : '') + (beforeW ? 'write' : '');
            const after = (afterR ? 'read' : '') + (afterW ? 'write' : '');
            if (before === after) return;
            const action = after === '' ? 'detach' : before === '' ? 'attach' : 'update';
            diffs.push({ id, action, extra: { from: before || 'none', to: after || 'none', tbId: id } });
        });
        if (diffs.length) {
            for (const d of diffs) {
                const entry = makeBaseLogEntry(d.action, 'project-tb', {
                    entityId: d.id,
                    entityName: `TB #${d.id}`,
                    extra: d.extra
                });
                await appendProjectChangeLog(currentProjectId, entry);
                await DBService.addModuleLog('projects', entry);
            }
        }
        alert('術語庫設定已儲存！');
    }

    /** 專案頁：僅顯示已掛載 TM（唯讀） */
    async function loadProjectTms(project) {
        const tms = await DBService.getTMs();
        const projectTmListBody = document.getElementById('projectTmListBody');
        if (!projectTmListBody) return;

        if (tms.length === 0) {
            projectTmListBody.innerHTML = '<tr><td colspan="4" style="padding:0.75rem; color:#64748b;">系統中目前沒有任何翻譯記憶庫。請至 TM 管理頁面新增。</td></tr>';
            return;
        }

        const readTms = new Set(project.readTms || []);
        const writeTms = new Set(project.writeTms || []);
        const mounted = tms.filter(tm => readTms.has(tm.id) || writeTms.has(tm.id));

        projectTmListBody.innerHTML = '';
        if (mounted.length === 0) {
            projectTmListBody.innerHTML = '<tr><td colspan="4" style="padding:0.75rem; color:#64748b;">尚未掛載任何 TM，請按「選擇 TM」。</td></tr>';
            return;
        }

        mounted.forEach(tm => {
            const tr = document.createElement('tr');
            const nameEsc = (tm.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const isRead = readTms.has(tm.id);
            const isWrite = writeTms.has(tm.id);
            const tmSrcLangs = tm.sourceLangs || [];
            const tmTgtLangs = tm.targetLangs || [];
            const tmLangHtml = (tmSrcLangs.length || tmTgtLangs.length)
                ? `${langBadgeHtml(tmSrcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tmTgtLangs)}`
                : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0;"><a href="#" class="tm-link" data-id="${tm.id}" style="color:var(--primary-color); text-decoration:underline; cursor:pointer;">${nameEsc}</a></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem;">${tmLangHtml}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${isRead ? '是' : '否'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${isWrite ? '是' : '否'}</td>
            `;
            projectTmListBody.appendChild(tr);
        });

        projectTmListBody.querySelectorAll('.tm-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = parseId(link.getAttribute('data-id'));
                openTmDetail(id);
                navItems.forEach(n => n.classList.remove('active'));
                const navTm = document.querySelector('.nav-item[data-view="viewTM"]');
                if (navTm) navTm.classList.add('active');
            });
        });
    }

    function fillProjectTmPickerTable(project) {
        const body = document.getElementById('projectTmPickerBody');
        if (!body) return;
        const readTms = new Set(project.readTms || []);
        const writeTms = new Set(project.writeTms || []);
        body.innerHTML = '';
        DBService.getTMs().then(tms => {
            if (!tms.length) {
                body.innerHTML = '<tr><td colspan="5" style="padding:0.75rem; color:#64748b;">系統中尚無 TM。</td></tr>';
                return;
            }
            tms.forEach(tm => {
                const isRead = readTms.has(tm.id);
                const isWrite = writeTms.has(tm.id);
                const nameEsc = (tm.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const tmSrcLangs = tm.sourceLangs || [];
                const tmTgtLangs = tm.targetLangs || [];
                const tmLangHtml = (tmSrcLangs.length || tmTgtLangs.length)
                    ? `${langBadgeHtml(tmSrcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tmTgtLangs)}`
                    : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;">${tm.id}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;">${nameEsc}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0; font-size:0.8rem;">${tmLangHtml}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;"><label style="display:flex; align-items:center; gap:0.25rem; cursor:pointer;"><input type="checkbox" class="tm-read-cb-picker" data-id="${tm.id}" ${isRead ? 'checked' : ''}> 讀取</label></td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;"><label style="display:flex; align-items:center; gap:0.25rem; cursor:pointer;"><input type="checkbox" class="tm-write-cb-picker" data-id="${tm.id}" ${isWrite ? 'checked' : ''}> 寫入</label></td>
                `;
                body.appendChild(tr);
            });
        });
    }

    async function openProjectTmPickerModal() {
        if (!currentProjectId) return;
        const modal = document.getElementById('projectTmPickerModal');
        if (!modal) return;
        const project = await DBService.getProject(currentProjectId) || {};
        fillProjectTmPickerTable(project);
        modal.classList.remove('hidden');
    }

    function closeProjectTmPickerModal() {
        document.getElementById('projectTmPickerModal')?.classList.add('hidden');
    }

    /** 專案頁：僅顯示已掛載 TB（唯讀） */
    async function loadProjectTbs(project) {
        const tbs = await DBService.getTBs();
        const projectTbListBody = document.getElementById('projectTbListBody');
        if (!projectTbListBody) return;

        if (tbs.length === 0) {
            projectTbListBody.innerHTML = '<tr><td colspan="4" style="padding:0.75rem; color:#64748b;">系統中目前沒有任何術語庫。請至 TB 管理頁面新增。</td></tr>';
            return;
        }

        const readTbs = new Set(project.readTbs || []);
        const writeTb = project.writeTb ?? null;
        const mounted = tbs.filter(tb => readTbs.has(tb.id) || writeTb === tb.id);

        projectTbListBody.innerHTML = '';
        if (mounted.length === 0) {
            projectTbListBody.innerHTML = '<tr><td colspan="4" style="padding:0.75rem; color:#64748b;">尚未掛載任何 TB，請按「選擇 TB」。</td></tr>';
            return;
        }

        mounted.forEach(tb => {
            const tr = document.createElement('tr');
            const nameEsc = (tb.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const isRead = readTbs.has(tb.id);
            const isWrite = writeTb === tb.id;
            const tbSrcLangs = tb.sourceLangs || [];
            const tbTgtLangs = tb.targetLangs || [];
            const tbLangHtml = (tbSrcLangs.length || tbTgtLangs.length)
                ? `${langBadgeHtml(tbSrcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tbTgtLangs)}`
                : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0;"><a href="#" class="tb-proj-link" data-id="${tb.id}" style="color:var(--primary-color); text-decoration:underline; cursor:pointer;">${nameEsc}</a></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem;">${tbLangHtml}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${isRead ? '是' : '否'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${isWrite ? '是' : '否'}</td>
            `;
            projectTbListBody.appendChild(tr);
        });

        projectTbListBody.querySelectorAll('.tb-proj-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = parseId(link.getAttribute('data-id'));
                openTbDetail(id);
                navItems.forEach(n => n.classList.remove('active'));
                const navTb = document.querySelector('.nav-item[data-view="viewTB"]');
                if (navTb) navTb.classList.add('active');
            });
        });
    }

    function fillProjectTbPickerTable(project) {
        const body = document.getElementById('projectTbPickerBody');
        if (!body) return;
        const readTbs = new Set(project.readTbs || []);
        const writeTb = project.writeTb ?? null;
        body.innerHTML = '';
        DBService.getTBs().then(tbs => {
            if (!tbs.length) {
                body.innerHTML = '<tr><td colspan="5" style="padding:0.75rem; color:#64748b;">系統中尚無 TB。</td></tr>';
                return;
            }
            tbs.forEach(tb => {
                const isRead = readTbs.has(tb.id);
                const isWrite = writeTb === tb.id;
                const nameEsc = (tb.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const tbSrcLangs = tb.sourceLangs || [];
                const tbTgtLangs = tb.targetLangs || [];
                const tbLangHtml = (tbSrcLangs.length || tbTgtLangs.length)
                    ? `${langBadgeHtml(tbSrcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tbTgtLangs)}`
                    : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;">${tb.id}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;">${nameEsc}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0; font-size:0.8rem;">${tbLangHtml}</td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;"><label style="display:flex; align-items:center; gap:0.25rem; cursor:pointer;"><input type="checkbox" class="tb-read-cb-picker" data-id="${tb.id}" ${isRead ? 'checked' : ''}> 讀取</label></td>
                    <td style="padding:0.45rem; border:1px solid #e2e8f0;"><label style="display:flex; align-items:center; gap:0.25rem; cursor:pointer;"><input type="radio" name="tb-write-radio-picker" class="tb-write-radio-picker" value="${tb.id}" ${isWrite ? 'checked' : ''}> 寫入</label></td>
                `;
                body.appendChild(tr);
            });
        });
    }

    async function openProjectTbPickerModal() {
        if (!currentProjectId) return;
        const modal = document.getElementById('projectTbPickerModal');
        if (!modal) return;
        const project = await DBService.getProject(currentProjectId) || {};
        fillProjectTbPickerTable(project);
        modal.classList.remove('hidden');
    }

    function closeProjectTbPickerModal() {
        document.getElementById('projectTbPickerModal')?.classList.add('hidden');
    }

    document.getElementById('btnOpenProjectTmPicker')?.addEventListener('click', () => { openProjectTmPickerModal(); });
    document.getElementById('btnOpenProjectTbPicker')?.addEventListener('click', () => { openProjectTbPickerModal(); });
    document.getElementById('btnCloseProjectTmPicker')?.addEventListener('click', closeProjectTmPickerModal);
    document.getElementById('btnProjectTmPickerCancel')?.addEventListener('click', closeProjectTmPickerModal);
    document.getElementById('btnCloseProjectTbPicker')?.addEventListener('click', closeProjectTbPickerModal);
    document.getElementById('btnProjectTbPickerCancel')?.addEventListener('click', closeProjectTbPickerModal);

    document.getElementById('btnProjectTmPickerConfirm')?.addEventListener('click', async () => {
        if (!currentProjectId) return;
        const readTms = [];
        const writeTms = [];
        document.querySelectorAll('.tm-read-cb-picker:checked').forEach(cb => readTms.push(parseId(cb.getAttribute('data-id'))));
        document.querySelectorAll('.tm-write-cb-picker:checked').forEach(cb => writeTms.push(parseId(cb.getAttribute('data-id'))));
        await commitProjectTmMounts(readTms, writeTms);
        closeProjectTmPickerModal();
        const p = await DBService.getProject(currentProjectId);
        if (p) await loadProjectTms(p);
    });

    document.getElementById('btnProjectTbPickerConfirm')?.addEventListener('click', async () => {
        if (!currentProjectId) return;
        const readTbs = [];
        document.querySelectorAll('.tb-read-cb-picker:checked').forEach(cb => readTbs.push(parseId(cb.getAttribute('data-id'))));
        const writeRadio = document.querySelector('input[name="tb-write-radio-picker"]:checked');
        const writeTb = writeRadio ? parseId(writeRadio.value) : null;
        await commitProjectTbMounts(readTbs, writeTb);
        closeProjectTbPickerModal();
        const p = await DBService.getProject(currentProjectId);
        if (p) await loadProjectTbs(p);
    });

    if (projectFilesSelectAll && filesListBody) {
        projectFilesSelectAll.addEventListener('change', () => {
            const checked = projectFilesSelectAll.checked;
            filesListBody.querySelectorAll('.project-file-row-cb').forEach(cb => { cb.checked = checked; });
            syncProjectFilesSelectAll();
        });
    }
    if (filesListBody) {
        filesListBody.addEventListener('change', (e) => {
            if (e.target.matches('.project-file-row-cb')) syncProjectFilesSelectAll();
        });
    }

    async function loadFilesList() {
        if(!currentProjectId || !filesListBody) return;
        if (isTeamMode()) {
            await requestProjectAssignments(currentProjectId);
        } else {
            window._fileAssigneesByFileId = {};
        }
        const files = await DBService.getFiles(currentProjectId);
        filesListBody.innerHTML = '';
        if(files.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="7" style="padding:0.75rem; color:#64748b;">此專案內尚無檔案。請點擊上方按鈕匯入檔案。</td>';
            filesListBody.appendChild(tr);
            await loadWorkspaceNotesList();
            return;
        }

        files.forEach((f, idx) => {
            const tr = document.createElement('tr');
            const nameEsc = (f.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const modStr = f.lastModified ? new Date(f.lastModified).toLocaleString('zh-TW') : '—';
            const isMqxliff = (f.name || '').toLowerCase().endsWith('.mqxliff');
            const roleLabels = { 'T_ALLOW_R1': 'T (R1 - ✓ )', 'T_DENY_R1': 'T (R1 - ✖)', 'T': 'T (R1 - ✓ )', R1: 'Reviewer 1', R2: 'Reviewer 2' };
            const roleStr = isMqxliff && f.defaultMqRole ? (roleLabels[f.defaultMqRole] || f.defaultMqRole) : (isMqxliff ? '—' : '');

            // 語言對顯示（若原始檔語言對不同則附加提示）
            const fileSrc = f.sourceLang || '';
            const fileTgt = f.targetLang || '';
            let fileLangHtml = '';
            if (fileSrc || fileTgt) {
                fileLangHtml = `${langBadgeHtml([fileSrc].filter(Boolean))} <span style="color:#94a3b8;">→</span> ${langBadgeHtml([fileTgt].filter(Boolean))}`;
                const origSrc = f.originalSourceLang || '';
                const origTgt = f.originalTargetLang || '';
                const mismatch = (origSrc && origSrc.toLowerCase() !== fileSrc.toLowerCase()) ||
                                 (origTgt && origTgt.toLowerCase() !== fileTgt.toLowerCase());
                if (mismatch) {
                    fileLangHtml += ` <span style="color:#f59e0b; font-size:0.75rem; cursor:help;" title="原始檔語言對：${origSrc} → ${origTgt}">⚠</span>`;
                }
            } else {
                fileLangHtml = '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
            }

            tr.setAttribute('data-file-id', f.id);
            const aid = String(f.id);
            const assignees = (window._fileAssigneesByFileId && window._fileAssigneesByFileId[aid]) || [];
            const assignPlain = assignees.length ? assignees.join('、') : '';
            const assignCell = assignees.length
                ? assignees.map((n) => String(n).replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('、')
                : '—';
            const assignTitle = assignPlain.replace(/"/g, '&quot;');
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0; text-align:center;"><input type="checkbox" class="project-file-row-cb" data-id="${f.id}"></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; width:60px;">${idx + 1}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;"><a href="#" class="edit-file-btn" data-id="${f.id}" style="color:var(--primary-color); text-decoration:underline; cursor:pointer;">${nameEsc}</a></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem;">${fileLangHtml}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; width:80px;">${roleStr}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem; color:#334155; max-width:220px; overflow:hidden; text-overflow:ellipsis;" title="${assignTitle}">${assignCell}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">${modStr}</td>
            `;
            filesListBody.appendChild(tr);
        });

        filesListBody.querySelectorAll('.edit-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const idAttr = btn.getAttribute('data-id');
                if (!idAttr) return;
                // local mode: Dexie PK is integer; team mode: string UUID
                const id = isTeamMode() ? idAttr : parseInt(idAttr);
                openEditor(id);
            });
        });
        syncProjectFilesSelectAll();
        await loadWorkspaceNotesList();
    }

    function getSelectedProjectFileIds() {
        if (!filesListBody) return [];
        return Array.from(filesListBody.querySelectorAll('.project-file-row-cb:checked'))
            .map(cb => cb.getAttribute('data-id'))
            .filter(Boolean);
    }

    function closeWordCountModal() {
        if (wordCountModal) wordCountModal.classList.add('hidden');
    }

    function closeSplitAssignModal() {
        if (splitAssignModal) splitAssignModal.classList.add('hidden');
    }

    async function refreshWordCountReportHistory() {
        if (!wordCountReportHistory || !currentProjectId || !DBService.listWordCountReports) return;
        const list = await DBService.listWordCountReports(currentProjectId);
        if (!list.length) {
            wordCountReportHistory.innerHTML = '<li style="color:#64748b;">尚無儲存的報告</li>';
            return;
        }
        wordCountReportHistory.innerHTML = list.map((r) => {
            const at = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-TW') : '';
            const lab = (r.label || '').replace(/</g, '&lt;');
            return `<li style="margin-bottom:0.25rem;"><span style="color:#64748b;">${at}</span> — ${lab}</li>`;
        }).join('');
    }

    async function openWordCountModalWithSelection() {
        const ids = getSelectedProjectFileIds();
        if (!ids.length) {
            alert('請先勾選要納入分析的檔案。');
            return;
        }
        if (!currentProjectId || !wordCountModal || !wordCountTmCheckboxes) return;
        wordCountSelectedFileIds = ids.slice();
        const p = await DBService.getProject(currentProjectId);
        const readTms = (p && p.readTms) ? p.readTms : [];
        const allTms = await DBService.getTMs();
        wordCountTmCheckboxes.innerHTML = readTms.length ? readTms.map((tid) => {
            const tm = allTms.find((t) => String(t.id) === String(tid));
            const name = tm ? (tm.name || `TM #${tid}`) : `TM #${tid}`;
            const safe = String(name).replace(/</g, '&lt;');
            return `<label style="display:flex; align-items:center; gap:0.35rem; font-size:0.86rem; cursor:pointer;">
                <input type="checkbox" class="word-count-tm-cb" value="${tid}" checked> ${safe}
            </label>`;
        }).join('') : '<span style="color:#64748b; font-size:0.86rem;">專案尚未掛載讀取 TM（仍可依句段與檔內重複分析）</span>';
        if (wordCountResultBody) wordCountResultBody.innerHTML = '';
        lastWordCountResult = null;
        await refreshWordCountReportHistory();
        wordCountModal.classList.remove('hidden');
    }

    async function runWordCountAnalysis() {
        if (!window.WordCountEngine || !wordCountSelectedFileIds.length) {
            alert('無可分析的檔案。');
            return;
        }
        const includeLocked = !!(wordCountIncludeLocked && wordCountIncludeLocked.checked);
        let tmNormList = [];
        if (wordCountTmCheckboxes) {
            const checked = wordCountTmCheckboxes.querySelectorAll('.word-count-tm-cb:checked');
            for (const cb of checked) {
                const tmId = cb.value;
                if (!tmId) continue;
                const segs = await DBService.getTMSegments(tmId);
                segs.forEach((s) => {
                    const n = WordCountEngine.normKey(s.sourceText);
                    if (n) tmNormList.push(n);
                });
            }
        }
        let allSegments = [];
        for (const fid of wordCountSelectedFileIds) {
            const segs = await DBService.getSegmentsByFile(fid);
            allSegments = allSegments.concat(segs);
        }
        lastWordCountResult = WordCountEngine.analyze({
            segments: allSegments,
            tmSourcesNormalized: tmNormList,
            includeLocked
        });
        if (wordCountResultBody) {
            const t = lastWordCountResult.totals || {};
            const head = `<tr style="background:#f8fafc;"><td style="padding:0.45rem; border:1px solid #e2e8f0; font-weight:600;">分析範圍總計（略過鎖定後）</td>
                <td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${t.segmentsAnalyzed != null ? t.segmentsAnalyzed : '—'}</td>
                <td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${t.weightedExcludingSkipped != null ? t.weightedExcludingSkipped : '—'}</td></tr>`;
            const body = (lastWordCountResult.rows || []).map((r) =>
                `<tr><td style="padding:0.45rem; border:1px solid #e2e8f0;">${r.label}</td>
                <td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${r.segments}</td>
                <td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${r.weighted}</td></tr>`
            ).join('');
            wordCountResultBody.innerHTML = head + body;
        }
    }

    async function saveWordCountReport() {
        if (!lastWordCountResult || !currentProjectId) {
            alert('請先執行分析。');
            return;
        }
        const label = new Date().toLocaleString('zh-TW');
        await DBService.addWordCountReport({
            projectId: currentProjectId,
            label,
            payload: {
                fileIds: wordCountSelectedFileIds.slice(),
                result: lastWordCountResult,
                includeLocked: !!(wordCountIncludeLocked && wordCountIncludeLocked.checked)
            }
        });
        await refreshWordCountReportHistory();
        alert('已儲存至本機報告紀錄。');
    }

    const SPLIT_HINT_QUOTA_EPS = 1e-4;

    function fmtSplitHintNum(x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
        return String(Math.round(x * 100) / 100);
    }

    function computeSplitHintQuotas(totalWeighted, n, filledValues) {
        const eps = SPLIT_HINT_QUOTA_EPS;
        const T = totalWeighted;
        const filled = [];
        for (let i = 0; i < n; i++) {
            filled.push(i < filledValues.length ? filledValues[i] : null);
        }
        let S = 0;
        const blanks = [];
        for (let i = 0; i < n; i++) {
            const v = filled[i];
            if (v === null || v === undefined || Number.isNaN(v)) {
                blanks.push(i);
            } else {
                S += v;
            }
        }
        const B = blanks.length;
        const quotas = new Array(n);

        if (B === 0) {
            if (Math.abs(S - T) > eps) {
                return { error: `已填配額加總 ${fmtSplitHintNum(S)} 須等於總加權 ${fmtSplitHintNum(T)}（容許誤差 ${eps}）。` };
            }
            for (let i = 0; i < n; i++) quotas[i] = filled[i];
            for (let i = 0; i < n - 1; i++) {
                if (quotas[i] <= eps) {
                    return { error: `第 ${i + 1} 份的目標加權必須大於 ${eps}。` };
                }
            }
            return { quotas };
        }

        const R = T - S;
        if (R < -eps) {
            return { error: `已填配額加總 ${fmtSplitHintNum(S)} 超過總加權 ${fmtSplitHintNum(T)}。` };
        }
        if (R <= eps && B > 0) {
            return { error: '已填配額加總已達（或超過）總加權，無法再為留白份量分配剩餘配額。' };
        }

        for (let i = 0; i < n; i++) {
            if (blanks.indexOf(i) === -1) quotas[i] = filled[i];
        }
        const Bcnt = B;
        const per = R / Bcnt;
        let acc = 0;
        for (let j = 0; j < Bcnt - 1; j++) {
            const idx = blanks[j];
            quotas[idx] = per;
            acc += per;
        }
        quotas[blanks[Bcnt - 1]] = R - acc;

        for (let i = 0; i < n - 1; i++) {
            if (quotas[i] <= eps) {
                return { error: `第 ${i + 1} 份的目標加權必須大於 ${eps}（含留白均分結果）。` };
            }
        }
        return { quotas };
    }

    function partitionFlatByQuotas(flat, quotas, n) {
        const slices = Array.from({ length: n }, () => []);
        if (!flat || !flat.length) return slices;
        const eps = SPLIT_HINT_QUOTA_EPS;
        let fi = 0;
        for (let p = 0; p < n; p++) {
            const target = quotas[p];
            let sum = 0;
            while (fi < flat.length) {
                const w = flat[fi].weight || 0;
                const lastPart = (p === n - 1);
                if (!lastPart && sum > 0 && sum + w > target + eps) break;
                slices[p].push(flat[fi++]);
                sum += w;
            }
        }
        while (fi < flat.length) {
            slices[n - 1].push(flat[fi++]);
        }
        return slices;
    }

    function rangeTextFromSlice(slice) {
        if (!slice || !slice.length) return '—';
        const byFile = {};
        slice.forEach((item) => {
            if (!byFile[item.fileName]) byFile[item.fileName] = { min: item.rowInFile, max: item.rowInFile };
            else {
                byFile[item.fileName].min = Math.min(byFile[item.fileName].min, item.rowInFile);
                byFile[item.fileName].max = Math.max(byFile[item.fileName].max, item.rowInFile);
            }
        });
        return Object.keys(byFile).map((fn) => {
            const o = byFile[fn];
            return o.min === o.max ? `${fn}：第 ${o.min} 句` : `${fn}：第 ${o.min}–${o.max} 句`;
        }).join('<br>');
    }

    function readSplitHintFilledValues(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const el = document.getElementById(`splitHintQuotaInput${i}`);
            if (!el) {
                out.push(null);
                continue;
            }
            const raw = String(el.value != null ? el.value : '').trim();
            if (raw === '') {
                out.push(null);
                continue;
            }
            const num = parseFloat(raw);
            out.push(Number.isFinite(num) ? num : null);
        }
        return out;
    }

    function renderSplitHintQuotaRows(n) {
        if (!splitHintQuotaContainer) return;
        let html = '<div style="display:flex; flex-direction:column; gap:0.35rem;">';
        for (let i = 0; i < n; i++) {
            html += `<div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <label style="min-width:4rem;">第 ${i + 1} 份</label>
                <input type="number" id="splitHintQuotaInput${i}" step="any" min="0" placeholder="留白均分" style="flex:1; min-width:8rem; padding:0.3rem 0.45rem; border:1px solid #e2e8f0; border-radius:6px;" />
            </div>`;
        }
        html += '</div>';
        splitHintQuotaContainer.innerHTML = html;
    }

    async function runSplitHintWeightedPreview(fileIds, parts) {
        const wrap = splitAssignTableWrap;
        if (!wrap || !fileIds || !fileIds.length) return;
        const n = Math.max(2, Math.min(99, parseInt(parts, 10) || 2));
        wrap.innerHTML = '<div style="padding:0.75rem;color:#64748b;">計算中…</div>';

        const fileRows = [];
        for (const fid of fileIds) {
            const segs = await DBService.getSegmentsByFile(fid);
            const file = await DBService.getFile(fid);
            fileRows.push({
                name: file && file.name ? file.name : String(fid),
                segs: segs || []
            });
        }
        const flat = [];
        let totalW = 0;
        fileRows.forEach((fr) => {
            fr.segs.forEach((s, i) => {
                const w = (window.WordCountEngine && window.WordCountEngine.weightedUnits)
                    ? window.WordCountEngine.weightedUnits(s.sourceText || '')
                    : 0;
                totalW += w;
                flat.push({ fileName: fr.name, rowInFile: i + 1, weight: w });
            });
        });
        const totalSegs = flat.length;

        const filledValues = readSplitHintFilledValues(n);
        const qres = computeSplitHintQuotas(totalW, n, filledValues);
        if (qres.error) {
            const errText = String(qres.error).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            wrap.innerHTML = `<div style="padding:0.75rem; color:#dc2626; font-size:0.88rem;">${errText}</div>`;
            return;
        }

        const partSlices = partitionFlatByQuotas(flat, qres.quotas, n);

        let html = `<p style="margin:0 0 0.5rem 0; font-size:0.85rem; color:#64748b;">勾選檔案合計 <strong>${totalSegs}</strong> 句、加權約 <strong>${fmtSplitHintNum(totalW)}</strong>；分為 <strong>${n}</strong> 份（僅供參考）：</p>`;
        html += '<table class="resource-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:#f1f5f9;">';
        html += '<th style="text-align:left; padding:0.45rem; border:1px solid #e2e8f0;">份次</th>';
        html += '<th style="text-align:right; padding:0.45rem; border:1px solid #e2e8f0;">目標加權</th>';
        html += '<th style="text-align:right; padding:0.45rem; border:1px solid #e2e8f0;">實際加權</th>';
        html += '<th style="text-align:right; padding:0.45rem; border:1px solid #e2e8f0;">句段數</th>';
        html += '<th style="text-align:left; padding:0.45rem; border:1px solid #e2e8f0;">範圍</th></tr></thead><tbody>';

        for (let p = 0; p < n; p++) {
            const slice = partSlices[p] || [];
            const actualW = slice.reduce((acc, it) => acc + (it.weight || 0), 0);
            const cnt = slice.length;
            const rangeText = rangeTextFromSlice(slice);
            const target = qres.quotas[p];
            html += `<tr><td style="padding:0.45rem; border:1px solid #e2e8f0;">第 ${p + 1} 份</td>`;
            html += `<td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${fmtSplitHintNum(target)}</td>`;
            html += `<td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${fmtSplitHintNum(actualW)}</td>`;
            html += `<td style="padding:0.45rem; border:1px solid #e2e8f0; text-align:right;">${cnt}</td>`;
            html += `<td style="padding:0.45rem; border:1px solid #e2e8f0; font-size:0.82rem;">${rangeText}</td></tr>`;
        }
        html += '</tbody></table>';
        wrap.innerHTML = html;
    }

    function openSplitHintModal() {
        const ids = getSelectedProjectFileIds();
        if (!ids.length) {
            alert('請先勾選檔案。');
            return;
        }
        const raw = splitHintPartsInput ? parseInt(splitHintPartsInput.value, 10) : 2;
        const n = Math.max(2, Math.min(99, Number.isFinite(raw) ? raw : 2));
        if (splitHintPartsInput) splitHintPartsInput.value = String(n);
        renderSplitHintQuotaRows(n);
        if (splitAssignTableWrap) {
            splitAssignTableWrap.innerHTML = '<div style="padding:0.75rem; color:#64748b; font-size:0.88rem;">設定份數與選填配額後，按「開始計算」。</div>';
        }
        if (splitAssignModal) splitAssignModal.classList.remove('hidden');
    }

    if (btnProjectToolbarAssign) {
        btnProjectToolbarAssign.addEventListener('click', async () => {
            const cbs = Array.from(filesListBody ? filesListBody.querySelectorAll('.project-file-row-cb:checked') : []);
            if (cbs.length !== 1) {
                alert('請僅勾選一個檔案以進行指派。');
                return;
            }
            const id = cbs[0].getAttribute('data-id');
            const tr = cbs[0].closest('tr');
            const nameLink = tr && tr.querySelector('.edit-file-btn');
            const name = nameLink ? nameLink.textContent : '';
            if (!id) return;
            await openFileAssignModal(id, name);
        });
    }
    if (btnProjectToolbarDelete) {
        btnProjectToolbarDelete.addEventListener('click', async () => {
            const ids = getSelectedProjectFileIds();
            if (!ids.length) {
                alert('請先勾選要刪除的檔案。');
                return;
            }
            if (!confirm(`確定要從專案移除 ${ids.length} 個檔案並刪除其所有翻譯資料嗎？`)) return;
            for (const id of ids) {
                const file = await DBService.getFile(id);
                await DBService.deleteFile(id);
                const entry = makeBaseLogEntry('delete', 'project-file', {
                    entityId: id,
                    entityName: file && file.name ? file.name : `File #${id}`
                });
                if (currentProjectId) {
                    await appendProjectChangeLog(currentProjectId, entry);
                    await DBService.addModuleLog('projects', entry);
                }
            }
            await loadFilesList();
        });
    }
    if (btnProjectWordCount) {
        btnProjectWordCount.addEventListener('click', () => { openWordCountModalWithSelection(); });
    }
    if (btnProjectSplitAssign) {
        btnProjectSplitAssign.addEventListener('click', () => { openSplitHintModal(); });
    }
    if (btnCloseWordCountModal) btnCloseWordCountModal.addEventListener('click', closeWordCountModal);
    if (btnDismissWordCountModal) btnDismissWordCountModal.addEventListener('click', closeWordCountModal);
    if (wordCountModal) {
        wordCountModal.addEventListener('click', (e) => { if (e.target === wordCountModal) closeWordCountModal(); });
    }
    if (btnRunWordCount) btnRunWordCount.addEventListener('click', () => { runWordCountAnalysis(); });
    if (btnSaveWordCountReport) btnSaveWordCountReport.addEventListener('click', () => { saveWordCountReport(); });
    if (btnCloseSplitAssignModal) btnCloseSplitAssignModal.addEventListener('click', closeSplitAssignModal);
    if (btnCancelSplitAssign) btnCancelSplitAssign.addEventListener('click', closeSplitAssignModal);
    if (splitAssignModal) {
        splitAssignModal.addEventListener('click', (e) => { if (e.target === splitAssignModal) closeSplitAssignModal(); });
    }
    if (btnSplitHintRun) {
        btnSplitHintRun.addEventListener('click', () => {
            const ids = getSelectedProjectFileIds();
            if (!ids.length) {
                alert('請先勾選檔案。');
                return;
            }
            const raw = splitHintPartsInput ? parseInt(splitHintPartsInput.value, 10) : 2;
            const n = Math.max(2, Math.min(99, Number.isFinite(raw) ? raw : 2));
            btnSplitHintRun.disabled = true;
            runSplitHintWeightedPreview(ids, n).finally(() => {
                btnSplitHintRun.disabled = false;
            });
        });
    }
    if (splitHintPartsInput) {
        splitHintPartsInput.addEventListener('input', () => {
            const raw = parseInt(splitHintPartsInput.value, 10);
            const n = Math.max(2, Math.min(99, Number.isFinite(raw) ? raw : 2));
            renderSplitHintQuotaRows(n);
        });
    }
    (function initHighMatchGuardModal() {
        function closeHm() {
            if (highMatchGuardModal) highMatchGuardModal.classList.add('hidden');
            const r = highMatchModalPromiseResolver;
            highMatchModalPromiseResolver = null;
            if (r) r(false);
        }
        function okHm() {
            if (highMatchGuardModal) highMatchGuardModal.classList.add('hidden');
            const r = highMatchModalPromiseResolver;
            highMatchModalPromiseResolver = null;
            if (r) r(true);
        }
        if (btnHighMatchGuardOk) btnHighMatchGuardOk.addEventListener('click', okHm);
        if (btnHighMatchGuardCancel) btnHighMatchGuardCancel.addEventListener('click', closeHm);
        if (btnHighMatchGuardClose) btnHighMatchGuardClose.addEventListener('click', closeHm);
        if (highMatchGuardModal) {
            highMatchGuardModal.addEventListener('click', (e) => { if (e.target === highMatchGuardModal) closeHm(); });
        }
    })();

    function syncProjectWorkspaceNotesSelectAll() { /* removed - workspace notes table replaced by shared info */ }

    /** Stub for legacy references (workspace notes table replaced by shared info panel) */
    async function loadWorkspaceNotesList() { /* no-op: replaced by shared info */ }

    // ---- Project page: shared info button ----
    (function initProjectSharedInfoBtn() {
        document.addEventListener('click', async (e) => {
            if (e.target && e.target.id === 'btnOpenSharedInfo') {
                if (!currentProjectId) return;
                await openSharedInfoModal(currentProjectId);
            }
        });
    })();

    async function updateProjectDetailChangeLog(project) {
        if (!projectDetailChangeLog) return;
        const log = Array.isArray(project && project.changeLog) ? project.changeLog : [];
        const ordered = log.slice().sort((a, b) => new Date(b.at) - new Date(a.at));
        const display = projectDetailChangeLogShowAll ? ordered : ordered.slice(0, 20);
        renderChangeLogList({
            listEl: projectDetailChangeLog,
            expandBtn: btnProjectDetailChangeLogExpand,
            display,
            totalCount: ordered.length,
            showAll: projectDetailChangeLogShowAll,
            formatEntry: (e) => {
                const at = formatDateForLog(e.at || '');
                const who = (e.by || '').trim() || '—';
                const action = e.action || '';
                return `${action}；${who}，${at}`;
            }
        });
    }

    function syncProjectFilesSelectAll() {
        if (!filesListBody || !projectFilesSelectAll) return;
        const cbs = filesListBody.querySelectorAll('.project-file-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        projectFilesSelectAll.checked = total > 0 && checked === total;
    }

    // --- TMs & TBs CRUD (表格列表 + 勾選 + 刪除所選) ---
    // itemsOverride: 可選，傳入時使用此陣列取代從 DB 載入（用於 TB 搜尋篩選）
    async function baseResourceList(loaderMethod, deleteMethod, listContainerElement, itemsOverride) {
        const items = itemsOverride !== undefined ? itemsOverride : await DBService[loaderMethod]();
        if (loaderMethod === 'getTMs') lastTmListItems = items;
        listContainerElement.innerHTML = '';
        if (items.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="6" style="padding:0.75rem; border:1px solid #e2e8f0; color:#64748b; font-size:0.9rem;">${itemsOverride !== undefined ? '沒有符合搜尋條件的術語庫。' : '目前沒有資料。'}</td>`;
            listContainerElement.appendChild(emptyRow);
            if (loaderMethod === 'getTMs' && syncTmListSelectAllLabel) syncTmListSelectAllLabel();
            if (loaderMethod === 'getTBs' && syncTbListSelectAllLabel) syncTbListSelectAllLabel();
            return;
        }

        items.forEach(it => {
            const tr = document.createElement('tr');
            const nameEsc = (it.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const srcLangs = it.sourceLangs || [];
            const tgtLangs = it.targetLangs || [];
            const langHtml = (srcLangs.length || tgtLangs.length)
                ? `${langBadgeHtml(srcLangs)} <span style="color:#94a3b8;">→</span> ${langBadgeHtml(tgtLangs)}`
                : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0; text-align:center;"><input type="checkbox" class="resource-row-cb" data-id="${it.id}"></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; width:60px;">${it.id}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0;">
                    <button class="link-btn resource-name" data-id="${it.id}" style="background:none;border:none;padding:0;color:var(--primary-color);cursor:pointer;text-decoration:underline;">${nameEsc}</button>
                </td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.82rem;">${langHtml}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; font-size:0.85rem; color:#64748b;">${new Date(it.createdAt).toLocaleDateString()}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; white-space:nowrap;">
                    <button class="secondary-btn btn-sm manage-btn" data-id="${it.id}">更名</button>
                </td>
            `;
            listContainerElement.appendChild(tr);
        });

        const openDetail = (id) => {
            if (loaderMethod === 'getTMs') openTmDetail(id);
            else if (loaderMethod === 'getTBs') openTbDetail(id);
        };

        listContainerElement.querySelectorAll('.resource-name').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseId(btn.getAttribute('data-id'));
                if (id) openDetail(id);
            });
        });

        listContainerElement.querySelectorAll('.manage-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseId(btn.getAttribute('data-id'));
                if (id) openDetail(id);
            });
        });

        if (loaderMethod === 'getTMs' && syncTmListSelectAllLabel) syncTmListSelectAllLabel();
        if (loaderMethod === 'getTBs' && syncTbListSelectAllLabel) syncTbListSelectAllLabel();
    }

    function syncTmListSelectAllLabel() {
        if (!tmList || !tmListSelectAll) return;
        const cbs = tmList.querySelectorAll('.resource-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        tmListSelectAll.checked = total > 0 && checked === total;
        if (tmListSelectAllLabel) tmListSelectAllLabel.textContent = tmListSelectAll.checked ? '取消全選' : '全選';
    }
    function syncTbListSelectAllLabel() {
        if (!tbList || !tbListSelectAll) return;
        const cbs = tbList.querySelectorAll('.resource-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        tbListSelectAll.checked = total > 0 && checked === total;
        if (tbListSelectAllLabel) tbListSelectAllLabel.textContent = tbListSelectAll.checked ? '取消全選' : '全選';
    }

    async function loadTMList() {
        await baseResourceList('getTMs', 'deleteTM', tmList);
        if (tmListChangeLog) {
            const logs = await DBService.getModuleLogs('tm', 0);
            const ordered = logs.sort((a, b) => new Date(b.at) - new Date(a.at));
            const display = tmListChangeLogShowAll ? ordered : ordered.slice(0, 20);
            renderChangeLogList({
                listEl: tmListChangeLog,
                expandBtn: btnTmListChangeLogExpand,
                display,
                totalCount: ordered.length,
                showAll: tmListChangeLogShowAll,
                formatEntry: (e) => {
                    const at = formatDateForLog(e.at || '');
                    const who = (e.by || '').trim() || '—';
                    const name = e.entityName || '';
                    const action = e.action || '';
                    return `${name} ${action}；${who}，${at}`;
                }
            });
        }
    }

    if (tmList) {
        tmList.addEventListener('change', (e) => {
            if (e.target.matches('.resource-row-cb')) syncTmListSelectAllLabel();
        });
    }
    if (tmListSelectAll && tmList) {
        tmListSelectAll.addEventListener('change', () => {
            const checked = tmListSelectAll.checked;
            tmList.querySelectorAll('.resource-row-cb').forEach(cb => { cb.checked = checked; });
            syncTmListSelectAllLabel();
        });
    }
    if (btnTmListDeleteSelected) {
        btnTmListDeleteSelected.addEventListener('click', async () => {
            if (!tmList) return;
            const checkedIds = Array.from(tmList.querySelectorAll('.resource-row-cb:checked'))
                .map(cb => parseId(cb.getAttribute('data-id')))
                .filter(id => id != null && id !== '');
            if (checkedIds.length === 0) {
                alert('請先勾選要刪除的 TM。');
                return;
            }
            if (!confirm(`確定要刪除所選的 ${checkedIds.length} 個翻譯記憶庫嗎？`)) return;
            for (const id of checkedIds) {
                const tm = await DBService.getTM(id);
                await DBService.deleteTM(id);
                const entry = makeBaseLogEntry('delete', 'tm', {
                    entityId: id,
                    entityName: tm && tm.name ? tm.name : `TM #${id}`
                });
                await DBService.addModuleLog('tm', entry);
            }
            await loadTMList();
        });
    }

    if (tbList) {
        tbList.addEventListener('change', (e) => {
            if (e.target.matches('.resource-row-cb')) syncTbListSelectAllLabel();
        });
    }
    if (tbListSelectAll && tbList) {
        tbListSelectAll.addEventListener('change', () => {
            const checked = tbListSelectAll.checked;
            tbList.querySelectorAll('.resource-row-cb').forEach(cb => { cb.checked = checked; });
            syncTbListSelectAllLabel();
        });
    }
    if (btnTbListDeleteSelected) {
        btnTbListDeleteSelected.addEventListener('click', async () => {
            if (!tbList) return;
            const checkedIds = Array.from(tbList.querySelectorAll('.resource-row-cb:checked'))
                .map(cb => parseId(cb.getAttribute('data-id')))
                .filter(id => id != null && id !== '');
            if (checkedIds.length === 0) {
                alert('請先勾選要刪除的術語庫。');
                return;
            }
            if (!confirm(`確定要刪除所選的 ${checkedIds.length} 個術語庫嗎？`)) return;
            for (const id of checkedIds) {
                const tb = await DBService.getTB(id);
                await DBService.deleteTB(id);
                const entry = makeBaseLogEntry('delete', 'tb', {
                    entityId: id,
                    entityName: tb && tb.name ? tb.name : `TB #${id}`,
                    extra: { termCount: Array.isArray(tb && tb.terms) ? tb.terms.length : 0 }
                });
                await DBService.addModuleLog('tb', entry);
            }
            await loadTBList();
        });
    }

    async function applyTbListFilter() {
        const q = (tbSearchInput && tbSearchInput.value.trim()) || '';
        const filtered = q
            ? lastTbListItems.filter(t => (t.name || '').toLowerCase().includes(q.toLowerCase()))
            : lastTbListItems;
        await baseResourceList('getTBs', 'deleteTB', tbList, filtered);
    }

    async function loadTBList() {
        lastTbListItems = await DBService.getTBs();
        await applyTbListFilter();
        if (tbListChangeLog) {
            const logs = await DBService.getModuleLogs('tb', 0);
            const ordered = logs.sort((a, b) => new Date(b.at) - new Date(a.at));
            const display = tbListChangeLogShowAll ? ordered : ordered.slice(0, 20);
            renderChangeLogList({
                listEl: tbListChangeLog,
                expandBtn: btnTbListChangeLogExpand,
                display,
                totalCount: ordered.length,
                showAll: tbListChangeLogShowAll,
                formatEntry: (e) => {
                    const at = formatDateForLog(e.at || '');
                    const who = (e.by || '').trim() || '—';
                    const name = e.entityName || '';
                    const action = e.action || '';
                    return `${name} ${action}；${who}，${at}`;
                }
            });
        }
    }

    if (tbSearchInput) {
        tbSearchInput.addEventListener('input', () => applyTbListFilter());
    }

    // --- TB DETAIL (性質與入口按鈕) ---
    function applyTbTypeUI(tb) {
        const type = tb.sourceType || 'manual';
        const locked = !!tb.sourceTypeLocked;

        if (tbTypeManual && tbTypeOnline) {
            tbTypeManual.checked = type === 'manual';
            tbTypeOnline.checked = type === 'online';
            tbTypeManual.disabled = locked;
            tbTypeOnline.disabled = locked;
        }

        if (btnTbAddTerm) btnTbAddTerm.style.display = (type === 'manual') ? '' : 'none';
        if (btnTbImportFile) btnTbImportFile.style.display = (type === 'manual') ? '' : 'none';
        if (btnTbImportOnline) btnTbImportOnline.style.display = (type === 'online') ? '' : 'none';
    }

    if (btnBackToTbs) {
        btnBackToTbs.addEventListener('click', () => {
            switchView('viewTB');
        });
    }

    async function openTbDetail(tbId) {
        const tb = await DBService.getTB(tbId);
        if (!tb) return;
        currentTbId = tbId;
        tbChangeLogShowAll = false;
        if (detailTbName) detailTbName.textContent = tb.name || `TB #${tbId}`;
        applyTbTypeUI(tb);
        switchView('viewTbDetail');
        await loadTbTermsList();
    }

    function matchTermSearch(term, q) {
        if (!q) return true;
        const k = q.toLowerCase();
        const s = (term.source || '').toLowerCase();
        const t = (term.target || '').toLowerCase();
        const n = (term.note || '').toLowerCase();
        return s.includes(k) || t.includes(k) || n.includes(k);
    }

    function syncTbTermSelectAllLabel() {
        if (!tbTermsList || !tbTermSelectAll) return;
        const cbs = tbTermsList.querySelectorAll('.tb-term-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        tbTermSelectAll.checked = total > 0 && checked === total;
        if (tbTermSelectAllLabel) tbTermSelectAllLabel.textContent = tbTermSelectAll.checked ? '取消全選' : '全選';
    }

    async function updateTbDetailInfoBlock() {
        if (!currentTbId || !tbTermCount || !tbChangeLog) return;
        const tb = await DBService.getTB(currentTbId);
        const terms = (tb && tb.terms) ? tb.terms : [];
        const log = Array.isArray(tb && tb.changeLog) ? tb.changeLog : [];
        tbTermCount.textContent = String(terms.length);
        const recent = log.slice(-20).reverse();
        const displayLog = tbChangeLogShowAll ? [...log].reverse() : recent;
        renderChangeLogList({
            listEl: tbChangeLog,
            expandBtn: btnTbChangeLogExpand,
            display: displayLog,
            totalCount: log.length,
            showAll: tbChangeLogShowAll,
            formatEntry: (entry) => {
                const by = (entry.by || '').trim() || '—';
                const at = formatDateForLog(entry.at || '');
                const nums = Array.isArray(entry.termNumbers) ? entry.termNumbers : [];
                const numStr = nums.length ? '編號 ' + nums.join(', ') : '';
                const actionStr = entry.action === 'add'
                    ? '已新增'
                    : entry.action === 'delete'
                        ? '已刪除'
                        : entry.action === 'change'
                            ? '已變更'
                            : '';
                let baseText = numStr + (actionStr ? ' ' + actionStr : '');
                if (entry.action === 'delete' && entry.extra && Array.isArray(entry.extra.terms)) {
                    const count = entry.extra.terms.length;
                    baseText += count ? `（共 ${count} 筆）` : '';
                }
                return baseText + '；' + by + '，' + at;
            }
        });
    }

    async function loadTbTermsList() {
        if (!tbTermsList || !currentTbId) return;
        let tb = await DBService.getTB(currentTbId);
        let terms = (tb && tb.terms) ? tb.terms : [];
        const nextTermNumber = typeof tb.nextTermNumber === 'number' ? tb.nextTermNumber : 1;
        const needsMigration = terms.length > 0 && terms.some(t => typeof t.termNumber !== 'number');
        if (needsMigration) {
            terms = terms.map((t, i) => ({ ...t, termNumber: i + 1 }));
            await DBService.updateTB(currentTbId, { terms, nextTermNumber: terms.length + 1 });
            tb = await DBService.getTB(currentTbId);
            terms = (tb && tb.terms) ? tb.terms : [];
        }
        lastTbTerms = terms;
        const q = (tbTermSearchInput && tbTermSearchInput.value.trim()) || '';
        const withIndex = terms.map((t, i) => [t, i]).filter(([t]) => matchTermSearch(t, q));

        tbTermsList.innerHTML = '';
        if (withIndex.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="padding:0.75rem; color:#64748b; font-size:0.9rem;">${q ? '沒有符合搜尋條件的術語。' : '尚無術語，請使用上方「新增術語」或「匯入檔案」加入。'}</td>`;
            tbTermsList.appendChild(tr);
            if (syncTbTermSelectAllLabel) syncTbTermSelectAllLabel();
            updateTbDetailInfoBlock();
            return;
        }

        withIndex.forEach(([term, idx]) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-term-index', idx);
            const num = typeof term.termNumber === 'number' ? String(term.termNumber) : '—';
            const src = (term.source || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const tgt = (term.target || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const note = (term.note || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 80);
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0; text-align:center;"><input type="checkbox" class="tb-term-row-cb" data-term-index="${idx}"></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; width:60px;">${num}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; max-width:200px; overflow:hidden; text-overflow:ellipsis;" title="${src}">${src || '—'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; max-width:200px; overflow:hidden; text-overflow:ellipsis;" title="${tgt}">${tgt || '—'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; max-width:180px; overflow:hidden; text-overflow:ellipsis; font-size:0.85rem; color:#64748b;" title="${(term.note || '').replace(/</g, '&lt;')}">${note || '—'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; white-space:nowrap;">
                    <button type="button" class="secondary-btn btn-sm tb-term-edit-btn" data-term-index="${idx}">編輯</button>
                </td>
            `;
            tbTermsList.appendChild(tr);
        });
        if (syncTbTermSelectAllLabel) syncTbTermSelectAllLabel();

        tbTermsList.querySelectorAll('.tb-term-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-term-index'), 10);
                if (isNaN(idx) || idx < 0 || idx >= lastTbTerms.length) return;
                currentEditingTermIndex = idx;
                const t = lastTbTerms[idx];
                if (tbTermEditSource) tbTermEditSource.value = t.source || '';
                if (tbTermEditTarget) tbTermEditTarget.value = t.target || '';
                if (tbTermEditNote) tbTermEditNote.value = t.note || '';
                if (tbTermEditModal) tbTermEditModal.classList.remove('hidden');
            });
        });
        updateTbDetailInfoBlock();
    }

    if (tbTermSearchInput) tbTermSearchInput.addEventListener('input', () => loadTbTermsList());

    if (tbTermsList) {
        tbTermsList.addEventListener('change', (e) => {
            if (e.target.matches('.tb-term-row-cb')) syncTbTermSelectAllLabel();
        });
    }
    if (tbTermSelectAll && tbTermsList) {
        tbTermSelectAll.addEventListener('change', () => {
            const checked = tbTermSelectAll.checked;
            tbTermsList.querySelectorAll('.tb-term-row-cb').forEach(cb => { cb.checked = checked; });
            syncTbTermSelectAllLabel();
        });
    }
    if (btnTbChangeLogExpand) {
        btnTbChangeLogExpand.addEventListener('click', () => {
            tbChangeLogShowAll = !tbChangeLogShowAll;
            updateTbDetailInfoBlock();
        });
    }
    if (btnTbDeleteSelected) {
        btnTbDeleteSelected.addEventListener('click', async () => {
            if (!currentTbId || !tbTermsList) return;
            const checked = Array.from(tbTermsList.querySelectorAll('.tb-term-row-cb:checked'))
                .map(cb => parseInt(cb.getAttribute('data-term-index'), 10))
                .filter(n => !isNaN(n) && n >= 0 && n < lastTbTerms.length);
            if (checked.length === 0) {
                alert('請先勾選要刪除的術語。');
                return;
            }
            if (!confirm(`確定要刪除所選的 ${checked.length} 筆術語？`)) return;
            const toDelete = checked.map(i => lastTbTerms[i]).filter(Boolean);
            const termNumbers = toDelete.filter(t => typeof t.termNumber === 'number').map(t => t.termNumber);
            const deletedSnapshot = toDelete.map(t => ({
                termNumber: t.termNumber,
                source: t.source || '',
                target: t.target || '',
                note: t.note || ''
            }));
            const next = lastTbTerms.filter((_, i) => !checked.includes(i));
            const tb = await DBService.getTB(currentTbId);
            const changeLog = Array.isArray(tb && tb.changeLog) ? tb.changeLog.slice() : [];
            const userName = getCurrentUserName();
            const entry = makeBaseLogEntry('delete', 'tb-term', {
                termNumbers,
                extra: { terms: deletedSnapshot }
            });
            changeLog.push(entry);
            await DBService.updateTB(currentTbId, { terms: next, changeLog });
            lastTbTerms = next;
            await loadTbTermsList();
        });
    }

    function closeTbTermEditModal() {
        if (tbTermEditModal) tbTermEditModal.classList.add('hidden');
        currentEditingTermIndex = -1;
    }

    if (btnCloseTbTermEdit) btnCloseTbTermEdit.addEventListener('click', closeTbTermEditModal);
    if (btnCancelTbTermEdit) btnCancelTbTermEdit.addEventListener('click', closeTbTermEditModal);

    if (btnSaveTbTermEdit) {
        btnSaveTbTermEdit.addEventListener('click', async () => {
            const src = (tbTermEditSource && tbTermEditSource.value.trim()) || '';
            const tgt = (tbTermEditTarget && tbTermEditTarget.value.trim()) || '';
            const note = (tbTermEditNote && tbTermEditNote.value.trim()) || '';
            const userName = localStorage.getItem('localCatUserProfile') || 'Unknown User';
            const now = new Date().toISOString();
            const tb = await DBService.getTB(currentTbId);
            const updated = (tb && tb.terms) ? tb.terms.slice() : [];
            const nextNum = typeof (tb && tb.nextTermNumber) === 'number' ? tb.nextTermNumber : 1;
            const changeLog = Array.isArray(tb && tb.changeLog) ? tb.changeLog.slice() : [];
            if (currentEditingTermIndex < 0) {
                updated.push({ source: src, target: tgt, note, termNumber: nextNum, createdBy: userName, createdAt: now });
                changeLog.push(makeBaseLogEntry('add', 'tb-term', { termNumbers: [nextNum] }));
                await DBService.updateTB(currentTbId, { terms: updated, nextTermNumber: nextNum + 1, changeLog });
            } else if (currentEditingTermIndex < updated.length) {
                const termNumber = updated[currentEditingTermIndex].termNumber;
                updated[currentEditingTermIndex] = { ...updated[currentEditingTermIndex], source: src, target: tgt, note };
                changeLog.push(makeBaseLogEntry('change', 'tb-term', { termNumbers: typeof termNumber === 'number' ? [termNumber] : [] }));
                await DBService.updateTB(currentTbId, { terms: updated, changeLog });
            } else { closeTbTermEditModal(); return; }
            lastTbTerms = updated;
            closeTbTermEditModal();
            await loadTbTermsList();
        });
    }

    if (btnTbAddTerm) {
        btnTbAddTerm.addEventListener('click', () => {
            if (!currentTbId) return;
            currentEditingTermIndex = -1;
            if (tbTermEditSource) tbTermEditSource.value = '';
            if (tbTermEditTarget) tbTermEditTarget.value = '';
            if (tbTermEditNote) tbTermEditNote.value = '';
            if (tbTermEditModal) tbTermEditModal.classList.remove('hidden');
        });
    }

    // 解析欄位字串，例如 "C-E, G" -> [2,3,4,6]
    function parseTbColumnList(str) {
        if (!str) return [];
        const cleaned = str.toUpperCase().replace(/\s+/g, '');
        if (!cleaned) return [];
        const parts = cleaned.split(',');
        const cols = new Set();
        const letterToIndex = (s) => {
            let r = 0;
            for (let i = 0; i < s.length; i++) r = r * 26 + (s.charCodeAt(i) - 64);
            return r - 1;
        };
        parts.forEach(p => {
            if (!p || p === '#') return; // '#' 不當成實際欄位，由呼叫端另行處理
            if (p.includes('-')) {
                const [a, b] = p.split('-');
                if (!a || !b) return;
                const start = letterToIndex(a);
                const end = letterToIndex(b);
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                for (let i = lo; i <= hi; i++) cols.add(i);
            } else {
                cols.add(letterToIndex(p));
            }
        });
        return Array.from(cols).sort((a, b) => a - b);
    }

    function parseTbSingleColumn(str) {
        const cols = parseTbColumnList(str);
        return cols.length ? cols[0] : -1;
    }

    function parseTbDate(value) {
        if (!value) return null;
        const trimmed = String(value).trim();
        if (!trimmed) return null;
        const d = new Date(trimmed);
        if (isNaN(d.getTime())) return null;
        // 轉成台北時間的 ISO-like 字串 (24h)
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
    }

    let tbExcelPendingFile = null;
    let tbExcelSheetNames = [];
    let tbExcelConfigs = {};      // { sheetName: { sourceCol,targetCol,noteCols,creatorCol,createdAtCol,rowsRange } }
    let tbExcelActiveSheet = null;

    // 設定右側表單為指定工作表的設定（供下拉與 sync 使用）
    function setTbExcelActiveSheet(name) {
        if (!name || !tbExcelConfigs[name]) return;
        tbExcelActiveSheet = name;
        const cfg = tbExcelConfigs[name];
        if (tbExcelSourceCol) tbExcelSourceCol.value = cfg.sourceCol || '';
        if (tbExcelTargetCol) tbExcelTargetCol.value = cfg.targetCol || '';
        if (tbExcelNoteCols) tbExcelNoteCols.value = cfg.noteCols || '';
        if (tbExcelCreatorCol) tbExcelCreatorCol.value = cfg.creatorCol || '';
        if (tbExcelCreatedAtCol) tbExcelCreatedAtCol.value = cfg.createdAtCol || '';
        if (tbExcelRowsRange) tbExcelRowsRange.value = cfg.rowsRange || '2-';
    }

    // 全選邏輯：依左側勾選數更新「全選」勾選與標籤（全選→顯示「取消全選」，未全選→顯示「全選」）
    function syncTbExcelSelectAllLabel() {
        if (!tbExcelSheetList || !tbExcelSelectAll || !tbExcelSelectAllLabel) return;
        const cbs = tbExcelSheetList.querySelectorAll('.tb-excel-sheet-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        tbExcelSelectAll.checked = total > 0 && checked === total;
        tbExcelSelectAllLabel.textContent = tbExcelSelectAll.checked ? '取消全選' : '全選';
    }

    // 右側下拉選單：僅顯示左側已勾選的工作表，並隨勾選即時增減選項
    function syncTbExcelDropdownFromCheckboxes() {
        if (!tbExcelSheetList || !tbExcelSheetSelect) return;
        const checkedNames = Array.from(tbExcelSheetList.querySelectorAll('.tb-excel-sheet-cb'))
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        const currentVal = tbExcelSheetSelect.value;
        tbExcelSheetSelect.innerHTML = '';
        checkedNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            tbExcelSheetSelect.appendChild(opt);
        });
        if (checkedNames.length) {
            const keepVal = checkedNames.includes(currentVal) ? currentVal : checkedNames[0];
            tbExcelSheetSelect.value = keepVal;
            setTbExcelActiveSheet(keepVal);
        } else {
            tbExcelActiveSheet = null;
        }
    }

    // 全選／下拉同步：僅綁定一次，避免重複註冊
    if (tbExcelSheetList) {
        tbExcelSheetList.addEventListener('change', (e) => {
            if (!e.target.matches('.tb-excel-sheet-cb')) return;
            syncTbExcelSelectAllLabel();
            syncTbExcelDropdownFromCheckboxes();
        });
    }
    if (tbExcelSelectAll && tbExcelSheetList) {
        tbExcelSelectAll.addEventListener('change', () => {
            const checked = tbExcelSelectAll.checked;
            tbExcelSheetList.querySelectorAll('.tb-excel-sheet-cb').forEach(cb => { cb.checked = checked; });
            syncTbExcelSelectAllLabel();
            syncTbExcelDropdownFromCheckboxes();
        });
    }
    if (tbExcelSheetSelect) {
        tbExcelSheetSelect.addEventListener('change', () => {
            if (tbExcelActiveSheet && tbExcelConfigs[tbExcelActiveSheet]) {
                tbExcelConfigs[tbExcelActiveSheet] = {
                    sourceCol: tbExcelSourceCol ? tbExcelSourceCol.value.trim() : '',
                    targetCol: tbExcelTargetCol ? tbExcelTargetCol.value.trim() : '',
                    noteCols: tbExcelNoteCols ? tbExcelNoteCols.value.trim() : '',
                    creatorCol: tbExcelCreatorCol ? tbExcelCreatorCol.value.trim() : '',
                    createdAtCol: tbExcelCreatedAtCol ? tbExcelCreatedAtCol.value.trim() : '',
                    rowsRange: tbExcelRowsRange ? tbExcelRowsRange.value.trim() : ''
                };
            }
            setTbExcelActiveSheet(tbExcelSheetSelect.value);
        });
    }
    if (tbExcelUseSameConfig && tbExcelSheetSelect) {
        tbExcelUseSameConfig.addEventListener('change', () => {
            tbExcelSheetSelect.disabled = tbExcelUseSameConfig.checked;
        });
    }

    if (btnTbImportFile && tbImportInput) {
        btnTbImportFile.addEventListener('click', () => {
            if (!currentTbId) {
                alert('請先選擇要管理的術語庫。');
                return;
            }
            tbImportInput.value = '';
            tbImportInput.click();
        });

        tbImportInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'xlsx' && ext !== 'tbx' && ext !== 'sdltbx' && ext !== 'csv') {
                alert('不支援的匯入格式，請使用 xlsx / tbx / sdltbx / csv。');
                tbImportInput.value = '';
                return;
            }
            if (ext === 'xlsx') {
                tbExcelPendingFile = file;
                if (tbExcelImportModal) {
                    if (tbExcelImportError) tbExcelImportError.textContent = '';
                    // 讀取工作表並偵測有內容的
                    file.arrayBuffer().then(buffer => {
                        const workbook = XLSX.read(buffer, { type: 'array' });
                        const names = workbook.SheetNames || [];
                        tbExcelSheetNames = [];
                        tbExcelConfigs = {};
                        tbExcelActiveSheet = null;
                        if (tbExcelSheetList) tbExcelSheetList.innerHTML = '';
                        names.forEach((name, idx) => {
                            tbExcelSheetNames.push(name);
                            tbExcelConfigs[name] = {
                                sourceCol: 'A',
                                targetCol: 'B',
                                noteCols: '',
                                creatorCol: '',
                                createdAtCol: '',
                                rowsRange: '2-'
                            };
                            if (tbExcelSheetList) {
                                const rowEl = document.createElement('div');
                                rowEl.style.display = 'flex';
                                rowEl.style.alignItems = 'center';
                                rowEl.style.padding = '2px 0';
                                rowEl.innerHTML = `
                                    <label style="display:flex; align-items:center; gap:0.25rem; cursor:pointer;">
                                        <input type="checkbox" class="tb-excel-sheet-cb" value="${name}" checked>
                                        <span>${name}</span>
                                    </label>
                                `;
                                tbExcelSheetList.appendChild(rowEl);
                            }
                        });
                        if (!tbExcelSheetNames.length) {
                            alert('此 Excel 檔案中沒有任何工作表。');
                            tbImportInput.value = '';
                            return;
                        }

                        if (tbExcelUseSameConfig) tbExcelUseSameConfig.checked = false;
                        if (tbExcelSheetSelect) tbExcelSheetSelect.disabled = false;
                        syncTbExcelSelectAllLabel();
                        syncTbExcelDropdownFromCheckboxes();
                        setTbExcelActiveSheet(tbExcelSheetSelect ? tbExcelSheetSelect.value : tbExcelSheetNames[0]);
                        tbExcelImportModal.classList.remove('hidden');
                    }).catch(err => {
                        console.error('TB Excel read error', err);
                        alert('讀取 Excel 檔案失敗：' + err.message);
                        tbImportInput.value = '';
                    });
                }
            } else {
                alert('目前僅實作 xlsx 匯入，其他格式將在之後支援。');
            }
        });
    }

    if (tbExcelImportModal) {
        const closeTbExcelModal = () => {
            tbExcelImportModal.classList.add('hidden');
            tbExcelPendingFile = null;
            tbExcelSheetNames = [];
            tbExcelConfigs = {};
            tbExcelActiveSheet = null;
            tbImportInput.value = '';
        };
        if (btnCloseTbExcelImport) btnCloseTbExcelImport.addEventListener('click', closeTbExcelModal);
        if (btnCancelTbExcelImport) btnCancelTbExcelImport.addEventListener('click', closeTbExcelModal);
        // 使用 modal 上的事件委派，確保「開始匯入」點擊一定會被處理
        tbExcelImportModal.addEventListener('click', (e) => {
            if (!e.target.closest('#btnConfirmTbExcelImport')) return;
            e.preventDefault();
            console.log('TB Excel 開始匯入 已點擊');
            const errEl = document.getElementById('tbExcelImportError');
            const srcColEl = document.getElementById('tbExcelSourceCol');
            const tgtColEl = document.getElementById('tbExcelTargetCol');
            if (errEl) errEl.textContent = '處理中…';
            const runImport = async () => {
            try {
                    console.log('runImport 開始');
                    if (typeof DBService.updateTB !== 'function') {
                        console.log('runImport 提早結束: DBService.updateTB 未定義');
                        const msg = 'DBService.updateTB 未定義，請強制重新整理 (Ctrl+Shift+R) 後再試。';
                        if (errEl) errEl.textContent = msg;
                        else alert(msg);
                        return;
                    }
                    const msgNoFileOrTb = '無法匯入：尚未選擇檔案或術語庫，請關閉視窗後重新從術語庫詳情頁操作。';
                    if (!tbExcelPendingFile || !currentTbId) {
                        console.log('runImport 提早結束: 無檔案或術語庫', { hasFile: !!tbExcelPendingFile, currentTbId });
                        if (errEl) { errEl.textContent = msgNoFileOrTb; errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                        else alert(msgNoFileOrTb);
                        return;
                    }
                    const msgNoCols = '無法取得原文／譯文欄位，請關閉視窗後重新選擇檔案再試。';
                    if (!srcColEl || !tgtColEl) {
                        console.log('runImport 提早結束: 無原文/譯文欄位');
                        if (errEl) { errEl.textContent = msgNoCols; errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                        else alert(msgNoCols);
                        return;
                    }

            const sheetCheckboxes = tbExcelSheetList ? Array.from(tbExcelSheetList.querySelectorAll('.tb-excel-sheet-cb')) : [];
                const selectedSheets = sheetCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
                if (!selectedSheets.length) {
                    console.log('runImport 提早結束: 未勾選任何工作表');
                    if (errEl) errEl.textContent = '請至少勾選一個要匯入的工作表。';
                    return;
                }

                // 目前畫面上的設定先寫回「右側下拉選單所選的工作表」的 config（僅此一個，其餘用已儲存）
                const activeSheetFromDropdown = tbExcelSheetSelect && tbExcelSheetSelect.value ? tbExcelSheetSelect.value : tbExcelActiveSheet;
                const useSameConfig = !!(tbExcelUseSameConfig && tbExcelUseSameConfig.checked);
                if (activeSheetFromDropdown && tbExcelConfigs[activeSheetFromDropdown]) {
                    tbExcelConfigs[activeSheetFromDropdown] = {
                        sourceCol: srcColEl.value.trim(),
                        targetCol: tgtColEl.value.trim(),
                        noteCols: tbExcelNoteCols ? tbExcelNoteCols.value.trim() : '',
                        creatorCol: tbExcelCreatorCol ? tbExcelCreatorCol.value.trim() : '',
                        createdAtCol: tbExcelCreatedAtCol ? tbExcelCreatedAtCol.value.trim() : '',
                        rowsRange: tbExcelRowsRange ? tbExcelRowsRange.value.trim() : ''
                    };
                }

                // 未勾選「使用同樣設定」時：每個要匯入的工作表都必須已有欄位設定（使用者需切換至該工作表設定過）
                if (!useSameConfig) {
                    for (const name of selectedSheets) {
                        if (name === activeSheetFromDropdown) continue;
                        const stored = tbExcelConfigs[name] || {};
                        const src = (stored.sourceCol || '').trim();
                        const tgt = (stored.targetCol || '').trim();
                        if (!src || !tgt) {
                            if (errEl) errEl.textContent = `請在右側切換至工作表「${name}」並設定原文／譯文欄位後再匯入。`;
                            return;
                        }
                    }
                }

                // 針對每一個要匯入的工作表：勾選「使用同樣設定」時全部用表單值，否則僅目前下拉選中的用表單值、其餘用已儲存 config
                const formCfg = {
                    sourceCol: srcColEl.value.trim(),
                    targetCol: tgtColEl.value.trim(),
                    noteCols: tbExcelNoteCols ? tbExcelNoteCols.value.trim() : '',
                    creatorCol: tbExcelCreatorCol ? tbExcelCreatorCol.value.trim() : '',
                    createdAtCol: tbExcelCreatedAtCol ? tbExcelCreatedAtCol.value.trim() : '',
                    rowsRange: tbExcelRowsRange ? tbExcelRowsRange.value.trim() : ''
                };
                const sheetConfigs = {};
                for (const name of selectedSheets) {
                    const isActiveSheet = (name === activeSheetFromDropdown);
                    const cfg = (useSameConfig || isActiveSheet) ? formCfg : (tbExcelConfigs[name] || {});
                    const srcColStr = (cfg.sourceCol || '').trim();
                    const tgtColStr = (cfg.targetCol || '').trim();
                    if (!srcColStr || !tgtColStr) {
                        console.log('runImport 提早結束: 工作表原文/譯文為空', name);
                        if (errEl) errEl.textContent = `工作表「${name}」的原文/譯文欄位為必填。`;
                        return;
                    }
                    const srcIdx = parseTbSingleColumn(srcColStr);
                    const tgtIdx = parseTbSingleColumn(tgtColStr);
                    if (srcIdx < 0 || tgtIdx < 0) {
                        console.log('runImport 提早結束: 欄位格式錯誤', name, srcColStr, tgtColStr);
                        if (errEl) errEl.textContent = `工作表「${name}」的原文/譯文欄位格式錯誤，請輸入欄位代號，例如 A 或 B。`;
                        return;
                    }
                    sheetConfigs[name] = {
                        srcIdx,
                        tgtIdx,
                        noteIdxs: parseTbColumnList(cfg.noteCols || ''),
                        includeSheetName: (cfg.noteCols || '').includes('#'),
                        creatorIdx: parseTbSingleColumn(cfg.creatorCol || ''),
                        createdAtIdx: parseTbSingleColumn(cfg.createdAtCol || ''),
                        rowsRangeStr: (cfg.rowsRange || '2-').trim()
                    };
                }
                if (selectedSheets.length > 1) {
                    selectedSheets.forEach(name => {
                        const c = sheetConfigs[name];
                        if (c) console.log('runImport sheetConfigs[' + name + ']', { srcIdx: c.srcIdx, tgtIdx: c.tgtIdx });
                    });
                }

                console.log('runImport 通過檢查，即將讀取 Excel');
                try {
                    const buffer = await tbExcelPendingFile.arrayBuffer();
                    console.log('runImport 已取得 arrayBuffer，長度:', buffer.byteLength);
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    console.log('runImport 已解析 workbook，工作表:', workbook.SheetNames && workbook.SheetNames.length);
                    const newTerms = [];
                    const scanStats = []; // 每個工作表的掃描統計，用於除錯
                    const userName = localStorage.getItem('localCatUserProfile') || 'Unknown User';
                    const parseRowRange = (str) => {
                        const cleaned = (str || '').replace(/\s+/g, '');
                        if (!cleaned) return { start: 2, end: Infinity };
                        if (cleaned.includes('-')) {
                            const [a, b] = cleaned.split('-');
                            const start = a ? parseInt(a, 10) : 2;
                            const end = b ? parseInt(b, 10) : Infinity;
                            return { start, end };
                        }
                        const v = parseInt(cleaned, 10);
                        if (isNaN(v)) return { start: 2, end: Infinity };
                        return { start: v, end: v };
                    };
                    for (const sheetName of selectedSheets) {
                        const cfg = sheetConfigs[sheetName];
                        if (!cfg) continue;
                        const rowRange = parseRowRange(cfg.rowsRangeStr || '2-');
                        const sheet = workbook.Sheets[sheetName];
                        if (!sheet) {
                            console.warn('TB Excel 匯入：找不到工作表', JSON.stringify(sheetName), 'workbook 內工作表:', (workbook.SheetNames || []).map(s => JSON.stringify(s)));
                            continue;
                        }
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                        if (!rows.length) continue;
                        const startRow = Math.max(0, rowRange.start - 1); // 1-based 轉 0-based，允許從第 1 列開始
                        const endRow = isFinite(rowRange.end) ? rowRange.end - 1 : rows.length - 1;
                        let inRange = 0;
                        let withContent = 0;

                        for (let r = startRow; r < rows.length && r <= endRow; r++) {
                            inRange++;
                            const row = rows[r] || [];
                            const source = String(row[cfg.srcIdx] ?? '').trim();
                            const target = String(row[cfg.tgtIdx] ?? '').trim();
                            // 若原文與譯文皆空白才略過；只要任一有內容就匯入
                            if (!source && !target) continue;
                            withContent++;

                            let noteLines = [];
                            cfg.noteIdxs.forEach(idx => {
                                const v = String(row[idx] ?? '').trim();
                                if (v) noteLines.push(v);
                            });
                            if (cfg.includeSheetName) {
                                noteLines.push(sheetName);
                            }
                            const note = noteLines.join('\n');

                            let creator = cfg.creatorIdx >= 0 ? String(row[cfg.creatorIdx] ?? '').trim() : '';
                            if (!creator) creator = userName;

                            let createdAt = cfg.createdAtIdx >= 0 ? parseTbDate(row[cfg.createdAtIdx]) : null;
                            if (!createdAt) createdAt = parseTbDate(new Date()) || '';

                            newTerms.push({
                                source,
                                target,
                                note,
                                createdBy: creator,
                                createdAt
                            });
                        }
                        scanStats.push({ sheet: sheetName, inRange, withContent });
                    }

                    if (!newTerms.length) {
                        console.log('runImport 提早結束: 無可匯入資料列', scanStats);
                        const hint = '未找到可匯入的資料列（原文欄與譯文欄至少需有一欄有內容）。請確認：匯入列數是否正確（例如無標題列請用 1-，有標題列請用 2-）、原文／譯文欄位（如 A、B）是否對應到有資料的欄。';
                        if (errEl) errEl.textContent = hint;
                        else alert(hint);
                        return;
                    }

                    console.log('runImport 已解析出', newTerms.length, '筆，即將讀取術語庫');
                    const tb = await DBService.getTB(currentTbId);
                    console.log('runImport 已取得術語庫，即將 updateTB');
                    const oldTerms = tb && tb.terms ? tb.terms : [];

                    // 以「除建立者與建立時間以外的欄位」作為去重 key
                    const makeKey = (t) => {
                        return JSON.stringify({
                            source: (t.source || '').trim(),
                            target: (t.target || '').trim(),
                            note: (t.note || '').trim()
                        });
                    };

                    const existingKeys = new Set(oldTerms.map(makeKey));
                    const addedKeys = new Set();
                    const filteredNew = [];
                    for (const t of newTerms) {
                        const k = makeKey(t);
                        if (existingKeys.has(k) || addedKeys.has(k)) continue;
                        addedKeys.add(k);
                        filteredNew.push(t);
                    }

                    if (!filteredNew.length) {
                        if (errEl) errEl.textContent = '所有資料列皆與現有術語重複，未新增任何術語。';
                        return;
                    }

                    let nextNum = typeof tb.nextTermNumber === 'number' ? tb.nextTermNumber : 1;
                    filteredNew.forEach(t => {
                        t.termNumber = nextNum++;
                    });
                    const merged = oldTerms.concat(filteredNew);
                    const changeLog = Array.isArray(tb.changeLog) ? tb.changeLog.slice() : [];
                    changeLog.push({
                        by: userName,
                        at: new Date().toISOString(),
                        action: 'add',
                        termNumbers: filteredNew.map(t => t.termNumber)
                    });
                    const updatePayload = {
                        terms: merged,
                        nextTermNumber: nextNum,
                        changeLog,
                        sourceType: tb && tb.sourceType ? tb.sourceType : 'manual',
                        sourceTypeLocked: true,
                        lastModified: new Date().toISOString()
                    };
                    const updatePromise = DBService.updateTB(currentTbId, updatePayload);
                    const timeoutMs = 60000;
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('寫入術語庫逾時（60 秒），請重試或減少單次匯入筆數')), timeoutMs)
                    );
                    await Promise.race([updatePromise, timeoutPromise]);

                    console.log('runImport 寫入 DB 完成，即將關閉視窗');
                    closeTbExcelModal();
                    alert(`匯入完成，共加入 ${filteredNew.length} 筆術語（已自動略過重複內容）。`);
                    await loadTbTermsList();
                } catch (err) {
                    console.error('TB xlsx import error (內層)', err);
                    if (errEl) errEl.textContent = '匯入失敗：' + err.message;
                }
                } catch (outerErr) {
                    console.error('TB Excel 開始匯入錯誤 (外層)', outerErr);
                    if (errEl) errEl.textContent = '匯入時發生錯誤：' + (outerErr && outerErr.message);
                    else alert('匯入時發生錯誤：' + (outerErr && outerErr.message));
                }
            };
            runImport().catch(err => {
                console.error('TB Excel 匯入未捕捉錯誤 (Promise.catch)', err);
                const el = document.getElementById('tbExcelImportError');
                if (el) el.textContent = '匯入時發生錯誤：' + (err && err.message);
                else alert('匯入時發生錯誤：' + (err && err.message));
            });
        });
    }

    if (tbTypeManual && tbTypeOnline) {
        const onTypeChange = async (e) => {
            if (!currentTbId) return;
            const tb = await DBService.getTB(currentTbId);
            if (!tb || tb.sourceTypeLocked) {
                // 還原勾選狀態
                applyTbTypeUI(tb || {});
                return;
            }
            const newType = e.target.value === 'online' ? 'online' : 'manual';
            await DBService.updateTB(currentTbId, { sourceType: newType });
            const newTb = await DBService.getTB(currentTbId);
            applyTbTypeUI(newTb || { sourceType: newType });
        };
        tbTypeManual.addEventListener('change', onTypeChange);
        tbTypeOnline.addEventListener('change', onTypeChange);
    }

    // --- TM DETAIL MANAGER ---
    const btnBackToTms = document.getElementById('btnBackToTms');
    const btnImportTmFile = document.getElementById('btnImportTmFile');
    const tmImportInput = document.getElementById('tmImportInput');
    const detailTmName = document.getElementById('detailTmName');
    const tmSegmentCount = document.getElementById('tmSegmentCount');
    const tmSegmentsListBody = document.getElementById('tmSegmentsListBody');
    const tmSegmentsSelectAll = document.getElementById('tmSegmentsSelectAll');
    const btnClearTmSegments = document.getElementById('btnClearTmSegments');

    if(btnBackToTms) btnBackToTms.addEventListener('click', () => switchView('viewTM'));

    async function openTmDetail(tmId) {
        currentTmId = tmId;
        const tm = await DBService.getTM(tmId);
        if(!tm) return switchView('viewTM');
        detailTmName.textContent = tm.name;
        switchView('viewTmDetail');
        await loadTmSegments();
        await updateTmDetailChangeLog(tm);
    }

    async function loadTmSegments() {
        if(!currentTmId || !tmSegmentsListBody) return;
        const segments = await DBService.getTMSegments(currentTmId);
        tmSegmentCount.textContent = segments.length;
        tmSegmentsListBody.innerHTML = '';
        if(segments.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="4" style="padding:0.75rem; color:#64748b;">此記憶庫尚無內容。</td>';
            tmSegmentsListBody.appendChild(tr);
            return;
        }
        segments.forEach(seg => {
            const tr = document.createElement('tr');
            const src = (seg.sourceText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const tgt = (seg.targetText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            tr.innerHTML = `
                <td style="padding:0.5rem; border:1px solid #e2e8f0; text-align:center;"><input type="checkbox" class="tm-segment-row-cb" data-id="${seg.id}"></td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; width:60px;">${seg.id}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; max-width:280px; overflow:hidden; text-overflow:ellipsis;" title="${src}">${src || '—'}</td>
                <td style="padding:0.5rem; border:1px solid #e2e8f0; max-width:280px; overflow:hidden; text-overflow:ellipsis;" title="${tgt}">${tgt || '—'}</td>
            `;
            tmSegmentsListBody.appendChild(tr);
        });
        syncTmSegmentsSelectAll();
    }

    async function updateTmDetailChangeLog(tm) {
        if (!tmDetailChangeLog) return;
        const log = Array.isArray(tm && tm.changeLog) ? tm.changeLog : [];
        const ordered = log.slice().sort((a, b) => new Date(b.at) - new Date(a.at));
        const display = tmDetailChangeLogShowAll ? ordered : ordered.slice(0, 20);
        renderChangeLogList({
            listEl: tmDetailChangeLog,
            expandBtn: btnTmDetailChangeLogExpand,
            display,
            totalCount: ordered.length,
            showAll: tmDetailChangeLogShowAll,
            formatEntry: (e) => {
                const at = formatDateForLog(e.at || '');
                const who = (e.by || '').trim() || '—';
                const action = e.action || '';
                return `${action}；${who}，${at}`;
            }
        });
    }

    function syncTmSegmentsSelectAll() {
        if (!tmSegmentsListBody || !tmSegmentsSelectAll) return;
        const cbs = tmSegmentsListBody.querySelectorAll('.tm-segment-row-cb');
        const total = cbs.length;
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        tmSegmentsSelectAll.checked = total > 0 && checked === total;
    }

    if (tmSegmentsSelectAll && tmSegmentsListBody) {
        tmSegmentsSelectAll.addEventListener('change', () => {
            const checked = tmSegmentsSelectAll.checked;
            tmSegmentsListBody.querySelectorAll('.tm-segment-row-cb').forEach(cb => { cb.checked = checked; });
            syncTmSegmentsSelectAll();
        });
    }
    if (tmSegmentsListBody) {
        tmSegmentsListBody.addEventListener('change', (e) => {
            if (e.target.matches('.tm-segment-row-cb')) syncTmSegmentsSelectAll();
        });
    }

    if (btnDashboardChangeLogExpand && dashboardChangeLog) {
        btnDashboardChangeLogExpand.addEventListener('click', async () => {
            dashboardChangeLogShowAll = !dashboardChangeLogShowAll;
            await loadDashboardData();
        });
    }

    if (btnProjectsChangeLogExpand && projectsChangeLog) {
        btnProjectsChangeLogExpand.addEventListener('click', async () => {
            projectsChangeLogShowAll = !projectsChangeLogShowAll;
            await loadProjectsList();
        });
    }

    if (btnProjectDetailChangeLogExpand && projectDetailChangeLog) {
        btnProjectDetailChangeLogExpand.addEventListener('click', async () => {
            if (!currentProjectId) return;
            const p = await DBService.getProject(currentProjectId);
            await updateProjectDetailChangeLog(p);
        });
    }

    if (btnTmListChangeLogExpand && tmListChangeLog) {
        btnTmListChangeLogExpand.addEventListener('click', async () => {
            tmListChangeLogShowAll = !tmListChangeLogShowAll;
            await loadTMList();
        });
    }

    if (btnTmDetailChangeLogExpand && tmDetailChangeLog) {
        btnTmDetailChangeLogExpand.addEventListener('click', async () => {
            if (!currentTmId) return;
            const tm = await DBService.getTM(currentTmId);
            await updateTmDetailChangeLog(tm);
        });
    }

    if (btnTbListChangeLogExpand && tbListChangeLog) {
        btnTbListChangeLogExpand.addEventListener('click', async () => {
            tbListChangeLogShowAll = !tbListChangeLogShowAll;
            await loadTBList();
        });
    }

    if(btnClearTmSegments) {
        btnClearTmSegments.addEventListener('click', async () => {
            if(!currentTmId) return;
            if(confirm('確定要清空此記憶庫中所有的句段嗎？此動作無法復原！')) {
                const existing = await DBService.getTMSegments(currentTmId);
                const total = existing.length;
                await DBService.deleteTMSegmentsByTMId(currentTmId);
                await DBService.patchTM(currentTmId, {});
                if (total > 0) {
                    const entry = makeBaseLogEntry('delete', 'tm-segment', {
                        entityId: currentTmId,
                        entityName: `TM #${currentTmId}`,
                        extra: { cleared: total }
                    });
                    await appendTMChangeLog(currentTmId, entry);
                    await DBService.addModuleLog('tm', entry);
                }
                await loadTmSegments();
                alert('記憶庫已清空。');
            }
        });
    }

    if(btnImportTmFile) {
        btnImportTmFile.addEventListener('click', () => tmImportInput.click());
    }

    if(tmImportInput) {
        tmImportInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file || !currentTmId) return;

            const ext = file.name.split('.').pop().toLowerCase();
            const startStr = '正在匯入資料，請稍候...\\n';
            let parsedSegments = [];

            try {
                if (ext === 'tmx') {
                    const text = await file.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(text, 'text/xml');
                    
                    const tuNodes = xmlDoc.getElementsByTagName('tu');
                    for(let i=0; i<tuNodes.length; i++) {
                        const tu = tuNodes[i];
                        const tuvNodes = tu.getElementsByTagName('tuv');
                        if(tuvNodes.length >= 2) {
                            // Basic assumption: 1st is source, 2nd is target
                            const sourceSeg = tuvNodes[0].getElementsByTagName('seg')[0];
                            const targetSeg = tuvNodes[1].getElementsByTagName('seg')[0];
                            if(sourceSeg && targetSeg) {
                                const creator = localStorage.getItem('localCatUserProfile') || 'Unknown User';
                                const ts = new Date().toLocaleString();
                                const changeMsg = `${ts} - ${creator} (以檔案匯入) 建立`;

                                parsedSegments.push({
                                    tmId: currentTmId,
                                    sourceText: sourceSeg.textContent || '',
                                    targetText: targetSeg.textContent || '',
                                    key: '',
                                    prevSegment: '',
                                    nextSegment: '',
                                    writtenFile: '',
                                    writtenProject: '',
                                    createdBy: `${creator} (以檔案匯入)`,
                                    changeLog: [changeMsg],
                                    createdAt: new Date().toISOString(),
                                    lastModified: new Date().toISOString()
                                });
                            }
                        }
                    }
                } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
                    // Reuse SheetJS from window.XLSX if available
                    if (typeof XLSX === 'undefined') throw new Error('Excel 解析模組尚未載入');
                    
                    const arrBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrBuffer, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    // Simple assume Source is Col 0, Target is Col 1, Key is Col 2, Prev is Col 3, Next is Col 4. Skip header row 0.
                    for(let i=1; i<jsonData.length; i++) {
                        const row = jsonData[i];
                        if(row && row.length >= 2 && row[0] && String(row[0]).trim() !== '') {
                            const creator = localStorage.getItem('localCatUserProfile') || 'Unknown User';
                            const ts = new Date().toLocaleString();
                            const changeMsg = `${ts} - ${creator} (以檔案匯入) 建立`;

                            parsedSegments.push({
                                tmId: currentTmId,
                                sourceText: String(row[0]),
                                targetText: String(row[1] || ''),
                                key: String(row[2] || ''),
                                prevSegment: String(row[3] || ''),
                                nextSegment: String(row[4] || ''),
                                writtenFile: '',
                                writtenProject: '',
                                createdBy: `${creator} (以檔案匯入)`,
                                changeLog: [changeMsg],
                                createdAt: new Date().toISOString(),
                                lastModified: new Date().toISOString()
                            });
                        }
                    }
                } else {
                    alert('不支援的檔案格式。');
                    return;
                }

                if (parsedSegments.length > 0) {
                    await DBService.bulkAddTMSegments(parsedSegments);
                    await DBService.patchTM(currentTmId, {});
                    const entry = makeBaseLogEntry('create', 'tm-segment', {
                        entityId: currentTmId,
                        entityName: `TM #${currentTmId}`,
                        extra: { imported: parsedSegments.length, fileName: file.name, ext }
                    });
                    await appendTMChangeLog(currentTmId, entry);
                    await DBService.addModuleLog('tm', entry);
                    alert(`匯入成功！共匯入 ${parsedSegments.length} 筆句段。`);
                    await loadTmSegments();
                } else {
                    alert('未能從檔案中讀取到有效的句段。');
                }

            } catch (err) {
                console.error('TM Import Error:', err);
                alert('匯入失敗：' + err.message);
            } finally {
                tmImportInput.value = '';
            }
        });
    }

    // ==========================================
    // NAMING MODAL (Generic for Projects, TMs, TBs, Rename)
    // ==========================================
    document.getElementById('btnCreateProjectModal').addEventListener('click', () => openNamingModal('createProject', '新增專案', '專案名稱'));
    document.getElementById('btnCreateTMModal').addEventListener('click', () => openNamingModal('createTM', '新增翻譯記憶庫 (TM)', 'TM 名稱'));
    document.getElementById('btnCreateTBModal').addEventListener('click', () => openNamingModal('createTB', '新增術語庫 (TB)', 'TB 名稱'));
    btnCloseNamingModal.addEventListener('click', () => namingModal.classList.add('hidden'));
    const btnCloseNamingModalFooter = document.getElementById('btnCloseNamingModalFooter');
    if (btnCloseNamingModalFooter) btnCloseNamingModalFooter.addEventListener('click', () => namingModal.classList.add('hidden'));

    // 語言選擇容器參照（Modal 內部動態填入）
    let _namingModalSrcLangsCb = null;
    let _namingModalTgtLangsCb = null;

    function openNamingModal(action, title, label, idArg = null, defaultName = '', existingEntity = null) {
        namingActionContext = { action, idArg };
        namingModalTitle.textContent = title;
        namingModalLabel.textContent = label;
        namingModalInput.value = defaultName;

        const langSection = document.getElementById('namingModalLangSection');
        const srcContainer = document.getElementById('namingModalSrcLangs');
        const tgtContainer = document.getElementById('namingModalTgtLangs');
        const needsLangs = ['createProject', 'createTM', 'createTB'].includes(action);

        if (langSection) {
            langSection.classList.toggle('hidden', !needsLangs);
        }
        if (needsLangs && srcContainer && tgtContainer) {
            srcContainer.innerHTML = '';
            tgtContainer.innerHTML = '';
            const existingSrc = (existingEntity && existingEntity.sourceLangs) ? existingEntity.sourceLangs : [];
            const existingTgt = (existingEntity && existingEntity.targetLangs) ? existingEntity.targetLangs : [];
            _namingModalSrcLangsCb = buildLangCheckboxes(existingSrc);
            _namingModalTgtLangsCb = buildLangCheckboxes(existingTgt);
            srcContainer.appendChild(_namingModalSrcLangsCb);
            tgtContainer.appendChild(_namingModalTgtLangsCb);
        } else {
            _namingModalSrcLangsCb = null;
            _namingModalTgtLangsCb = null;
        }

        namingModal.classList.remove('hidden');
        namingModalInput.focus();
    }

    btnNamingModalConfirm.addEventListener('click', async () => {
        const val = namingModalInput.value.trim();
        if(!val) return alert('請輸入名稱');
        
        const { action, idArg } = namingActionContext;
        const srcLangs = _namingModalSrcLangsCb ? getCheckedLangs(_namingModalSrcLangsCb) : [];
        const tgtLangs = _namingModalTgtLangsCb ? getCheckedLangs(_namingModalTgtLangsCb) : [];

        if (action === 'createProject') {
            const id = await DBService.createProject(val, srcLangs, tgtLangs);
            const entry = makeBaseLogEntry('create', 'project', {
                entityId: id,
                entityName: val
            });
            await appendProjectChangeLog(id, entry);
            await DBService.addModuleLog('projects', entry);
        } else if (action === 'renameProject') {
            const old = await DBService.getProject(idArg);
            await DBService.updateProjectName(idArg, val);
            const entry = makeBaseLogEntry('rename', 'project', {
                entityId: idArg,
                entityName: val,
                extra: {
                    oldName: old && old.name ? old.name : ''
                }
            });
            await appendProjectChangeLog(idArg, entry);
            await DBService.addModuleLog('projects', entry);
        } else if (action === 'createTM') {
            const id = await DBService.createTM(val, srcLangs, tgtLangs);
            const entry = makeBaseLogEntry('create', 'tm', {
                entityId: id,
                entityName: val
            });
            await appendTMChangeLog(id, entry);
            await DBService.addModuleLog('tm', entry);
        } else if (action === 'createTB') {
            const id = await DBService.createTB(val, srcLangs, tgtLangs);
            const entry = makeBaseLogEntry('create', 'tb', {
                entityId: id,
                entityName: val
            });
            await appendTBChangeLog(id, entry);
            await DBService.addModuleLog('tb', entry);
        }
        else if (action === 'setUserProfile') {
            localStorage.setItem('localCatUserProfile', val);
            document.getElementById('displayUserName').textContent = val;
        }

        namingModal.classList.add('hidden');
        if(action.includes('Project')) await loadProjectsList();
        if(action === 'createTM') await loadTMList();
        if(action === 'createTB') await loadTBList();
    });

    // ==========================================
    // FILE IMPORT WIZARD
    // ==========================================
    document.getElementById('btnAddFileModal').addEventListener('click', () => {
        wizardOverlay.classList.remove('hidden');
        showWizardStep('wizardStep1');
        sourceFileInput.value = '';
    });

    btnCloseWizard.addEventListener('click', () => wizardOverlay.classList.add('hidden'));

    function showWizardStep(stepId) {
        [wizardStep1, wizardStep2].forEach(el => el.classList.add('hidden'));
        document.getElementById(stepId).classList.remove('hidden');
    }

    sourceFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        originalFileName = file.name;
        const lowerName = file.name.toLowerCase();

        const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
        const isXliffLike = lowerName.endsWith('.xlf') || lowerName.endsWith('.xliff') || lowerName.endsWith('.mqxliff') || lowerName.endsWith('.sdlxliff');

        // ---- 語言對選擇（匯入前必選）----
        // 先取得目前專案的語言設定
        const project = currentProjectId ? await DBService.getProject(currentProjectId) : null;
        const projectSrcLangs = (project && project.sourceLangs) ? project.sourceLangs : [];
        const projectTgtLangs = (project && project.targetLangs) ? project.targetLangs : [];

        // 隱藏 wizard，顯示語言對選擇 Modal
        if (wizardOverlay) wizardOverlay.classList.add('hidden');
        const langChoice = await showFileLangModal(projectSrcLangs, projectTgtLangs);
        if (langChoice === null) {
            // 使用者取消 → 恢復 wizard step 1
            if (wizardOverlay) wizardOverlay.classList.remove('hidden');
            sourceFileInput.value = '';
            return;
        }
        _importSelectedSrcLang = langChoice.sourceLang;
        _importSelectedTgtLang = langChoice.targetLang;

        if (isExcel) {
            if (wizardOverlay) wizardOverlay.classList.remove('hidden');
            const reader = new FileReader();
            reader.onload = (ev) => {
                excelRawBuffer = ev.target.result;
                const data = new Uint8Array(excelRawBuffer);
                excelWorkbook = XLSX.read(data, { type: 'array' });

                sheetList.innerHTML = '';
                excelWorkbook.SheetNames.forEach(name => {
                    excelDataBySheet[name] = XLSX.utils.sheet_to_json(excelWorkbook.Sheets[name], { header: 1, defval: '' });
                    const lbl = document.createElement('label');
                    lbl.innerHTML = `<input type="checkbox" class="sheet-checkbox" value="${name}" checked> <span>${name}</span>`;
                    sheetList.appendChild(lbl);
                    lbl.style.display = 'block'; lbl.style.marginBottom = '0.5rem';
                });

                const checkboxes = document.querySelectorAll('.sheet-checkbox');
                selectAllSheets.addEventListener('change', (evt) => checkboxes.forEach(cb => cb.checked = evt.target.checked));
                checkboxes.forEach(cb => cb.addEventListener('change', () => selectAllSheets.checked = Array.from(checkboxes).every(c => c.checked)));

                showWizardStep('wizardStep2');
            };
            reader.readAsArrayBuffer(file);
        } else if (isXliffLike) {
            const isMqxliff = lowerName.endsWith('.mqxliff');
            if (isMqxliff) {
                const role = await showMqRoleModal({ hideWizardFirst: false });
                if (role === null) { sourceFileInput.value = ''; return; }
                try {
                    if (!XliffImport || typeof XliffImport.handleXliffLikeImport !== 'function') {
                        throw new Error('XLIFF 匯入模組未載入（js/xliff-import.js）');
                    }
                    const result = await XliffImport.handleXliffLikeImport(xliffImportCtx(), file, role);
                    _checkXliffLangMismatch(result, langChoice);
                } catch (err) {
                    console.error(err);
                    alert('匯入 XLIFF 檔案時發生錯誤：' + (err.message || err));
                } finally {
                    sourceFileInput.value = '';
                }
            } else {
                try {
                    if (!XliffImport || typeof XliffImport.handleXliffLikeImport !== 'function') {
                        throw new Error('XLIFF 匯入模組未載入（js/xliff-import.js）');
                    }
                    const result = await XliffImport.handleXliffLikeImport(xliffImportCtx(), file);
                    _checkXliffLangMismatch(result, langChoice);
                } catch (err) {
                    console.error(err);
                    alert('匯入 XLIFF 檔案時發生錯誤：' + (err.message || err));
                } finally {
                    sourceFileInput.value = '';
                }
            }
        } else {
            alert('目前僅支援 Excel (.xlsx/.xls) 以及 XLIFF (.xlf/.xliff/.mqxliff/.sdlxliff) 檔案。');
            sourceFileInput.value = '';
        }
    });

    /** 比對 XLIFF 原始語言對與使用者選擇，若不符則跳出警告（但不阻止匯入） */
    function _checkXliffLangMismatch(result, langChoice) {
        if (!result || !langChoice) return;
        const { originalSourceLang, originalTargetLang } = result;
        if (!originalSourceLang && !originalTargetLang) return;
        const srcMatch = !originalSourceLang || originalSourceLang.toLowerCase() === (langChoice.sourceLang || '').toLowerCase();
        const tgtMatch = !originalTargetLang || originalTargetLang.toLowerCase() === (langChoice.targetLang || '').toLowerCase();
        if (!srcMatch || !tgtMatch) {
            const msg = [
                '⚠ 語言對不符提示（檔案已成功匯入）',
                '',
                `原始檔內建語言對：${originalSourceLang || '—'} → ${originalTargetLang || '—'}`,
                `本次任務語言對：${langChoice.sourceLang || '—'} → ${langChoice.targetLang || '—'}`,
                '',
                '系統將以任務設定為準進行 TM／TB 比對與寫入；匯出時原始語言對會從原始檔案還原，不受影響。'
            ].join('\n');
            alert(msg);
        }
    }

    btnWizBack1.addEventListener('click', () => {
        sourceFileInput.value = '';
        showWizardStep('wizardStep1');
    });

    /** 顯示 mqxliff 身分選擇視窗，回傳選中的 'T'|'R1'|'R2'，取消則回傳 null。opts.hideWizardFirst: 匯入時先隱藏 wizard；opts.defaultRole: 預設選中的身分 */
    function showMqRoleModal(opts = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('mqRoleModal');
            const btnConfirm = document.getElementById('btnMqRoleConfirm');
            const btnClose = document.getElementById('btnCloseMqRoleModal');
            const validRoles = ['T_ALLOW_R1', 'T_DENY_R1', 'R1', 'R2'];
            // Backward compat: old 'T' maps to 'T_ALLOW_R1'
            const normalizedDefault = opts.defaultRole === 'T' ? 'T_ALLOW_R1' : opts.defaultRole;
            const defaultRole = validRoles.includes(normalizedDefault) ? normalizedDefault : 'T_ALLOW_R1';
            document.querySelectorAll('input[name="mqRoleChoice"]').forEach(r => { r.checked = (r.value === defaultRole); });
            if (opts.hideWizardFirst && wizardOverlay) wizardOverlay.classList.add('hidden');
            const finish = (val) => {
                modal.classList.add('hidden');
                document.removeEventListener('keydown', onEsc);
                resolve(val);
            };
            const onEsc = (e) => { if (e.key === 'Escape') finish(null); };
            modal.classList.remove('hidden');
            document.addEventListener('keydown', onEsc);
            const handler = () => {
                const checked = document.querySelector('input[name="mqRoleChoice"]:checked');
                finish(checked ? checked.value : 'T_ALLOW_R1');
            };
            btnConfirm.onclick = handler;
            btnClose.onclick = () => finish(null);
            modal.onclick = (e) => { if (e.target === modal) finish(null); };
        });
    }

    /** Legacy stubs (replaced by new notes module) */
    function isLegacyAutoWorkspaceNoteTitle() { return false; }
    function normalizeWorkspaceNoteTitle(raw) { return String(raw ?? '').trim() || '未命名'; }
    function showWorkspaceNoteMountModal() { return Promise.resolve({ noteId: null }); }

    // ==========================================
    // XLIFF 匯入：js/xliff-import.js（window.CatToolXliffImport）
    // 標籤佔位：js/xliff-tag-pipeline.js（window.CatToolXliffTags）
    // 【CRITICAL】匯出策略：docs/XLIFF_TAG_EXPORT.md、.cursor/rules/xliff-tag-export.mdc
    // ==========================================
    // 用於傳給 xliffImportCtx() 的當前語言選擇（由 showFileLangModal 設定）
    let _importSelectedSrcLang = '';
    let _importSelectedTgtLang = '';

    function xliffImportCtx() {
        return {
            Xliff,
            DBService,
            currentProjectId,
            wizardOverlay,
            makeBaseLogEntry,
            appendProjectChangeLog,
            loadFilesList,
            selectedSourceLang: _importSelectedSrcLang,
            selectedTargetLang: _importSelectedTgtLang
        };
    }

    /**
     * 彈出「語言對選擇」Modal，回傳 { sourceLang, targetLang } 或 null（取消）。
     * @param {string[]} srcLangs - 專案支援的原文語言代碼
     * @param {string[]} tgtLangs - 專案支援的譯文語言代碼
     */
    function showFileLangModal(srcLangs, tgtLangs) {
        return new Promise((resolve) => {
            const modal = document.getElementById('fileLangModal');
            const srcList = document.getElementById('fileLangSrcList');
            const tgtList = document.getElementById('fileLangTgtList');
            const warnEl = document.getElementById('fileLangWarning');
            const btnConfirm = document.getElementById('btnFileLangConfirm');
            const btnCancel = document.getElementById('btnFileLangCancel');
            const btnClose = document.getElementById('btnCloseFileLangModal');
            if (!modal || !srcList || !tgtList) { resolve(null); return; }

            /** 可捲動單選列表（若專案沒有設定語言，顯示全部） */
            function buildRadioList(container, codes, radioName) {
                container.innerHTML = '';
                const pool = codes && codes.length ? codes : LANG_OPTIONS.map(o => o.code);
                pool.forEach((code, i) => {
                    const row = document.createElement('div');
                    row.className = 'lang-radio-row';
                    row.dataset.langCode = code;
                    const label = document.createElement('label');
                    label.className = 'file-lang-radio-label';
                    const input = document.createElement('input');
                    input.type = 'radio';
                    input.name = radioName;
                    input.value = code;
                    if (i === 0) input.checked = true;
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(` ${langLabel(code)}`));
                    row.appendChild(label);
                    container.appendChild(row);
                });
            }
            buildRadioList(srcList, srcLangs, 'fileLangSrc');
            buildRadioList(tgtList, tgtLangs, 'fileLangTgt');

            const wireSearch = (searchId, listEl, radioName) => {
                const searchEl = document.getElementById(searchId);
                if (!searchEl) return;
                searchEl.value = '';
                const handler = () => {
                    const q = searchEl.value.toLowerCase();
                    const rows = listEl.querySelectorAll('.lang-radio-row');
                    rows.forEach(row => {
                        const t = (row.textContent || '').toLowerCase();
                        row.style.display = t.includes(q) ? '' : 'none';
                    });
                    const visible = Array.from(rows).filter(r => r.style.display !== 'none');
                    if (!visible.length) return;
                    const checked = listEl.querySelector(`input[name="${radioName}"]:checked`);
                    const checkedRow = checked && checked.closest('.lang-radio-row');
                    if (!checked || (checkedRow && checkedRow.style.display === 'none')) {
                        const firstIn = visible[0].querySelector('input[type="radio"]');
                        if (firstIn) firstIn.checked = true;
                    }
                };
                const clone = searchEl.cloneNode(true);
                searchEl.parentNode.replaceChild(clone, searchEl);
                clone.addEventListener('input', handler);
            };
            wireSearch('fileLangSrcSearch', srcList, 'fileLangSrc');
            wireSearch('fileLangTgtSearch', tgtList, 'fileLangTgt');

            if (warnEl) warnEl.classList.add('hidden');
            modal.classList.remove('hidden');

            const cleanup = (val) => {
                modal.classList.add('hidden');
                btnConfirm.removeEventListener('click', onConfirm);
                btnCancel.removeEventListener('click', onCancel);
                if (btnClose) btnClose.removeEventListener('click', onCancel);
                resolve(val);
            };
            const onConfirm = () => {
                const src = modal.querySelector('input[name="fileLangSrc"]:checked');
                const tgt = modal.querySelector('input[name="fileLangTgt"]:checked');
                cleanup({ sourceLang: src ? src.value : '', targetLang: tgt ? tgt.value : '' });
            };
            const onCancel = () => cleanup(null);

            btnConfirm.addEventListener('click', onConfirm);
            btnCancel.addEventListener('click', onCancel);
            if (btnClose) btnClose.addEventListener('click', onCancel);
        });
    }

    function colLetterToIndex(str) { let r=0; for(let i=0; i<str.length; i++) r = r*26 + str.charCodeAt(i) - 64; return r-1; }
    function parseColumnString(str) {
        if (!str || !str.trim()) return [];
        const parts = str.toUpperCase().replace(/\s/g, '').split(',');
        const s = new Set();
        parts.forEach(p => {
            if(p.includes('-')) {
                const [st, en] = p.split('-');
                if(st && en) { const min=Math.min(colLetterToIndex(st), colLetterToIndex(en)); const max=Math.max(colLetterToIndex(st), colLetterToIndex(en)); for(let i=min; i<=max; i++) s.add(i); }
                else if(st) s.add(colLetterToIndex(st));
            } else s.add(colLetterToIndex(p));
        });
        return Array.from(s).sort((a,b)=>a-b);
    }
    function parseRowString(str) {
        const c = str.replace(/\s/g, ''); if (!c) return { start: 1, end: Infinity };
        if(c.includes('-')) { const [st, en] = c.split('-'); return { start: st ? parseInt(st)-1 : 0, end: en ? parseInt(en)-1 : Infinity }; }
        const i = parseInt(c)-1; return { start: i, end: i };
    }

    let extractedSegmentsBackup = [];

    btnWizFinish.addEventListener('click', async () => {
        try {
            const sCols = parseColumnString(configSourceCol.value);
            const tCols = parseColumnString(configTargetCol.value);
            const idCols = parseColumnString(configIdCol.value);
            const extCols = parseColumnString(configExtraCol.value);
            const rRange = parseRowString(configRows.value);
            const dir = configDirection.value;
            const extraDelimiter = '\n';

            if(!sCols.length || !tCols.length) throw new Error('必填欄位未填寫');
            if(sCols.length !== tCols.length) throw new Error('原文與譯文欄位數量不一致');
            if(idCols.length > 1) throw new Error('String Key 欄位僅允許輸入單一欄位，不支援多個欄');
            const selSheets = Array.from(document.querySelectorAll('.sheet-checkbox')).filter(c=>c.checked).map(c=>c.value);
            if(!selSheets.length) throw new Error('請勾選至少一個工作表');

            extractedSegmentsBackup = [];
            selSheets.forEach(sheetName => {
                const data = excelDataBySheet[sheetName];
                const rawSheet = excelWorkbook ? excelWorkbook.Sheets[sheetName] : null;
                const endR = Math.min(rRange.end, data.length-1);
                if (dir === 'top-down') {
                    for(let c=0; c<sCols.length; c++) for(let r = rRange.start; r <= endR; r++) extractSegmentIntoBackup(data, sheetName, r, sCols[c], tCols[c], idCols, extCols, extraDelimiter, rawSheet);
                } else {
                    for(let r = rRange.start; r <= endR; r++) for(let c=0; c<sCols.length; c++) extractSegmentIntoBackup(data, sheetName, r, sCols[c], tCols[c], idCols, extCols, extraDelimiter, rawSheet);
                }
            });

            btnWizFinish.disabled = true; btnWizFinish.textContent = '處理中...';
            const fId = await DBService.createFile(
                currentProjectId, originalFileName, excelRawBuffer,
                _importSelectedSrcLang, _importSelectedTgtLang
            );
            const entry = makeBaseLogEntry('create', 'project-file', {
                entityId: fId,
                entityName: originalFileName
            });
            if (currentProjectId) {
                await appendProjectChangeLog(currentProjectId, entry);
                await DBService.addModuleLog('projects', entry);
            }
            const mappedSegments = extractedSegmentsBackup.map((s, idx) => ({ ...s, fileId: fId, globalId: idx + 1 }));
            const savedCount = await DBService.addSegments(mappedSegments);
            if (isTeamMode() && mappedSegments.length > 0 && !savedCount) {
                console.warn('[CAT] addSegments returned 0 — segments may not have been saved to cloud.');
            }

            wizardOverlay.classList.add('hidden');
            excelWorkbook = null; excelRawBuffer = null; excelDataBySheet = {}; extractedSegmentsBackup = [];
            await loadFilesList();
        } catch(e) { alert('匯入失敗: ' + e.message); } finally { btnWizFinish.disabled = false; btnWizFinish.textContent = '匯入檔案'; }
    });

    function extractSegmentIntoBackup(data, sheetName, r, sC, tC, idCols, extCols, extraDelimiter, rawSheet) {
        if(!data[r]) return;
        const srcText = data[r][sC] !== undefined ? String(data[r][sC]).trim() : '';
        const tgtText = data[r][tC] !== undefined ? String(data[r][tC]).trim() : '';
        
        // Single column Key Parsing
        let idVal = idCols.length === 1 && data[r][idCols[0]] !== undefined ? String(data[r][idCols[0]]).trim() : '';

        // Multi-column Extra Parsing
        let extVals = [];
        for(let i=0; i<extCols.length; i++) {
            const eVal = data[r][extCols[i]];
            if (eVal !== undefined && String(eVal).trim() !== '') {
                extVals.push(String(eVal).trim());
            }
        }
        let extVal = extVals.join(extraDelimiter);

        let locked = false, finalSrc = srcText;
        if(srcText==='' && tgtText==='') { locked = true; finalSrc = '（原文檔本列空白）'; }
        if(locked || srcText !== '') {
            // Rich Text：原文欄、譯文欄分別偵測；匯出時 baseRprXml 以譯文儲存格為優先
            let sourceTags = null;
            let targetTags = null;
            let baseRprXml = '';
            let finalTgt = tgtText;
            const XlsxRich = window.CatToolXlsxRichTags;
            if (!locked && XlsxRich && rawSheet) {
                try {
                    const srcCellRef = XLSX.utils.encode_cell({ r, c: sC });
                    const tgtCellRef = XLSX.utils.encode_cell({ r, c: tC });
                    const srcCell = rawSheet[srcCellRef];
                    const tgtCell = rawSheet[tgtCellRef];
                    const srcRich = srcCell ? XlsxRich.extractCellRichTags(srcCell) : null;
                    const tgtRich = tgtCell ? XlsxRich.extractCellRichTags(tgtCell) : null;
                    if (srcRich) {
                        finalSrc = srcRich.text;
                        sourceTags = srcRich.tags;
                    }
                    if (tgtRich) {
                        finalTgt = tgtRich.text;
                        targetTags = tgtRich.tags;
                    }
                    if (tgtRich) {
                        baseRprXml = tgtRich.baseRprXml || '';
                    } else if (srcRich) {
                        baseRprXml = srcRich.baseRprXml || '';
                    }
                    if (srcRich && !tgtRich) {
                        targetTags = [];
                    }
                } catch (err) {
                    console.warn('xlsx rich tag 萃取失敗（row', r, 'col', sC, '）', err);
                }
            }
            const seg = {
                sheetName, rowIdx: r, colSrc: sC, colTgt: tC,
                idValue: idVal, extraValue: extVal,
                sourceText: finalSrc, targetText: finalTgt,
                isLocked: locked,
                isLockedSystem: locked,
                isLockedUser: false,
                status: 'unconfirmed'
            };
            const hasSrcTags = sourceTags && sourceTags.length;
            const hasTgtTags = targetTags && targetTags.length;
            if (hasSrcTags || hasTgtTags) {
                if (hasSrcTags) seg.sourceTags = sourceTags;
                if (hasTgtTags) {
                    seg.targetTags = targetTags;
                } else if (hasSrcTags) {
                    seg.targetTags = [];
                }
                seg.baseRprXml = baseRprXml;
            }
            extractedSegmentsBackup.push(seg);
        }
    }

    // ==========================================
    // PRO EDITOR ENGINE
    // ==========================================
    let currentSegmentsList = [];
    let editorUndoStack = [];
    let editorRedoStack = [];
    let editorUndoEditStart = {};
    let editorUndoStatusStart = {};
    let editorUndoMatchStart = {};
    let emptySegUserEditedIds = new Set();
    let emptySegAutoConsumedIds = new Set();
    let currentFileFormat = 'excel'; // 'excel' | 'xliff' | 'mqxliff' | 'sdlxliff'
    let currentMqConfirmationRole = 'T_ALLOW_R1'; // mqxliff 用的目前確認身分
    let currentFileDefaultMqRole = null; // 匯入時儲存的預設身分，用於字數/句段統計基準

    // 禁止編輯核心判斷：以 role 等級與句段 originalRole 計算是否禁止
    // 規則（角色等級：T < R1 < R2）：
    //   ‧ R2 確認句段：只有 R2 session 可編輯，其餘均禁止
    //   ‧ R1 確認句段：T_ALLOW_R1 / R1 / R2 可編輯，T_DENY_R1 禁止
    //   ‧ T  確認句段：所有 session 均可編輯
    //   ‧ 無 originalRole + mq:locked：任何 session 均禁止（匯入時即已鎖定）
    //   ‧ 無 originalRole + 無 mq:locked：所有 session 均可編輯
    function computeForbiddenForRole(seg, role) {
        const effectiveRole = (role === 'T') ? 'T_ALLOW_R1' : (role || 'T_ALLOW_R1');
        if (seg.originalRole === 'R2') return effectiveRole !== 'R2';
        if (seg.originalRole === 'R1') return !['T_ALLOW_R1', 'R1', 'R2'].includes(effectiveRole);
        if (seg.originalRole === 'T') return false;
        // originalRole 為 null：只有 mq:locked 才禁止（匯入時即已鎖定）
        return !!seg.isLockedSystem;
    }

    // 字數/句段統計基準：以「預設身分（匯入時選定）第一次開啟」的非禁止句段為準，不受當前 session 影響
    function isBaselineForbidden(seg) {
        if (currentFileFormat !== 'mqxliff') return !!seg.isLockedSystem;
        return computeForbiddenForRole(seg, currentFileDefaultMqRole);
    }

    // 將 session role 轉換為實際寫入句段的 confirmationRole（T_ALLOW_R1/T_DENY_R1 → 'T'）
    function getSessionConfirmRole() {
        const r = currentMqConfirmationRole || 'T_ALLOW_R1';
        if (r === 'T_ALLOW_R1' || r === 'T_DENY_R1' || r === 'T') return 'T';
        return r; // 'R1' | 'R2'
    }

    // 禁止編輯工具提示：區分「身分權限不足」與「匯入時即已鎖定」
    function getForbiddenTooltip(seg) {
        if (!seg.originalRole && seg.isLockedSystem) return '禁止編輯：匯入時即已鎖定';
        return '禁止編輯：目前身分權限不允許編輯';
    }

    // 判斷句段是否「禁止編輯」（依當前 session 身分動態判斷）
    function isDynamicForbidden(seg) {
        if (currentFileFormat !== 'mqxliff') return !!seg.isLockedSystem;
        return computeForbiddenForRole(seg, currentMqConfirmationRole);
    }

    // 計算句段在目前 session 下應使用的 confirmationRole
    function resolveConfirmationRole(seg) {
        if (seg.originalRole) {
            // T_ALLOW_R1 允許以 T 身分覆寫 R1 確認
            if ((currentMqConfirmationRole === 'T_ALLOW_R1' || currentMqConfirmationRole === 'T_DENY_R1') && seg.originalRole === 'R1') {
                return 'T';
            }
            return seg.originalRole; // 其他情況保留原檔身分
        }
        return getSessionConfirmRole();
    }

    async function openEditor(fileId) {
        if (collabCurrentFileId && String(collabCurrentFileId) !== String(fileId)) {
            leaveCollabForCurrentFile();
        }
        currentFileId = fileId;
        editorUndoStack = [];
        editorRedoStack = [];
        editorUndoEditStart = {};
        editorUndoStatusStart = {};
        editorUndoMatchStart = {};
        emptySegUserEditedIds = new Set();
        emptySegAutoConsumedIds = new Set();
        pendingRemoteBySegId.clear();
        const file = await DBService.getFile(fileId);
        if(!file) return alert('檔案不存在');

        const resolvedProjectId = file.projectId || currentProjectId;
        if (resolvedProjectId) currentProjectId = resolvedProjectId;

        editorFileName.textContent = file.name;
        currentSegmentsList = await DBService.getSegmentsByFile(fileId);

        // 推斷目前檔案格式，供狀態與樣式判斷使用
        const lowerName = (file.name || '').toLowerCase();
        if (lowerName.endsWith('.mqxliff')) currentFileFormat = 'mqxliff';
        else if (lowerName.endsWith('.sdlxliff')) currentFileFormat = 'sdlxliff';
        else if (lowerName.endsWith('.xlf') || lowerName.endsWith('.xliff')) currentFileFormat = 'xliff';
        else currentFileFormat = 'excel';

        // 設定統計基準身分（用 defaultMqRole；非 mqxliff 則為 null）
        currentFileDefaultMqRole = currentFileFormat === 'mqxliff'
            ? (file.defaultMqRole === 'T' ? 'T_ALLOW_R1' : (file.defaultMqRole || 'T_ALLOW_R1'))
            : null;

        // mqxliff：每次開啟都詢問當次作業身分，預設為匯入時選擇的身分
        if (currentFileFormat === 'mqxliff') {
            // Backward compat: old 'T' maps to 'T_ALLOW_R1'
            const rawDefault = file.defaultMqRole === 'T' ? 'T_ALLOW_R1' : (file.defaultMqRole || 'T_ALLOW_R1');
            const importDefault = rawDefault;
            const role = await showMqRoleModal({ defaultRole: importDefault });
            if (role === null) return; // 使用者取消，不開啟編輯器
            currentMqConfirmationRole = role;
            if (!file.defaultMqRole) {
                await DBService.updateFile(fileId, { defaultMqRole: role });
                file.defaultMqRole = role;
            }
        }

        // 設定／顯示 mqxliff 作業中身分圖示（篩選圖示正下方，與周遭圖示同大）
        const mqRoleIcon = document.getElementById('mqRoleIcon');
        const sfCellModeRow2 = document.getElementById('sfCellModeRow2');
        if (mqRoleIcon) {
            if (currentFileFormat === 'mqxliff') {
                mqRoleIcon.style.display = '';
                if (sfCellModeRow2) sfCellModeRow2.classList.remove('mq-role-hidden');
                const role = currentMqConfirmationRole || 'T_ALLOW_R1';
                const roleLabels = {
                    'T_ALLOW_R1': 'T（允許編輯 R1 確認）',
                    'T_DENY_R1': 'T（不允許編輯 R1 確認）',
                    'T': 'T（譯者）',
                    'R1': 'R1',
                    'R2': 'R2'
                };
                mqRoleIcon.title = `作業中身分：${roleLabels[role] || role}`;
                if (role === 'R1') mqRoleIcon.innerHTML = '✓+';
                else if (role === 'R2') mqRoleIcon.innerHTML = '✓✓';
                else                 mqRoleIcon.innerHTML = '✓';
            } else {
                mqRoleIcon.style.display = 'none';
                if (sfCellModeRow2) sfCellModeRow2.classList.add('mq-role-hidden');
            }
        }

        // Notes auto-load is handled later after editor renders
        
        // --- LOAD PROJECT TM CACHE ---
        window.ActiveTmCache = [];
        window.ActiveWriteTms = [];
        window.ActiveReadTmIds = [];
        window.ActiveReadTbIds = [];
        window.ActiveTbNames = {};
        // 記錄當前檔案的語言對，供 TM 篩選及寫入使用
        window.ActiveFileLangs = { sourceLang: file.sourceLang || '', targetLang: file.targetLang || '' };
        const project = await DBService.getProject(resolvedProjectId);
        window.ActiveReadTmIds = (project && Array.isArray(project.readTms)) ? project.readTms : [];
        if (project && project.readTms && project.readTms.length > 0) {
            for (const tmId of project.readTms) {
                const tm = await DBService.getTM(tmId);
                const tmName = tm ? tm.name : `TM #${tmId}`;
                const segs = await DBService.getTMSegments(tmId);
                // 若檔案有設定語言對，則只保留語言對相符或未設語言的 TM 句段（向下相容）
                const fileSrc = window.ActiveFileLangs.sourceLang;
                const fileTgt = window.ActiveFileLangs.targetLang;
                const filtered = (fileSrc || fileTgt)
                    ? segs.filter(s => {
                        const segSrc = s.sourceLang || '';
                        const segTgt = s.targetLang || '';
                        // 句段沒有語言標記（舊資料）→ 納入；有語言標記 → 必須相符
                        if (!segSrc && !segTgt) return true;
                        return segSrc.toLowerCase() === fileSrc.toLowerCase() &&
                               segTgt.toLowerCase() === fileTgt.toLowerCase();
                    })
                    : segs;
                // Stamp each segment with its source TM id + name
                filtered.forEach(s => { s._tmId = tmId; s.tmName = tmName; });
                window.ActiveTmCache.push(...filtered);
            }
        }
        if (project && project.writeTms) window.ActiveWriteTms = project.writeTms;

        // --- LOAD TB TERMS: only TBs listed in project.readTbs (no language fallback) ---
        window.ActiveTbTerms = [];
        window.ActiveWriteTb = (project && project.writeTb != null) ? project.writeTb : null;
        const readTbIds = (project && Array.isArray(project.readTbs)) ? project.readTbs : [];
        window.ActiveReadTbIds = readTbIds;
        for (const tbId of readTbIds) {
            const full = await DBService.getTB(tbId);
            if (!full) continue;
            // 無論術語數量多寡，先記錄 TB 名稱供 UI 顯示
            window.ActiveTbNames[full.id] = full.name || `TB #${full.id}`;
            const terms = full.terms ? full.terms : [];
            terms.forEach(t => {
                if (t && ((t.source && t.source.trim()) || (t.target && t.target.trim())))
                    window.ActiveTbTerms.push({
                        source: (t.source || '').trim(),
                        target: (t.target || '').trim(),
                        note: (t.note || '').trim(),
                        tbId: full.id,
                        tbName: full.name || `TB #${full.id}`
                    });
            });
        }
        // 若 writeTb 不在 readTbs 中，補抓其名稱供新增術語分頁顯示
        if (project && project.writeTb && !readTbIds.includes(project.writeTb)) {
            const wFull = await DBService.getTB(project.writeTb);
            if (wFull) window.ActiveTbNames[project.writeTb] = wFull.name || `TB #${project.writeTb}`;
        }
        
        // Dynamic Key Columns Setup & Legacy Migration
        let maxKeys = 0;
        currentSegmentsList.forEach((seg, i) => {
            if (!seg.globalId) seg.globalId = i + 1; // Seamless legacy fix
            
            if (!seg.keys && seg.idValue) {
                let lines = seg.idValue.split('\n');
                seg.keys = lines.map(l => l.replace(/^String Key \d+: /, '').trim());
            } else if (!seg.keys) {
                seg.keys = [];
            }
            if(seg.keys && seg.keys.length > maxKeys) maxKeys = seg.keys.length;
        });

        const defaultCols = [];
        defaultCols.push({ id: 'col-id', name: 'ID', visible: true, width: '50px' });
        for(let i=0; i<maxKeys; i++) {
            defaultCols.push({ id: `col-key-${i}`, name: `Key`, visible: true, width: '100px' });
        }
        defaultCols.push({ id: 'col-source', name: '原文 (Source)', visible: true, width: '1fr' });
        defaultCols.push({ id: 'col-target', name: '譯文 (Target)', visible: true, width: '1fr' });
        defaultCols.push({ id: 'col-extra', name: '額外資訊', visible: true, width: '100px' });
        defaultCols.push({ id: 'col-repetition', name: '重複', visible: true, width: '35px' });
        defaultCols.push({ id: 'col-match', name: '相符度', visible: true, width: '35px' });
        defaultCols.push({ id: 'col-status', name: '狀態', visible: true, width: '35px' });

        const savedData = JSON.parse(localStorage.getItem('catToolColSettings')) || [];
        const savedColIds = savedData.map(c => c.id);
        const savedMap = new Map(savedData.map(c => [c.id, c]));

        colSettings = defaultCols.sort((a,b) => {
            let idxA = savedColIds.indexOf(a.id);
            let idxB = savedColIds.indexOf(b.id);
            if(idxA === -1 && idxB === -1) return 0;
            if(idxA === -1) return 1;
            if(idxB === -1) return -1;
            return idxA - idxB;
        });

        colSettings.forEach(c => {
            if(savedMap.has(c.id)) {
                c.visible = savedMap.get(c.id).visible;
                const savedW = savedMap.get(c.id).width;
                if(savedW && (savedW.includes('minmax') || (savedW.endsWith('px') && savedW !== '150px'))) {
                    c.width = savedW;
                }
            }
        });
        ensureStatusColumnLast();

        // Initialize grid headers
        const gridHeaderRow = document.getElementById('gridHeaderRow');
        gridHeaderRow.innerHTML = '';
        colSettings.forEach((c, index) => {
            const cell = document.createElement('div');
            cell.className = 'grid-header-cell';
            cell.setAttribute('data-col-id', c.id);
            
            // Rename Key 1 -> Key
            if (c.name === 'Key 1') c.name = 'Key';
            cell.textContent = c.name;
            
            // Status, Match, and Repetition don't have resizers and are fixed/sticky
            if (c.id !== 'col-status' && c.id !== 'col-match' && c.id !== 'col-repetition') {
                const resizer = document.createElement('div');
                resizer.className = 'col-resizer';
                resizer.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    
                    const activeColsList = colSettings.filter(cx => cx.visible);
                    const otherColsObj = activeColsList.filter(cx => cx.id !== 'col-status');
                    
                    const visibleIndex = otherColsObj.findIndex(cx => cx.id === c.id);
                    const nextCol = visibleIndex >= 0 && visibleIndex < otherColsObj.length - 1 ? otherColsObj[visibleIndex + 1] : null;

                    // 如果右側是「重複」欄，就不要提供拖曳調整，避免影響重複欄寬度
                    if (nextCol && nextCol.id === 'col-repetition') return;

                    if (!nextCol) return;

                    let startX = e.clientX;
                    const leftCell = cell;
                    const rightCell = gridHeaderRow.querySelector(`.grid-header-cell[data-col-id="${nextCol.id}"]`);
                    if (!leftCell || !rightCell) return;
                    
                    let startWidthLeft = leftCell.offsetWidth;
                    let startWidthRight = rightCell.offsetWidth;

                    const onMove = (ev) => {
                        let deltaX = ev.clientX - startX;
                        
                        let minLeft = c.id.startsWith('col-key') || c.id === 'col-extra' ? 120 : (c.id === 'col-source' || c.id === 'col-target' ? 200 : 50);
                        let minRight = nextCol.id.startsWith('col-key') || nextCol.id === 'col-extra' ? 120 : (nextCol.id === 'col-source' || nextCol.id === 'col-target' ? 200 : 50);
                        
                        if (startWidthLeft + deltaX < minLeft) deltaX = minLeft - startWidthLeft;
                        if (startWidthRight - deltaX < minRight) deltaX = startWidthRight - minRight;
                        
                        let newWidthLeft = startWidthLeft + deltaX;
                        let newWidthRight = startWidthRight - deltaX;
                        
                        c.width = `minmax(${minLeft}px, ${newWidthLeft}fr)`;
                        nextCol.width = `minmax(${minRight}px, ${newWidthRight}fr)`;
                        applyColSettings();
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        resizer.classList.remove('is-resizing');
                        localStorage.setItem('catToolColSettings', JSON.stringify(colSettings));
                    };
                    resizer.classList.add('is-resizing');
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
                cell.appendChild(resizer);
            }

            // set styles directly to avoid grid flash
            cell.style.order = index;
            cell.style.display = c.visible ? '' : 'none';
            gridHeaderRow.appendChild(cell);
        });
        
        applyColSettings();

        // Populate Sort Columns
        if (sortColSelect) {
            sortColSelect.innerHTML = '';
            colSettings.forEach(c => {
                if (['col-id', 'col-source', 'col-target'].includes(c.id) || c.id.startsWith('col-key-')) {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    sortColSelect.appendChild(opt);
                }
            });
            sortColSelect.value = 'col-id'; // default
            const e = new Event('change');
            sortColSelect.dispatchEvent(e);
        }

        // Remove active class from Nav Items and show Editor View specifically
        navItems.forEach(n => n.classList.remove('active'));
        viewSections.forEach(sec => sec.classList.add('hidden'));
        document.getElementById('viewEditor').classList.remove('hidden');
        sidebar.classList.add('collapsed');

        sfFilterSnapshotSegIds = null;
        sfFilterLockedSpecHash = '';
        highMatchEditConfirmedIds.clear();
        renderEditorSegments();
        runSearchAndFilter();
        joinCollabForFile(file);
        renderCollabPresence();
        refreshNewTermPanel();

        // Auto-load notes panel（resolvedProjectId 含檔案無 projectId 時沿用 currentProjectId／還原路由）
        if (resolvedProjectId) {
            loadEditorNotes(resolvedProjectId).catch(console.warn);
        }

        activeView = 'viewEditor';
        persistCatRoute();
    }

    btnExitEditor.addEventListener('click', async () => {
        const ok = await ensureWorkspaceNoteLeaveResolved();
        if (!ok) return;
        leaveCollabForCurrentFile();
        currentFileId = null;
        currentSegmentsList = [];
        gridBody.innerHTML = '';
        window.ActiveTmCache = [];
        window.ActiveTbTerms = [];
        sidebar.classList.remove('collapsed');
        await openProjectDetail(currentProjectId);
        persistCatRoute();
    });

    // --- PRE-TRANSLATE LOGIC ---
    const preTranslateModal = document.getElementById('preTranslateModal');
    const btnClosePreTranslate = document.getElementById('btnClosePreTranslate');
    const btnCancelPreTranslate = document.getElementById('btnCancelPreTranslate');
    const btnRunPreTranslate = document.getElementById('btnRunPreTranslate');
    const ptScopeSelectedText = document.getElementById('ptScopeSelectedText');
    const ptScopeSelected = document.getElementById('ptScopeSelected');
    const ptThreshold = document.getElementById('ptThreshold');
    const ptOverwrite = document.getElementById('ptOverwrite');
    const ptAutoConfirm = document.getElementById('ptAutoConfirm');
    const btnPreTranslate = document.getElementById('btnPreTranslate');

    if (btnPreTranslate) {
        btnPreTranslate.addEventListener('click', () => {
            if (activeView !== 'viewEditor') return;
            
            if (selectedRowIds.size > 0) {
                ptScopeSelected.disabled = false;
                ptScopeSelectedText.style.color = 'inherit';
                ptScopeSelectedText.textContent = `選取的句段 (${selectedRowIds.size} 筆)`;
            } else {
                ptScopeSelected.disabled = true;
                ptScopeSelectedText.style.color = '#64748b';
                ptScopeSelectedText.textContent = `選取的句段 (無選取)`;
                document.querySelector('input[name="ptScope"][value="all"]').checked = true;
            }

            preTranslateModal.classList.remove('hidden');
        });
    }

    if (btnClosePreTranslate) btnClosePreTranslate.addEventListener('click', () => preTranslateModal.classList.add('hidden'));
    if (btnCancelPreTranslate) btnCancelPreTranslate.addEventListener('click', () => preTranslateModal.classList.add('hidden'));
    
    if (btnRunPreTranslate) {
        btnRunPreTranslate.addEventListener('click', async () => {
            const scope = document.querySelector('input[name="ptScope"]:checked').value;
            const threshold = parseInt(ptThreshold.value) || 100;
            const overwrite = ptOverwrite.checked;
            const autoConfirm = ptAutoConfirm.checked;

            btnRunPreTranslate.disabled = true;
            btnRunPreTranslate.textContent = '處理中...';

            try {
                const affectedSegments = scope === 'selected' 
                    ? currentSegmentsList.filter(s => selectedRowIds.has(s.id))
                    : currentSegmentsList;
                
                let applyCount = 0;
                for (const seg of affectedSegments) {
                    if (seg.isLocked) continue;
                    if (!overwrite && seg.targetText.trim() !== '') continue;

                    let bestMatch = null;
                    let bestScore = 0;

                    if (window.ActiveTmCache && window.ActiveTmCache.length > 0) {
                        for (const tms of window.ActiveTmCache) {
                            const sim = calculateSimilarity(seg.sourceText, tms.sourceText);
                            if (sim > bestScore) {
                                bestScore = sim;
                                bestMatch = tms;
                            }
                            if (bestScore === 101) break; 
                        }
                    }

                    if (bestMatch && bestScore >= threshold) {
                        seg.targetText = bestMatch.targetText;
                        seg.matchValue = bestScore.toString();
                        if (autoConfirm && bestScore >= 100) {
                            seg.status = 'confirmed';
                        }
                        await DBService.updateSegmentTarget(seg.id, seg.targetText, { matchValue: seg.matchValue });
                        applyCount++;
                    }
                }
                
                alert(`預先翻譯完成！共更新 ${applyCount} 個句段。`);
                preTranslateModal.classList.add('hidden');
                renderEditorSegments();
                updateProgress();
            } catch (e) {
                console.error(e);
                alert('預先翻譯過程中發生錯誤');
            } finally {
                btnRunPreTranslate.disabled = false;
                btnRunPreTranslate.textContent = '開始套用';
            }
        });
    }

    // ==========================================
    // Side panel width drag-resize
    if (sidePanelWidthResizer && sidePanel && segmentsContainer) {
        let isResizingSide = false;
        let startXSide = 0;
        let startWidthSide = 0;
        sidePanelWidthResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizingSide = true;
            startXSide = e.clientX;
            startWidthSide = sidePanel.offsetWidth;
            document.body.style.cursor = 'ew-resize';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isResizingSide) return;
            const delta = startXSide - e.clientX;
            let newWidth = startWidthSide + delta;
            const minWidth = 260;
            const maxWidth = 600;
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;
            sidePanel.style.width = `${newWidth}px`;
        });
        document.addEventListener('mouseup', () => {
            if (!isResizingSide) return;
            isResizingSide = false;
            document.body.style.cursor = '';
        });
    }

    // ADVANCED SEARCH & FILTER ENGINE
    // ==========================================
    let sfMode = 'search'; // 'search' or 'filter'
    let sfUseRegexChecked = false;
    let sfSearchMatches = [];
    let sfActiveMatchIdx = -1;
    let sfFilterGroups = []; // [{ op: 'AND'/'OR', term, scopes, isRegex, isInvert, statuses, tms }]
    let sfFilterSnapshotSegIds = null;
    let sfFilterLockedSpecHash = '';
    const highMatchEditConfirmedIds = new Set();
    let highMatchModalPromiseResolver = null;
    let highMatchInputGuardBusy = false;
    let sfPresets = JSON.parse(localStorage.getItem('catToolSfPresets') || '{}');
    let lastEditedRowIdx = null; // Track cursor position
    let selectedRowIds = new Set(); // Track selected segment IDs
    /** 若設為數字，renderEditorSegments 結束後將焦點移到該句段譯文欄 */
    let _pendingFocusSegIdxAfterRender = null;
    let lastSelectedRowIdx = null; // Track last clicked for Shift-select
    let isBatchOpInProgress = false; // 批次操作進行中時，阻止 focusin 清除選取狀態
    
    // UI Elements
    const sfInput = document.getElementById('sfInput');
    const sfModeSearch = document.getElementById('sfModeSearch');
    const sfModeFilter = document.getElementById('sfModeFilter');
    const btnToggleAdvancedSF = document.getElementById('btnToggleAdvancedSF');
    const sfAdvancedPanel = document.getElementById('sfAdvancedPanel');
    const sfUseRegex = document.getElementById('sfUseRegex');
    const sfActionsSearch = document.getElementById('sfActionsSearch');
    const sfActionsFilter = document.getElementById('sfActionsFilter');
    const btnSfPrev = document.getElementById('btnSfPrev');
    const btnSfNext = document.getElementById('btnSfNext');
    const sfMatchCount = document.getElementById('sfMatchCount');
    const btnSfInvert = document.getElementById('btnSfInvert');
    const btnSfOptionsPopover = document.getElementById('btnSfOptionsPopover');
    const sfOptionsPopover = document.getElementById('sfOptionsPopover');
    const sfReplaceInput = document.getElementById('sfReplaceInput');
    const btnSfReplaceThis = document.getElementById('btnSfReplaceThis');
    const btnSfReplaceAll = document.getElementById('btnSfReplaceAll');
    ['sfModeSearch', 'sfModeFilter', 'btnSfPrev', 'btnSfNext', 'btnSfClearNav', 'btnToggleAdvancedSF', 'btnPreTranslate', 'btnSortMenu', 'btnCopySourceToTarget', 'btnClearTarget', 'btnTagCollapse', 'btnTagGroupMode', 'btnShortcuts', 'btnColSettings', 'exportBtn'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => emitCollabFocus('control', id));
    });
    if (sfInput) sfInput.addEventListener('focus', () => emitCollabFocus('control', 'sfInput'));
    if (sfReplaceInput) sfReplaceInput.addEventListener('focus', () => emitCollabFocus('control', 'sfReplaceInput'));
    
    // Toggles
    btnToggleAdvancedSF.addEventListener('click', () => {
        sfAdvancedPanel.classList.toggle('hidden');
        const isHidden = sfAdvancedPanel.classList.contains('hidden');
        btnToggleAdvancedSF.textContent = isHidden ? '▼' : '▲';
        // 當進階篩選啟動時，鎖定為「篩選」模式
        if (!isHidden) {
            sfMode = 'filter';
            sfModeFilter.classList.add('active');
            sfModeSearch.classList.remove('active');
            runSearchAndFilter();
        }
    });
    sfModeSearch.addEventListener('click', () => {
        // 進階篩選開啟時，強制維持在「篩選」模式
        if (!sfAdvancedPanel.classList.contains('hidden')) {
            sfMode = 'filter';
            sfModeFilter.classList.add('active');
            sfModeSearch.classList.remove('active');
            return;
        }
        if (sfMode === 'search') { sfModeFilter.click(); return; } // Toggle behavior
        sfMode = 'search'; sfModeSearch.classList.add('active'); sfModeFilter.classList.remove('active');
        runSearchAndFilter();
        emitCollabFocus('control', 'sfModeSearch');
    });
    sfModeFilter.addEventListener('click', () => {
        // 進階篩選開啟時，維持在「篩選」模式且不做切換邏輯
        if (!sfAdvancedPanel.classList.contains('hidden')) {
            sfMode = 'filter';
            sfModeFilter.classList.add('active');
            sfModeSearch.classList.remove('active');
            runSearchAndFilter();
            return;
        }
        if (sfMode === 'filter') { sfModeSearch.click(); return; } // Toggle behavior
        sfMode = 'filter'; sfModeFilter.classList.add('active'); sfModeSearch.classList.remove('active');
        runSearchAndFilter();
        emitCollabFocus('control', 'sfModeFilter');
    });
    sfUseRegex.addEventListener('change', (e) => { sfUseRegexChecked = e.target.checked; runSearchAndFilter(); });
    btnSfInvert.addEventListener('click', () => {
        if (btnSfInvert.classList.contains('sf-invert-disabled')) return;
        btnSfInvert.classList.toggle('active'); runSearchAndFilter();
    });
    if (btnSfOptionsPopover && sfOptionsPopover) {
        btnSfOptionsPopover.addEventListener('click', (e) => {
            e.stopPropagation();
            sfOptionsPopover.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!sfOptionsPopover.classList.contains('hidden') && !sfOptionsPopover.contains(e.target) && e.target !== btnSfOptionsPopover) {
                sfOptionsPopover.classList.add('hidden');
            }
        });
    }
    document.querySelectorAll('.sf-scope-cb, .sf-status-cb').forEach(cb => cb.addEventListener('change', runSearchAndFilter));
    document.getElementById('sfTmMatch').addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearchAndFilter, 300);
    });
    
    sfInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearchAndFilter, 300);
    });

    // 標籤群組插入模式：預設開啟（一次插入所有相鄰缺漏標籤）
    let tagGroupInsertMode = localStorage.getItem('tagGroupInsertMode') !== 'single'; // default: group

    // 標籤展開/收起：預設收起
    let tagsExpanded = false;

    /**
     * F8 插入規則：
     * - 無論如何都只插入「下一個缺漏 tag」（單一 tag）。
     * - 只有在「有選取文字」且「下一個缺漏為 open，並且其 close 也同樣缺漏」時，
     *   才在選取範圍前後插入一對 open/close。
     * - 有選取且下一個是 standalone（或 close 等非成對情況）→ 用該單一 tag 取代選取文字。
     * - 插入後游標不會跳到句尾。
     */
    function insertNextMissingTag(editorDiv, seg) {
        const sourceTags = seg.sourceTags || [];
        if (!sourceTags.length) return;

        const currentText = extractTextFromEditor(editorDiv) || seg.targetText || '';
        const presentPhs = new Set((currentText.match(/\{\/?\d+\}/g) || []));

        // 找出所有缺漏標籤（依 ph 是否存在）
        const missingTags = sourceTags.filter(t => !presentPhs.has(t.ph));
        if (!missingTags.length) return;

        // 選出「下一個」缺漏：用 num 最小；同 num 優先 open
        const firstMissing = missingTags.reduce(
            (a, b) => a.num < b.num ? a : (a.num === b.num && a.type === 'open' ? a : b)
        );

        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed && editorDiv.contains(sel.anchorNode);

        const openTag = (firstMissing.type === 'open') ? firstMissing : null;
        const closeTag = openTag
            ? (sourceTags.find(t => t.pairNum === openTag.pairNum && t.type === 'close') || null)
            : null;

        const shouldWrapSelection = hasSelection
            && openTag
            && closeTag
            && !presentPhs.has(closeTag.ph); // close 也缺漏才包覆

        // 取得目前游標/選取的 range
        const range = sel && sel.rangeCount > 0 && editorDiv.contains(sel.anchorNode)
            ? sel.getRangeAt(0)
            : (() => { const r = document.createRange(); r.selectNodeContents(editorDiv); r.collapse(false); return r; })();

        if (shouldWrapSelection) {
            const closeSpan = buildTagSpan(closeTag);
            const openSpan = buildTagSpan(openTag);

            // 在選取起點插入 open
            const startRange = range.cloneRange();
            startRange.collapse(true);
            startRange.insertNode(openSpan);

            // 在選取終點插入 close
            const endRange = range.cloneRange();
            endRange.collapse(false);
            endRange.insertNode(closeSpan);

            // 移動游標到 close 後
            const newRange = document.createRange();
            newRange.setStartAfter(closeSpan);
            newRange.collapse(true);
            if (sel) { sel.removeAllRanges(); sel.addRange(newRange); }
        } else {
            const tagToInsert = firstMissing;
            const span = buildTagSpan(tagToInsert);

            // 若有選取文字，則取代選取範圍
            if (hasSelection) range.deleteContents();
            range.insertNode(span);

            // 移動游標到插入後
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            if (sel) { sel.removeAllRanges(); sel.addRange(newRange); }
        }

        // 更新 targetText / 顏色 / 下一步提示
        seg.targetText = extractTextFromEditor(editorDiv);
        const row = editorDiv.closest('.grid-data-row');
        updateTagColors(row, seg.targetText);
        DBService.updateSegmentTarget(seg.id, seg.targetText).catch(console.error);
        refreshTagNextHighlight(row);
    }

    /** 建立單個標籤的 span 元素（用於游標插入）。 */
    function buildTagSpan(tag) {
        const span = document.createElement('span');
        const color = (tag.type === 'open' || tag.type === 'close')
            ? TAG_PAIR_COLORS[(tag.pairNum - 1) % TAG_PAIR_COLORS.length] : undefined;
        span.className = 'rt-tag' + (tag.type === 'open' ? ' rt-tag-s' : tag.type === 'close' ? ' rt-tag-e' : '');
        span.setAttribute('data-ph', tag.ph);
        span.setAttribute('data-pair', tag.pairNum);
        span.contentEditable = 'false';
        if (color) span.style.setProperty('--tag-color', color);
        span.innerHTML = `<span class="tag-num">${tag.num}</span><span class="tag-content">${escapeHtml(tag.display)}</span>`;
        return span;
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            sfInput.focus();
        }
        // Ctrl+Shift+A for Select All Segments
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            selectedRowIds.clear();
            currentSegmentsList.forEach(s => { if (!isDynamicForbidden(s) && !s.isLockedUser) selectedRowIds.add(s.id); });
            document.querySelectorAll('.grid-data-row').forEach(r => {
                const rId = parseId(r.dataset.segId);
                if (selectedRowIds.has(rId)) r.classList.add('selected-row');
                else r.classList.remove('selected-row');
            });
        }
        // F8: 插入下一個缺漏標籤（只插單一 tag；有選取且下一個可成對才包一對）
        if (e.key === 'F8' && currentFileId && !e.ctrlKey) {
            e.preventDefault();

            const sel = window.getSelection();
            let activeEditor = document.activeElement;
            if (!(activeEditor && activeEditor.classList && activeEditor.classList.contains('grid-textarea'))) {
                const anchor = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
                activeEditor = anchor && anchor.closest ? anchor.closest('.grid-textarea') : null;
            }

            if (activeEditor && activeEditor.contentEditable !== 'false') {
                const activeRow = activeEditor.closest('.grid-data-row');
                if (!activeRow) return;
                const segId = parseId(activeRow.dataset.segId);
                const seg = currentSegmentsList.find(s => s.id === segId);
                if (seg) insertNextMissingTag(activeEditor, seg);
            }
        }
        // Ctrl+F8：清除譯文中的所有標籤
        if (e.ctrlKey && e.key === 'F8' && currentFileId) {
            e.preventDefault();

            const sel = window.getSelection();
            let activeEditor = document.activeElement;
            if (!(activeEditor && activeEditor.classList && activeEditor.classList.contains('grid-textarea'))) {
                const anchor = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
                activeEditor = anchor && anchor.closest ? anchor.closest('.grid-textarea') : null;
            }

            if (activeEditor && activeEditor.contentEditable !== 'false') {
                const activeRow = activeEditor.closest('.grid-data-row');
                if (!activeRow) return;
                const segId = parseId(activeRow.dataset.segId);
                const seg = currentSegmentsList.find(s => s.id === segId);
                if (seg) {
                    const oldTarget = seg.targetText;
                    const oldMv = seg.matchValue;
                    const stripped = seg.targetText.replace(/\{\/?\d+\}/g, '');
                    seg.targetText = stripped;
                    seg.matchValue = undefined;
                    activeEditor.innerHTML = buildTaggedHtml(stripped, seg.targetTags || seg.sourceTags || []);
                    updateTagColors(activeRow, stripped);
                    refreshTagNextHighlight(activeRow);
                    applyMatchCellVisual(activeRow, '');
                    pushEditorUndo(seg.id, oldTarget, stripped, { oldMatchValue: oldMv, newMatchValue: undefined });
                    DBService.updateSegmentTarget(seg.id, stripped, { matchValue: '' }).catch(console.error);
                }
            }
        }
        // Ctrl+Insert：將原文複製到譯文
        if (e.ctrlKey && e.key === 'Insert' && currentFileId) {
            e.preventDefault();
            runTextOpOnSelection('copy-source');
        }
        // Ctrl+Delete：清除譯文
        if (e.ctrlKey && e.key === 'Delete' && currentFileId) {
            e.preventDefault();
            runTextOpOnSelection('clear');
        }
        // Ctrl+Shift+T: 切換標籤展開/收起
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
            e.preventDefault();
            tagsExpanded = !tagsExpanded;
            const editorGrid = document.getElementById('editorGrid');
            if (editorGrid) {
                editorGrid.classList.toggle('tags-expanded', tagsExpanded);
                editorGrid.classList.toggle('tags-collapsed', !tagsExpanded);
            }
            const tagToggleBtn = document.getElementById('btnTagCollapse');
            if (tagToggleBtn) tagToggleBtn.title = tagsExpanded ? '收起標籤 (Ctrl+Shift+T)' : '展開標籤 (Ctrl+Shift+T)';
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'k' && currentFileId) {
            e.preventDefault();
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            const tmSearchInput = document.getElementById('tmSearchInput');
            if (selText && tmSearchInput) tmSearchInput.value = selText;
            const tabBtn = document.querySelector('.tab-btn[data-tab="tabTmSearch"]');
            if (tabBtn) tabBtn.click();
            if (tmSearchInput && tmSearchInput.value.trim()) {
                runTmConcordanceSearch();
            } else if (tmSearchInput) {
                tmSearchInput.focus();
            }
        }
        function editorUndoHotkeyAllowed() {
            if (!currentFileId || !currentSegmentsList.length) return false;
            const ve = document.getElementById('viewEditor');
            if (!ve || ve.classList.contains('hidden')) return false;
            const ae = document.activeElement;
            if (ae && (ae.id === 'tmSearchInput' || ae.id === 'sfInput' || ae.id === 'sfReplaceInput')) return false;
            return true;
        }

        if (editorUndoHotkeyAllowed()) {
            if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                applyEditorUndo();
            } else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
                e.preventDefault();
                applyEditorRedo();
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || !/^[1-9]$/.test(e.key) || !currentFileId) return;
        const ve = document.getElementById('viewEditor');
        if (!ve || ve.classList.contains('hidden')) return;
        const ae = document.activeElement;
        if (ae && ae.id === 'tmSearchInput') return;
        if (!window.currentTmMatches || !window.currentTmMatches.length) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.applyCatMatchAtIndex === 'function') {
            window.applyCatMatchAtIndex(parseInt(e.key, 10) - 1);
        }
    }, true);

    btnSfNext.addEventListener('click', () => {
        if(sfSearchMatches.length === 0) return;
        sfActiveMatchIdx = (sfActiveMatchIdx + 1) % sfSearchMatches.length;
        updateMatchHighlightFocus();
    });
    btnSfPrev.addEventListener('click', () => {
        if(sfSearchMatches.length === 0) return;
        sfActiveMatchIdx = (sfActiveMatchIdx - 1 + sfSearchMatches.length) % sfSearchMatches.length;
        updateMatchHighlightFocus();
    });

    // Core Evaluator
    function evaluateSegment(seg, term, scopes, isRegex, isInvert, statuses, tmVal) {
        let textMatch = false;
        
        if (!term) textMatch = true;
        else {
             let regex;
             try {
                 regex = isRegex ? new RegExp(term, 'gi') : null;
             } catch(e) { return false; } // Invalid regex
             
             const checkMatch = (str) => {
                 if(!str) return false;
                 return isRegex ? regex.test(str) : str.toLowerCase().includes(term.toLowerCase());
             };

             // 搜尋時同時比對展開版（{N} 還原為實際標籤內容）
             const expandTags = (text, tags) => {
                 if (!tags || !tags.length) return text;
                 const map = {};
                 tags.forEach(t => { map[t.ph] = t.display || t.ph; });
                 return text.replace(/\{\/?\d+\}/g, m => map[m] !== undefined ? map[m] : m);
             };
             const srcExpanded = expandTags(seg.sourceText || '', seg.sourceTags);
             const tgtExpanded = expandTags(seg.targetText || '', seg.targetTags || seg.sourceTags);
             if(scopes.includes('source') && (checkMatch(seg.sourceText || '') || checkMatch(srcExpanded))) textMatch = true;
             if(scopes.includes('target') && (checkMatch(seg.targetText || '') || checkMatch(tgtExpanded))) textMatch = true;
             if(scopes.includes('extra') && checkMatch(seg.extraValue || '')) textMatch = true;
             if(scopes.includes('keys') && seg.keys) {
                 for (let k of seg.keys) if (checkMatch(k || '')) { textMatch = true; break; }
             }
        }
        
        if (term && isInvert && sfMode === 'filter') textMatch = !textMatch;

        let statusMatch = true;
        if(statuses.length > 0) {
            statusMatch = false;
            const isConfirmed = seg.status === 'confirmed';
            const isEmpty = !seg.targetText || !seg.targetText.trim();
            if(statuses.includes('empty') && isEmpty) statusMatch = true;
            if(statuses.includes('not_empty') && !isEmpty) statusMatch = true;
            if(statuses.includes('confirmed') && isConfirmed) statusMatch = true;
            if(statuses.includes('unconfirmed') && !isConfirmed) statusMatch = true;
            if(statuses.includes('locked') && seg.isLocked) statusMatch = true;
            if(statuses.includes('unlocked') && !seg.isLocked) statusMatch = true;
        }

        let tmMatch = true;
        if(tmVal && tmVal.trim() !== '') {
            // Check if segment has any TM match result >= required
            let highestTm = 0;
            // Mock: If seg has results array, find max. Default mock to 85.
            highestTm = seg.tmMatch || 0; // fallback

            const v = tmVal.trim();
            tmMatch = false; // default false
            if(v.startsWith('-')) {
                // -x (x and below)
                const max = parseInt(v.substring(1));
                if (!isNaN(max) && highestTm <= max) tmMatch = true;
            } else if (v.endsWith('-')) {
                // y- (y and above)
                const min = parseInt(v.substring(0, v.length-1));
                if (!isNaN(min) && highestTm >= min) tmMatch = true;
            } else if (v.includes('-')) {
                // x-y (x to y)
                const parts = v.split('-');
                if(parts.length === 2) {
                    const min = parseInt(parts[0]);
                    const max = parseInt(parts[1]);
                    if (!isNaN(min) && !isNaN(max) && highestTm >= min && highestTm <= max) tmMatch = true;
                }
            } else {
                // Exact match (or consider it single number)
                const exact = parseInt(v);
                if (!isNaN(exact) && highestTm === exact) tmMatch = true;
            }
        }

        return textMatch && statusMatch && tmMatch;
    }

    function getSfFilterSpecHash() {
        const adv = document.getElementById('sfAdvancedPanel');
        return JSON.stringify({
            mode: sfMode,
            term: sfInput ? sfInput.value : '',
            scopes: Array.from(document.querySelectorAll('.sf-scope-cb:checked')).map(cb => cb.value),
            statuses: Array.from(document.querySelectorAll('.sf-status-cb:checked')).map(cb => cb.value),
            tmVal: document.getElementById('sfTmMatch') ? document.getElementById('sfTmMatch').value : '',
            invert: btnSfInvert ? btnSfInvert.classList.contains('active') : false,
            regex: sfUseRegexChecked,
            groups: sfFilterGroups,
            advHidden: adv ? adv.classList.contains('hidden') : true
        });
    }

    function computeSegmentRowMatch(seg) {
        const term = sfInput.value;
        const scopes = Array.from(document.querySelectorAll('.sf-scope-cb:checked')).map(cb => cb.value);
        const statuses = Array.from(document.querySelectorAll('.sf-status-cb:checked')).map(cb => cb.value);
        const tmVal = document.getElementById('sfTmMatch').value;
        const isInvert = btnSfInvert.classList.contains('active');
        const hasUiFilter = (term || statuses.length > 0 || tmVal || isInvert);
        const isEvalMatch = evaluateSegment(seg, term, scopes, sfUseRegexChecked, isInvert, statuses, tmVal);
        let r_finalMatch = true;
        if (sfFilterGroups.length > 0) {
            if (!hasUiFilter) {
                r_finalMatch = evaluateSegment(seg, sfFilterGroups[0].term, sfFilterGroups[0].scopes, sfFilterGroups[0].isRegex, sfFilterGroups[0].isInvert, sfFilterGroups[0].statuses, sfFilterGroups[0].tmVal);
                for (let i = 1; i < sfFilterGroups.length; i++) {
                    const g = sfFilterGroups[i];
                    const m = evaluateSegment(seg, g.term, g.scopes, g.isRegex, g.isInvert, g.statuses, g.tmVal);
                    if (g.op === 'AND') r_finalMatch = r_finalMatch && m;
                    if (g.op === 'OR') r_finalMatch = r_finalMatch || m;
                }
            } else {
                r_finalMatch = isEvalMatch;
                for (let i = 0; i < sfFilterGroups.length; i++) {
                    const g = sfFilterGroups[i];
                    const m = evaluateSegment(seg, g.term, g.scopes, g.isRegex, g.isInvert, g.statuses, g.tmVal);
                    if (g.op === 'AND') r_finalMatch = r_finalMatch && m;
                    if (g.op === 'OR') r_finalMatch = r_finalMatch || m;
                }
            }
        } else {
            r_finalMatch = hasUiFilter ? isEvalMatch : true;
        }
        return r_finalMatch;
    }

    function isSfSearchControlActive() {
        const ae = document.activeElement;
        if (!ae) return false;
        const id = ae.id;
        if (id === 'sfInput' || id === 'sfReplaceInput' || id === 'sfTmMatch') return true;
        if (ae.closest && ae.closest('#sfAdvancedPanel')) return true;
        return false;
    }

    function runSearchAndFilter() {
        if (!currentSegmentsList.length) return;
        
        if (btnSfInvert) {
            if (sfMode === 'search') btnSfInvert.classList.add('sf-invert-disabled');
            else btnSfInvert.classList.remove('sf-invert-disabled');
        }

        sfSearchMatches = [];
        sfActiveMatchIdx = -1;
        
        const term = sfInput.value;
        const scopes = Array.from(document.querySelectorAll('.sf-scope-cb:checked')).map(cb => cb.value);
        const statuses = Array.from(document.querySelectorAll('.sf-status-cb:checked')).map(cb => cb.value);
        const tmVal = document.getElementById('sfTmMatch').value;
        const isInvert = btnSfInvert.classList.contains('active');
        
        const rows = document.querySelectorAll('.grid-data-row');

        const specHash = getSfFilterSpecHash();
        let didRebuildFilterSnapshot = false;
        if (sfMode !== 'filter') {
            sfFilterSnapshotSegIds = null;
            sfFilterLockedSpecHash = '';
        } else {
            const needNewSnapshot = sfFilterSnapshotSegIds === null || specHash !== sfFilterLockedSpecHash;
            if (needNewSnapshot) {
                const next = new Set();
                currentSegmentsList.forEach((seg) => {
                    if (computeSegmentRowMatch(seg)) next.add(seg.id);
                });
                sfFilterSnapshotSegIds = next;
                sfFilterLockedSpecHash = specHash;
                didRebuildFilterSnapshot = true;
            }
        }
        
        currentSegmentsList.forEach((seg, idx) => {
            const row = rows[idx];
            if(!row) return;

            const r_liveMatch = computeSegmentRowMatch(seg);

            // Filter Mode hiding：篩選模式下以快照列為準，避免句段內容變動即時剔除列
            if (sfMode === 'filter') {
                const vis = sfFilterSnapshotSegIds && sfFilterSnapshotSegIds.has(seg.id);
                row.style.display = vis ? '' : 'none';
            } else {
                row.style.display = '';
            }

            // Highlighting resetting
            row.querySelectorAll('.col-source, .col-extra, .col-id, [class^="col-key-"]').forEach(cell => {
                cell.innerHTML = cell.innerHTML.replace(/<mark class="search-match[^>]*>|<\/mark>/g, '');
            });
            // Reset target contenteditable: rebuild from stored text to remove old marks
            const targetEditor = row.querySelector('.grid-textarea');
            if (targetEditor) {
                const currentText = seg.targetText || '';
                targetEditor.innerHTML = buildTaggedHtml(currentText, seg.targetTags || seg.sourceTags || []);
            }

            // --- Apply Highlighting ---
            // Build a list of highlight requests for this row
            const highlightRequests = [];
            
            if (term && (sfMode === 'search' ? r_liveMatch : r_liveMatch)) {
                highlightRequests.push({ term, scopes, isRegex: sfUseRegexChecked, bg: null }); 
            }
            if (r_liveMatch || sfMode === 'search') {
                sfFilterGroups.forEach(g => {
                    if(g.term) highlightRequests.push({ term: g.term, scopes: g.scopes, isRegex: g.isRegex, bg: g.color });
                });
            }

            if (highlightRequests.length > 0) {
                const highlightCell = (cellSelector, rawText, isTextarea, segIdx, fieldKey) => {
                    // For target: highlight directly in contenteditable (no separate backdrop)
                    const cell = isTextarea ? row.querySelector('.grid-textarea') : row.querySelector(cellSelector);
                    if(!cell || !rawText) return;
                    
                    let newHtml = rawText;
                    let matchFoundInCell = false;

                    // Apply each request sequentially
                    highlightRequests.forEach(req => {
                        if(!req.scopes.includes(isTextarea ? 'target' : cellSelector.replace('.col-', ''))) {
                            if (cellSelector.startsWith('.col-key-') && req.scopes.includes('keys')) { /* valid */ }
                            else return;
                        }
                        
                        let regexObj = null;
                        if(req.isRegex) {
                            try { regexObj = new RegExp("(" + req.term + ")", 'gi'); } catch(e){}
                        }

                        if (req.isRegex && regexObj) {
                            if(regexObj.test(rawText)) matchFoundInCell = true;
                            const styleStr = req.bg ? ` style="background-color:${req.bg};"` : '';
                            newHtml = newHtml.replace(regexObj, `<mark class="search-match"${styleStr}>$1</mark>`);
                            regexObj.lastIndex = 0;
                        } else {
                            const lTerm = req.term.toLowerCase();
                            if(rawText.toLowerCase().indexOf(lTerm) !== -1) {
                                matchFoundInCell = true;
                                const escapedRaw = isTextarea ? rawText : rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const escapedTerm = req.term.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const escReg = new RegExp(`(${escapedTerm.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\$&')})`, 'gi');
                                const styleStr = req.bg ? ` style="background-color:${req.bg};"` : '';
                                newHtml = newHtml.replace(escReg, `<mark class="search-match"${styleStr}>$1</mark>`);
                            }
                        }
                    });

                    if(matchFoundInCell) {
                        cell.innerHTML = newHtml;
                        cell.querySelectorAll('.search-match').forEach(m => {
                            sfSearchMatches.push({ 
                                markEl: m, 
                                rowEl: row,
                                isTextarea: isTextarea,
                                textareaEl: isTextarea ? row.querySelector('.grid-textarea') : null,
                                segIdx: segIdx,
                                fieldKey: fieldKey
                            });
                        });
                    }
                };

                highlightCell('.col-source', seg.sourceText, false, idx, 'source');
                highlightCell('.col-extra', seg.extraValue || '', false, idx, 'extra');
                highlightCell('.col-target', seg.targetText, true, idx, 'target');
                if(seg.keys) {
                    for(let k=0; k<seg.keys.length; k++) highlightCell(`.col-key-${k}`, seg.keys[k], false, idx, 'key-' + k);
                }
            }
        });

        sfMatchCount.textContent = sfSearchMatches.length > 0 ? `1 / ${sfSearchMatches.length}` : `0 / 0`;
        if(sfSearchMatches.length > 0) {
            sfActiveMatchIdx = 0;
            updateMatchHighlightFocus();
        } else {
            sfMatchCount.textContent = `0 / 0`;
        }

        if (didRebuildFilterSnapshot && sfMode === 'filter' && lastEditedRowIdx !== null && !isSfSearchControlActive()) {
            const rowsAfter = document.querySelectorAll('.grid-data-row');
            const targetRow = rowsAfter[lastEditedRowIdx];
            if (targetRow && targetRow.style.display !== 'none') {
                const txt = targetRow.querySelector('.grid-textarea');
                if (txt && txt.contentEditable !== 'false') {
                    txt.focus();
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }

    function updateMatchHighlightFocus() {
        document.querySelectorAll('mark.search-match-active').forEach(m => m.classList.remove('search-match-active'));
        if(sfSearchMatches.length === 0 || sfActiveMatchIdx === -1) return;
        
        sfMatchCount.textContent = `${sfActiveMatchIdx + 1} / ${sfSearchMatches.length}`;
        const match = sfSearchMatches[sfActiveMatchIdx];
        
        match.markEl.classList.add('search-match-active');
        
        if (match.isTextarea && match.textareaEl) {
            if (!isSfSearchControlActive()) match.textareaEl.focus();
        }
        
        if (!isSfSearchControlActive()) {
            match.rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function getSegmentFieldText(seg, segIdx, fieldKey) {
        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : document.querySelectorAll('.grid-data-row');
        const row = rows[segIdx];
        if (fieldKey === 'target' && row) {
            const ta = row.querySelector('.grid-textarea');
            if (ta) return extractTextFromEditor(ta);
        }
        if (fieldKey === 'source') return seg.sourceText || '';
        if (fieldKey === 'extra') return seg.extraValue || '';
        if (fieldKey.startsWith('key-')) {
            const k = parseInt(fieldKey.replace('key-', ''), 10);
            return (seg.keys && seg.keys[k]) || '';
        }
        return '';
    }

    function insertPlainTextAtCaret(editorEl, plainText) {
        if (!editorEl || !plainText) return;
        editorEl.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editorEl.appendChild(document.createTextNode(plainText));
            return;
        }
        const range = sel.getRangeAt(0);
        if (!editorEl.contains(range.commonAncestorContainer)) {
            editorEl.appendChild(document.createTextNode(plainText));
            return;
        }
        range.deleteContents();
        const textNode = document.createTextNode(plainText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function applyMatchCellVisual(rowEl, matchValue) {
        if (!rowEl) return;
        const matchCell = rowEl.querySelector('.col-match');
        if (!matchCell) return;
        if (matchValue == null || matchValue === '') {
            matchCell.textContent = '';
            matchCell.style.background = '';
            return;
        }
        const mv = parseInt(String(matchValue), 10);
        if (!isNaN(mv)) {
            matchCell.style.background = mv >= 100 ? '#dcfce7' : (mv >= 70 ? '#ffedd5' : '');
            matchCell.textContent = String(matchValue);
        } else {
            matchCell.style.background = '';
            matchCell.textContent = String(matchValue);
        }
    }

    function snapshotSegForUndo(seg) {
        if (!seg) return null;
        return {
            targetText: seg.targetText,
            status: seg.status,
            confirmationRole: seg.confirmationRole,
            isLockedUser: !!seg.isLockedUser,
            matchValue: seg.matchValue,
            targetTags: seg.targetTags ? seg.targetTags.map(t => ({ ...t })) : []
        };
    }

    function applySegSnapshotToModel(seg, snap) {
        if (!seg || !snap) return;
        seg.targetText = snap.targetText;
        seg.status = snap.status;
        seg.confirmationRole = snap.confirmationRole;
        seg.isLockedUser = snap.isLockedUser;
        seg.matchValue = snap.matchValue;
        seg.targetTags = snap.targetTags ? snap.targetTags.map(t => ({ ...t })) : [];
    }

    async function persistSegStateToDb(seg) {
        const ex = currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {};
        if (seg.isLockedUser !== undefined) {
            ex.isLockedUser = seg.isLockedUser;
            ex.isLocked = !!(seg.isLockedSystem || seg.isLockedUser);
        }
        await DBService.updateSegmentStatus(seg.id, seg.status, ex);
        await DBService.updateSegmentTarget(seg.id, seg.targetText, { targetTags: seg.targetTags, matchValue: seg.matchValue });
    }

    function pushUndoEntry(entry) {
        editorUndoStack.push(entry);
        editorRedoStack.length = 0;
    }

    /** @param extras.oldMatchValue, newMatchValue, oldStatus, newStatus, oldTargetTags, newTargetTags */
    function pushEditorUndo(segmentId, oldTarget, newTarget, extras = {}) {
        if (oldTarget === newTarget && !extras.force) return;
        pushUndoEntry({
            kind: 'target',
            segmentId,
            oldTarget,
            newTarget,
            oldMatchValue: extras.oldMatchValue,
            newMatchValue: extras.newMatchValue,
            oldStatus: extras.oldStatus,
            newStatus: extras.newStatus,
            oldTargetTags: extras.oldTargetTags,
            newTargetTags: extras.newTargetTags
        });
    }

    async function applyTmUndoOps(ops) {
        if (!ops || !ops.length) return;
        for (let i = ops.length - 1; i >= 0; i--) {
            const op = ops[i];
            if (op.op === 'delete') {
                await DBService.deleteTMSegment(op.id);
                window.ActiveTmCache = (window.ActiveTmCache || []).filter(t => t.id !== op.id);
            } else if (op.op === 'update') {
                await DBService.updateTMSegment(op.id, op.oldTarget, { changeLog: op.oldChangeLog || [] });
                window.ActiveTmCache.forEach(tms => {
                    if (tms.id === op.id) {
                        tms.targetText = op.oldTarget;
                        tms.changeLog = op.oldChangeLog || [];
                    }
                });
            }
        }
    }

    async function applyTmRedoOps(ops) {
        if (!ops || !ops.length) return;
        for (const op of ops) {
            if (op.op === 'create') {
                const newId = await DBService.addTMSegment(op.tmId, op.sourceText, op.targetText, op.meta || {});
                const full = await DBService.getTMSegmentById(newId);
                const tmRow = await DBService.getTM(op.tmId);
                const tmName = tmRow ? tmRow.name : `TM #${op.tmId}`;
                if (full && !window.ActiveTmCache.some(t => t.id === full.id)) {
                    window.ActiveTmCache.push({ ...full, _tmId: op.tmId, tmName });
                }
            } else if (op.op === 'update') {
                await DBService.updateTMSegment(op.id, op.newTarget, { changeLog: op.newChangeLog || [] });
                window.ActiveTmCache.forEach(tms => {
                    if (tms.id === op.id) {
                        tms.targetText = op.newTarget;
                        tms.changeLog = op.newChangeLog || [];
                    }
                });
            }
        }
    }

    function normalizeUndoEntry(entry) {
        if (!entry) return null;
        if (entry.kind) return entry;
        return {
            kind: 'target',
            segmentId: entry.segmentId,
            oldTarget: entry.oldTarget,
            newTarget: entry.newTarget
        };
    }

    function applyOneTargetUndo(te, direction) {
        const isUndo = direction === 'undo';
        const segIdx = currentSegmentsList.findIndex(s => s.id === te.segmentId);
        if (segIdx === -1) return null;
        const seg = currentSegmentsList[segIdx];
        const tgt = isUndo ? te.oldTarget : te.newTarget;
        const mv = isUndo ? te.oldMatchValue : te.newMatchValue;
        const st = isUndo ? te.oldStatus : te.newStatus;
        const tags = isUndo ? te.oldTargetTags : te.newTargetTags;

        seg.targetText = tgt;
        if (mv !== undefined) seg.matchValue = mv;
        if (st !== undefined) seg.status = st;
        if (tags !== undefined) seg.targetTags = tags ? tags.map(t => ({ ...t })) : [];

        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : document.querySelectorAll('.grid-data-row');
        const row = rows[segIdx];
        if (row) {
            const ta = row.querySelector('.grid-textarea');
            if (ta) {
                ta.innerHTML = buildTaggedHtml(tgt, seg.targetTags || seg.sourceTags || []);
                updateTagColors(row, tgt);
            }
            applyMatchCellVisual(row, seg.matchValue);
            const effectiveLocked = !!(isDynamicForbidden(seg) || seg.isLockedUser);
            const isConfirmed = seg.status === 'confirmed';
            if (isConfirmed && !effectiveLocked) {
                row.style.backgroundColor = '#f0fdf4';
                row.classList.add('row-bg-confirmed');
            } else {
                row.style.backgroundColor = '';
                row.classList.remove('row-bg-confirmed');
            }
            const si = row.querySelector('.status-icon');
            if (si) {
                if (isConfirmed) {
                    si.classList.add('done');
                    if (currentFileFormat === 'mqxliff') {
                        const role = seg.confirmationRole || 'T';
                        if (role === 'R1') {
                            si.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                        } else if (role === 'R2') {
                            si.innerHTML = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                        } else {
                            si.innerHTML = '&#10003;';
                        }
                    }
                } else {
                    si.classList.remove('done');
                    if (currentFileFormat === 'mqxliff') si.innerHTML = '';
                }
            }
            if (editorUndoEditStart[seg.id] !== undefined) editorUndoEditStart[seg.id] = tgt;
        }

        const extra = {};
        if (mv !== undefined) extra.matchValue = mv;
        if (tags !== undefined) extra.targetTags = seg.targetTags;
        if (st !== undefined) {
            DBService.updateSegmentStatus(seg.id, st, currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {}).catch(console.error);
        }
        if (seg.id) DBService.updateSegmentTarget(seg.id, tgt, extra).catch(console.error);

        return {
            kind: 'target',
            segmentId: te.segmentId,
            oldTarget: isUndo ? te.newTarget : te.oldTarget,
            newTarget: isUndo ? te.oldTarget : te.newTarget,
            oldMatchValue: isUndo ? te.newMatchValue : te.oldMatchValue,
            newMatchValue: isUndo ? te.oldMatchValue : te.newMatchValue,
            oldStatus: isUndo ? te.newStatus : te.oldStatus,
            newStatus: isUndo ? te.oldStatus : te.newStatus,
            oldTargetTags: isUndo ? te.newTargetTags : te.oldTargetTags,
            newTargetTags: isUndo ? te.oldTargetTags : te.newTargetTags
        };
    }

    function applySegmentStateItems(entry, direction) {
        const isUndo = direction === 'undo';
        for (const it of entry.items) {
            const segIdx = currentSegmentsList.findIndex(s => s.id === it.id);
            if (segIdx === -1) continue;
            const seg = currentSegmentsList[segIdx];
            const snap = isUndo ? it.beforeSnap : it.afterSnap;
            applySegSnapshotToModel(seg, snap);
            const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : document.querySelectorAll('.grid-data-row');
            const row = rows[segIdx];
            if (row) {
                const ta = row.querySelector('.grid-textarea');
                if (ta) {
                    ta.innerHTML = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
                    updateTagColors(row, seg.targetText);
                }
                applyMatchCellVisual(row, seg.matchValue);
                const effectiveLockedSystem = isDynamicForbidden(seg);
                const effectiveLocked = !!(effectiveLockedSystem || seg.isLockedUser);
                let lockedClass = '';
                if (effectiveLockedSystem) lockedClass = 'locked-system';
                else if (seg.isLockedUser) lockedClass = 'locked-user';
                row.className = `grid-data-row ${lockedClass}`.trim();
                if (effectiveLockedSystem) row.title = getForbiddenTooltip(seg);
                else if (seg.isLockedUser) row.title = '句段鎖定中，請解除鎖定後再編輯';
                else row.title = '';
                const isConfirmed = seg.status === 'confirmed';
                if (isConfirmed && !effectiveLocked) {
                    row.style.backgroundColor = '#f0fdf4';
                    row.classList.add('row-bg-confirmed');
                } else {
                    row.style.backgroundColor = '';
                    row.classList.remove('row-bg-confirmed');
                }
                const si = row.querySelector('.status-icon');
                if (si) {
                    if (isConfirmed) {
                        si.classList.add('done');
                        if (currentFileFormat === 'mqxliff') {
                            const role = seg.confirmationRole || 'T';
                            if (role === 'R1') {
                                si.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                            } else if (role === 'R2') {
                                si.innerHTML = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                            } else {
                                si.innerHTML = '&#10003;';
                            }
                        }
                    } else {
                        si.classList.remove('done');
                        if (currentFileFormat === 'mqxliff') si.innerHTML = '';
                    }
                }
            }
            const ex = currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {};
            if (seg.isLockedUser !== undefined) {
                ex.isLockedUser = seg.isLockedUser;
                ex.isLocked = !!(seg.isLockedSystem || seg.isLockedUser);
            }
            DBService.updateSegmentStatus(seg.id, seg.status, ex).catch(console.error);
            DBService.updateSegmentTarget(seg.id, seg.targetText, { targetTags: seg.targetTags, matchValue: seg.matchValue }).catch(console.error);
        }
    }

    function applyEditorUndo() {
        const raw = editorUndoStack.pop();
        const entry = normalizeUndoEntry(raw);
        if (!entry) return;

        if (entry.kind === 'compound') {
            const redoEntries = [];
            for (let i = entry.entries.length - 1; i >= 0; i--) {
                const te = normalizeUndoEntry(entry.entries[i]);
                if (te.kind === 'target') redoEntries.unshift(applyOneTargetUndo(te, 'undo'));
            }
            editorRedoStack.push({ kind: 'compound', entries: redoEntries });
            updateProgress();
            return;
        }

        if (entry.kind === 'segmentState') {
            applySegmentStateItems(entry, 'undo');
            editorRedoStack.push(entry);
            updateProgress();
            return;
        }

        if (entry.kind === 'confirmOp') {
            (async () => {
                for (const id of Object.keys(entry.beforeSnapshots)) {
                    const seg = currentSegmentsList.find(s => String(s.id) === String(id));
                    const snap = entry.beforeSnapshots[id];
                    if (seg && snap) {
                        applySegSnapshotToModel(seg, snap);
                        await persistSegStateToDb(seg);
                    }
                }
                await applyTmUndoOps(entry.tmUndo || []);
                renderEditorSegments();
                const ar = document.querySelector('.grid-data-row.active-row');
                const aid = ar ? parseId(ar.dataset.segId) : null;
                const activeSeg = aid != null ? currentSegmentsList.find(s => s.id === aid) : null;
                if (activeSeg) renderLiveTmMatches(activeSeg);
                updateProgress();
            })().catch(console.error);
            editorRedoStack.push({
                kind: 'confirmOp',
                beforeSnapshots: entry.afterSnapshots,
                afterSnapshots: entry.beforeSnapshots,
                tmUndo: entry.tmRedo || [],
                tmRedo: entry.tmUndo || []
            });
            return;
        }

        if (entry.kind === 'target') {
            const mirror = applyOneTargetUndo(entry, 'undo');
            editorRedoStack.push(mirror);
            updateProgress();
        }
    }

    function applyEditorRedo() {
        const raw = editorRedoStack.pop();
        const entry = normalizeUndoEntry(raw);
        if (!entry) return;

        if (entry.kind === 'compound') {
            const undoEntries = [];
            for (let i = 0; i < entry.entries.length; i++) {
                const te = normalizeUndoEntry(entry.entries[i]);
                if (te.kind === 'target') undoEntries.push(applyOneTargetUndo(te, 'redo'));
            }
            editorUndoStack.push({ kind: 'compound', entries: undoEntries });
            updateProgress();
            return;
        }

        if (entry.kind === 'segmentState') {
            applySegmentStateItems(entry, 'redo');
            editorUndoStack.push(entry);
            updateProgress();
            return;
        }

        if (entry.kind === 'confirmOp') {
            (async () => {
                for (const id of Object.keys(entry.beforeSnapshots)) {
                    const seg = currentSegmentsList.find(s => String(s.id) === String(id));
                    const snap = entry.beforeSnapshots[id];
                    if (seg && snap) {
                        applySegSnapshotToModel(seg, snap);
                        await persistSegStateToDb(seg);
                    }
                }
                await applyTmRedoOps(entry.tmRedo || []);
                renderEditorSegments();
                const ar = document.querySelector('.grid-data-row.active-row');
                const aid = ar ? parseId(ar.dataset.segId) : null;
                const activeSeg = aid != null ? currentSegmentsList.find(s => s.id === aid) : null;
                if (activeSeg) renderLiveTmMatches(activeSeg);
                updateProgress();
            })().catch(console.error);
            editorUndoStack.push({
                kind: 'confirmOp',
                beforeSnapshots: entry.afterSnapshots,
                afterSnapshots: entry.beforeSnapshots,
                tmUndo: entry.tmRedo || [],
                tmRedo: entry.tmUndo || []
            });
            return;
        }

        if (entry.kind === 'target') {
            const mirror = applyOneTargetUndo(entry, 'redo');
            editorUndoStack.push(mirror);
            updateProgress();
        }
    }

    function setSegmentFieldText(seg, segIdx, fieldKey, newText) {
        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : document.querySelectorAll('.grid-data-row');
        const row = rows[segIdx];
        if (fieldKey === 'target') {
            seg.targetText = newText;
            if (row) {
                const ta = row.querySelector('.grid-textarea');
                if (ta) {
                    ta.innerHTML = buildTaggedHtml(newText, seg.targetTags || seg.sourceTags || []);
                    updateTagColors(row, newText);
                }
            }
            if (seg.id) DBService.updateSegmentTarget(seg.id, newText).catch(console.error);
            return;
        }
        if (fieldKey === 'source') seg.sourceText = newText;
        else if (fieldKey === 'extra') seg.extraValue = newText;
        else if (fieldKey.startsWith('key-')) {
            const k = parseInt(fieldKey.replace('key-', ''), 10);
            if (!seg.keys) seg.keys = [];
            seg.keys[k] = newText;
        }
        if (row) {
            const cell = row.querySelector('.col-' + fieldKey);
            if (cell && !cell.querySelector('textarea')) cell.textContent = newText;
        }
    }

    function doReplaceInText(text, searchTerm, replaceTerm, isRegex, firstOnly) {
        if (!text || searchTerm === '') return text;
        if (isRegex) {
            try {
                const regex = new RegExp(searchTerm, firstOnly ? 'i' : 'g');
                return text.replace(regex, replaceTerm);
            } catch(e) { return text; }
        }
        const lower = searchTerm.toLowerCase();
        if (firstOnly) {
            const idx = text.toLowerCase().indexOf(lower);
            if (idx === -1) return text;
            return text.substring(0, idx) + replaceTerm + text.substring(idx + searchTerm.length);
        }
        let result = text;
        let pos = 0;
        for (;;) {
            const idx = result.toLowerCase().indexOf(lower, pos);
            if (idx === -1) break;
            result = result.substring(0, idx) + replaceTerm + result.substring(idx + searchTerm.length);
            pos = idx + replaceTerm.length;
        }
        return result;
    }

    function findNextTargetMatchIndex(fromIdx) {
        if (!sfSearchMatches.length) return -1;
        for (let i = fromIdx; i < sfSearchMatches.length; i++) {
            if (sfSearchMatches[i].fieldKey === 'target') return i;
        }
        for (let i = 0; i < fromIdx; i++) {
            if (sfSearchMatches[i].fieldKey === 'target') return i;
        }
        return -1;
    }

    function segmentNeedsHighMatchGuard(seg) {
        if (!seg || highMatchEditConfirmedIds.has(seg.id)) return false;
        const mv = seg.matchValue;
        if (mv == null || mv === '') return false;
        const s = String(mv).trim();
        const n = parseInt(s, 10);
        if (!isNaN(n) && n > 100) return true;
        if (/^(ICE|XTL)$/i.test(s)) return true;
        if (seg.importMatchKind) {
            const k = String(seg.importMatchKind).toUpperCase();
            if (k === 'ICE' || k === 'XTL' || k === '101' || k === 'CTX') return true;
        }
        return false;
    }

    function showHighMatchEditConfirmModal(seg, bulkCount) {
        return new Promise((resolve) => {
            if (!highMatchGuardModal || !highMatchGuardMessage) {
                resolve(true);
                return;
            }
            highMatchModalPromiseResolver = resolve;
            const mv = seg && seg.matchValue != null ? String(seg.matchValue) : '';
            const ik = seg && seg.importMatchKind ? String(seg.importMatchKind) : '';
            if (bulkCount != null && bulkCount > 0) {
                highMatchGuardMessage.textContent = `即將批次取代 ${bulkCount} 句；其中含有來稿標示為高信心相符（高於一般 100%，例如 101%、ICE 或 XTL 等）。若繼續，表示您確認要覆寫這些譯文。`;
            } else {
                highMatchGuardMessage.textContent = `此句在來稿中的相符度為「${mv || ik || '高於 100%'}」。通常表示已依上下文自動帶入譯文。若修改譯文，表示您確認不再沿用該結果。`;
            }
            highMatchGuardModal.classList.remove('hidden');
        });
    }

    async function performReplaceThis() {
        const term = sfInput.value;
        const replaceTerm = sfReplaceInput ? sfReplaceInput.value : '';
        if (!term || !currentSegmentsList.length) return;
        if (sfSearchMatches.length === 0) return;
        let idx = sfActiveMatchIdx < 0 ? 0 : sfActiveMatchIdx;

        // 先對齊到目前或之後「譯文欄」的符合項目（不管鎖定與否）
        let match = sfSearchMatches[idx];
        if (match.fieldKey !== 'target') {
            idx = findNextTargetMatchIndex(idx + 1);
            if (idx < 0) return;
            match = sfSearchMatches[idx];
        }

        const seg = currentSegmentsList[match.segIdx];
        if (!seg) return;

        // 若目前命中在鎖定句段中：不做取代，只把焦點移到下一個譯文命中
        if (seg.isLocked) {
            const nextIdx = findNextTargetMatchIndex(idx + 1);
            sfActiveMatchIdx = nextIdx >= 0 ? nextIdx : idx; // 若沒有下一個，就留在原處
            updateMatchHighlightFocus();
            return;
        }

        let text = getSegmentFieldText(seg, match.segIdx, 'target');
        const newText = doReplaceInText(text, term, replaceTerm, sfUseRegexChecked, true);
        if (newText === text) return;
        if (segmentNeedsHighMatchGuard(seg)) {
            const ok = await showHighMatchEditConfirmModal(seg);
            if (!ok) return;
            highMatchEditConfirmedIds.add(seg.id);
        }
        pushEditorUndo(seg.id, text, newText, { oldMatchValue: seg.matchValue, newMatchValue: seg.matchValue });
        setSegmentFieldText(seg, match.segIdx, 'target', newText);
        runSearchAndFilter();
        if (sfSearchMatches.length > 0) {
            // 重新從第一個譯文命中開始走，確保不會跳過同一句段中的其他相符項目
            const firstTargetIdx = findNextTargetMatchIndex(0);
            sfActiveMatchIdx = firstTargetIdx >= 0 ? firstTargetIdx : 0;
            updateMatchHighlightFocus();
        }
    }

    function updateSfReplaceAllButtonLabel() {
        if (!btnSfReplaceAll) return;
        const multi = selectedRowIds && selectedRowIds.size > 1;
        btnSfReplaceAll.textContent = multi ? '在選取範圍取代' : '全部取代';
    }

    function unconfirmSegmentVisualAfterReplace(seg, segIdx) {
        seg.status = 'unconfirmed';
        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : [];
        const row = rows[segIdx];
        if (row) {
            row.style.backgroundColor = '';
            row.classList.remove('row-bg-confirmed');
            const si = row.querySelector('.status-icon');
            if (si) {
                si.classList.remove('done');
                if (currentFileFormat === 'mqxliff') si.innerHTML = '';
            }
        }
        const ex = currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {};
        DBService.updateSegmentStatus(seg.id, 'unconfirmed', ex).catch(console.error);
    }

    const AFTER_CONFIRM_NAV_KEY = 'catToolAfterConfirmNav';
    let confirmSideEffectChain = Promise.resolve();

    function enqueueConfirmSideEffects(fn) {
        confirmSideEffectChain = confirmSideEffectChain.then(() => fn()).catch((err) => console.error(err));
        return confirmSideEffectChain;
    }

    function getAfterConfirmNavMode() {
        return localStorage.getItem(AFTER_CONFIRM_NAV_KEY) || 'nextUnconfirmed';
    }

    function rowIndexHasEditableTarget(segIdx) {
        const s = currentSegmentsList[segIdx];
        if (!s) return false;
        return !isDynamicForbidden(s) && !s.isLockedUser;
    }

    /** @returns {number|null} 下一個焦點句段索引，無則 null */
    function getAfterConfirmFocusIndex(currentIndex) {
        const mode = getAfterConfirmNavMode();
        const n = currentSegmentsList.length;
        if (n === 0) return null;
        if (mode === 'nextRow') {
            for (let j = currentIndex + 1; j < n; j++) {
                if (rowIndexHasEditableTarget(j)) return j;
            }
            return null;
        }
        for (let j = currentIndex + 1; j < n; j++) {
            const s = currentSegmentsList[j];
            if (s && s.status !== 'confirmed' && rowIndexHasEditableTarget(j)) return j;
        }
        return null;
    }

    function focusTargetEditorAtSegmentIndex(segIdx) {
        if (segIdx == null || segIdx < 0) return;
        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : [];
        const row = rows[segIdx];
        if (!row) return;
        const ed = row.querySelector('.grid-textarea');
        if (ed && ed.contentEditable !== 'false') {
            row.scrollIntoView({ block: 'nearest' });
            ed.focus();
        }
    }

    async function performReplaceAll() {
        const term = sfInput.value;
        const replaceTerm = sfReplaceInput ? sfReplaceInput.value : '';
        if (!term || !currentSegmentsList.length) return;
        const rows = gridBody ? gridBody.querySelectorAll('.grid-data-row') : [];
        const multiSelection = selectedRowIds && selectedRowIds.size > 1;
        const pending = [];
        currentSegmentsList.forEach((seg, segIdx) => {
            if (seg.isLocked) return;
            const row = rows[segIdx];
            if (multiSelection && !selectedRowIds.has(seg.id)) return;
            if (!multiSelection && row && row.style.display === 'none') return;
            const text = getSegmentFieldText(seg, segIdx, 'target');
            const newText = doReplaceInText(text, term, replaceTerm, sfUseRegexChecked, false);
            if (newText !== text) pending.push({ seg, segIdx, text, newText });
        });
        const risky = pending.filter((p) => segmentNeedsHighMatchGuard(p.seg));
        if (risky.length) {
            const ok = await showHighMatchEditConfirmModal(null, risky.length);
            if (!ok) return;
            risky.forEach((p) => highMatchEditConfirmedIds.add(p.seg.id));
        }
        const bundle = [];
        let replacedCount = 0;
        pending.forEach((p) => {
            const oldStatus = p.seg.status;
            const newStatus = oldStatus === 'confirmed' ? 'unconfirmed' : oldStatus;
            bundle.push({
                kind: 'target',
                segmentId: p.seg.id,
                oldTarget: p.text,
                newTarget: p.newText,
                oldMatchValue: p.seg.matchValue,
                newMatchValue: p.seg.matchValue,
                oldStatus,
                newStatus
            });
            setSegmentFieldText(p.seg, p.segIdx, 'target', p.newText);
            if (oldStatus === 'confirmed') {
                unconfirmSegmentVisualAfterReplace(p.seg, p.segIdx);
            }
            replacedCount++;
        });
        if (bundle.length) pushUndoEntry({ kind: 'compound', entries: bundle });
        runSearchAndFilter();
        if (replacedCount > 0) updateProgress();
    }

    if (btnSfReplaceThis) btnSfReplaceThis.addEventListener('click', () => performReplaceThis().catch(console.error));
    if (btnSfReplaceAll) btnSfReplaceAll.addEventListener('click', () => performReplaceAll().catch(console.error));

    // --- Advanced Groups & Presets ---
    const sfActiveGroupsContainer = document.getElementById('sfActiveGroupsContainer');
    const btnAddFilterGroup = document.getElementById('btnAddFilterGroup');
    const btnSaveFilterPreset = document.getElementById('btnSaveFilterPreset');
    const sfPresetsSelect = document.getElementById('sfPresetsSelect');
    function getRandomGroupColor() {
        let h;
        // avoid 30-60 (orange/yellow used by active UI search) and extremely dark colors
        do { h = Math.floor(Math.random() * 360); } while (h >= 30 && h <= 60);
        return `hsl(${h}, 70%, 85%)`;
    }

    const scopeNames = { 'source':'原文', 'target':'譯文', 'keys':'Key', 'extra':'額外資訊' };
    const statusNames = { 'empty':'空白', 'not_empty':'非空白', 'confirmed':'已確認', 'unconfirmed':'未確認', 'locked':'鎖定', 'unlocked':'未鎖定' };

    function renderFilterGroups() {
        sfActiveGroupsContainer.innerHTML = '';
        if(sfFilterGroups.length === 0) {
            sfActiveGroupsContainer.style.display = 'none';
            return;
        }
        sfActiveGroupsContainer.style.display = 'flex';
        sfFilterGroups.forEach((g, idx) => {
            const chip = document.createElement('div');
            chip.className = 'sf-group-chip';
            if(g.color) { 
                chip.style.backgroundColor = g.color; 
                chip.style.borderColor = g.color; 
                chip.style.color = '#1e293b'; 
            }
            
            const opHtml = `<div class="sf-group-op" title="點擊切換"><span>${g.op === 'AND' ? '且' : '或'}</span></div>`;
            
            let strPart = g.term ? `${g.isInvert ? '(不包含) ' : ''}字串「${g.term}」 / 搜尋範圍：${g.scopes.map(s => scopeNames[s]||s).join('、')}` : '';
            if (g.isInvert && !g.term) strPart = '(不包含) 全部字串';
            
            let statusPartText = g.statuses.length ? g.statuses.map(s => statusNames[s]||s).join('、') : '無';
            let tmPartText = g.tmVal ? g.tmVal + '' : '無';
            let statusTmPart = `句段狀態：${statusPartText} / 翻譯記憶相符度：${tmPartText}`;

            chip.innerHTML = `
                ${opHtml}
                <div class="sf-group-content">
                    ${strPart ? `<div>${strPart}</div>` : ''}
                    <div>${statusTmPart}</div>
                </div>
                <div class="sf-group-del" title="移除">✖</div>
            `;

            chip.querySelector('.sf-group-op').addEventListener('click', () => {
                g.op = g.op === 'AND' ? 'OR' : 'AND';
                renderFilterGroups(); runSearchAndFilter();
            });
            chip.querySelector('.sf-group-del').addEventListener('click', () => {
                sfFilterGroups.splice(idx, 1);
                renderFilterGroups(); runSearchAndFilter();
            });

            sfActiveGroupsContainer.appendChild(chip);
        });
    }

    function clearUIFilters() {
        sfFilterSnapshotSegIds = null;
        sfFilterLockedSpecHash = '';
        sfInput.value = '';
        document.querySelectorAll('.sf-status-cb').forEach(c => c.checked = false);
        document.getElementById('sfTmMatch').value = '';
        btnSfInvert.classList.remove('active');
        // keep scopes & regex as they are settings
    }

    btnAddFilterGroup.addEventListener('click', () => {
        sfFilterGroups.push({
            op: 'AND',
            term: sfInput.value,
            scopes: Array.from(document.querySelectorAll('.sf-scope-cb:checked')).map(cb => cb.value),
            isRegex: sfUseRegexChecked,
            isInvert: btnSfInvert.classList.contains('active'),
            statuses: Array.from(document.querySelectorAll('.sf-status-cb:checked')).map(cb => cb.value),
            tmVal: document.getElementById('sfTmMatch').value,
            color: getRandomGroupColor()
        });
        clearUIFilters();
        if(sfMode !== 'filter') document.getElementById('sfModeFilter').click(); // Auto switch to filter mode
        else { renderFilterGroups(); runSearchAndFilter(); }
    });

    function loadPresetsSelect() {
        sfPresetsSelect.innerHTML = '<option value="">-- 我的最愛 --</option>';
        Object.keys(sfPresets).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            sfPresetsSelect.appendChild(opt);
        });
    }
    
    btnSaveFilterPreset.addEventListener('click', () => {
        const name = prompt('請輸入常用篩選與搜尋組合名稱：');
        if(!name) return;
        sfPresets[name] = {
            groups: JSON.parse(JSON.stringify(sfFilterGroups)),
            current: {
                term: sfInput.value,
                scopes: Array.from(document.querySelectorAll('.sf-scope-cb:checked')).map(cb => cb.value),
                isRegex: sfUseRegexChecked,
                isInvert: btnSfInvert.classList.contains('active'),
                statuses: Array.from(document.querySelectorAll('.sf-status-cb:checked')).map(cb => cb.value),
                tmVal: document.getElementById('sfTmMatch').value,
            }
        };
        localStorage.setItem('catToolSfPresets', JSON.stringify(sfPresets));
        loadPresetsSelect();
    });

    sfPresetsSelect.addEventListener('change', (e) => {
        const name = e.target.value;
        if(!name || !sfPresets[name]) return;
        const p = sfPresets[name];
        
        // ensure backwards compatibility for missing color code in old presets
        sfFilterGroups = JSON.parse(JSON.stringify(p.groups)).map(g => {
            if(!g.color) g.color = getRandomGroupColor();
            return g;
        });
        
        sfInput.value = p.current.term;
        document.getElementById('sfTmMatch').value = p.current.tmVal || '';

        sfUseRegexChecked = p.current.isRegex;
        document.getElementById('sfUseRegex').checked = sfUseRegexChecked;
        if (p.current.isInvert) btnSfInvert.classList.add('active'); else btnSfInvert.classList.remove('active');
        
        document.querySelectorAll('.sf-scope-cb').forEach(c => c.checked = p.current.scopes.includes(c.value));
        document.querySelectorAll('.sf-status-cb').forEach(c => c.checked = p.current.statuses.includes(c.value));
        
        document.getElementById('sfModeFilter').click();
        renderFilterGroups();
        runSearchAndFilter();
        e.target.value = ''; // reset DDL
    });



    const btnSfClearNav = document.getElementById('btnSfClearNav');
    if (btnSfClearNav) {
        btnSfClearNav.addEventListener('click', () => {
            clearUIFilters();
            sfFilterGroups = [];
            renderFilterGroups();
            runSearchAndFilter();
            if (lastEditedRowIdx !== null) {
                const rows = document.querySelectorAll('.grid-data-row');
                const targetRow = rows[lastEditedRowIdx];
                if (targetRow) {
                    const txt = targetRow.querySelector('.grid-textarea');
                    if (txt && txt.contentEditable !== 'false') { txt.focus(); targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                }
            }
        });
    }

    loadPresetsSelect();

    /** 確認／傳播時可能受影響的列索引（含自身與重複句段同原文列） */
    function collectConfirmTouchIndices(segIndex) {
        const set = new Set([segIndex]);
        const seg = currentSegmentsList[segIndex];
        if (!seg || !seg.repetitionType) return set;
        const mode = seg.repModeSeg || repMode;
        if (mode === 'none') return set;
        const src = seg.sourceText;
        for (let j = 0; j < currentSegmentsList.length; j++) {
            if (j === segIndex) continue;
            const other = currentSegmentsList[j];
            const otherLocked = !!(isDynamicForbidden(other) || other.isLockedUser);
            if (otherLocked || other.sourceText !== src) continue;
            if (mode === 'after' && j <= segIndex) continue;
            set.add(j);
        }
        return set;
    }

    function mergeTmPair(acc, pair) {
        if (!pair) return;
        acc.undo.push(...(pair.undo || []));
        acc.redo.push(...(pair.redo || []));
    }

    // Helper: propagate repetition confirmation
    async function propagateRepetition(seg, segIndex) {
        const accum = { undo: [], redo: [] };
        const mode = seg.repModeSeg || repMode;
        if (mode === 'none' || !seg.repetitionType) return accum;

        const src = seg.sourceText;
        const tgt = seg.targetText;

        for (let j = 0; j < currentSegmentsList.length; j++) {
            if (j === segIndex) continue;
            const other = currentSegmentsList[j];
            const otherLocked = !!(isDynamicForbidden(other) || other.isLockedUser);
            if (otherLocked || other.sourceText !== src) continue;

            if (mode === 'after' && j <= segIndex) continue;

            other.targetText = tgt;
            other.status = 'confirmed';
            if (currentFileFormat === 'mqxliff') {
                other.confirmationRole = resolveConfirmationRole(other);
            }
            await DBService.updateSegmentTarget(other.id, tgt);
            await DBService.updateSegmentStatus(other.id, 'confirmed', currentFileFormat === 'mqxliff' && other.confirmationRole ? { confirmationRole: other.confirmationRole } : {});
            mergeTmPair(accum, await syncSegmentToWriteTmsOnConfirm(other, j));

            const rows = document.querySelectorAll('.grid-data-row');
            if (rows[j]) {
                const ta = rows[j].querySelector('.grid-textarea');
                if (ta) {
                    ta.innerHTML = buildTaggedHtml(tgt, other.targetTags || other.sourceTags || []);
                    updateTagColors(rows[j], tgt);
                }
                const si = rows[j].querySelector('.status-icon');
                if (si) {
                    si.classList.add('done');
                    if (currentFileFormat === 'mqxliff') {
                        const r = other.confirmationRole || 'T';
                        if (r === 'R1') {
                            si.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                        } else if (r === 'R2') {
                            si.innerHTML = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                        } else {
                            si.innerHTML = '&#10003;';
                        }
                    }
                }
                if (!isDynamicForbidden(other) && !other.isLockedUser) rows[j].style.backgroundColor = '#f0fdf4';
            }
        }
        updateProgress();
        return accum;
    }

    // Notes bar replaced by new notesPanel (see NOTES MODULE section)

    /** 離開編輯器前：詢問是否共用私人筆記（以新 sharing modal）。 */
    async function ensureWorkspaceNoteLeaveResolved() {
        await autoSaveAllNotes();
        return await ensureNotesSharingResolved();
    }

    /** 多選時 Ctrl+Enter：批次確認所選句段（略過鎖定／禁止），並寫入 TM／重複傳播。capture 先於 textarea。 */
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || e.key !== 'Enter' || !currentFileId) return;
        const viewEditor = document.getElementById('viewEditor');
        if (!viewEditor || viewEditor.classList.contains('hidden')) return;
        if (!selectedRowIds || selectedRowIds.size <= 1) return;
        e.preventDefault();
        e.stopPropagation();
        (async () => {
            const indices = [];
            currentSegmentsList.forEach((s, idx) => {
                if (selectedRowIds.has(s.id) && !isDynamicForbidden(s) && !s.isLockedUser) indices.push(idx);
            });
            indices.sort((a, b) => a - b);
            const touchAll = new Set();
            indices.forEach(i => collectConfirmTouchIndices(i).forEach(x => touchAll.add(x)));
            const beforeSnapshots = {};
            touchAll.forEach(idx => {
                const s = currentSegmentsList[idx];
                beforeSnapshots[s.id] = snapshotSegForUndo(s);
            });
            for (const i of indices) {
                const seg = currentSegmentsList[i];
                if (seg.status !== 'confirmed') {
                    seg.status = 'confirmed';
                    if (currentFileFormat === 'mqxliff') seg.confirmationRole = resolveConfirmationRole(seg);
                }
            }
            const dbWaits = [];
            indices.forEach((i) => {
                const seg = currentSegmentsList[i];
                const bs = beforeSnapshots[seg.id];
                if (bs && bs.status !== 'confirmed' && seg.status === 'confirmed') {
                    const extra = currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {};
                    dbWaits.push(DBService.updateSegmentStatus(seg.id, seg.status, extra));
                }
            });
            await Promise.all(dbWaits);
            const lastIdx = indices.length ? indices[indices.length - 1] : 0;
            const focusIdx = getAfterConfirmFocusIndex(lastIdx);
            _pendingFocusSegIdxAfterRender = focusIdx;
            updateProgress();
            renderEditorSegments();

            enqueueConfirmSideEffects(async () => {
                try {
                    const tmU = [];
                    const tmR = [];
                    for (const i of indices) {
                        const seg = currentSegmentsList[i];
                        mergeTmPair({ undo: tmU, redo: tmR }, await syncSegmentToWriteTmsOnConfirm(seg, i));
                        if (seg.repetitionType) mergeTmPair({ undo: tmU, redo: tmR }, await propagateRepetition(seg, i));
                    }
                    const afterSnapshots = {};
                    touchAll.forEach(idx => {
                        const s = currentSegmentsList[idx];
                        afterSnapshots[s.id] = snapshotSegForUndo(s);
                    });
                    let changed = tmU.length > 0 || tmR.length > 0;
                    for (const id of Object.keys(beforeSnapshots)) {
                        if (JSON.stringify(beforeSnapshots[id]) !== JSON.stringify(afterSnapshots[id])) changed = true;
                    }
                    if (changed) {
                        pushUndoEntry({ kind: 'confirmOp', beforeSnapshots, afterSnapshots, tmUndo: tmU, tmRedo: tmR });
                    }
                    updateProgress();
                    const keepId = focusIdx != null && currentSegmentsList[focusIdx] ? currentSegmentsList[focusIdx].id : null;
                    renderEditorSegments();
                    if (keepId != null) {
                        const idx2 = currentSegmentsList.findIndex(s => s.id === keepId);
                        queueMicrotask(() => focusTargetEditorAtSegmentIndex(idx2 >= 0 ? idx2 : null));
                    }
                    const ar = document.querySelector('.grid-data-row.active-row');
                    const aid = ar ? parseId(ar.dataset.segId) : null;
                    const activeSeg = aid != null ? currentSegmentsList.find(s => s.id === aid) : null;
                    if (activeSeg) renderLiveTmMatches(activeSeg);
                } catch (err) { console.error(err); }
            });
        })();
    }, true);

    // ==========================================
    // TAG EDITOR HELPERS
    // ==========================================

    const TAG_PAIR_COLORS = [
        '#2563eb','#d97706','#16a34a','#dc2626',
        '#7c3aed','#0891b2','#c2410c','#15803d'
    ];

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /**
     * 將含 {N}/{/N} 佔位符的純文字 + tags 陣列轉為 contenteditable innerHTML。
     * isSource=true 時不加 contenteditable="true"（唯讀原文欄使用）。
     */
    function buildTaggedHtml(text, tags, isSource) {
        if (!text) return '';
        if (!tags || !tags.length) {
            return escapeHtml(text).replace(/\n/g, '<br>');
        }
        const tagMap = {};
        const pairColorMap = {};
        let pairColorIdx = 0;
        tags.forEach(t => {
            tagMap[t.ph] = t;
            if ((t.type === 'open' || t.type === 'close') && !(t.pairNum in pairColorMap)) {
                pairColorMap[t.pairNum] = TAG_PAIR_COLORS[pairColorIdx++ % TAG_PAIR_COLORS.length];
            }
        });

        let html = '';
        const parts = text.split(/(\{\/?\d+\})/);
        for (const part of parts) {
            const tag = tagMap[part];
            if (tag) {
                const color = (tag.type === 'open' || tag.type === 'close')
                    ? pairColorMap[tag.pairNum] : undefined;
                const colorStyle = color ? `--tag-color:${color};` : '';
                const cls = 'rt-tag' +
                    (tag.type === 'open' ? ' rt-tag-s' : tag.type === 'close' ? ' rt-tag-e' : '');
                html += `<span class="${cls}" data-ph="${escapeHtml(tag.ph)}" data-pair="${tag.pairNum}" style="${colorStyle}" contenteditable="false">`;
                html += `<span class="tag-num">${tag.num}</span>`;
                html += `<span class="tag-content">${escapeHtml(tag.display)}</span>`;
                html += `</span>`;
            } else {
                html += escapeHtml(part).replace(/\n/g, '<br>');
            }
        }
        return html;
    }

    /**
     * 從 contenteditable div 提取純文字（含 {N} 佔位符），忽略 <mark> 等裝飾元素。
     */
    function extractTextFromEditor(editorDiv) {
        let text = '';
        for (const node of editorDiv.childNodes) {
            if (node.nodeType === 3) {
                text += node.nodeValue;
            } else if (node.nodeType === 1) {
                if (node.tagName === 'BR') {
                    text += '\n';
                } else if (node.classList && node.classList.contains('rt-tag')) {
                    text += node.getAttribute('data-ph') || '';
                } else {
                    text += extractTextFromEditor(node);
                }
            }
        }
        return text;
    }

    function normalizeXmlForSig(xml) {
        return String(xml ?? '')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function buildTagTokenSequence(tags, text) {
        const tagByPh = {};
        const openByPairNum = new Map();   // pairNum -> open tag
        const closeByPairNum = new Map();  // pairNum -> close tag
        (tags || []).forEach(t => {
            if (!t || !t.ph) return;
            tagByPh[t.ph] = t;
            if (t.type === 'open') openByPairNum.set(t.pairNum, t);
            if (t.type === 'close') closeByPairNum.set(t.pairNum, t);
        });

        const phSeq = String(text ?? '').match(/\{\/?\d+\}/g) || [];
        const phSet = new Set(phSeq);

        /** token: { kind: 'pair'|'standalone', sig, openPh?, closePh?, ph? } */
        const tokens = [];
        for (const ph of phSeq) {
            const t = tagByPh[ph];
            if (!t) continue;
            if (t.type === 'open') {
                const openTag = openByPairNum.get(t.pairNum) || t;
                const closeTag = closeByPairNum.get(t.pairNum) || null;
                const closePh = closeTag ? closeTag.ph : '';
                const hasClose = closeTag && phSet.has(closePh);

                // 成對 token 的簽名：open + close xml（close 缺失會加上 ::INCOMPLETE）
                const sigBase = normalizeXmlForSig(openTag.xml) + '||' + normalizeXmlForSig(closeTag ? closeTag.xml : '');
                const sig = hasClose ? sigBase : (sigBase + '::INCOMPLETE');

                tokens.push({
                    kind: 'pair',
                    sig,
                    openPh: openTag.ph,
                    closePh,
                    pairNum: openTag.pairNum
                });
            } else if (t.type === 'standalone') {
                const sig = normalizeXmlForSig(t.xml);
                tokens.push({ kind: 'standalone', sig, ph: t.ph });
            }
            // close 類型不獨立計數；由 open 計數一次 token
        }

        return tokens;
    }

    /**
     * 重新比對標籤顏色：
     * - 用 xml（簽名）+ token 次數，決定來源端紅（缺少匹配）與目標端橘（多出匹配）。
     * - 正確的 token 顯示淡藍（tag-present）。
     * - tag-next（F8 下一步）由 refreshTagNextHighlight 負責疊加較深藍。
     */
    function updateTagColors(row, targetText) {
        if (!row) return;

        const segId = parseId(row.dataset.segId);
        const seg = currentSegmentsList.find(s => s && s.id === segId);
        if (!seg) return;

        const sourceEditor = row.querySelector('.col-source .rt-editor');
        const targetEditor = row.querySelector('.col-target .rt-editor');
        if (!sourceEditor || !targetEditor) return;

        const sourceTags = seg.sourceTags || [];
        const sourceText = seg.sourceText || '';

        const effectiveTargetTags = (seg.targetTags && seg.targetTags.length > 0)
            ? seg.targetTags
            : (seg.sourceTags || []);

        const tgtText = (targetText !== undefined && targetText !== null) ? targetText : (seg.targetText || '');

        // 清掉舊的比對結果類別，但保留 tag-next（由 refreshTagNextHighlight 再疊回）
        const clearClasses = (el) => {
            el.querySelectorAll('.rt-tag').forEach(span => {
                span.classList.remove('tag-present');
                span.classList.remove('tag-missing');
                span.classList.remove('tag-extra');
            });
        };
        clearClasses(sourceEditor);
        clearClasses(targetEditor);

        const sourceTokens = buildTagTokenSequence(sourceTags, sourceText);
        const targetTokens = buildTagTokenSequence(effectiveTargetTags, tgtText);

        const countBySig = (tokens) => {
            const m = new Map();
            tokens.forEach(tok => {
                m.set(tok.sig, (m.get(tok.sig) || 0) + 1);
            });
            return m;
        };

        // 1) Source 端：拿 target token 去「逐次配對」決定 present/missing
        const targetRemaining = countBySig(targetTokens);
        sourceTokens.forEach(tok => {
            const n = targetRemaining.get(tok.sig) || 0;
            if (n > 0) {
                tok.status = 'present';
                targetRemaining.set(tok.sig, n - 1);
            } else {
                tok.status = 'missing';
            }
        });

        // 2) Target 端：拿 source token 去配對，沒配到的就是 extra
        const sourceRemaining = countBySig(sourceTokens);
        targetTokens.forEach(tok => {
            const n = sourceRemaining.get(tok.sig) || 0;
            if (n > 0) {
                tok.status = 'present';
                sourceRemaining.set(tok.sig, n - 1);
            } else {
                tok.status = 'extra';
            }
        });

        // 快速索引 DOM spans by data-ph
        const buildSpanByPh = (editorEl) => {
            const map = new Map();
            editorEl.querySelectorAll('.rt-tag').forEach(span => {
                const ph = span.getAttribute('data-ph');
                if (ph) map.set(ph, span);
            });
            return map;
        };
        const sourceSpanByPh = buildSpanByPh(sourceEditor);
        const targetSpanByPh = buildSpanByPh(targetEditor);

        // 套用 Source 標籤顏色
        sourceTokens.forEach(tok => {
            if (tok.kind === 'pair') {
                const openSpan = sourceSpanByPh.get(tok.openPh);
                const closeSpan = tok.closePh ? sourceSpanByPh.get(tok.closePh) : null;
                if (openSpan) {
                    openSpan.classList.add(tok.status === 'present' ? 'tag-present' : 'tag-missing');
                }
                if (closeSpan) {
                    closeSpan.classList.add(tok.status === 'present' ? 'tag-present' : 'tag-missing');
                }
            } else if (tok.kind === 'standalone') {
                const span = sourceSpanByPh.get(tok.ph);
                if (span) span.classList.add(tok.status === 'present' ? 'tag-present' : 'tag-missing');
            }
        });

        // 套用 Target 標籤顏色
        targetTokens.forEach(tok => {
            if (tok.kind === 'pair') {
                const openSpan = targetSpanByPh.get(tok.openPh);
                const closeSpan = tok.closePh ? targetSpanByPh.get(tok.closePh) : null;
                if (openSpan) {
                    openSpan.classList.add(tok.status === 'extra' ? 'tag-extra' : 'tag-present');
                }
                if (closeSpan) {
                    closeSpan.classList.add(tok.status === 'extra' ? 'tag-extra' : 'tag-present');
                }
            } else if (tok.kind === 'standalone') {
                const span = targetSpanByPh.get(tok.ph);
                if (span) span.classList.add(tok.status === 'extra' ? 'tag-extra' : 'tag-present');
            }
        });
    }

    function getF8NextInsertPlan(editorDiv, seg) {
        const sourceTags = seg.sourceTags || [];
        if (!sourceTags.length) return null;

        const currentText = extractTextFromEditor(editorDiv) || seg.targetText || '';
        const presentPhs = new Set((currentText.match(/\{\/?\d+\}/g) || []));

        const missingTags = sourceTags.filter(t => !presentPhs.has(t.ph));
        if (!missingTags.length) return null;

        const firstMissing = missingTags.reduce(
            (a, b) => a.num < b.num ? a : (a.num === b.num && a.type === 'open' ? a : b)
        );

        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed && editorDiv.contains(sel.anchorNode);

        const openTag = (firstMissing.type === 'open') ? firstMissing : null;
        const closeTag = openTag
            ? (sourceTags.find(t => t.pairNum === openTag.pairNum && t.type === 'close') || null)
            : null;

        const shouldWrap = hasSelection
            && openTag
            && closeTag
            && !presentPhs.has(closeTag.ph);

        if (shouldWrap) {
            return { mode: 'wrap', openTag, closeTag, highlightPhs: [openTag.ph, closeTag.ph] };
        }
        return { mode: hasSelection ? 'replace' : 'insert', tag: firstMissing, highlightPhs: [firstMissing.ph] };
    }

    function refreshTagNextHighlight(row) {
        if (!row) return;
        const segId = parseId(row.dataset.segId);
        const seg = currentSegmentsList.find(s => s && s.id === segId);
        if (!seg) return;

        const sourceEditor = row.querySelector('.col-source .rt-editor');
        const targetEditor = row.querySelector('.col-target .rt-editor');
        if (!sourceEditor || !targetEditor) return;

        // 清掉舊的 tag-next（避免上一個句段留底）
        document.querySelectorAll('.col-source .rt-tag.tag-next').forEach(span => span.classList.remove('tag-next'));

        // 只有當游標在編輯區內時才疊加
        // 用 contains 避免不同瀏覽器/節點造成 activeElement 不是 editor 本體
        const focusedInEditor = targetEditor.contains(document.activeElement);
        const sel = window.getSelection();
        const selectionInside = sel && sel.anchorNode && targetEditor.contains(sel.anchorNode);
        if (!focusedInEditor && !selectionInside) return;
        if (targetEditor.getAttribute('contenteditable') === 'false') return;

        const plan = getF8NextInsertPlan(targetEditor, seg);
        if (!plan || !plan.highlightPhs || !plan.highlightPhs.length) return;

        const spanByPh = new Map();
        sourceEditor.querySelectorAll('.rt-tag').forEach(span => {
            const ph = span.getAttribute('data-ph');
            if (ph) spanByPh.set(ph, span);
        });

        plan.highlightPhs.forEach(ph => {
            const span = spanByPh.get(ph);
            if (span) span.classList.add('tag-next');
        });
    }

    function markEmptySegUserEdited(segId) {
        if (segId != null) emptySegUserEditedIds.add(segId);
    }

    function getEmptySegAutoSettings() {
        const mode = localStorage.getItem('catToolEmptySegMode') || 'off';
        const raw = parseInt(localStorage.getItem('catToolEmptySegTmMinPct') || '70', 10);
        const minPct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 70));
        return { mode, minPct };
    }

    function pickBestTmForAuto(seg) {
        if (!window.ActiveTmCache || !window.ActiveTmCache.length || !seg.sourceText) return null;
        const rawTm = [];
        window.ActiveTmCache.forEach(tms => {
            const sim = calculateSimilarity(seg.sourceText, tms.sourceText);
            if (sim >= 50) rawTm.push({ ...tms, score: sim, type: 'TM' });
        });
        if (!rawTm.length) return null;
        const bySource = new Map();
        for (const m of rawTm) {
            const k = m.sourceText;
            if (!bySource.has(k)) bySource.set(k, []);
            bySource.get(k).push(m);
        }
        const collapsed = [];
        for (const arr of bySource.values()) {
            arr.sort((a, b) => {
                const ta = new Date(a.lastModified || a.createdAt || 0).getTime();
                const tb = new Date(b.lastModified || b.createdAt || 0).getTime();
                return tb - ta;
            });
            collapsed.push({ ...arr[0] });
        }
        collapsed.sort((a, b) => b.score - a.score);
        return collapsed[0];
    }

    async function maybeAutoFillEmptyTarget(seg, row, targetInput) {
        const cfg = getEmptySegAutoSettings();
        if (cfg.mode === 'off') return;
        if (!targetInput || targetInput.getAttribute('contenteditable') === 'false') return;
        const raw = extractTextFromEditor(targetInput);
        if ((raw || '').trim() !== '') return;
        if (isDynamicForbidden(seg) || seg.isLockedUser) return;
        if (emptySegUserEditedIds.has(seg.id)) return;
        if (emptySegAutoConsumedIds.has(seg.id)) return;

        const best = pickBestTmForAuto(seg);
        const hasTm = best && typeof best.score === 'number' && best.score >= cfg.minPct;

        if (cfg.mode === 'tm_only' && !hasTm) return;
        if (cfg.mode === 'copy_only' && hasTm) return;

        const beforeSnap = snapshotSegForUndo(seg);

        if (cfg.mode === 'tm_only') {
            if (best.targetTags && best.targetTags.length) {
                seg.targetTags = best.targetTags.map(t => ({ ...t }));
            }
            seg.targetText = best.targetText;
            seg.matchValue = String(Math.round(best.score));
            targetInput.innerHTML = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
            updateTagColors(row, seg.targetText);
            applyMatchCellVisual(row, seg.matchValue);
            await DBService.updateSegmentTarget(seg.id, seg.targetText, { matchValue: seg.matchValue, targetTags: seg.targetTags });
        } else if (cfg.mode === 'copy_only') {
            seg.targetTags = (seg.sourceTags || []).map(t => ({ ...t }));
            seg.targetText = seg.sourceText;
            seg.matchValue = undefined;
            targetInput.innerHTML = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
            updateTagColors(row, seg.targetText);
            applyMatchCellVisual(row, '');
            await DBService.updateSegmentTarget(seg.id, seg.targetText, { targetTags: seg.targetTags, matchValue: '' });
        } else if (cfg.mode === 'tm_then_copy') {
            if (hasTm) {
                if (best.targetTags && best.targetTags.length) {
                    seg.targetTags = best.targetTags.map(t => ({ ...t }));
                }
                seg.targetText = best.targetText;
                seg.matchValue = String(Math.round(best.score));
                targetInput.innerHTML = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
                updateTagColors(row, seg.targetText);
                applyMatchCellVisual(row, seg.matchValue);
                await DBService.updateSegmentTarget(seg.id, seg.targetText, { matchValue: seg.matchValue, targetTags: seg.targetTags });
            } else {
                seg.targetTags = (seg.sourceTags || []).map(t => ({ ...t }));
                seg.targetText = seg.sourceText;
                seg.matchValue = undefined;
                targetInput.innerHTML = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
                updateTagColors(row, seg.targetText);
                applyMatchCellVisual(row, '');
                await DBService.updateSegmentTarget(seg.id, seg.targetText, { targetTags: seg.targetTags, matchValue: '' });
            }
        }

        const afterSnap = snapshotSegForUndo(seg);
        pushUndoEntry({ kind: 'segmentState', items: [{ id: seg.id, beforeSnap, afterSnap }] });
        emptySegAutoConsumedIds.add(seg.id);
        editorUndoEditStart[seg.id] = seg.targetText;
        editorUndoMatchStart[seg.id] = seg.matchValue;
        editorUndoStatusStart[seg.id] = seg.status;
        updateProgress();
        renderLiveTmMatches(seg);
        emitCollabEdit('commit', seg, seg.targetText || '');
    }

    function renderEditorSegments() {
        gridBody.innerHTML = '';

        // 初始化 editorGrid 的標籤展開/收起 class
        const editorGrid = document.getElementById('editorGrid');
        if (editorGrid) {
            editorGrid.classList.toggle('tags-expanded', tagsExpanded);
            editorGrid.classList.toggle('tags-collapsed', !tagsExpanded);
        }
        
        // Phase 4.10: Repetition detection
        const sourceMap = new Map();
        currentSegmentsList.forEach(s => {
            if (!s.sourceText) return;
            if (!sourceMap.has(s.sourceText)) {
                sourceMap.set(s.sourceText, 'first');
                s.repetitionType = 'first';
            } else {
                s.repetitionType = 'duplicate';
            }
        });
        // If only one occurs, it's not a repetition
        const sourceCounts = {};
        currentSegmentsList.forEach(s => { if(s.sourceText) sourceCounts[s.sourceText] = (sourceCounts[s.sourceText]||0)+1; });
        currentSegmentsList.forEach(s => { if(s.sourceText && sourceCounts[s.sourceText] === 1) s.repetitionType = null; });

        // 依 ID 排序，計算相同內容句段的出現序號 (第幾次/共幾次)
        const sourceToSegs = {};
        currentSegmentsList.forEach(s => {
            if (!s.sourceText || !s.repetitionType) return;
            if (!sourceToSegs[s.sourceText]) sourceToSegs[s.sourceText] = [];
            sourceToSegs[s.sourceText].push(s);
        });
        Object.keys(sourceToSegs).forEach(st => {
            const list = sourceToSegs[st];
            list.sort((a, b) => (a.id || 0) - (b.id || 0));
            list.forEach((s, idx) => {
                s.repetitionIndex = idx + 1;
                s.repetitionTotal = list.length;
            });
        });

        const fragment = document.createDocumentFragment();

        currentSegmentsList.forEach((seg, i) => {
            seg.rowIdx = i; // Ensure old files have rowIdx explicitly attached for evaluateSegment logic

            const row = document.createElement('div');
            // Dynamic system-lock for T_DENY_R1 session: R1-confirmed segments become forbidden
            const effectiveLockedSystem = isDynamicForbidden(seg); // isDynamicForbidden incorporates isLockedSystem + role override
            const effectiveLocked = !!(effectiveLockedSystem || seg.isLockedUser);
            let lockedClass = '';
            if (effectiveLockedSystem) lockedClass = 'locked-system';
            else if (seg.isLockedUser) lockedClass = 'locked-user';
            row.className = `grid-data-row ${lockedClass}`;
            row.dataset.segId = seg.id;
            if (effectiveLockedSystem) row.title = getForbiddenTooltip(seg);
            else if (seg.isLockedUser) row.title = '句段鎖定中，請解除鎖定後再編輯';
            
            // Activate row on focus; also update selection to this segment only
            row.addEventListener('focusin', () => {
                document.querySelectorAll('.grid-data-row').forEach(r => r.classList.remove('active-row'));
                row.classList.add('active-row');
                lastEditedRowIdx = seg.rowIdx;
                // 選取狀態更新原則：
                // 只有在使用者主動切換到新目標時才更新選取，以下情況跳過：
                // 1. 批次操作進行中（isBatchOpInProgress）
                // 2. 目前句段已在多選清單中（焦點由 DOM 操作觸發，非使用者點擊新目標）
                // 這確保批次操作、快速鍵等不會破壞選取狀態
                const isAlreadyInMultiSelect = selectedRowIds.has(seg.id) && selectedRowIds.size > 1;
                if (!isBatchOpInProgress && !isAlreadyInMultiSelect) {
                    selectedRowIds.clear();
                    selectedRowIds.add(seg.id);
                    document.querySelectorAll('.grid-data-row').forEach(r => {
                        const rId = parseId(r.dataset.segId);
                        if (selectedRowIds.has(rId)) r.classList.add('selected-row');
                        else r.classList.remove('selected-row');
                    });
                }
                renderLiveTmMatches(seg);
                renderSegmentComments(seg);
                refreshTagNextHighlight(row);
                emitCollabFocus('segment', seg.id);
            });

            const isConfirmed = seg.status === 'confirmed';
            const isSelected = selectedRowIds.has(seg.id);
            if (isSelected) row.classList.add('selected-row');
            // 已確認套淡綠底，但鎖定/禁止句段保留其本身底色（灰/橘）不覆蓋
            if (isConfirmed && !effectiveLocked) {
                row.style.backgroundColor = '#f0fdf4';
                row.classList.add('row-bg-confirmed');
            }

            let rowInnerContent = '';
            rowInnerContent += `<div class="col-id" title="點擊選取 (Ctrl: 單獨加減, Shift: 連續選取)" data-idx="${i}" data-id="${seg.id}">${seg.globalId || (seg.rowIdx+1)}</div>`;
            const maxKeys = colSettings.filter(c => c.id.startsWith('col-key-')).length;
            for(let k=0; k<maxKeys; k++) {
                const keyText = seg.keys && seg.keys[k] ? seg.keys[k] : '';
                // Rename Key 1 logic: CSS class stays the same but UI name in colSettings is handled in the header loop
                rowInnerContent += `<div class="col-key-${k}" style="padding:0.5rem; border-right:1px solid #e2e8f0; word-break:break-all; font-size:0.85rem; color:var(--text-main);">${keyText}</div>`;
            }
            const sourceHtml = buildTaggedHtml(seg.sourceText, seg.sourceTags || [], true);
            rowInnerContent += `<div class="col-source"><div class="rt-editor" contenteditable="false">${sourceHtml}</div></div>`;
            const targetHtml = buildTaggedHtml(seg.targetText, seg.targetTags || seg.sourceTags || []);
            rowInnerContent += `<div class="col-target" style="position:relative;">
                <div class="rt-editor grid-textarea" contenteditable="${effectiveLocked ? 'false' : 'true'}" spellcheck="false">${targetHtml}</div>
            </div>`;
            rowInnerContent += `<div class="col-extra" style="padding:0.5rem; font-size:0.8rem; color:#2563eb; word-break:break-all;">${seg.extraValue || ''}</div>`;
            
            // New Columns: Repetition and Match
            // repModeSeg defaults to global repMode
            if (seg.repModeSeg === undefined) seg.repModeSeg = repMode;
            const effectiveRepMode = seg.repModeSeg;
            let repIcon = '';
            let repTitle = '';
            if (seg.repetitionType) {
                const repNum = (seg.repetitionIndex != null && seg.repetitionTotal != null) ? `${seg.repetitionIndex}/${seg.repetitionTotal}` : '';
                if (effectiveRepMode === 'after') {
                    repIcon = '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;">&#x25BC;</span>';
                    repTitle = '確認其後的重複句段';
                } else if (effectiveRepMode === 'all') {
                    repIcon = '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;">&#x21F3;</span>';
                    repTitle = '確認整個檔案中所有重複句段';
                } else {
                    repIcon = '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;"><span style="color:red;">&#x2715;</span></span>';
                    repTitle = '停用重複句段連動確認';
                }
                if (repNum) repIcon = `<span style="font-size:0.7rem;color:var(--text-light);">${repNum}</span>` + repIcon;
            }
            rowInnerContent += `<div class="col-repetition" data-seg-idx="${i}" style="cursor:${seg.repetitionType ? 'pointer' : 'default'}; font-size:0.8rem; user-select:none; flex-direction:column;" title="${repTitle}">${repIcon}</div>`;

            let matchStyle = '';
            if (seg.matchValue) {
                const mv = parseInt(seg.matchValue);
                // 100% 以上都顯示綠色，70–99 顯示橘色
                if (mv >= 100) matchStyle = 'background: #dcfce7;'; // Light green
                else if (mv >= 70) matchStyle = 'background: #ffedd5;'; // Light orange
            }
            rowInnerContent += `<div class="col-match" style="${matchStyle}">${seg.matchValue || ''}</div>`;

            // 狀態欄：mqxliff 顯示 T/R1/R2 圖示，其它格式顯示綠點
            let statusCellHtml = '';
            if (currentFileFormat === 'mqxliff') {
                const role = seg.confirmationRole || 'T';
                let symbolHtml = '';
                if (isConfirmed) {
                    if (role === 'R1') {
                        symbolHtml = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                    } else if (role === 'R2') {
                        symbolHtml = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                    } else {
                        symbolHtml = '&#10003;';
                    }
                }
                statusCellHtml = `<span class="status-icon status-icon-mq ${isConfirmed ? 'done' : ''}" data-role="${seg.confirmationRole || ''}" style="cursor:pointer;" title="Ctrl+Enter/點擊 確認狀態">${symbolHtml}</span>`;
            } else {
                statusCellHtml = `<span class="status-icon ${isConfirmed ? 'done' : ''}" style="cursor:pointer;" title="Ctrl+Enter/點擊 確認狀態"></span>`;
            }
            rowInnerContent += `<div class="col-status">${statusCellHtml}</div>`;
            row.innerHTML = rowInnerContent;
            
            const targetInput = row.querySelector('.grid-textarea');
            const statusIcon = row.querySelector('.status-icon');

            // Initialise tag colour state for this row
            updateTagColors(row, seg.targetText);

            colSettings.forEach((c, index) => {
                const cell = row.querySelector(`.${c.id}`);
                if (cell) {
                    cell.style.order = index;
                    cell.style.display = c.visible ? '' : 'none';
                }
            });

            if(!effectiveLocked) {
                
                // ID Click Selection Logic
                const idCell = row.querySelector('.col-id');
                if (idCell) {
                    // ID セルクリック時はフォーカス移動を防ぎ focusin による選取上書きを回避
                    idCell.addEventListener('mousedown', (e) => e.preventDefault());
                    idCell.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Ctrl click - toggle individual
                        if (e.ctrlKey || e.metaKey) {
                            if (selectedRowIds.has(seg.id)) selectedRowIds.delete(seg.id);
                            else selectedRowIds.add(seg.id);
                            lastSelectedRowIdx = i;
                        } 
                        // Shift click - range selection (extends from last anchor, clears previous)
                        else if (e.shiftKey && lastSelectedRowIdx !== null) {
                            selectedRowIds.clear();
                            const start = Math.min(lastSelectedRowIdx, i);
                            const end = Math.max(lastSelectedRowIdx, i);
                            for (let j = start; j <= end; j++) {
                                const s = currentSegmentsList[j];
                                if (!isDynamicForbidden(s) && !s.isLockedUser) selectedRowIds.add(s.id);
                            }
                        } 
                        // Normal click - clear and select one
                        else {
                            selectedRowIds.clear();
                            selectedRowIds.add(seg.id);
                            lastSelectedRowIdx = i;
                            // 清除其他列的 active-row 樣式，並解除編輯焦點
                            document.querySelectorAll('.grid-data-row').forEach(r => r.classList.remove('active-row'));
                            const focused = document.activeElement;
                            if (focused && focused.classList.contains('grid-textarea')) focused.blur();
                        }

                        // Ctrl / Shift 點擊後：若原 active-row 不在新選取中，一併清除
                        if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            const activeRow = document.querySelector('.grid-data-row.active-row');
                            if (activeRow) {
                        const activeSegId = parseId(activeRow.dataset.segId);
                        if (!selectedRowIds.has(activeSegId)) {
                                    activeRow.classList.remove('active-row');
                                    const focused = document.activeElement;
                                    if (focused && focused.classList.contains('grid-textarea')) focused.blur();
                                }
                            }
                        }
                        
                        // Render visually using data-seg-id
                        document.querySelectorAll('.grid-data-row').forEach(r => {
                            const rId = parseId(r.dataset.segId);
                            if (selectedRowIds.has(rId)) r.classList.add('selected-row');
                            else r.classList.remove('selected-row');
                        });
                        updateSfReplaceAllButtonLabel();
                    });
                }

                let targetDebounceTimer;
                let skipHighMatchInputGuard = false;
                targetInput.addEventListener('focus', async () => {
                    if (isSegmentBeingEditedByOthers(seg.id)) {
                        const locker = Object.values(collabEditBySession || {}).find((e) =>
                            e && e.sessionId !== collabSelfSessionId && String(e.segmentId || '') === String(seg.id || '') && String(e.state || '') !== 'end'
                        );
                        const m = locker ? findMemberBySession(locker.sessionId) : null;
                        const who = (m && m.displayName) ? m.displayName : '其他成員';
                        alert(`此句段目前由 ${who} 編輯中，請稍後再試。`);
                        targetInput.blur();
                        return;
                    }
                    await maybeAutoFillEmptyTarget(seg, row, targetInput);
                    editorUndoEditStart[seg.id] = seg.targetText;
                    editorUndoStatusStart[seg.id] = seg.status;
                    editorUndoMatchStart[seg.id] = seg.matchValue;
                    refreshTagNextHighlight(row);
                    emitCollabEdit('start', seg, seg.targetText || '');
                });
                targetInput.addEventListener('input', async () => {
                    if (isSegmentBeingEditedByOthers(seg.id)) {
                        targetInput.innerText = seg.targetText || '';
                        refreshTagNextHighlight(row);
                        return;
                    }
                    if (!skipHighMatchInputGuard && segmentNeedsHighMatchGuard(seg)) {
                        const attempted = extractTextFromEditor(targetInput);
                        const prevVal = seg.targetText || '';
                        if (attempted !== prevVal) {
                            targetInput.innerHTML = buildTaggedHtml(prevVal, seg.targetTags || seg.sourceTags || []);
                            refreshTagNextHighlight(row);
                            const ok = await showHighMatchEditConfirmModal(seg);
                            if (!ok) return;
                            highMatchEditConfirmedIds.add(seg.id);
                            skipHighMatchInputGuard = true;
                            targetInput.innerHTML = buildTaggedHtml(attempted, seg.targetTags || seg.sourceTags || []);
                            refreshTagNextHighlight(row);
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                            skipHighMatchInputGuard = false;
                            return;
                        }
                    }
                    markEmptySegUserEdited(seg.id);
                    const newVal = extractTextFromEditor(targetInput);
                    seg.targetText = newVal;
                    emitCollabEdit('typing', seg, newVal);

                    // Update source tag colours (blue=present, red=missing)
                    updateTagColors(row, newVal);
                    refreshTagNextHighlight(row);
                    
                    // Unconfirm immediately if edited and was confirmed
                    if (seg.status === 'confirmed') {
                        seg.status = 'unconfirmed';
                        statusIcon.classList.remove('done');
                        row.style.backgroundColor = '';
                        await DBService.updateSegmentStatus(seg.id, seg.status);
                    }

                    updateProgress();
                    clearTimeout(targetDebounceTimer);
                    targetDebounceTimer = setTimeout(async () => {
                        const latest = extractTextFromEditor(targetInput);
                        const oldVal = editorUndoEditStart[seg.id] ?? seg.targetText;
                        if (oldVal !== latest) {
                            pushEditorUndo(seg.id, oldVal, latest, {
                                oldMatchValue: editorUndoMatchStart[seg.id],
                                newMatchValue: seg.matchValue,
                                oldStatus: editorUndoStatusStart[seg.id],
                                newStatus: seg.status
                            });
                            editorUndoEditStart[seg.id] = latest;
                        }
                        seg.targetText = latest;
                        await DBService.updateSegmentTarget(seg.id, latest);
                        emitCollabEdit('commit', seg, latest);
                    }, 500);
                });

                // 游標位置/選取改變時，更新「F8 下一步」的深藍高亮
                targetInput.addEventListener('mouseup', () => refreshTagNextHighlight(row));
                targetInput.addEventListener('keyup', () => refreshTagNextHighlight(row));
                targetInput.addEventListener('blur', async () => {
                    refreshTagNextHighlight(row);
                    const conflictOk = await resolvePendingRemoteConflict(seg, row, targetInput);
                    if (!conflictOk) {
                        queueMicrotask(() => targetInput.focus());
                        return;
                    }
                    if (targetDebounceTimer) {
                        clearTimeout(targetDebounceTimer);
                        targetDebounceTimer = null;
                        const newVal = extractTextFromEditor(targetInput);
                        const oldVal = editorUndoEditStart[seg.id] ?? seg.targetText;
                        if (oldVal !== newVal) {
                            pushEditorUndo(seg.id, oldVal, newVal, {
                                oldMatchValue: editorUndoMatchStart[seg.id],
                                newMatchValue: seg.matchValue,
                                oldStatus: editorUndoStatusStart[seg.id],
                                newStatus: seg.status
                            });
                            editorUndoEditStart[seg.id] = newVal;
                        }
                        seg.targetText = newVal;
                        await DBService.updateSegmentTarget(seg.id, newVal);
                        emitCollabEdit('commit', seg, newVal);
                    }
                    emitCollabEdit('end', seg, null);
                });

                // Intercept paste：
                // - 若是從本工具的欄位複製（含 .rt-tag span），保留這些標籤節點，確保匯出時仍可還原 tag
                // - 其他來源則去除格式，僅貼上純文字
                targetInput.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const cd = e.clipboardData || window.clipboardData;
                    if (!cd) return;

                    const html = cd.getData('text/html');
                    if (html && html.includes('class="rt-tag"')) {
                        // 來自本編輯器（或相容結構）的貼上：保留 rt-tag span，以便 extractTextFromEditor 轉回 {N} 佔位符
                        document.execCommand('insertHTML', false, html);
                        markEmptySegUserEdited(seg.id);
                        return;
                    }

                    const plain = cd.getData('text/plain');
                    if (plain) {
                        document.execCommand('insertText', false, plain);
                    }
                    markEmptySegUserEdited(seg.id);
                });

                // Ctrl+Enter logic（先焦點，再於背景寫入 DB／TM／傳播／undo）
                targetInput.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.key === 'Enter') {
                        e.preventDefault();
                        void (async () => {
                            const conflictOk = await resolvePendingRemoteConflict(seg, row, targetInput);
                            if (!conflictOk) {
                                queueMicrotask(() => targetInput.focus());
                                return;
                            }
                            const touch = collectConfirmTouchIndices(i);
                            const beforeSnapshots = {};
                            touch.forEach(idx => {
                                const s = currentSegmentsList[idx];
                                beforeSnapshots[s.id] = snapshotSegForUndo(s);
                            });
                            const wasUnconfirmed = seg.status !== 'confirmed';
                            const tmU = [];
                            const tmR = [];
                            if (seg.status !== 'confirmed') {
                                seg.status = 'confirmed';
                                statusIcon.classList.add('done');
                                if (!effectiveLocked) row.style.backgroundColor = '#f0fdf4';
                                if (currentFileFormat === 'mqxliff') {
                                    seg.confirmationRole = resolveConfirmationRole(seg);
                                }
                                if (currentFileFormat === 'mqxliff') {
                                    const role = seg.confirmationRole || 'T';
                                    if (role === 'R1') {
                                        statusIcon.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                                    } else if (role === 'R2') {
                                        statusIcon.innerHTML = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                                    } else {
                                        statusIcon.innerHTML = '&#10003;';
                                    }
                                }
                                updateProgress();
                            }
                            const nextFocus = getAfterConfirmFocusIndex(i);
                            focusTargetEditorAtSegmentIndex(nextFocus);

                            enqueueConfirmSideEffects(async () => {
                                try {
                                    if (wasUnconfirmed) {
                                        await DBService.updateSegmentStatus(seg.id, seg.status, currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {});
                                        updateProgress();
                                    }
                                    if (seg.status === 'confirmed') {
                                        mergeTmPair({ undo: tmU, redo: tmR }, await syncSegmentToWriteTmsOnConfirm(seg, i));
                                    }
                                    if (seg.repetitionType) {
                                        mergeTmPair({ undo: tmU, redo: tmR }, await propagateRepetition(seg, i));
                                    }
                                    const afterSnapshots = {};
                                    touch.forEach(idx => {
                                        const s = currentSegmentsList[idx];
                                        afterSnapshots[s.id] = snapshotSegForUndo(s);
                                    });
                                    let changed = tmU.length > 0 || tmR.length > 0;
                                    for (const id of Object.keys(beforeSnapshots)) {
                                        if (JSON.stringify(beforeSnapshots[id]) !== JSON.stringify(afterSnapshots[id])) changed = true;
                                    }
                                    if (changed) {
                                        pushUndoEntry({ kind: 'confirmOp', beforeSnapshots, afterSnapshots, tmUndo: tmU, tmRedo: tmR });
                                    }
                                } catch (err) { console.error(err); }
                            });
                        })();
                    } else if (e.ctrlKey && e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevRow = row.previousElementSibling;
                        if(prevRow) {
                            const prevEditor = prevRow.querySelector('.grid-textarea');
                            if(prevEditor && prevEditor.contentEditable !== 'false') prevEditor.focus();
                        }
                    } else if (e.ctrlKey && e.key === 'ArrowDown') {
                        e.preventDefault();
                        const nextRow = row.nextElementSibling;
                        if(nextRow) {
                            const nextEditor = nextRow.querySelector('.grid-textarea');
                            if(nextEditor && nextEditor.contentEditable !== 'false') nextEditor.focus();
                        }
                    } else if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
                        e.preventDefault();
                        if (typeof window.applyCatMatchAtIndex === 'function') window.applyCatMatchAtIndex(parseInt(e.key, 10) - 1);
                    }
                });

                // Click on repetition icon to cycle mode for this segment
                const repCell = row.querySelector('.col-repetition');
                if (repCell && seg.repetitionType) {
                    repCell.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const modes = ['after', 'all', 'none'];
                        const curIdx = modes.indexOf(seg.repModeSeg || repMode);
                        seg.repModeSeg = modes[(curIdx + 1) % 3];
                        // Re-render just this cell icon
                        const icons = {
                            after: '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;">&#x25BC;</span>',
                            all:   '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;">&#x21F3;</span>',
                            none:  '<span style="display:flex;flex-direction:column;align-items:center;line-height:1;"><span style="color:red;">&#x2715;</span></span>'
                        };
                        const titles = { after: '確認其後的重複句段', all: '確認整個檔案中所有重複句段', none: '停用重複句段連動確認' };
                        const repNum = (seg.repetitionIndex != null && seg.repetitionTotal != null) ? `<span style="font-size:0.7rem;color:var(--text-light);">${seg.repetitionIndex}/${seg.repetitionTotal}</span>` : '';
                        repCell.innerHTML = repNum ? repNum + icons[seg.repModeSeg] : icons[seg.repModeSeg];
                        repCell.title = titles[seg.repModeSeg];
                    });
                }

                // Click icon to toggle
                statusIcon.addEventListener('click', () => {
                    const willConfirm = seg.status !== 'confirmed';
                    if (willConfirm) {
                        void (async () => {
                            const targetTa = row.querySelector('.grid-textarea');
                            if (targetTa) {
                                const conflictOk = await resolvePendingRemoteConflict(seg, row, targetTa);
                                if (!conflictOk) {
                                    queueMicrotask(() => targetTa.focus());
                                    return;
                                }
                            }
                            const touch = collectConfirmTouchIndices(i);
                            const beforeSnapshots = {};
                            touch.forEach(idx => {
                                const s = currentSegmentsList[idx];
                                beforeSnapshots[s.id] = snapshotSegForUndo(s);
                            });
                            seg.status = 'confirmed';
                            statusIcon.classList.add('done');
                            if (!effectiveLocked) row.style.backgroundColor = '#f0fdf4';
                            if (currentFileFormat === 'mqxliff') {
                                seg.confirmationRole = resolveConfirmationRole(seg);
                            }
                            if (currentFileFormat === 'mqxliff') {
                                const role = seg.confirmationRole || 'T';
                                if (role === 'R1') {
                                    statusIcon.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;line-height:1;">&#10003;<sup style="font-size:0.5em;margin-left:-0.1em;">+</sup></span>`;
                                } else if (role === 'R2') {
                                    statusIcon.innerHTML = `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;line-height:0.9;">&#10003;&#10003;</span>`;
                                } else {
                                    statusIcon.innerHTML = '&#10003;';
                                }
                            }
                            updateProgress();
                            const nextFocus = getAfterConfirmFocusIndex(i);
                            focusTargetEditorAtSegmentIndex(nextFocus);

                            const tmU = [];
                            const tmR = [];
                            enqueueConfirmSideEffects(async () => {
                                try {
                                    await DBService.updateSegmentStatus(seg.id, seg.status, currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {});
                                    updateProgress();
                                    mergeTmPair({ undo: tmU, redo: tmR }, await syncSegmentToWriteTmsOnConfirm(seg, i));
                                    if (seg.repetitionType) mergeTmPair({ undo: tmU, redo: tmR }, await propagateRepetition(seg, i));
                                    const afterSnapshots = {};
                                    touch.forEach(idx => {
                                        const s = currentSegmentsList[idx];
                                        afterSnapshots[s.id] = snapshotSegForUndo(s);
                                    });
                                    let changed = tmU.length > 0 || tmR.length > 0;
                                    for (const id of Object.keys(beforeSnapshots)) {
                                        if (JSON.stringify(beforeSnapshots[id]) !== JSON.stringify(afterSnapshots[id])) changed = true;
                                    }
                                    if (changed) {
                                        pushUndoEntry({ kind: 'confirmOp', beforeSnapshots, afterSnapshots, tmUndo: tmU, tmRedo: tmR });
                                    }
                                } catch (err) { console.error(err); }
                            });
                        })();
                    } else {
                        const beforeSnap = snapshotSegForUndo(seg);
                        seg.status = 'unconfirmed';
                        statusIcon.classList.remove('done');
                        if (currentFileFormat === 'mqxliff') {
                            statusIcon.innerHTML = '';
                        }
                        row.style.backgroundColor = '';
                        const afterSnap = snapshotSegForUndo(seg);
                        pushUndoEntry({ kind: 'segmentState', items: [{ id: seg.id, beforeSnap, afterSnap }] });
                        enqueueConfirmSideEffects(async () => {
                            await DBService.updateSegmentStatus(seg.id, seg.status, currentFileFormat === 'mqxliff' && seg.confirmationRole ? { confirmationRole: seg.confirmationRole } : {});
                        });
                        updateProgress();
                    }
                });
            }
            fragment.appendChild(row);
        });

        gridBody.appendChild(fragment);
        updateProgress();
        applyCollabFocusOutlines();
        updateSfReplaceAllButtonLabel();
        if (_pendingFocusSegIdxAfterRender != null) {
            const pi = _pendingFocusSegIdxAfterRender;
            _pendingFocusSegIdxAfterRender = null;
            queueMicrotask(() => focusTargetEditorAtSegmentIndex(pi));
        }
    }

    /**
     * 句段確認時：若專案寫入 TM 中尚無相同原文，則新增一筆（已存在則不覆寫）。
     */
    /**
     * 句段已確認時同步至「寫入 TM」（第 6 點前暫以 sourceText 對應同一 TU）。
     * 新建：只寫建立者／時間，changeLog 為 []。
     * 已存在且譯文相同：不動。
     * 已存在且譯文不同：更新譯文並 append 結構化 targetUpdate（含舊／新譯供追蹤修訂顯示）。
     */
    async function syncSegmentToWriteTmsOnConfirm(seg, rowIdx) {
        const undo = [];
        const redo = [];
        if (!seg || seg.status !== 'confirmed') return { undo, redo };
        if (!window.ActiveWriteTms || window.ActiveWriteTms.length === 0) return { undo, redo };
        let i = typeof rowIdx === 'number' ? rowIdx : currentSegmentsList.indexOf(seg);
        if (i < 0) i = currentSegmentsList.findIndex(s => s.id === seg.id);
        if (i < 0) return { undo, redo };
        const creator = localStorage.getItem('localCatUserProfile') || 'Unknown User';
        const prjEl = document.getElementById('detailProjectName');
        const fEl = document.getElementById('editorFileName');
        const prjName = prjEl ? prjEl.textContent : '';
        const fName = fEl ? fEl.textContent : '';
        const prevS = i > 0 ? currentSegmentsList[i - 1].sourceText : '';
        const nextS = i < currentSegmentsList.length - 1 ? currentSegmentsList[i + 1].sourceText : '';
        const key = seg.keys && seg.keys.length > 0 ? seg.keys[0] : '';
        const fileLangs = window.ActiveFileLangs || {};
        const metaBase = {
            key,
            prevSegment: prevS,
            nextSegment: nextS,
            writtenFile: fName,
            writtenProject: prjName,
            createdBy: creator,
            sourceLang: fileLangs.sourceLang || '',
            targetLang: fileLangs.targetLang || ''
        };
        for (const rawTmId of window.ActiveWriteTms) {
            const tmId = rawTmId;
            const tmRow = await DBService.getTM(tmId);
            const tmName = tmRow ? tmRow.name : `TM #${tmId}`;
            const existing = await DBService.getTMSegments(tmId);
            const srcLang = metaBase.sourceLang.toLowerCase();
            const tgtLang = metaBase.targetLang.toLowerCase();
            const match = existing.find(tms => {
                if (tms.sourceText !== seg.sourceText) return false;
                if (!srcLang && !tgtLang) return true;
                const segSrc = (tms.sourceLang || '').toLowerCase();
                const segTgt = (tms.targetLang || '').toLowerCase();
                if (!segSrc && !segTgt) return true;
                return segSrc === srcLang && segTgt === tgtLang;
            });
            if (!match) {
                const metaFull = { ...metaBase, changeLog: [] };
                const newId = await DBService.addTMSegment(tmId, seg.sourceText, seg.targetText, metaFull);
                undo.push({ op: 'delete', tmId, id: newId });
                redo.push({ op: 'create', tmId, sourceText: seg.sourceText, targetText: seg.targetText, meta: metaFull });
                const full = await DBService.getTMSegmentById(newId);
                if (full) {
                    const dupCache = window.ActiveTmCache.some(t => t.id === full.id || (t._tmId === tmId && t.sourceText === seg.sourceText));
                    if (!dupCache) {
                        window.ActiveTmCache.push({
                            ...full,
                            _tmId: tmId,
                            tmName
                        });
                    }
                }
            } else {
                if (match.targetText === seg.targetText) continue;
                const oldTarget = match.targetText;
                const oldChangeLog = Array.isArray(match.changeLog) ? [...match.changeLog] : [];
                const prevLog = [...oldChangeLog];
                prevLog.push({
                    kind: 'targetUpdate',
                    at: new Date().toISOString(),
                    by: creator,
                    oldTarget: match.targetText,
                    newTarget: seg.targetText
                });
                undo.push({ op: 'update', tmId, id: match.id, oldTarget, oldChangeLog });
                redo.push({ op: 'update', tmId, id: match.id, newTarget: seg.targetText, newChangeLog: prevLog });
                await DBService.updateTMSegment(match.id, seg.targetText, { changeLog: prevLog });
                window.ActiveTmCache.forEach(tms => {
                    if (tms.id === match.id || (tms._tmId === tmId && tms.sourceText === seg.sourceText)) {
                        tms.targetText = seg.targetText;
                        tms.changeLog = prevLog;
                        tms.lastModified = new Date().toISOString();
                    }
                });
            }
        }
        return { undo, redo };
    }

    function updateCatTrackPanelContent() {
        const el = document.getElementById('liveTrackChangeContent');
        if (!el) return;
        const seg = window.currentCatFooterSeg;
        const matches = window.currentTmMatches;
        if (!seg) {
            el.innerHTML = '<span style="color:#94a3b8;font-size:0.75rem;">選取句段以顯示原文對照。</span>';
            return;
        }
        if (!matches || matches.length === 0) {
            el.innerHTML = '<span style="color:#94a3b8;font-size:0.75rem;">無 TM / 片段列可比對時無法顯示追蹤修訂。</span>';
            return;
        }
        const sel = typeof window.catPanelSelectedIndex === 'number' ? window.catPanelSelectedIndex : 0;
        const idx = Math.max(0, Math.min(sel, matches.length - 1));
        const m = matches[idx];
        if (!m || (m.type !== 'TM' && m.type !== 'Fragment')) {
            el.innerHTML = '<span style="color:#94a3b8;font-size:0.75rem;">請選取類型為 TM 或 Frg 的列以顯示原文對照。</span>';
            return;
        }
        if (typeof window.buildTmTrackChangeStackHtml === 'function') {
            el.innerHTML = window.buildTmTrackChangeStackHtml(seg.sourceText || '', m.sourceText || '');
        }
    }

    function formatCatTmChangeLogForFooter(changeLog) {
        if (!changeLog || !changeLog.length) return '<span style="color:#94a3b8;">無</span>';
        const parts = [];
        for (const cl of changeLog) {
            if (typeof cl === 'string') {
                parts.push(`<div class="tm-changelog-line">• ${cl.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`);
                continue;
            }
            if (cl && cl.kind === 'targetUpdate') {
                const at = cl.at ? new Date(cl.at).toLocaleString('zh-TW', { hour12: false }) : '';
                const by = (cl.by || '').replace(/</g, '&lt;');
                const diff = typeof window.buildTmTargetRevisionDiffHtml === 'function'
                    ? window.buildTmTargetRevisionDiffHtml(cl.oldTarget || '', cl.newTarget || '')
                    : '';
                parts.push(`<div class="tm-changelog-entry"><div class="tm-changelog-meta">${at} — ${by}</div><div class="tm-changelog-diff">${diff}</div></div>`);
            }
        }
        if (!parts.length) return '<span style="color:#94a3b8;">無</span>';
        const sep = '<hr class="cat-footer-divider cat-footer-divider--sub" />';
        return parts.map(p => `<div class="cat-footer-changelog-block">${p}</div>`).join(sep);
    }

    // --- Live TM Match Rendering ---
    async function renderLiveTmMatches(seg) {
        const searchResultsDOM = document.getElementById('tmSearchResults');
        const footerDOM = document.getElementById('liveFooterContent');
        if (!searchResultsDOM || !footerDOM) return;

        const hasTm = window.ActiveTmCache && window.ActiveTmCache.length > 0;
        const hasTb = window.ActiveTbTerms && window.ActiveTbTerms.length > 0;
        if (!seg.isLocked && (hasTm || hasTb)) {
            let matches = [];
            if (hasTm) {
                const rawTm = [];
            window.ActiveTmCache.forEach(tms => {
                const sim = calculateSimilarity(seg.sourceText, tms.sourceText);
                if (sim >= 50) {
                        rawTm.push({ ...tms, score: sim, type: 'TM' });
                    } else if (tms.sourceText && tms.sourceText.length >= 2 && seg.sourceText.includes(tms.sourceText)) {
                        rawTm.push({ ...tms, score: 'S', type: 'Fragment' });
                    }
                });
                const bySource = new Map();
                const fragOrNonTm = [];
                for (const m of rawTm) {
                    if (m.type !== 'TM') {
                        fragOrNonTm.push(m);
                        continue;
                    }
                    const k = m.sourceText;
                    if (!bySource.has(k)) bySource.set(k, []);
                    bySource.get(k).push(m);
                }
                const collapsedTm = [];
                for (const arr of bySource.values()) {
                    arr.sort((a, b) => {
                        const ta = new Date(a.lastModified || a.createdAt || 0).getTime();
                        const tb = new Date(b.lastModified || b.createdAt || 0).getTime();
                        return tb - ta;
                    });
                    const primary = { ...arr[0] };
                    if (arr.length > 1) primary._dupes = arr.slice(1);
                    collapsedTm.push(primary);
                }
                matches.push(...collapsedTm, ...fragOrNonTm);
            }
            if (hasTb) {
                const src = (seg.sourceText || '').trim();
                window.ActiveTbTerms.forEach(term => {
                    const termSrc = term.source || '';
                    if (!termSrc) return;
                    if (src === termSrc || src.includes(termSrc)) {
                        matches.push({
                            type: 'TB',
                            sourceText: term.source,
                            targetText: term.target,
                            tbName: term.tbName,
                            note: term.note,
                            score: 100
                        });
                    }
                });
            }

            matches.sort((a, b) => {
                const order = { TM: 0, TB: 1, Fragment: 2 };
                const oa = order[a.type] ?? 2;
                const ob = order[b.type] ?? 2;
                if (oa !== ob) return oa - ob;
                if (a.type === 'TM' && b.type === 'TM' && typeof a.score === 'number' && typeof b.score === 'number')
                    return b.score - a.score;
                    return 0;
            });

            if (matches.length > 0) {
                window.currentTmMatches = matches;
                window.catPanelSelectedIndex = 0;
                window.currentCatFooterSeg = seg;

                const renderFooter = (m) => {
                    const escFoot = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const fSeg = window.currentCatFooterSeg;
                    let footerHtml = '';
                    if (m.type === 'TB') {
                        footerHtml += `<div class="cat-footer-section">
                            <div style="font-size:0.8rem;">
                            <strong>術語庫：</strong>${escFoot(m.tbName || 'N/A')}<br>
                            ${m.note ? `<strong>備註：</strong>${escFoot(m.note)}<br>` : ''}
                        </div>
                        </div>`;
                    } else {
                        footerHtml += '<div class="cat-footer-block-wrap">';
                        if (fSeg && fSeg.repetitionType && (fSeg.repetitionTotal || 0) > 1) {
                            footerHtml += `<p class="cat-footer-rep-hint">此原文在檔案中重複 ${fSeg.repetitionTotal} 次。比對表若 TM 內同原文僅有一筆記憶則顯示一列；若有多筆同原文 TU，該列右側會出現 <strong style="color:#334155;">▶</strong> 可展開檢視。</p>`;
                        }
                        footerHtml += `<div class="cat-footer-section cat-footer-tm-meta">
                            <div><strong>TM 名稱：</strong>${escFoot(m.tmName || 'N/A')}</div>
                            ${m.key ? `<div><strong>Key：</strong>${escFoot(m.key)}</div>` : ''}
                            <div><strong>寫入檔案：</strong>${escFoot(m.writtenFile || 'N/A')}</div>
                        </div>`;
                        footerHtml += `<div class="cat-footer-section cat-footer-context">
                            <div class="cat-footer-context-inner">
                                <div><strong>上一句</strong><br>${escFoot(m.prevSegment || '')}</div>
                                <hr class="cat-footer-divider cat-footer-divider--sub" />
                                <div><strong>下一句</strong><br>${escFoot(m.nextSegment || '')}</div>
                            </div>
                        </div>`;
                        footerHtml += `<div class="cat-footer-section cat-footer-audit">
                            <div><strong>建立者：</strong>${escFoot(m.createdBy || 'N/A')}</div>
                            <div><strong>建立時間：</strong>${m.createdAt ? escFoot(new Date(m.createdAt).toLocaleString('zh-TW', { hour12: false })) : 'N/A'}</div>
                            <hr class="cat-footer-divider cat-footer-divider--before-changelog" />
                            <div><strong>更新紀錄</strong></div>
                            <div class="cat-footer-changelog">${formatCatTmChangeLogForFooter(m.changeLog)}</div>
                        </div>`;
                        footerHtml += '</div>';
                    }
                    footerDOM.innerHTML = footerHtml;
                };

                const headerHtml = `
                    <div class="result-table-header">
                        <div class="result-header-cell">#</div>
                        <div class="result-header-cell">原文</div>
                        <div class="result-header-cell result-header-cell--pct" aria-hidden="true">&nbsp;</div>
                        <div class="result-header-cell">譯文</div>
                    </div>
                `;

                const rowsHtml = matches.slice(0, 9).map((m, idx) => {
                    const isFragment = m.type === 'Fragment';
                    const isTb = m.type === 'TB';
                    let scoreInner = '';
                    let scoreBg = '';
                    if (isTb) {
                        scoreInner = '<span class="result-pct-main">TB</span>';
                        scoreBg = 'background:#fef9c3;';
                    } else if (isFragment) {
                        scoreInner = '<span class="result-pct-main">Frg</span>';
                    } else if (typeof m.score === 'number') {
                        const mv = m.score;
                        if (mv >= 100) scoreBg = 'background:#dcfce7;';
                        else if (mv >= 70) scoreBg = 'background:#ffedd5;';
                        const pct = `${Math.round(mv)}%`;
                        const dupBtn = (m._dupes && m._dupes.length)
                            ? `<button type="button" class="cat-dup-toggle" aria-expanded="false" title="同原文其他 TM 紀錄"><span aria-hidden="true">▶</span></button>`
                            : '';
                        scoreInner = `<span class="result-pct-row"><span class="result-pct-main">${pct}</span>${dupBtn}</span>`;
                    }
                    const dupPanel = (m._dupes && m._dupes.length) ? `
                    <div class="cat-tm-dupes-panel hidden">
                        ${m._dupes.map(d => {
                            const tStr = d.lastModified || d.createdAt ? new Date(d.lastModified || d.createdAt).toLocaleString('zh-TW', { hour12: false }) : '';
                            const tnm = (d.tmName || '').replace(/</g, '&lt;');
                            const tt = (d.targetText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            return `<div class="cat-tm-dupe-line"><strong>${tnm}</strong> · ${tStr}<br>譯文：${tt}</div>`;
                        }).join('')}
                    </div>` : '';
                    const isSelected = idx === window.catPanelSelectedIndex;
                    const tgtEsc = m.targetText.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                    return `
                    <div class="result-block">
                    <div class="result-item${isSelected ? ' result-item--selected' : ''}" data-index="${idx}"
                         onclick="handleCatResultClick(this, ${idx})"
                         ondblclick="handleCatResultApply(this, '${m.type}', \`${tgtEsc}\`, ${m.type === 'TM' ? m.score : 'undefined'}, ${idx})">
                        <div class="result-cell result-cell--index">${idx + 1}</div>
                        <div class="result-cell result-cell--source">${m.sourceText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                        <div class="result-cell result-cell--score" style="${scoreBg}">${scoreInner}</div>
                        <div class="result-cell result-cell--target">${m.targetText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                            </div>
                    ${dupPanel}
                    </div>
                    `;
                }).join('');

                searchResultsDOM.innerHTML = headerHtml + rowsHtml;

                window.updateCatPanelSelection = function () {
                    const sel = typeof window.catPanelSelectedIndex === 'number' ? window.catPanelSelectedIndex : 0;
                    const container = document.getElementById('tmSearchResults');
                    if (container) {
                        const list = container.querySelectorAll('.result-block');
                        list.forEach((block, i) => {
                            const item = block.querySelector('.result-item');
                            if (item) {
                                if (i === sel) item.classList.add('result-item--selected');
                                else item.classList.remove('result-item--selected');
                            }
                        });
                    }
                    if (window.currentTmMatches && window.currentTmMatches[sel] && window.currentTmRenderFooter)
                        window.currentTmRenderFooter(window.currentTmMatches[sel]);
                    updateCatTrackPanelContent();
                };

                renderFooter(matches[window.catPanelSelectedIndex]);
                window.currentTmRenderFooter = renderFooter;
                updateCatTrackPanelContent();
            } else {
                searchResultsDOM.innerHTML = '<div style="padding: 1rem; color: #64748b; font-size: 0.9rem; text-align: center;">無相符 TM／TB 紀錄</div>';
                footerDOM.innerHTML = '無相關中繼資料。';
                const trackEl = document.getElementById('liveTrackChangeContent');
                if (trackEl) trackEl.innerHTML = '<span style="color:#94a3b8;font-size:0.75rem;">無 TM / 片段列可比對時無法顯示追蹤修訂。</span>';
            }
        } else {
            const _isConfigured = (window.ActiveReadTmIds?.length > 0) || (window.ActiveReadTbIds?.length > 0);
            const _noDataMsg = seg.isLocked ? '此句段已鎖定'
                : _isConfigured ? '已掛載 TM / TB，目前無相符的比對結果'
                : '目前未掛載 TM 或術語庫，或請先選取句段';
            searchResultsDOM.innerHTML = `<div style="padding: 1rem; color: #64748b; font-size: 0.9rem; text-align: center;">${_noDataMsg}</div>`;
            footerDOM.innerHTML = '請選取句段以檢視詳細資訊。';
            const trackEl = document.getElementById('liveTrackChangeContent');
            if (trackEl) trackEl.innerHTML = '<span style="color:#94a3b8;font-size:0.75rem;">選取句段以顯示原文對照。</span>';
        }
    }

    // 單擊：選取該列（外框 + 下方中繼／追蹤修訂）
    window.handleCatResultClick = function(el, matchIndex) {
        const idx = typeof matchIndex === 'number' ? matchIndex : parseInt(matchIndex, 10);
        if (!isNaN(idx) && idx >= 0) {
            window.catPanelSelectedIndex = idx;
            if (typeof window.updateCatPanelSelection === 'function') window.updateCatPanelSelection();
        }
    };

    // 雙擊：套用該列的譯文至目前句段
    window.handleCatResultApply = async function(el, type, text, score, matchIndex) {
        const activeRow = document.querySelector('.grid-data-row.active-row');
        if (!activeRow) return;
        const textarea = activeRow.querySelector('.grid-textarea');
        if (!textarea) return;
        const rowIdx = Array.from(document.querySelectorAll('.grid-data-row')).indexOf(activeRow);
        if (rowIdx < 0 || !currentSegmentsList[rowIdx]) return;
        const seg = currentSegmentsList[rowIdx];
        if (segmentNeedsHighMatchGuard(seg)) {
            const ok = await showHighMatchEditConfirmModal(seg);
            if (!ok) return;
            highMatchEditConfirmedIds.add(seg.id);
        }
        markEmptySegUserEdited(seg.id);
        const oldTarget = seg.targetText;
        const oldMatchValue = seg.matchValue;

        let newTarget;
        if (type === 'TM') {
            newTarget = text;
            textarea.innerHTML = buildTaggedHtml(text, seg.targetTags || seg.sourceTags || []);
            updateTagColors(activeRow, text);
        } else {
            textarea.focus();
            insertPlainTextAtCaret(textarea, text);
            newTarget = extractTextFromEditor(textarea);
        }
        seg.targetText = newTarget;
        editorUndoEditStart[seg.id] = newTarget;
        const newMatchValue = type === 'TM' && score !== undefined && score !== 'undefined' ? String(score) : seg.matchValue;
        pushEditorUndo(seg.id, oldTarget, newTarget, {
            oldMatchValue,
            newMatchValue,
            oldStatus: seg.status,
            newStatus: seg.status
        });
        const updatePayload = type === 'TM' && score !== undefined && score !== 'undefined'
            ? { matchValue: String(score) }
            : undefined;
        if (updatePayload) seg.matchValue = updatePayload.matchValue;
        DBService.updateSegmentTarget(seg.id, newTarget, updatePayload || {}).catch(console.error);

        if (type === 'TM' && score !== undefined && score !== 'undefined') {
            applyMatchCellVisual(activeRow, String(score));
        }

        textarea.focus();
        if (el && el.style) {
            el.style.opacity = 0.5;
            setTimeout(() => { el.style.opacity = 1; }, 300);
        }
    };

    window.applyCatMatchAtIndex = function(index) {
        const matches = window.currentTmMatches;
        if (!matches || index < 0 || index >= matches.length) return;
        const m = matches[index];
        const el = document.querySelector(`#tmSearchResults .result-item[data-index="${index}"]`);
        const scoreArg = m.type === 'TM' ? m.score : undefined;
        window.handleCatResultApply(el || document.body, m.type, m.targetText, scoreArg, index);
    };
    
    // Alt+上/下：在右側 CAT 比對列表中移動選取
    document.addEventListener('keydown', function catPanelArrowKey(e) {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const viewEditor = document.getElementById('viewEditor');
        if (!viewEditor || viewEditor.classList.contains('hidden')) return;
        const matches = window.currentTmMatches;
        if (!matches || matches.length === 0) return;
        const maxIdx = matches.length - 1;
        const cur = typeof window.catPanelSelectedIndex === 'number' ? window.catPanelSelectedIndex : 0;
        if (e.key === 'ArrowDown') {
            window.catPanelSelectedIndex = Math.min(cur + 1, maxIdx);
        } else {
            window.catPanelSelectedIndex = Math.max(0, cur - 1);
        }
        e.preventDefault();
        if (typeof window.updateCatPanelSelection === 'function') window.updateCatPanelSelection();
    });

    // Grid Level Context Menu for Batch Actions (確認 / 鎖定)
    let contextMenu = null;
    gridBody.addEventListener('contextmenu', (e) => {
        const targetRow = e.target.closest('.grid-data-row');
        if (!targetRow) return;
        
        let targetId = parseId(targetRow.querySelector('.col-id').getAttribute('data-id'));
        
        // 若點到未選取列，改為只選這一列
        if (!selectedRowIds.has(targetId)) {
            selectedRowIds.clear();
            selectedRowIds.add(targetId);
            document.querySelectorAll('.grid-data-row').forEach(r => r.classList.remove('selected-row'));
            targetRow.classList.add('selected-row');
        }

        e.preventDefault();
        
        if (contextMenu) contextMenu.remove();
        
        contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;

        // anyUserLocked：有手動鎖定（才能解除）; anyEffectiveLocked：有任何鎖定; anyUnlocked：有非完全鎖定的句段（可供手動鎖定）
        const anyUserLocked = currentSegmentsList.some(s => selectedRowIds.has(s.id) && s.isLockedUser);
        const anyEffectiveLocked = currentSegmentsList.some(s => selectedRowIds.has(s.id) && (isDynamicForbidden(s) || s.isLockedUser));
        const anyUnlocked = currentSegmentsList.some(s => selectedRowIds.has(s.id) && !(isDynamicForbidden(s) || s.isLockedUser));
        
        contextMenu.innerHTML = `
            <div class="context-menu-item confirm" id="ctxBatchConfirm"><div class="icon"></div> 設定為「已確認」</div>
            <div class="context-menu-item" id="ctxBatchUnconfirm"><div class="icon"></div> 設定為「未確認」</div>
            <div class="context-menu-item" id="ctxLockSegments"${anyUnlocked ? '' : ' style="opacity:0.5;pointer-events:none;"'}><div class="icon"></div> 鎖定句段</div>
            <div class="context-menu-item" id="ctxUnlockSegments"${anyUserLocked ? '' : ' style="opacity:0.5;pointer-events:none;"'}><div class="icon"></div> 解除鎖定</div>
        `;
        
        document.body.appendChild(contextMenu);
        
        const closeMenu = () => { if(contextMenu) contextMenu.remove(); document.removeEventListener('click', closeMenu); };
        document.addEventListener('click', closeMenu);

        document.getElementById('ctxBatchConfirm').addEventListener('click', () => {
            const ids = Array.from(selectedRowIds);
            const toUpdate = currentSegmentsList.filter(s => ids.includes(s.id) && !(isDynamicForbidden(s) || s.isLockedUser));
            const touchAll = new Set();
            toUpdate.forEach(s => {
                const idx = currentSegmentsList.indexOf(s);
                if (idx >= 0) collectConfirmTouchIndices(idx).forEach(x => touchAll.add(x));
            });
            const beforeSnapshots = {};
            touchAll.forEach(idx => {
                const s = currentSegmentsList[idx];
                beforeSnapshots[s.id] = snapshotSegForUndo(s);
            });
            for (let s of toUpdate) {
                s.status = 'confirmed';
                if (currentFileFormat === 'mqxliff') {
                    s.confirmationRole = resolveConfirmationRole(s);
                }
            }
            const indices = toUpdate.map(s => currentSegmentsList.indexOf(s)).filter((ix) => ix >= 0).sort((a, b) => a - b);
            const maxIdx = indices.length ? Math.max(...indices) : -1;
            const dbWaits = [];
            toUpdate.forEach((s) => {
                const bs = beforeSnapshots[s.id];
                if (bs && bs.status !== 'confirmed') {
                    dbWaits.push(DBService.updateSegmentStatus(s.id, 'confirmed', currentFileFormat === 'mqxliff' && s.confirmationRole ? { confirmationRole: s.confirmationRole } : {}));
                }
            });
            void (async () => {
                await Promise.all(dbWaits);
                const focusIdx = maxIdx >= 0 ? getAfterConfirmFocusIndex(maxIdx) : null;
                _pendingFocusSegIdxAfterRender = focusIdx;
                updateProgress();
                renderEditorSegments();

                enqueueConfirmSideEffects(async () => {
                    try {
                        const tmU = [];
                        const tmR = [];
                        for (const i of indices) {
                            const seg = currentSegmentsList[i];
                            mergeTmPair({ undo: tmU, redo: tmR }, await syncSegmentToWriteTmsOnConfirm(seg, i));
                            if (seg.repetitionType) mergeTmPair({ undo: tmU, redo: tmR }, await propagateRepetition(seg, i));
                        }
                        const afterSnapshots = {};
                        touchAll.forEach(idx => {
                            const s = currentSegmentsList[idx];
                            afterSnapshots[s.id] = snapshotSegForUndo(s);
                        });
                        let changed = tmU.length > 0 || tmR.length > 0;
                        for (const id of Object.keys(beforeSnapshots)) {
                            if (JSON.stringify(beforeSnapshots[id]) !== JSON.stringify(afterSnapshots[id])) changed = true;
                        }
                        if (changed) {
                            pushUndoEntry({ kind: 'confirmOp', beforeSnapshots, afterSnapshots, tmUndo: tmU, tmRedo: tmR });
                        }
                        updateProgress();
                        const keepId = focusIdx != null && currentSegmentsList[focusIdx] ? currentSegmentsList[focusIdx].id : null;
                        renderEditorSegments();
                        if (keepId != null) {
                            const idx2 = currentSegmentsList.findIndex(s => s.id === keepId);
                            queueMicrotask(() => focusTargetEditorAtSegmentIndex(idx2 >= 0 ? idx2 : null));
                        }
                    } catch (err) { console.error(err); }
                });
            })();
        });

        document.getElementById('ctxBatchUnconfirm').addEventListener('click', () => {
            const ids = Array.from(selectedRowIds);
            const toUpdate = currentSegmentsList.filter(s => ids.includes(s.id) && !(isDynamicForbidden(s) || s.isLockedUser));
            const items = [];
            const dbWaits = [];
            for (let s of toUpdate) {
                const beforeSnap = snapshotSegForUndo(s);
                s.status = 'unconfirmed';
                dbWaits.push(DBService.updateSegmentStatus(s.id, 'unconfirmed'));
                items.push({ id: s.id, beforeSnap, afterSnap: snapshotSegForUndo(s) });
            }
            if (items.length) pushUndoEntry({ kind: 'segmentState', items });
            void Promise.all(dbWaits).then(() => {}).catch(console.error);
            renderEditorSegments();
        });

        document.getElementById('ctxLockSegments').addEventListener('click', async () => {
            const ids = Array.from(selectedRowIds);
            const toUpdate = currentSegmentsList.filter(s => ids.includes(s.id) && !(isDynamicForbidden(s) || s.isLockedUser));
            const items = [];
            for (let s of toUpdate) {
                const beforeSnap = snapshotSegForUndo(s);
                s.isLockedUser = true;
                await DBService.updateSegmentStatus(s.id, s.status || 'unconfirmed', { isLockedUser: true, isLocked: true });
                items.push({ id: s.id, beforeSnap, afterSnap: snapshotSegForUndo(s) });
            }
            if (items.length) pushUndoEntry({ kind: 'segmentState', items });
            renderEditorSegments();
        });

        document.getElementById('ctxUnlockSegments').addEventListener('click', async () => {
            const ids = Array.from(selectedRowIds);
            const toUpdate = currentSegmentsList.filter(s => ids.includes(s.id) && s.isLockedUser);
            const items = [];
            for (let s of toUpdate) {
                const beforeSnap = snapshotSegForUndo(s);
                s.isLockedUser = false;
                const stillLocked = !!s.isLockedSystem;
                await DBService.updateSegmentStatus(s.id, s.status || 'unconfirmed', { isLockedUser: false, isLocked: stillLocked });
                items.push({ id: s.id, beforeSnap, afterSnap: snapshotSegForUndo(s) });
            }
            if (items.length) pushUndoEntry({ kind: 'segmentState', items });
            renderEditorSegments();
        });
    });

    // 選取狀態只會在使用者主動切換選取目標時清除（ID 欄點擊或點入不在選取範圍中的編輯欄），
    // 點擊按鈕、快速鍵或其他操作不會清除選取狀態。

    function updateProgress() {
        // 依 rowIdx 排序，取得「原始排序索引」（不受當前篩選或排序影響）
        const originalOrdered = [...currentSegmentsList].sort((a, b) => (a.rowIdx ?? 0) - (b.rowIdx ?? 0));
        const inProgressRange = (s) => {
            if (progressRangeStart == null && progressRangeEnd == null) return true;
            const idx = originalOrdered.indexOf(s) + 1; // 1-based
            const lo = progressRangeStart ?? 1;
            const hi = progressRangeEnd ?? originalOrdered.length;
            return idx >= lo && idx <= hi;
        };

        const baseline = currentSegmentsList.filter(s => !isBaselineForbidden(s) && inProgressRange(s));
        const total = baseline.length;
        const sessionValid = currentSegmentsList.filter(s => !(isDynamicForbidden(s) || s.isLockedUser) && inProgressRange(s));
        const translated = sessionValid.filter(s => s.status === 'confirmed').length;

        let totalWords = 0;
        let confirmedWords = 0;
        baseline.forEach(s => { totalWords += countWords(s.sourceText); });
        sessionValid.forEach(s => {
            if (s.status === 'confirmed') confirmedWords += countWords(s.sourceText);
        });

        document.getElementById('statusBarSegments').textContent = `${translated} / ${total}`;
        document.getElementById('statusBarWords').textContent = `${confirmedWords} / ${totalWords}`;

        const wordPct = totalWords === 0 ? 0 : (confirmedWords / totalWords) * 100;
        if (progressFill) progressFill.style.width = `${wordPct}%`;
        const pctEl = document.getElementById('statusBarPercent');
        if (pctEl) pctEl.textContent = `${wordPct.toFixed(0)}%`;
    }

    // ── 進度條統計範圍按鈕 ───────────────────────────────────────────────────

    (function initProgressRangeUI() {
        const btnRange = document.getElementById('btnProgressRange');
        const popup = document.getElementById('progressRangePopup');
        const fromInput = document.getElementById('progressRangeFrom');
        const toInput = document.getElementById('progressRangeTo');
        const btnApply = document.getElementById('btnApplyProgressRange');
        const btnReset = document.getElementById('btnResetProgressRange');
        const rangeLabel = document.getElementById('progressRangeLabel');
        if (!btnRange || !popup) return;

        btnRange.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = popup.classList.contains('hidden');
            popup.classList.toggle('hidden', !isHidden);
            if (!isHidden) return;
            // 填入目前範圍值
            if (fromInput) fromInput.value = progressRangeStart ?? '';
            if (toInput) toInput.value = progressRangeEnd ?? '';
        });

        // 點其他地方關閉
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== btnRange) {
                popup.classList.add('hidden');
            }
        });

        btnApply?.addEventListener('click', () => {
            const lo = fromInput && fromInput.value ? parseInt(fromInput.value, 10) : null;
            const hi = toInput && toInput.value ? parseInt(toInput.value, 10) : null;
            progressRangeStart = (lo != null && lo > 0) ? lo : null;
            progressRangeEnd   = (hi != null && hi > 0) ? hi : null;
            popup.classList.add('hidden');
            updateProgress();
            if (rangeLabel) {
                if (progressRangeStart != null || progressRangeEnd != null) {
                    rangeLabel.textContent = `[範圍 ${progressRangeStart ?? '1'}–${progressRangeEnd ?? '末'}]`;
                    rangeLabel.style.display = '';
                } else {
                    rangeLabel.style.display = 'none';
                }
            }
        });

        btnReset?.addEventListener('click', () => {
            progressRangeStart = null;
            progressRangeEnd = null;
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';
            popup.classList.add('hidden');
            if (rangeLabel) rangeLabel.style.display = 'none';
            updateProgress();
        });
    })();

    // ── QA ──────────────────────────────────────────────────────────────────

    let _qaResults = [];
    const _qaIgnoredSet = new Set(); // key: `${gid}:${type}:${detail}`

    function _qaJumpToSegment(segId) {
        const row = document.querySelector(`.grid-data-row[data-seg-id="${segId}"]`);
        if (!row) { alert('句段目前不在可見列表中（可能被篩選隱藏），請移除篩選後再試。'); return; }
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const ta = row.querySelector('.grid-textarea');
        if (ta) ta.focus();
    }

    function runQaChecks(segs, options) {
        const { fromIdx, toIdx, includeLocked } = options || {};
        const results = [];

        // 依原始排序（globalId or rowIdx+1）決定範圍索引
        const originalOrdered = [...segs].sort((a, b) => (a.rowIdx ?? 0) - (b.rowIdx ?? 0));

        for (let oi = 0; oi < originalOrdered.length; oi++) {
            const s = originalOrdered[oi];
            const gid = s.globalId || (s.rowIdx + 1);
            const rangeIdx = oi + 1; // 1-based

            if (fromIdx != null && rangeIdx < fromIdx) continue;
            if (toIdx != null && rangeIdx > toIdx) continue;
            if (!includeLocked && (isDynamicForbidden(s) || s.isLockedUser)) continue;
            if (!s.targetText || !s.targetText.trim()) continue; // 未譯跳過

            // Tag 完整性檢查
            const srcIds = (s.sourceTags || []).map(t => String(t.id ?? t.num ?? t.index ?? ''));
            const tgtIds = (s.targetTags || []).map(t => String(t.id ?? t.num ?? t.index ?? ''));
            if (srcIds.length > 0) {
                const srcSet = new Set(srcIds);
                const tgtSet = new Set(tgtIds);
                const missing = srcIds.filter(id => id && !tgtSet.has(id));
                const extra = tgtIds.filter(id => id && !srcSet.has(id));
                const hasMissing = [...new Set(missing)].length > 0;
                const hasExtra = [...new Set(extra)].length > 0;
                if (hasMissing || hasExtra) {
                    const detail = hasMissing
                        ? '缺少 tag：{' + [...new Set(missing)].join('}, {') + '}'
                        : '多餘 tag：{' + [...new Set(extra)].join('}, {') + '}';
                    results.push({ segId: s.id, gid, type: 'Tag 檢查', info: detail, key: `${gid}:tag` });
                }
            }

            // TB 術語未套用
            if (window.ActiveTbTerms && window.ActiveTbTerms.length > 0) {
                for (const term of window.ActiveTbTerms) {
                    if (!term.source || !term.target) continue;
                    if ((s.sourceText || '').includes(term.source) && !(s.targetText || '').includes(term.target)) {
                        const detail = `「${term.source}」→「${term.target}」`;
                        results.push({ segId: s.id, gid, type: '術語未套用', info: detail, key: `${gid}:tb:${term.source}` });
                    }
                }
            }
        }
        return results;
    }

    function renderQaResults() {
        const tbody = document.getElementById('qaResultsBody');
        const table = document.getElementById('qaResultsTable');
        const statusEl = document.getElementById('qaStatus');
        if (!tbody || !table || !statusEl) return;

        const hideIgnored = document.getElementById('qaHideIgnored')?.checked;
        const tagCount = _qaResults.filter(r => r.type === 'Tag 檢查').length;
        const tbCount = _qaResults.filter(r => r.type === '術語未套用').length;

        if (_qaResults.length === 0) {
            table.style.display = 'none';
            statusEl.textContent = '✓ 無發現問題';
            statusEl.style.color = '#16a34a';
            return;
        }

        statusEl.style.color = '#b45309';
        statusEl.textContent = `發現 ${_qaResults.length} 個問題（Tag: ${tagCount}，術語: ${tbCount}）`;
        table.style.display = '';

        tbody.innerHTML = '';
        for (const r of _qaResults) {
            const isIgnored = _qaIgnoredSet.has(r.key);
            if (hideIgnored && isIgnored) continue;
            const tr = document.createElement('tr');
            tr.className = 'qa-row' + (isIgnored ? ' is-ignored' : '');
            tr.dataset.qaKey = r.key;

            const tdNum = document.createElement('td');
            tdNum.className = 'qa-td-num qa-clickable';
            tdNum.textContent = r.gid;
            tdNum.title = '點擊跳至句段';
            tdNum.addEventListener('click', () => _qaJumpToSegment(r.segId));

            const tdType = document.createElement('td');
            tdType.className = 'qa-td-type';
            tdType.textContent = r.type;

            const tdInfo = document.createElement('td');
            tdInfo.className = 'qa-td-info qa-clickable';
            tdInfo.textContent = r.info;
            tdInfo.title = '點擊跳至句段';
            tdInfo.addEventListener('click', () => _qaJumpToSegment(r.segId));

            const tdIgnore = document.createElement('td');
            tdIgnore.className = 'qa-td-ignore';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = isIgnored;
            cb.addEventListener('change', () => {
                if (cb.checked) _qaIgnoredSet.add(r.key); else _qaIgnoredSet.delete(r.key);
                tr.classList.toggle('is-ignored', cb.checked);
                if (document.getElementById('qaHideIgnored')?.checked && cb.checked) {
                    tr.style.display = 'none';
                }
            });
            tdIgnore.appendChild(cb);

            tr.appendChild(tdNum);
            tr.appendChild(tdType);
            tr.appendChild(tdInfo);
            tr.appendChild(tdIgnore);
            tbody.appendChild(tr);
        }
    }

    // QA 按鈕事件
    const btnRunQA = document.getElementById('btnRunQA');
    if (btnRunQA) {
        btnRunQA.addEventListener('click', () => {
            const fromVal = document.getElementById('qaRangeFrom')?.value;
            const toVal = document.getElementById('qaRangeTo')?.value;
            const fromIdx = fromVal ? parseInt(fromVal, 10) : null;
            const toIdx = toVal ? parseInt(toVal, 10) : null;
            const includeLocked = document.getElementById('qaIncludeLocked')?.checked ?? false;
            _qaResults = runQaChecks(currentSegmentsList, { fromIdx, toIdx, includeLocked });
            renderQaResults();
        });
    }
    document.getElementById('qaHideIgnored')?.addEventListener('change', renderQaResults);

    // ── TM Concordance Search ────────────────────────────────────────────────

    function parseTmConcordanceQuery(raw) {
        const phrases = [];
        const tokens = [];
        const s = String(raw || '');
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch === '"') {
                const end = s.indexOf('"', i + 1);
                if (end === -1) {
                    const tail = s.slice(i + 1).trim();
                    if (tail) tail.split(/\s+/).forEach(t => { if (t) tokens.push(t); });
                    break;
                }
                const inner = s.slice(i + 1, end);
                if (inner) phrases.push(inner);
                i = end + 1;
            } else if (/\s/.test(ch)) {
                i++;
            } else {
                const start = i;
                while (i < s.length && s[i] !== '"' && !/\s/.test(s[i])) i++;
                const word = s.slice(start, i);
                if (word) tokens.push(word);
            }
        }
        return { phrases, tokens };
    }

    function tmConcordanceMatchesQuery(text, phrases, tokens) {
        const lower = (text || '').toLowerCase();
        for (const p of phrases) {
            if (p == null || p === '') continue;
            if (!lower.includes(String(p).toLowerCase())) return false;
        }
        for (const t of tokens) {
            if (t == null || t === '') continue;
            if (!lower.includes(String(t).toLowerCase())) return false;
        }
        return true;
    }

    function buildTmConcordanceHighlightedHtml(rawText, phrases, tokens) {
        const text = rawText == null ? '' : String(rawText);
        const terms = [];
        phrases.forEach(p => { if (p != null && p !== '') terms.push(String(p)); });
        tokens.forEach(t => { if (t != null && t !== '') terms.push(String(t)); });
        if (!terms.length) return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lower = text.toLowerCase();
        const intervals = [];
        for (const term of terms) {
            const tl = term.toLowerCase();
            let pos = 0;
            let idx;
            while ((idx = lower.indexOf(tl, pos)) !== -1) {
                intervals.push([idx, idx + term.length]);
                pos = idx + 1;
            }
        }
        if (!intervals.length) return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const iv of intervals) {
            if (!merged.length || iv[0] > merged[merged.length - 1][1]) merged.push([iv[0], iv[1]]);
            else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
        }
        let out = '';
        let last = 0;
        for (const [a, b] of merged) {
            out += text.slice(last, a).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            out += '<mark class="tm-search-hit">' + text.slice(a, b).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</mark>';
            last = b;
        }
        out += text.slice(last).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return out;
    }

    function runTmConcordanceSearch() {
        const input = document.getElementById('tmSearchInput');
        const fieldSel = document.getElementById('tmSearchField');
        const resultsEl = document.getElementById('tmSearchConcordanceResults');
        if (!input || !resultsEl) return;
        const raw = (input.value || '').trim();
        if (!raw) { resultsEl.innerHTML = '<div style="color:#64748b; padding:0.5rem;">請輸入搜尋關鍵字。</div>'; return; }
        const { phrases, tokens } = parseTmConcordanceQuery(raw);
        if (!phrases.length && !tokens.length) {
            resultsEl.innerHTML = '<div style="color:#64748b; padding:0.5rem;">請輸入有效的搜尋關鍵字。</div>';
            return;
        }
        const field = fieldSel ? fieldSel.value : 'source';
        const cache = window.ActiveTmCache || [];
        const matches = [];
        cache.forEach(seg => {
            const text = field === 'target' ? (seg.targetText || '') : (seg.sourceText || '');
            if (tmConcordanceMatchesQuery(text, phrases, tokens)) matches.push(seg);
        });
        if (!matches.length) {
            resultsEl.innerHTML = '<div style="color:#64748b; padding:0.5rem;">沒有找到相符的 TM 記錄。</div>';
            return;
        }
        const maxShow = 50;
        const shown = matches.slice(0, maxShow);
        resultsEl.innerHTML = shown.map((m, i) => {
            const src = buildTmConcordanceHighlightedHtml(m.sourceText || '', phrases, tokens);
            const tgt = buildTmConcordanceHighlightedHtml(m.targetText || '', phrases, tokens);
            const tmLabel = (m.tmName || '').replace(/</g, '&lt;');
            return `<div class="tm-concordance-item" data-idx="${i}" style="padding:0.45rem 0.4rem; border-bottom:1px solid #e2e8f0; cursor:pointer;" title="點擊套用譯文">
                <div style="font-size:0.78rem; color:#64748b; margin-bottom:2px;">${tmLabel}</div>
                <div style="margin-bottom:2px;"><b>原：</b>${src}</div>
                <div><b>譯：</b>${tgt}</div>
            </div>`;
        }).join('') + (matches.length > maxShow ? `<div style="padding:0.4rem; color:#94a3b8; font-size:0.8rem;">僅顯示前 ${maxShow} 筆（共 ${matches.length} 筆相符）</div>` : '');

        resultsEl.querySelectorAll('.tm-concordance-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.getAttribute('data-idx'));
                const m = shown[idx];
                if (!m) return;
                const activeRow = document.querySelector('.grid-data-row.active-row');
                if (!activeRow) return;
                const segId = parseId(activeRow.dataset.segId);
                const seg = currentSegmentsList.find(s => s.id === segId);
                if (!seg) return;
                markEmptySegUserEdited(seg.id);
                const editor = activeRow.querySelector('.grid-textarea');
                if (!editor || editor.contentEditable === 'false') return;
                editor.innerText = m.targetText || '';
                seg.targetText = m.targetText || '';
                DBService.updateSegmentTarget(seg.id, seg.targetText).catch(console.error);
                updateProgress();
                emitCollabEdit('commit', seg, seg.targetText);
            });
        });
    }

    const btnTmSearch = document.getElementById('btnTmSearch');
    if (btnTmSearch) btnTmSearch.addEventListener('click', runTmConcordanceSearch);
    const tmSearchInputEl = document.getElementById('tmSearchInput');
    if (tmSearchInputEl) tmSearchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runTmConcordanceSearch(); }
    });

    // ── New Term Panel ───────────────────────────────────────────────────────

    function refreshNewTermPanel() {
        const noTbEl = document.getElementById('newTermNoTb');
        const formEl = document.getElementById('newTermForm');
        const nameEl = document.getElementById('newTermTbName');
        if (!noTbEl || !formEl) return;
        const writeTbId = window.ActiveWriteTb;
        if (writeTbId == null) {
            noTbEl.style.display = '';
            formEl.style.display = 'none';
            return;
        }
        noTbEl.style.display = 'none';
        formEl.style.display = '';
        const tbName = (window.ActiveTbNames || {})[writeTbId] || `TB #${writeTbId}`;
        if (nameEl) nameEl.textContent = tbName;
    }

    const btnAddNewTerm = document.getElementById('btnAddNewTerm');
    if (btnAddNewTerm) {
        btnAddNewTerm.addEventListener('click', async () => {
            const writeTbId = window.ActiveWriteTb;
            if (writeTbId == null) { alert('未設定寫入目標術語庫。'); return; }
            const src = (document.getElementById('newTermSource')?.value || '').trim();
            const tgt = (document.getElementById('newTermTarget')?.value || '').trim();
            const note = (document.getElementById('newTermNote')?.value || '').trim();
            if (!src && !tgt) { alert('請至少填入原文或譯文。'); return; }
            const tb = await DBService.getTB(writeTbId);
            if (!tb) { alert('找不到寫入目標術語庫。'); return; }
            const terms = (tb.terms || []).slice();
            const nextNum = typeof tb.nextTermNumber === 'number' ? tb.nextTermNumber : terms.length + 1;
            const userName = getCurrentUserName();
            const now = new Date().toISOString();
            terms.push({ source: src, target: tgt, note, termNumber: nextNum, createdBy: userName, createdAt: now });
            const changeLog = Array.isArray(tb.changeLog) ? tb.changeLog.slice() : [];
            changeLog.push(makeBaseLogEntry('add', 'tb-term', { termNumbers: [nextNum] }));
            await DBService.updateTB(writeTbId, { terms, nextTermNumber: nextNum + 1, changeLog });
            window.ActiveTbTerms.push({ source: src, target: tgt, note, tbId: writeTbId, tbName: tb.name || `TB #${writeTbId}` });
            const statusEl = document.getElementById('newTermStatus');
            if (statusEl) { statusEl.textContent = `已新增術語 #${nextNum}`; statusEl.style.display = ''; setTimeout(() => { statusEl.style.display = 'none'; }, 3000); }
            if (document.getElementById('newTermSource')) document.getElementById('newTermSource').value = '';
            if (document.getElementById('newTermTarget')) document.getElementById('newTermTarget').value = '';
            if (document.getElementById('newTermNote')) document.getElementById('newTermNote').value = '';
        });
    }

    function renderSegmentComments(seg) {
        const panel = document.getElementById('tabComments');
        if (!panel) return;
        if (!seg || !Array.isArray(seg.comments) || seg.comments.length === 0) {
            panel.innerHTML = '<div style="padding:0.75rem; color:#64748b; font-size:0.9rem;">此句段目前沒有留言。</div>';
            return;
        }
        panel.innerHTML = seg.comments.map(c => {
            const creator = (c.creator || '').trim() || '（未指定）';
            const time = (c.time || '').trim();
            const header = time ? `${creator} / ${time}` : creator;
            const safeText = (c.text || '').replace(/</g, '&lt;');
            return `<div style="padding:0.5rem 0.75rem; border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
                <div style="color:#475569; margin-bottom:0.15rem;"><strong>${header}</strong></div>
                <div style="white-space:pre-wrap; color:#0f172a;">${safeText}</div>
            </div>`;
        }).join('');
    }

    // ==========================================
    // VIEW SETTINGS ENGINE
    // ==========================================
    function applyColSettings() {
        const root = document.documentElement;
        
        const activeCols = colSettings.filter(c => c.visible);
        const inactiveCols = colSettings.filter(c => !c.visible);
        const statusCol = activeCols.find(c => c.id === 'col-status');
        const otherCols = activeCols.filter(c => c.id !== 'col-status');
        const finalCols = statusCol ? [...otherCols, statusCol] : otherCols;

        const widths = finalCols.map(c => {
            if (['col-status', 'col-match', 'col-repetition'].includes(c.id)) return '35px';
            return c.width;
        }).join(' ');
        root.style.setProperty('--grid-cols', widths);

        // Discard all resizers visibility globally then enable specifically for order
        document.querySelectorAll('.col-resizer').forEach(r => r.style.display = 'none');

        finalCols.forEach((c, index) => {
            const header = document.querySelector(`.grid-header-cell[data-col-id="${c.id}"]`);
            if(header) { 
                header.style.order = index; 
                header.style.display = ''; 
                if (c.id !== 'col-status' && index < otherCols.length - 1) {
                    const rs = header.querySelector('.col-resizer');
                    if (rs) rs.style.display = 'block';
                }
            }
        });
        inactiveCols.forEach(c => {
            const header = document.querySelector(`.grid-header-cell[data-col-id="${c.id}"]`);
            if(header) { header.style.display = 'none'; }
        });
        
        document.querySelectorAll('.grid-data-row').forEach(row => {
            finalCols.forEach((c, index) => {
                const cell = row.querySelector(`.${c.id}`);
                if(cell) { cell.style.order = index; cell.style.display = ''; }
            });
            inactiveCols.forEach(c => {
                const cell = row.querySelector(`.${c.id}`);
                if(cell) { cell.style.display = 'none'; }
            });
        });
    }

    function ensureStatusColumnLast() {
        const idx = colSettings.findIndex(c => c.id === 'col-status');
        if (idx >= 0 && idx < colSettings.length - 1) {
            const [st] = colSettings.splice(idx, 1);
            colSettings.push(st);
        }
    }

    let colSettingsDragFrom = null;

    function renderColSettings() {
        ensureStatusColumnLast();
        colSettingsListContainer.innerHTML = '';
        colSettings.forEach((c, index) => {
            const item = document.createElement('div');
            item.dataset.index = String(index);
            item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.5rem; background:white; border:1px solid #cbd5e1; border-radius:4px;';
            const isStatus = c.id === 'col-status';

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="col-drag-handle" style="color:#94a3b8; user-select:none;" title="${isStatus ? '狀態欄固定於最右' : '拖曳排序'}">${isStatus ? '🔒' : '☰'}</span>
                    <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:${isStatus ? 'not-allowed' : 'pointer'};">
                        <input type="checkbox" ${c.visible ? 'checked' : ''} data-id="${c.id}" class="col-vis-toggle" ${isStatus ? 'disabled' : ''}>
                        <span style="${isStatus ? 'color:#94a3b8;' : ''}">${c.name}</span>
                    </label>
                </div>`;
            if (!isStatus) item.draggable = true;
            colSettingsListContainer.appendChild(item);
        });

        document.querySelectorAll('.col-vis-toggle').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const col = colSettings.find(cs => cs.id === e.target.getAttribute('data-id'));
                if (col) col.visible = e.target.checked;
            });
        });

        colSettingsListContainer.querySelectorAll('[draggable="true"]').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                colSettingsDragFrom = parseInt(row.dataset.index, 10);
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(colSettingsDragFrom)); } catch (_) {}
            });
            row.addEventListener('dragend', () => { colSettingsDragFrom = null; });
        });
    }

    if (colSettingsListContainer && !colSettingsListContainer.__colDragBound) {
        colSettingsListContainer.__colDragBound = true;
        colSettingsListContainer.addEventListener('dragover', (e) => {
            const t = e.target && e.target.closest && e.target.closest('[data-index]');
            if (!t || !colSettingsListContainer.contains(t)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        colSettingsListContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropRow = e.target && e.target.closest && e.target.closest('[data-index]');
            if (!dropRow || !colSettingsListContainer.contains(dropRow)) return;
            const from = colSettingsDragFrom;
            const to = parseInt(dropRow.dataset.index, 10);
            if (from == null || Number.isNaN(from) || Number.isNaN(to) || from === to) return;
            if (!colSettings[from] || !colSettings[to]) return;
            if (colSettings[from].id === 'col-status' || colSettings[to].id === 'col-status') {
                ensureStatusColumnLast();
                renderColSettings();
                return;
            }
            const [moved] = colSettings.splice(from, 1);
            const ins = from < to ? to - 1 : to;
            colSettings.splice(ins, 0, moved);
            ensureStatusColumnLast();
            renderColSettings();
        });
    }

    function syncEmptySegSettingsUI() {
        const mode = localStorage.getItem('catToolEmptySegMode') || 'off';
        const pct = localStorage.getItem('catToolEmptySegTmMinPct') || '70';
        if (emptySegModeSelect) emptySegModeSelect.value = mode;
        if (emptySegTmMinPctInput) emptySegTmMinPctInput.value = pct;
        const nav = localStorage.getItem(AFTER_CONFIRM_NAV_KEY) || 'nextUnconfirmed';
        document.querySelectorAll('input[name="afterConfirmNav"]').forEach((el) => {
            el.checked = el.value === nav;
        });
    }

    if (btnColSettings) btnColSettings.addEventListener('click', () => {
        renderColSettings();
        syncEmptySegSettingsUI();
        viewSettingsModal.classList.remove('hidden');
    });

    btnCloseViewSettings.addEventListener('click', () => viewSettingsModal.classList.add('hidden'));
    
    btnSaveViewSettings.addEventListener('click', () => {
        localStorage.setItem('catToolColSettings', JSON.stringify(colSettings));
        if (emptySegModeSelect) {
            const m = emptySegModeSelect.value || 'off';
            localStorage.setItem('catToolEmptySegMode', ['off', 'tm_only', 'copy_only', 'tm_then_copy'].includes(m) ? m : 'off');
        }
        if (emptySegTmMinPctInput) {
            const v = parseInt(emptySegTmMinPctInput.value, 10);
            const n = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 70));
            localStorage.setItem('catToolEmptySegTmMinPct', String(n));
        }
        const navEl = document.querySelector('input[name="afterConfirmNav"]:checked');
        const nav = navEl && (navEl.value === 'nextRow' || navEl.value === 'nextUnconfirmed') ? navEl.value : 'nextUnconfirmed';
        localStorage.setItem(AFTER_CONFIRM_NAV_KEY, nav);
        applyColSettings();
        viewSettingsModal.classList.add('hidden');
    });

    btnResetViewSettings.addEventListener('click', () => {
        let maxKeys = 0;
        currentSegmentsList.forEach(seg => { if(seg.keys && seg.keys.length > maxKeys) maxKeys = seg.keys.length; });
        const defaultCols = [];
        defaultCols.push({ id: 'col-id', name: 'ID', visible: true, width: '50px' });
        for(let i=0; i<maxKeys; i++) {
            defaultCols.push({ id: `col-key-${i}`, name: `Key`, visible: true, width: '100px' });
        }
        defaultCols.push({ id: 'col-source', name: '原文 (Source)', visible: true, width: '1fr' });
        defaultCols.push({ id: 'col-target', name: '譯文 (Target)', visible: true, width: '1fr' });
        defaultCols.push({ id: 'col-extra', name: '額外資訊', visible: true, width: '100px' });
        defaultCols.push({ id: 'col-repetition', name: '重複', visible: true, width: '35px' });
        defaultCols.push({ id: 'col-match', name: '相符度', visible: true, width: '35px' });
        defaultCols.push({ id: 'col-status', name: '狀態', visible: true, width: '35px' });

        colSettings = defaultCols;
        localStorage.setItem('catToolEmptySegMode', 'off');
        localStorage.setItem('catToolEmptySegTmMinPct', '70');
        localStorage.setItem(AFTER_CONFIRM_NAV_KEY, 'nextUnconfirmed');
        if (emptySegModeSelect) emptySegModeSelect.value = 'off';
        if (emptySegTmMinPctInput) emptySegTmMinPctInput.value = '70';
        document.querySelectorAll('input[name="afterConfirmNav"]').forEach((el) => {
            el.checked = el.value === 'nextUnconfirmed';
        });
        renderColSettings();
    });

    // ==========================================
    // EXPORT ENGINE 
    // XLIFF 系列：window.CatToolXliffTags（js/xliff-tag-pipeline.js）
    // ==========================================

    function showExportTagWarning(tagIssues) {
        return new Promise(resolve => {
            const modal = document.getElementById('exportTagWarningModal');
            const summaryEl = document.getElementById('exportTagWarningSummary');
            const listEl = document.getElementById('exportTagWarningList');
            const btnCancel = document.getElementById('exportTagWarningCancel');
            const btnConfirm = document.getElementById('exportTagWarningConfirm');
            if (!modal || !summaryEl || !listEl || !btnCancel || !btnConfirm) {
                // 若找不到元件，退化成直接繼續匯出
                resolve(true);
                return;
            }

            summaryEl.textContent = `偵測到 ${tagIssues.length} 筆句段標籤可能有問題（缺少或多出標籤）。`;
            listEl.innerHTML = '';
            tagIssues.slice(0, 50).forEach(issue => {
                const div = document.createElement('div');
                const miss = issue.missing.length ? `缺少: ${issue.missing.join(', ')}` : '';
                const extra = issue.extra.length ? `多出: ${issue.extra.join(', ')}` : '';
                const parts = [miss, extra].filter(Boolean).join('；');
                div.textContent = `句段 ${issue.label}: ${parts}`;
                div.style.padding = '0.25rem 0';
                listEl.appendChild(div);
            });
            if (tagIssues.length > 50) {
                const more = document.createElement('div');
                more.textContent = `…… 其餘 ${tagIssues.length - 50} 筆已略過顯示。`;
                more.style.padding = '0.25rem 0';
                more.style.color = '#64748b';
                listEl.appendChild(more);
            }

            modal.classList.remove('hidden');

            function cleanup(result) {
                modal.classList.add('hidden');
                btnCancel.removeEventListener('click', onCancel);
                btnConfirm.removeEventListener('click', onConfirm);
                resolve(result);
            }
            function onCancel() {
                cleanup(false);
            }
            function onConfirm() {
                cleanup(true);
            }

            btnCancel.addEventListener('click', onCancel);
            btnConfirm.addEventListener('click', onConfirm);
        });
    }

    function _resolveWorkbookSheet(wb, sheetName) {
        if (!wb || !wb.Sheets || sheetName == null || sheetName === '') return null;
        const s0 = String(sheetName).trim();
        if (wb.Sheets[s0]) return wb.Sheets[s0];
        const names = wb.SheetNames || [];
        const lower = s0.toLowerCase();
        for (let i = 0; i < names.length; i++) {
            const n = names[i];
            if (n != null && String(n).trim().toLowerCase() === lower) return wb.Sheets[n];
        }
        return null;
    }

    /**
     * 匯出用譯文：先以 currentSegmentsList 為完整基底（與編輯器狀態一致），再以 DOM 覆寫可編輯列，
     * 避免逐句掃描列時遺漏或與 DB 快照混用造成新舊交雜。
     */
    function buildExportTargetMap() {
        const map = new Map();
        if (Array.isArray(currentSegmentsList)) {
            for (let i = 0; i < currentSegmentsList.length; i++) {
                const s = currentSegmentsList[i];
                map.set(String(s.id), {
                    targetText: s.targetText || '',
                    targetTags: Array.isArray(s.targetTags) ? s.targetTags : [],
                    sourceTags: s.sourceTags,
                    baseRprXml: s.baseRprXml
                });
            }
        }
        const grid = document.getElementById('gridBody');
        if (grid) {
            const rowList = grid.querySelectorAll('.grid-data-row');
            for (let i = 0; i < rowList.length; i++) {
                const row = rowList[i];
                const sid = String(parseId(row.dataset.segId));
                const targetInput = row.querySelector('.col-target .grid-textarea');
                if (!targetInput || targetInput.getAttribute('contenteditable') === 'false') continue;
                const domText = extractTextFromEditor(targetInput);
                const merged = currentSegmentsList && currentSegmentsList.find((x) => String(x.id) === sid);
                const base = map.get(sid) || { targetText: '', targetTags: [], sourceTags: undefined, baseRprXml: undefined };
                map.set(sid, {
                    targetText: domText,
                    targetTags: (merged && merged.targetTags && merged.targetTags.length)
                        ? merged.targetTags
                        : (base.targetTags || []),
                    sourceTags: merged ? (merged.sourceTags || base.sourceTags) : base.sourceTags,
                    baseRprXml: merged && merged.baseRprXml != null ? merged.baseRprXml : base.baseRprXml
                });
            }
        }
        return map;
    }

    function segmentsWithEditorTargetsForExport(dbSegs) {
        if (!Array.isArray(dbSegs)) return dbSegs;
        const exportMap = buildExportTargetMap();
        return dbSegs.map((seg) => {
            const p = exportMap.get(String(seg.id));
            if (p) {
                return {
                    ...seg,
                    targetText: p.targetText,
                    targetTags: p.targetTags,
                    sourceTags: p.sourceTags != null ? p.sourceTags : seg.sourceTags,
                    baseRprXml: p.baseRprXml != null ? p.baseRprXml : seg.baseRprXml
                };
            }
            return {
                ...seg,
                targetText: seg.targetText || '',
                targetTags: seg.targetTags || [],
                sourceTags: seg.sourceTags,
                baseRprXml: seg.baseRprXml
            };
        });
    }

    /** 匯出前：將畫面上譯文欄內容寫入 DB，避免 debounce 未完成時匯出仍為舊 target_text */
    async function flushTargetEditorsToDbForExport() {
        if (!currentFileId || !currentSegmentsList || !currentSegmentsList.length) return;
        const grid = document.getElementById('gridBody');
        if (!grid) return;
        const rows = grid.querySelectorAll('.grid-data-row');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const targetInput = row.querySelector('.col-target .grid-textarea');
            if (!targetInput || targetInput.getAttribute('contenteditable') === 'false') continue;
            const sid = parseId(row.dataset.segId);
            const seg = currentSegmentsList.find((s) => String(s.id) === String(sid));
            if (!seg) continue;
            const latest = extractTextFromEditor(targetInput);
            if (latest === (seg.targetText || '')) continue;
            seg.targetText = latest;
            try {
                await DBService.updateSegmentTarget(seg.id, latest);
            } catch (err) {
                console.error('[CAT] flushTargetEditorsToDbForExport', err);
            }
        }
    }

    exportBtn.addEventListener('click', async () => {
        if (!currentFileId) return;
        try {
            exportBtn.disabled = true; exportBtn.textContent = '匯出中...';
            await flushTargetEditorsToDbForExport();
            const f    = await DBService.getFile(currentFileId);
            const rawSegs = await DBService.getSegmentsByFile(currentFileId);
            const segs = segmentsWithEditorTargetsForExport(rawSegs);

            const tagIssues = (Xliff && typeof Xliff.validateExportTags === 'function')
                ? Xliff.validateExportTags(segs)
                : [];
            if (tagIssues.length) {
                const proceed = await showExportTagWarning(tagIssues);
                if (!proceed) return;
            }

            if (currentFileFormat === 'xliff' || currentFileFormat === 'mqxliff' || currentFileFormat === 'sdlxliff') {
                if (!Xliff || typeof Xliff.exportXliffFamily !== 'function') {
                    throw new Error('XLIFF 匯出模組未載入（請確認已載入 js/xliff-tag-pipeline.js）');
                }
                await Xliff.exportXliffFamily(f, segs, currentFileFormat);
            } else {
                // Excel 匯出：直接修改原工作簿以保留樣式與 Rich Text
                if (!f.originalFileBuffer || !(f.originalFileBuffer.byteLength > 0)) {
                    alert('無法匯出：遺失原始檔案內容，請確認檔案已自雲端完整同步後再試。');
                    return;
                }
                const _dbgFmt = (arr) => Array.isArray(arr) ? arr.slice(0, 5).map(s => String(s.id).slice(-6) + ' r' + s.rowIdx + ' c' + s.colTgt + ' | ' + (s.targetText || '').slice(0, 50)).join('\n') : String(arr);
                console.log('[EXPORT DEBUG] currentSegmentsList:\n' + _dbgFmt(currentSegmentsList));
                console.log('[EXPORT DEBUG] rawSegs:\n' + _dbgFmt(rawSegs));
                console.log('[EXPORT DEBUG] segs:\n' + _dbgFmt(segs));
                const originalData = new Uint8Array(f.originalFileBuffer);
                const wb = XLSX.read(originalData, { type: 'array' });
                const XlsxRich = window.CatToolXlsxRichTags;

                let excelWriteCount = 0;
                let excelSkipLocked = 0;
                let excelSkipNoSheet = 0;
                const couldWriteSegs = segs.filter((s) => !s.isLocked);

                // SheetJS 0.20 讀入後有內部工作表 XML 快取；直接修改 cell 物件無法反映在 writeFile 輸出。
                // 解法：將整張工作表轉成 AoA → 更新目標欄 → aoa_to_sheet 重建，再整張替換進 wb.Sheets。
                const segsBySheet = new Map();
                segs.forEach(s => {
                    if (s.isLocked) { excelSkipLocked++; return; }
                    const k = String(s.sheetName || '');
                    if (!segsBySheet.has(k)) segsBySheet.set(k, []);
                    segsBySheet.get(k).push(s);
                });

                for (const [segSheetName, sheetSegs] of segsBySheet) {
                    // 找到工作簿中實際的 sheet 鍵（不區分大小寫）
                    const actualName = (wb.SheetNames || []).find(n =>
                        String(n || '').trim().toLowerCase() === segSheetName.trim().toLowerCase()
                    ) || segSheetName;
                    const sheet = wb.Sheets[actualName];
                    if (!sheet) {
                        excelSkipNoSheet += sheetSegs.length;
                        continue;
                    }

                    // 整張轉 AoA（header:1 保留所有欄位；defval 填空字串避免 undefined）
                    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                    for (const s of sheetSegs) {
                        // 確保陣列有足夠的列/欄
                        while (data.length <= s.rowIdx) data.push([]);
                        while (data[s.rowIdx].length <= s.colTgt) data[s.rowIdx].push('');
                        data[s.rowIdx][s.colTgt] = s.targetText || '';
                        excelWriteCount++;
                    }

                    // 重建工作表並替換（aoa_to_sheet 從 JS 資料直接序列化，無快取問題）
                    wb.Sheets[actualName] = XLSX.utils.aoa_to_sheet(data);
                }

                if (couldWriteSegs.length > 0 && excelWriteCount === 0) {
                    alert('匯出時無法寫入任何譯文儲存格（可能為工作表名稱與匯入時不一致，或資料異常）。已略過：鎖定 ' + excelSkipLocked + ' 句、找不到工作表 ' + excelSkipNoSheet + ' 句。');
                } else if (excelSkipNoSheet > 0) {
                    console.warn('[CAT] Excel 匯出：部分句段找不到對應工作表，已略過', excelSkipNoSheet, '句');
                }

                XLSX.writeFile(wb, `Translated_${f.name}`, { bookType: 'xlsx' });
            }
        } catch (e) {
            alert('匯出發生錯誤: ' + e.message);
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = '匯出檔案';
        }
    });

    // One-way migration helper: offline snapshot -> team cloud.
    // ============================================================
    // NOTES MODULE（私人筆記、共用資訊、討論串）
    // ============================================================

    const NOTES_TOOLBAR = [
        ['bold', 'italic', 'strike'],
        [{ script: 'sub' }, { script: 'super' }],
        ['link', 'image'],
        [{ list: 'ordered' }, { list: 'bullet' }]
    ];
    const REPLY_TOOLBAR = [['bold', 'italic', 'strike'], ['link'], [{ list: 'bullet' }]];

    let _noteQuills = {};       // legacy: 保留給 autoSave 掃描（私人筆記改為編輯模式後主要用 _privateNoteEditQuills）
    let _privateNoteEditQuills = {}; // 私人筆記 id → Quill（僅編輯中）
    let _replyQuills = {};      // guidelineId+context → Quill instance
    let _guidelineEditQuills = {}; // guideline id (string) → Quill（編輯準則／共用筆記中）
    let _activeNoteProjectId = null;
    let _notesPanelInitialized = false;
    let _privateNoteSharePending = null;

    /** 私人筆記／共用資訊：優先 _activeNoteProjectId，否則沿用編輯器 currentProjectId */
    function _notesProjectIdOrNull() {
        const a = _activeNoteProjectId;
        if (a != null && a !== '') return a;
        const c = typeof currentProjectId !== 'undefined' ? currentProjectId : null;
        return c != null && c !== '' ? c : null;
    }

    /** 團隊模式與 Supabase is_admin（pm/executive）一致，供共用資訊增刪改；離線模式皆可編輯 */
    function isCatSharedMutator() {
        if (!isTeamMode()) return true;
        const role = (window._tmsRole || '').toLowerCase();
        return role === 'pm' || role === 'executive';
    }

    function normalizeGuidelineContent(html) {
        if (html == null) return '';
        const s = String(html).trim();
        if (!s) return '';
        try {
            const doc = new DOMParser().parseFromString(s, 'text/html');
            const text = (doc.body && doc.body.textContent) ? doc.body.textContent.replace(/\s+/g, ' ').trim() : '';
            return text;
        } catch (_) {
            return s.replace(/\s+/g, ' ').trim();
        }
    }

    function isQuillHtmlEffectivelyEmpty(html) {
        return normalizeGuidelineContent(html) === '';
    }

    function privateNoteItemType(note) {
        return note && note.itemType === 'todo' ? 'todo' : 'note';
    }

    function _closePrivateNoteShareDialog() {
        _privateNoteSharePending = null;
        document.getElementById('privateNoteShareModal')?.classList.add('hidden');
    }

    function _openPrivateNoteShareDialog(note) {
        if (!_notesProjectIdOrNull()) return;
        if (!note || privateNoteItemType(note) !== 'note') return;
        const idStr = String(note.id);
        const q = _privateNoteEditQuills[idStr];
        const html = q ? q.root.innerHTML : (note.content || '');
        if (isQuillHtmlEffectivelyEmpty(html)) {
            alert('請先為此筆記輸入內容後再共用。');
            return;
        }
        _privateNoteSharePending = { ...note, content: html };
        document.getElementById('privateNoteShareModal')?.classList.remove('hidden');
    }

    /** 待辦 content 存純文字；相容舊資料若含 HTML 則取可見文字 */
    function todoPlainTextFromStored(content) {
        if (content == null) return '';
        const s = String(content).trim();
        if (!s) return '';
        if (s.startsWith('<')) {
            try {
                const doc = new DOMParser().parseFromString(s, 'text/html');
                return (doc.body && doc.body.textContent) ? doc.body.textContent.replace(/\s+/g, ' ').trim() : '';
            } catch (_) {
                return s;
            }
        }
        return s;
    }

    /** 共用資訊：時間顯示到分，不含秒 */
    function formatGuidelineDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    /** 側欄共用資訊 + 若共用資訊 Modal 開啟則一併重繪 */
    async function _refreshSharedInfoUi() {
        await _loadSharedInfo();
        const m = document.getElementById('sharedInfoModal');
        const pid = _notesProjectIdOrNull();
        if (m && !m.classList.contains('hidden') && pid) {
            await _reloadSharedInfoModal(pid);
        }
    }

    /** 離開分頁／專案／頁面隱藏時：刪除仍為空且無討論的準則條目，與空白私人筆記 */
    async function _pruneEmptyNoteDrafts(projectId) {
        if (projectId == null || projectId === '') return;
        try {
            const notes = await DBService.getPrivateNotesByProject(projectId, '');
            for (const note of notes) {
                const idStr = String(note.id);
                if (privateNoteItemType(note) === 'todo') {
                    const text = todoPlainTextFromStored(note.content);
                    if (text !== '') continue;
                    await DBService.deletePrivateNote(parseId(note.id)).catch(() => {});
                    continue;
                }
                const q = _privateNoteEditQuills[idStr] || _noteQuills[note.id];
                const html = q ? q.root.innerHTML : (note.content || '');
                if (!isQuillHtmlEffectivelyEmpty(html)) continue;
                await DBService.deletePrivateNote(parseId(note.id)).catch(() => {});
                delete _privateNoteEditQuills[idStr];
                delete _noteQuills[note.id];
            }
        } catch (_) {}
        try {
            const gls = await DBService.getGuidelinesByProject(projectId);
            for (const gl of gls) {
                const idStr = String(gl.id);
                const qEdit = _guidelineEditQuills[idStr];
                const html = qEdit ? qEdit.root.innerHTML : (gl.content || '');
                if (!isQuillHtmlEffectivelyEmpty(html)) continue;
                const replies = await DBService.getGuidelineReplies(gl.id).catch(() => []);
                if (replies.length) continue;
                await DBService.deleteGuideline(parseId(gl.id)).catch(() => {});
                delete _guidelineEditQuills[idStr];
            }
        } catch (_) {}
    }

    // ---- Quill image handler for notes ----
    async function uploadQuillImage(quill) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const url = await _uploadImageFile(file);
            if (!url) return;
            const range = quill.getSelection(true);
            quill.insertEmbed(range ? range.index : 0, 'image', url);
        };
        input.click();
    }

    async function _uploadImageFile(file) {
        const reader = new FileReader();
        return new Promise(resolve => {
            reader.onload = async (e) => {
                const base64 = e.target.result;
                if (!isTeamMode()) { resolve(base64); return; }
                try {
                    const url = await DBService.uploadNoteImage({ fileName: file.name, base64, mimeType: file.type });
                    resolve(url);
                } catch (err) { console.error('Image upload failed', err); resolve(null); }
            };
            reader.readAsDataURL(file);
        });
    }

    function _makeQuill(container, toolbar, placeholder) {
        const q = new Quill(container, {
            theme: 'snow',
            placeholder: placeholder || '',
            modules: {
                toolbar: {
                    container: toolbar,
                    handlers: { image: () => uploadQuillImage(q) }
                }
            }
        });
        container.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    const url = await _uploadImageFile(file);
                    if (!url) return;
                    const range = q.getSelection(true);
                    q.insertEmbed(range ? range.index : 0, 'image', url);
                }
            }
        });
        return q;
    }

    // ---- Notes panel init (tabs, resize, collapse) ----
    function initNotesPanel() {
        if (_notesPanelInitialized) return;
        _notesPanelInitialized = true;

        const panel = document.getElementById('notesPanel');
        const resizer = document.getElementById('notesPanelResizer');
        const collapseBtn = document.getElementById('btnCollapseNotesPanel');
        const body = document.getElementById('notesPanelBody');
        if (!panel) return;

        // Tab switching（切換前先清掉空白草稿）
        panel.querySelectorAll('.notes-tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await _pruneEmptyNoteDrafts(_notesProjectIdOrNull());
                panel.querySelectorAll('.notes-tab-btn').forEach(b => b.classList.remove('active'));
                panel.querySelectorAll('.notes-tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-notes-tab');
                const tabEl = document.getElementById(tabId);
                if (tabEl) tabEl.classList.add('active');
                await _loadPrivateNotes();
                await _refreshSharedInfoUi();
            });
        });

        document.addEventListener('visibilitychange', () => {
            const pid = _notesProjectIdOrNull();
            if (document.visibilityState === 'hidden' && pid) {
                _pruneEmptyNoteDrafts(pid).catch(console.error);
            }
        });

        // Collapse
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                collapseBtn.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
            });
        }

        // Drag-resize (top border, ns-resize)
        if (resizer && panel) {
            let ptrNotes = null;
            const endNotes = (e) => {
                if (ptrNotes && e.pointerId === ptrNotes.pid) {
                    try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
                    ptrNotes = null;
                    document.body.style.cursor = '';
                }
            };
            resizer.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                if (panel.classList.contains('collapsed')) return;
                ptrNotes = { pid: e.pointerId, startY: e.clientY, startH: panel.offsetHeight };
                resizer.setPointerCapture(e.pointerId);
                document.body.style.cursor = 'ns-resize';
            });
            resizer.addEventListener('pointermove', (e) => {
                if (!ptrNotes || e.pointerId !== ptrNotes.pid) return;
                e.preventDefault();
                const dy = ptrNotes.startY - e.clientY;
                let nh = ptrNotes.startH + dy;
                nh = Math.min(600, Math.max(80, nh));
                panel.style.height = `${nh}px`;
            });
            resizer.addEventListener('pointerup', endNotes);
            resizer.addEventListener('pointercancel', endNotes);
        }

        const addBtn = document.getElementById('btnAddPrivateNote');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                const pid = _notesProjectIdOrNull();
                if (!pid) {
                    alert('無法判定專案，無法新增筆記。請從專案詳情開啟檔案，或重新整理後再試。');
                    return;
                }
                try {
                    const id = await DBService.addPrivateNote({
                        projectId: pid,
                        userId: '',
                        content: '',
                        createdByName: getCurrentUserName(),
                        itemType: 'note'
                    });
                    await _loadPrivateNotes();
                    const wrap = document.getElementById(`private-note-item-${id}`);
                    if (wrap) {
                        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        _startPrivateNoteEdit(
                            { id, content: '', itemType: 'note', updatedAt: new Date().toISOString() },
                            wrap
                        );
                    }
                } catch (err) {
                    console.error(err);
                    alert(err && err.message ? String(err.message) : '新增筆記失敗');
                }
            });
        }
        const addTodoBtn = document.getElementById('btnAddPrivateTodo');
        if (addTodoBtn) {
            addTodoBtn.addEventListener('click', async () => {
                const pid = _notesProjectIdOrNull();
                if (!pid) {
                    alert('無法判定專案，無法新增待辦。請從專案詳情開啟檔案，或重新整理後再試。');
                    return;
                }
                try {
                    await DBService.addPrivateNote({
                        projectId: pid,
                        userId: '',
                        content: '',
                        createdByName: getCurrentUserName(),
                        itemType: 'todo',
                        todoDone: false
                    });
                    await _loadPrivateNotes();
                    const list = document.getElementById('privateNotesListTodos');
                    const last = list && list.querySelector('.private-todo-item:last-child .private-todo-input');
                    if (last) {
                        last.focus();
                        last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                } catch (err) {
                    console.error(err);
                    alert(err && err.message ? String(err.message) : '新增待辦失敗');
                }
            });
        }

        document.getElementById('btnPrivateNoteShareCopy')?.addEventListener('click', async () => {
            const note = _privateNoteSharePending;
            const pid = _notesProjectIdOrNull();
            if (!note || !pid) {
                _closePrivateNoteShareDialog();
                return;
            }
            try {
                await DBService.addGuideline({
                    projectId: pid,
                    type: 'shared_note',
                    content: note.content,
                    createdByName: getCurrentUserName()
                });
                await _refreshSharedInfoUi();
            } catch (err) {
                console.error(err);
                alert(err && err.message ? String(err.message) : '複製失敗');
            }
            _closePrivateNoteShareDialog();
        });
        document.getElementById('btnPrivateNoteShareMove')?.addEventListener('click', async () => {
            const note = _privateNoteSharePending;
            const pid = _notesProjectIdOrNull();
            if (!note || !pid) {
                _closePrivateNoteShareDialog();
                return;
            }
            try {
                await DBService.addGuideline({
                    projectId: pid,
                    type: 'shared_note',
                    content: note.content,
                    createdByName: getCurrentUserName()
                });
                delete _privateNoteEditQuills[String(note.id)];
                await DBService.deletePrivateNote(parseId(note.id));
                await _refreshSharedInfoUi();
                await _loadPrivateNotes();
            } catch (err) {
                console.error(err);
                alert(err && err.message ? String(err.message) : '移動失敗');
            }
            _closePrivateNoteShareDialog();
        });
        document.getElementById('btnPrivateNoteShareCancel')?.addEventListener('click', () => {
            _closePrivateNoteShareDialog();
        });

        // Add PM guideline
        const addPmBtn = document.getElementById('btnAddPmGuideline');
        if (addPmBtn) {
            addPmBtn.addEventListener('click', async () => {
                const pid = _notesProjectIdOrNull();
                if (!pid) {
                    alert('無法判定專案，無法新增準則。請從專案詳情開啟檔案，或重新整理後再試。');
                    return;
                }
                await _addGuideline('pm_guideline', { listKey: 'panel' });
            });
        }
    }

    async function _addGuideline(type, opts) {
        const listKey = (opts && opts.listKey) || 'panel';
        const pid = _notesProjectIdOrNull();
        if (!pid) {
            alert('無法判定專案，無法新增共用資訊。請從專案詳情開啟檔案，或重新整理後再試。');
            return;
        }
        let id;
        try {
            id = await DBService.addGuideline({ projectId: pid, type, content: '', createdByName: getCurrentUserName() });
        } catch (err) {
            console.error(err);
            alert(err && err.message ? String(err.message) : '新增失敗');
            return;
        }
        await _refreshSharedInfoUi();
        let guidelines = [];
        try { guidelines = await DBService.getGuidelinesByProject(pid); } catch (_) {}
        const gl = guidelines.find(g => String(g.id) === String(id));
        const wrap = document.getElementById(`guideline-item-${listKey}-${id}`);
        if (gl && wrap && isCatSharedMutator()) {
            _startGuidelineEdit(gl, wrap, listKey);
        }
    }

    // ---- Load notes for current project ----
    async function loadEditorNotes(projectId) {
        const prev = _activeNoteProjectId;
        if (prev != null && projectId != null && String(prev) !== String(projectId)) {
            await _pruneEmptyNoteDrafts(prev);
        }
        _activeNoteProjectId = projectId || currentProjectId;
        initNotesPanel();
        await Promise.all([_loadPrivateNotes(), _refreshSharedInfoUi()]);
    }

    async function _loadPrivateNotes() {
        const listNotes = document.getElementById('privateNotesListNotes');
        const listTodos = document.getElementById('privateNotesListTodos');
        const pid = _notesProjectIdOrNull();
        if (!listNotes || !listTodos || !pid) return;
        if (!_activeNoteProjectId) _activeNoteProjectId = pid;
        let notes = [];
        try { notes = await DBService.getPrivateNotesByProject(pid, ''); } catch (_) {}
        _noteQuills = {};
        Object.keys(_privateNoteEditQuills).forEach((k) => { delete _privateNoteEditQuills[k]; });
        const noteRows = notes.filter((n) => privateNoteItemType(n) === 'note');
        const todoRows = notes.filter((n) => privateNoteItemType(n) === 'todo');
        listNotes.innerHTML = '';
        listTodos.innerHTML = '';
        if (!noteRows.length) {
            listNotes.innerHTML = '<div class="private-notes-empty">目前沒有筆記。點「＋ 新增筆記」開始記錄。</div>';
        } else {
            noteRows.forEach((note, idx) => listNotes.appendChild(_buildPrivateNoteItem(note, idx + 1)));
        }
        if (!todoRows.length) {
            listTodos.innerHTML = '<div class="private-notes-empty">目前沒有待辦。點「＋ 新增待辦」新增。</div>';
        } else {
            todoRows.forEach((note) => listTodos.appendChild(_buildPrivateTodoItem(note)));
        }
    }

    function _buildPrivateNoteItem(note, listIndex) {
        const wrap = document.createElement('div');
        wrap.className = 'guideline-item private-note-item';
        wrap.id = `private-note-item-${note.id}`;
        const idxLabel = listIndex > 0 ? `${listIndex}.` : '';
        const at = note.updatedAt ? formatGuidelineDate(note.updatedAt) : '';
        wrap.innerHTML = `
            <div class="guideline-item-row">
                <div class="guideline-item-index">${idxLabel}</div>
                <div class="guideline-item-main">
                    <div class="guideline-item-body" id="pn-body-${note.id}"></div>
                </div>
                <div class="guideline-item-aside">
                    <div class="guideline-item-aside-inner">
                        <span class="guideline-item-meta-combined">${at}</span>
                        <div class="note-item-actions guideline-item-aside-actions pn-aside-${note.id}">
                            <button type="button" class="pn-edit-btn" title="編輯">✏️</button>
                            <button type="button" class="pn-del-btn danger" title="刪除">🗑</button>
                            <button type="button" class="gl-reply-btn pn-share-btn" title="共用至共用資訊">共用</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const bodyEl = wrap.querySelector(`#pn-body-${note.id}`);
        bodyEl.innerHTML = note.content
            ? `<div class="ql-editor ql-snow">${note.content}</div>`
            : '<div class="guideline-item-empty">（無內容）</div>';
        wrap.querySelector('.pn-edit-btn')?.addEventListener('click', () => _startPrivateNoteEdit(note, wrap));
        wrap.querySelector('.pn-share-btn')?.addEventListener('click', () => _openPrivateNoteShareDialog(note));
        wrap.querySelector('.pn-del-btn')?.addEventListener('click', async () => {
            if (!confirm('確定刪除此筆記？')) return;
            delete _privateNoteEditQuills[String(note.id)];
            await DBService.deletePrivateNote(parseId(note.id));
            await _loadPrivateNotes();
        });
        return wrap;
    }

    function _startPrivateNoteEdit(note, wrap) {
        const idStr = String(note.id);
        const bodyEl = wrap.querySelector(`#pn-body-${note.id}`);
        if (!bodyEl) return;
        bodyEl.innerHTML = '';
        const q = _makeQuill(bodyEl, NOTES_TOOLBAR, '輸入內容…');
        if (note.content) { try { q.root.innerHTML = note.content; } catch (_) {} }
        _privateNoteEditQuills[idStr] = q;
        const acts = wrap.querySelector(`.pn-aside-${note.id}`) || wrap.querySelector('.guideline-item-aside-actions');
        if (acts) {
            acts.innerHTML = `
                <button type="button" class="pn-save-btn primary-btn btn-sm">儲存</button>
                <button type="button" class="pn-cancel-btn secondary-btn btn-sm">取消</button>`;
        }
        wrap.querySelector('.pn-save-btn')?.addEventListener('click', async () => {
            const html = q.root.innerHTML;
            delete _privateNoteEditQuills[idStr];
            try {
                await DBService.updatePrivateNote(parseId(note.id), html);
                await _loadPrivateNotes();
            } catch (err) {
                console.error(err);
                alert(err && err.message ? String(err.message) : '儲存失敗');
            }
        });
        wrap.querySelector('.pn-cancel-btn')?.addEventListener('click', async () => {
            const html = q.root.innerHTML;
            delete _privateNoteEditQuills[idStr];
            if (isQuillHtmlEffectivelyEmpty(html)) {
                try {
                    await DBService.deletePrivateNote(parseId(note.id));
                } catch (err) {
                    console.error(err);
                }
            }
            await _loadPrivateNotes();
        });
    }

    function _buildPrivateTodoItem(note) {
        const wrap = document.createElement('div');
        const done = !!note.todoDone;
        wrap.className = `guideline-item private-todo-item${done ? ' is-done' : ''}`;
        wrap.id = `private-todo-item-${note.id}`;
        const at = note.updatedAt ? formatGuidelineDate(note.updatedAt) : '';
        const textVal = escapeHtml(todoPlainTextFromStored(note.content));
        wrap.innerHTML = `
            <div class="guideline-item-row">
                <div class="private-todo-check">
                    <input type="checkbox" class="private-todo-cb" ${done ? 'checked' : ''} aria-label="完成待辦">
                </div>
                <div class="guideline-item-main">
                    <input type="text" class="private-todo-input" value="${textVal}" placeholder="待辦內容…" spellcheck="false">
                </div>
                <div class="guideline-item-aside">
                    <div class="guideline-item-aside-inner">
                        <span class="guideline-item-meta-combined">${at}</span>
                        <div class="note-item-actions guideline-item-aside-actions">
                            <button type="button" class="pt-del-btn danger" title="刪除">🗑</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const cb = wrap.querySelector('.private-todo-cb');
        const input = wrap.querySelector('.private-todo-input');
        let saveTimer = null;
        const saveText = async () => {
            const t = input ? input.value : '';
            await DBService.updatePrivateNote(parseId(note.id), { content: t });
        };
        input?.addEventListener('input', () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveText, 450);
        });
        cb?.addEventListener('change', async () => {
            const checked = !!cb.checked;
            wrap.classList.toggle('is-done', checked);
            try {
                await DBService.updatePrivateNote(parseId(note.id), { todoDone: checked });
            } catch (err) {
                console.error(err);
            }
        });
        wrap.querySelector('.pt-del-btn')?.addEventListener('click', async () => {
            if (!confirm('確定刪除此待辦？')) return;
            await DBService.deletePrivateNote(parseId(note.id));
            await _loadPrivateNotes();
        });
        return wrap;
    }

    // ---- Shared info ----
    async function _loadSharedInfo() {
        const pid = _notesProjectIdOrNull();
        if (!pid) return;
        let guidelines = [];
        try { guidelines = await DBService.getGuidelinesByProject(pid); } catch (_) {}
        const pmList = document.getElementById('pmGuidelinesList');
        const shList = document.getElementById('sharedNotesList');
        const pmAddBtn = document.getElementById('btnAddPmGuideline');
        if (pmAddBtn) pmAddBtn.style.display = isCatSharedMutator() ? '' : 'none';
        _renderGuidelinesList(guidelines.filter(g => g.type === 'pm_guideline'), pmList, 'panel');
        _renderGuidelinesList(guidelines.filter(g => g.type === 'shared_note'), shList, 'panel');
    }

    function _renderGuidelinesList(items, container, listKey) {
        if (!container) return;
        const lk = listKey || 'panel';
        container.innerHTML = '';
        if (!items.length) {
            container.innerHTML = '<div style="font-size:0.8rem;color:#94a3b8;padding:0.2rem 0;">（目前無內容）</div>';
            return;
        }
        items.forEach((gl, idx) => container.appendChild(_buildGuidelineItem(gl, idx + 1, lk)));
    }

    function _buildGuidelineItem(gl, listIndex, listKey) {
        const lk = listKey || 'panel';
        const pm = isCatSharedMutator();
        const wrap = document.createElement('div');
        wrap.className = 'guideline-item';
        wrap.id = `guideline-item-${lk}-${gl.id}`;
        const idxLabel = listIndex > 0 ? `${listIndex}.` : '';
        const updAt = gl.updatedAt ? formatGuidelineDate(gl.updatedAt) : '';
        const byEsc = gl.createdByName ? gl.createdByName.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
        const metaCombined = [updAt, byEsc].filter(Boolean).join(' · ');
        const actionsHtml = pm ? `
            <button type="button" class="gl-edit-btn" title="編輯">✏️</button>
            <button type="button" class="gl-del-btn danger" title="刪除">🗑</button>` : '';
        wrap.innerHTML = `
            <div class="guideline-item-row">
                <div class="guideline-item-index">${idxLabel}</div>
                <div class="guideline-item-main">
                    <div class="guideline-item-body" id="gl-body-${lk}-${gl.id}"></div>
                    <div class="guideline-versions" id="gl-versions-${lk}-${gl.id}" style="${gl.versions && gl.versions.length ? '' : 'display:none'}"></div>
                    <div class="replies-section" id="gl-replies-${lk}-${gl.id}"></div>
                </div>
                <div class="guideline-item-aside">
                    <div class="guideline-item-aside-inner">
                        <span class="guideline-item-meta-combined">${metaCombined}</span>
                        <div class="note-item-actions guideline-item-aside-actions">${actionsHtml}
                            <button type="button" class="gl-reply-btn">回覆</button>
                        </div>
                    </div>
                </div>
            </div>`;

        const bodyEl = wrap.querySelector(`#gl-body-${lk}-${gl.id}`);
        bodyEl.innerHTML = gl.content
            ? `<div class="ql-editor ql-snow">${gl.content}</div>`
            : '<div class="guideline-item-empty">（無內容）</div>';

        _renderVersions(gl, wrap.querySelector(`#gl-versions-${lk}-${gl.id}`), lk);

        _loadAndRenderReplies(gl.id, wrap.querySelector(`#gl-replies-${lk}-${gl.id}`));

        if (pm) {
            wrap.querySelector('.gl-edit-btn')?.addEventListener('click', () => _startGuidelineEdit(gl, wrap, lk));
            wrap.querySelector('.gl-del-btn')?.addEventListener('click', async () => {
                if (!confirm('確定刪除此條目（包含所有回覆）？')) return;
                try {
                    await DBService.deleteGuideline(parseId(gl.id));
                    delete _guidelineEditQuills[String(gl.id)];
                    await _refreshSharedInfoUi();
                } catch (err) {
                    console.error(err);
                    alert(err && err.message ? String(err.message) : '刪除失敗（可能無權限或網路錯誤）');
                }
            });
        }

        wrap.querySelector('.gl-reply-btn')?.addEventListener('click', () => _showReplyInput(gl.id, null, 0, wrap.querySelector(`#gl-replies-${lk}-${gl.id}`)));

        return wrap;
    }

    function _startGuidelineEdit(gl, wrap, listKey) {
        const lk = listKey || 'panel';
        const bodyEl = wrap.querySelector(`#gl-body-${lk}-${gl.id}`);
        if (!bodyEl) return;
        bodyEl.innerHTML = '';
        const q = _makeQuill(bodyEl, NOTES_TOOLBAR, '輸入內容…');
        if (gl.content) { try { q.root.innerHTML = gl.content; } catch (_) {} }
        _guidelineEditQuills[String(gl.id)] = q;
        const acts = wrap.querySelector('.guideline-item-aside-actions');
        if (acts) acts.innerHTML = `
            <button type="button" class="gl-save-btn primary-btn btn-sm">儲存</button>
            <button type="button" class="gl-cancel-btn secondary-btn btn-sm">取消</button>`;
        wrap.querySelector('.gl-save-btn')?.addEventListener('click', async () => {
            const html = q.root.innerHTML;
            if (normalizeGuidelineContent(gl.content) === normalizeGuidelineContent(html)) {
                alert('內容未變更');
                delete _guidelineEditQuills[String(gl.id)];
                await _refreshSharedInfoUi();
                return;
            }
            delete _guidelineEditQuills[String(gl.id)];
            try {
                await DBService.updateGuideline(parseId(gl.id), html, getCurrentUserName());
                await _refreshSharedInfoUi();
            } catch (err) {
                console.error(err);
                alert(err && err.message ? String(err.message) : '儲存失敗');
            }
        });
        wrap.querySelector('.gl-cancel-btn')?.addEventListener('click', async () => {
            const idStr = String(gl.id);
            const html = q.root.innerHTML;
            delete _guidelineEditQuills[idStr];
            if (isQuillHtmlEffectivelyEmpty(html) && isCatSharedMutator()) {
                try {
                    const replies = await DBService.getGuidelineReplies(gl.id);
                    if (!replies.length) {
                        await DBService.deleteGuideline(parseId(gl.id));
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            await _refreshSharedInfoUi();
        });
    }

    function _renderVersions(gl, container, listKey) {
        if (!container) return;
        const lk = listKey || 'panel';
        const versions = gl.versions || [];
        if (!versions.length) return;
        container.innerHTML = `<span class="guideline-versions-toggle">▸ ${versions.length} 個舊版本</span>
            <div class="guideline-versions-list"></div>`;
        const toggle = container.querySelector('.guideline-versions-toggle');
        const vlist = container.querySelector('.guideline-versions-list');
        toggle.addEventListener('click', () => {
            vlist.classList.toggle('open');
            toggle.textContent = vlist.classList.contains('open')
                ? `▾ ${versions.length} 個舊版本`
                : `▸ ${versions.length} 個舊版本`;
        });
        [...versions].reverse().forEach(v => {
            const entry = document.createElement('div');
            entry.className = 'guideline-version-entry';
            entry.innerHTML = `<div class="ql-editor ql-snow" style="padding:0;font-size:0.78rem;color:#94a3b8;">${v.content || ''}</div>
                <div class="guideline-version-meta">${v.createdByName || ''}  ${v.createdAt ? formatGuidelineDate(v.createdAt) : ''}</div>`;
            vlist.appendChild(entry);
        });
    }

    // ---- Replies ----
    async function _loadAndRenderReplies(guidelineId, container) {
        if (!container) return;
        let replies = [];
        try { replies = await DBService.getGuidelineReplies(guidelineId); } catch (_) {}
        container.innerHTML = '';
        _renderReplyTree(guidelineId, container, replies, isCatSharedMutator(), null, 0, container);
    }

    function _renderReplyTree(guidelineId, container, allReplies, pm, parentId, depth, repliesRootContainer) {
        const root = repliesRootContainer || container;
        const children = allReplies.filter(r => (r.parentReplyId || null) === parentId);
        children.forEach(reply => {
            const item = document.createElement('div');
            item.className = 'reply-item' + (reply.isResolved ? ' resolved' : '');
            item.dataset.depth = depth;
            item.dataset.replyId = reply.id;
            const at = formatGuidelineDate(reply.createdAt);
            const resolveLabel = reply.isResolved
                ? `已結案（${reply.resolvedByName || ''}，${reply.resolvedAt ? formatGuidelineDate(reply.resolvedAt) : ''}）▸ 點此展開`
                : '';
            item.innerHTML = `
                ${reply.isResolved ? `<div class="reply-resolved-bar" data-reply-id="${reply.id}">${resolveLabel}</div>` : ''}
                <div class="reply-content-area${reply.isResolved ? '' : ' open'}">
                    <div class="reply-meta-row">
                        <span class="reply-meta-text">${reply.createdByName || ''}  ${at}</span>
                        <div class="reply-actions">
                        ${depth < 2 ? `<button type="button" class="reply-reply-btn" data-reply-id="${reply.id}" data-depth="${depth}">回覆</button>` : ''}
                        <button type="button" class="reply-resolve-btn" data-reply-id="${reply.id}">${reply.isResolved ? '重開' : '結案'}</button>
                        ${pm ? `<button type="button" class="danger reply-del-btn" data-reply-id="${reply.id}">刪除</button>` : ''}
                        </div>
                    </div>
                    <div class="reply-body"><div class="ql-editor ql-snow" style="padding:0;font-size:0.82rem;">${reply.content || ''}</div></div>
                </div>`;
            container.appendChild(item);

            // Collapsed bar click
            item.querySelector('.reply-resolved-bar')?.addEventListener('click', () => {
                item.querySelector('.reply-content-area').classList.toggle('open');
            });
            // Reply button
            item.querySelector('.reply-reply-btn')?.addEventListener('click', () => {
                _showReplyInput(guidelineId, reply.id, depth + 1, root, item);
            });
            // Resolve/reopen
            item.querySelector('.reply-resolve-btn')?.addEventListener('click', async () => {
                const newResolved = !reply.isResolved;
                await DBService.resolveGuidelineReply(parseId(reply.id), getCurrentUserName(), newResolved);
                await _loadAndRenderReplies(guidelineId, root);
            });
            // Delete
            item.querySelector('.reply-del-btn')?.addEventListener('click', async () => {
                if (!confirm('確定刪除此回覆（及其下層回覆）？')) return;
                await DBService.deleteGuidelineReply(parseId(reply.id));
                await _loadAndRenderReplies(guidelineId, root);
            });

            // Render children
            _renderReplyTree(guidelineId, container, allReplies, pm, reply.id, depth + 1, root);
        });
    }

    function _showReplyInput(guidelineId, parentReplyId, depth, container, afterEl) {
        const existingInput = container.querySelector('.reply-add-area');
        if (existingInput) existingInput.remove();
        const area = document.createElement('div');
        area.className = 'reply-add-area';
        const host = document.createElement('div');
        area.appendChild(host);
        const actions = document.createElement('div');
        actions.className = 'reply-add-actions';
        actions.innerHTML = `<button type="button" class="secondary-btn reply-cancel-btn">取消</button><button type="button" class="primary-btn reply-submit-btn">送出</button>`;
        area.appendChild(actions);
        if (afterEl) afterEl.after(area); else container.appendChild(area);
        const q = _makeQuill(host, REPLY_TOOLBAR, '輸入回覆…');
        const submitBtn = area.querySelector('.reply-submit-btn');
        area.querySelector('.reply-cancel-btn').addEventListener('click', () => area.remove());
        submitBtn.addEventListener('click', async () => {
            const html = q.root.innerHTML;
            if (!html || html === '<p><br></p>') return;
            submitBtn.disabled = true;
            try {
                await DBService.addGuidelineReply({ guidelineId: parseId(guidelineId), parentReplyId: parentReplyId ? parseId(parentReplyId) : null, depth, content: html, createdByName: getCurrentUserName() });
                await _loadAndRenderReplies(guidelineId, container);
            } catch (err) {
                console.error(err);
                alert(err && err.message ? String(err.message) : '送出失敗');
                submitBtn.disabled = false;
            }
        });
    }

    // ---- Sharing modal (exit flow) ----
    async function ensureNotesSharingResolved() {
        const pid = _notesProjectIdOrNull();
        if (!pid) return true;
        let notes = [];
        try { notes = await DBService.getPrivateNotesByProject(pid, ''); } catch (_) {}
        const noteRows = notes.filter((n) => privateNoteItemType(n) === 'note');
        const hasContent = noteRows.some(n => n.content && n.content !== '<p><br></p>' && String(n.content).trim());
        if (!hasContent) return true;
        return _showNoteSharingModal(true);
    }

    async function _showNoteSharingModal(returnPromise) {
        const pid = _notesProjectIdOrNull();
        if (!pid) return true;
        let notes = [];
        try { notes = await DBService.getPrivateNotesByProject(pid, ''); } catch (_) {}
        notes = notes.filter(
            (n) => privateNoteItemType(n) === 'note' && n.content && n.content !== '<p><br></p>' && String(n.content).trim()
        );
        if (!notes.length) return true;

        const modal = document.getElementById('noteSharingModal');
        const list = document.getElementById('noteSharingList');
        if (!modal || !list) return true;

        list.innerHTML = '';
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-sharing-item';
            const preview = document.createElement('div');
            preview.className = 'note-sharing-item-preview';
            preview.innerHTML = note.content || '';
            const radios = document.createElement('div');
            radios.className = 'note-sharing-radios';
            const uid = `nshare-${note.id}`;
            radios.innerHTML = `
                <label><input type="radio" name="${uid}" value="keep" checked> 保留為私人筆記</label>
                <label><input type="radio" name="${uid}" value="copy"> 複製到共用筆記</label>
                <label><input type="radio" name="${uid}" value="move"> 移動到共用筆記</label>`;
            item.appendChild(preview);
            item.appendChild(radios);
            list.appendChild(item);
        });

        modal.classList.remove('hidden');

        if (!returnPromise) return;
        return new Promise(resolve => {
            const confirmBtn = document.getElementById('btnNoteSharingConfirm');
            const cancelBtn = document.getElementById('btnNoteSharingCancel');
            const cleanup = () => {
                modal.classList.add('hidden');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
            };
            if (cancelBtn) cancelBtn.onclick = () => { cleanup(); resolve(false); };
            if (confirmBtn) confirmBtn.onclick = async () => {
                const items = list.querySelectorAll('.note-sharing-item');
                for (let i = 0; i < notes.length && i < items.length; i++) {
                    const note = notes[i];
                    const chosen = items[i].querySelector(`input[name="nshare-${note.id}"]:checked`)?.value || 'keep';
                    if (chosen === 'copy' || chosen === 'move') {
                        await DBService.addGuideline({ projectId: pid, type: 'shared_note', content: note.content, createdByName: getCurrentUserName() }).catch(() => {});
                    }
                    if (chosen === 'move') {
                        await DBService.deletePrivateNote(parseId(note.id)).catch(() => {});
                    }
                }
                await _refreshSharedInfoUi();
                cleanup();
                resolve(true);
            };
        });
    }

    async function autoSaveAllNotes() {
        if (!_notesProjectIdOrNull()) return;
        for (const [id, q] of Object.entries(_noteQuills)) {
            try { await DBService.updatePrivateNote(parseId(id), q.root.innerHTML); } catch (_) {}
        }
        for (const [id, q] of Object.entries(_privateNoteEditQuills)) {
            try { await DBService.updatePrivateNote(parseId(id), q.root.innerHTML); } catch (_) {}
        }
    }

    // ---- Shared info modal (project page) ----
    async function openSharedInfoModal(projectId) {
        const prev = _activeNoteProjectId;
        if (prev != null && projectId != null && String(prev) !== String(projectId)) {
            await _pruneEmptyNoteDrafts(prev);
        }
        _activeNoteProjectId = projectId;
        let guidelines = [];
        try { guidelines = await DBService.getGuidelinesByProject(projectId); } catch (_) {}
        const pmAddBtn = document.getElementById('btnAddPmGuidelineModal');
        if (pmAddBtn) {
            pmAddBtn.style.display = isCatSharedMutator() ? '' : 'none';
            pmAddBtn.onclick = async () => { await _addGuideline('pm_guideline', { listKey: 'modal' }); };
        }
        await _reloadSharedInfoModal(projectId, guidelines);
        document.getElementById('sharedInfoModal')?.classList.remove('hidden');
    }

    async function _reloadSharedInfoModal(projectId, guidelines) {
        if (!guidelines) {
            try { guidelines = await DBService.getGuidelinesByProject(projectId); } catch (_) { guidelines = []; }
        }
        const pmList = document.getElementById('pmGuidelinesListModal');
        const shList = document.getElementById('sharedNotesListModal');
        _renderGuidelinesList(guidelines.filter(g => g.type === 'pm_guideline'), pmList, 'modal');
        _renderGuidelinesList(guidelines.filter(g => g.type === 'shared_note'), shList, 'modal');
    }

    (function initSharedInfoModal() {
        document.getElementById('btnCloseSharedInfoModal')?.addEventListener('click', async () => {
            await _pruneEmptyNoteDrafts(_notesProjectIdOrNull());
            await _loadSharedInfo();
            document.getElementById('sharedInfoModal')?.classList.add('hidden');
        });
    })();

    async function restoreCatRouteFromSession() {
        try {
            const raw = sessionStorage.getItem(getSessionRouteStorageKey());
            if (!raw) return;
            const data = JSON.parse(raw);
            const view = data.view;
            const ALLOW = new Set(['viewDashboard', 'viewProjects', 'viewProjectDetail', 'viewTM', 'viewTB', 'viewTmDetail', 'viewTbDetail', 'viewEditor']);
            if (!view || !ALLOW.has(view)) return;

            if (view === 'viewDashboard') {
                switchView('viewDashboard');
                await loadDashboardData();
                return;
            }
            if (view === 'viewProjects') {
                switchView('viewProjects');
                await loadProjectsList();
                return;
            }
            if (view === 'viewTM') {
                switchView('viewTM');
                await loadTMList();
                return;
            }
            if (view === 'viewTB') {
                switchView('viewTB');
                await loadTBList();
                return;
            }
            if (view === 'viewProjectDetail' && data.projectId != null && data.projectId !== '') {
                await openProjectDetail(data.projectId);
                return;
            }
            if (view === 'viewTmDetail' && data.tmId != null && data.tmId !== '') {
                await openTmDetail(data.tmId);
                return;
            }
            if (view === 'viewTbDetail' && data.tbId != null && data.tbId !== '') {
                await openTbDetail(data.tbId);
                return;
            }
            if (view === 'viewEditor' && data.fileId != null && data.fileId !== '') {
                if (data.projectId != null && data.projectId !== '') {
                    currentProjectId = data.projectId;
                }
                await openEditor(data.fileId);
                const ve = document.getElementById('viewEditor');
                if (!ve || ve.classList.contains('hidden')) {
                    switchView('viewDashboard');
                    await loadDashboardData();
                    persistCatRoute();
                }
            }
        } catch (e) {
            console.warn('[cat] restore route failed', e);
        }
    }

    await restoreCatRouteFromSession();

    window.CatMigrationTools = {
        async exportOfflineSnapshot() {
            if (!DBService || !DBService.db) {
                throw new Error('Offline snapshot export requires local mode with IndexedDB access.');
            }
            const [projects, files, segments, tms, tmSegments, tbs, workspaceNotes, moduleLogs] = await Promise.all([
                DBService.db.projects.toArray(),
                DBService.db.files.toArray(),
                DBService.db.segments.toArray(),
                DBService.db.tms.toArray(),
                DBService.db.tmSegments.toArray(),
                DBService.db.tbs.toArray(),
                DBService.db.workspaceNotes.toArray(),
                DBService.db.moduleLogs.toArray()
            ]);
            return {
                exportedAt: new Date().toISOString(),
                source: 'offline-indexeddb',
                schemaVersion: 1,
                projects, files, segments, tms, tmSegments, tbs, workspaceNotes, moduleLogs
            };
        },
        downloadSnapshot(snapshot) {
            const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cat-offline-snapshot-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },
        async importSnapshotToTeam(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid snapshot');
            if (!Array.isArray(snapshot.projects)) throw new Error('Invalid snapshot.projects');

            const projectIdMap = new Map();
            const fileIdMap = new Map();
            const tmIdMap = new Map();

            for (const p of snapshot.projects || []) {
                const newId = await DBService.createProject(p.name, p.sourceLangs || [], p.targetLangs || []);
                projectIdMap.set(String(p.id), newId);
                await DBService.patchProject(newId, {
                    readTms: p.readTms || [],
                    writeTms: p.writeTms || [],
                    changeLog: p.changeLog || []
                });
            }

            for (const f of snapshot.files || []) {
                const mappedProjectId = projectIdMap.get(String(f.projectId));
                if (!mappedProjectId) continue;
                const newFileId = await DBService.createFile(
                    mappedProjectId,
                    f.name || 'Untitled',
                    f.originalFileBuffer || null,
                    f.sourceLang || '',
                    f.targetLang || '',
                    f.originalSourceLang || '',
                    f.originalTargetLang || ''
                );
                fileIdMap.set(String(f.id), newFileId);
            }

            const segs = (snapshot.segments || []).map(s => ({
                ...s,
                fileId: fileIdMap.get(String(s.fileId))
            })).filter(s => !!s.fileId);
            if (segs.length) await DBService.addSegments(segs);

            for (const tm of snapshot.tms || []) {
                const newTmId = await DBService.createTM(tm.name, tm.sourceLangs || [], tm.targetLangs || []);
                tmIdMap.set(String(tm.id), newTmId);
                await DBService.patchTM(newTmId, { changeLog: tm.changeLog || [] });
            }

            for (const ts of snapshot.tmSegments || []) {
                const mappedTmId = tmIdMap.get(String(ts.tmId));
                if (!mappedTmId) continue;
                await DBService.addTMSegment(mappedTmId, ts.sourceText || '', ts.targetText || '', {
                    key: ts.key || '',
                    prevSegment: ts.prevSegment || '',
                    nextSegment: ts.nextSegment || '',
                    writtenFile: ts.writtenFile || '',
                    writtenProject: ts.writtenProject || '',
                    createdBy: ts.createdBy || 'Unknown User',
                    changeLog: ts.changeLog || [],
                    sourceLang: ts.sourceLang || '',
                    targetLang: ts.targetLang || ''
                });
            }

            for (const tb of snapshot.tbs || []) {
                const newTbId = await DBService.createTB(tb.name, tb.sourceLangs || [], tb.targetLangs || []);
                await DBService.updateTB(newTbId, {
                    terms: tb.terms || [],
                    nextTermNumber: tb.nextTermNumber || 1,
                    changeLog: tb.changeLog || []
                });
            }

            for (const note of snapshot.workspaceNotes || []) {
                const mappedProjectId = projectIdMap.get(String(note.projectId));
                const mappedFileId = fileIdMap.get(String(note.fileId));
                if (!mappedProjectId) continue;
                await DBService.addWorkspaceNote({
                    projectId: mappedProjectId,
                    fileId: mappedFileId || null,
                    displayTitle: note.displayTitle || 'Untitled',
                    content: note.content || '',
                    createdBy: note.createdBy || 'Unknown User',
                    savedAt: note.savedAt || new Date().toISOString()
                });
            }

            for (const log of snapshot.moduleLogs || []) {
                await DBService.addModuleLog(log.module || 'migration', log);
            }

            return {
                projects: projectIdMap.size,
                files: fileIdMap.size,
                segments: segs.length,
                tms: tmIdMap.size,
                tmSegments: (snapshot.tmSegments || []).length,
                tbs: (snapshot.tbs || []).length,
                workspaceNotes: (snapshot.workspaceNotes || []).length
            };
        }
    };
});
