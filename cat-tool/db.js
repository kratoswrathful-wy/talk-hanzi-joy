// IndexedDB name is selected by URL query `catStorage`.
// offline (default) => LocalCatDB
// team => LocalCatTeamDB (separate local cache namespace)
function getCatDexieName() {
    try {
        const m = (new URLSearchParams(window.location.search).get('catStorage') || '').toLowerCase();
        if (m === 'team') return 'LocalCatTeamDB';
    } catch (_) { /* ignore */ }
    return 'LocalCatDB';
}

const db = new Dexie(getCatDexieName());

// Define Schema for decoupled entities
db.version(5).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, originalFileBuffer, createdAt, lastModified',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, sourceLang, targetLang, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog',
    tbs: '++id, name, createdAt, lastModified',
    moduleLogs: '++id, module, at'
});

// v6：專案「工作筆記」存檔（與句段無關，依檔案／專案關聯）
db.version(6).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, originalFileBuffer, createdAt, lastModified',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, sourceLang, targetLang, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog',
    tbs: '++id, name, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle'
});

// v7：語言別支援
// - projects：新增 sourceLangs[]、targetLangs[]（專案支援的語言清單，非索引欄位，直接儲存）
// - files：新增 sourceLang、targetLang（該檔案選用的語言對），originalSourceLang、originalTargetLang（XLIFF 原檔內建）
// - tms：以多值陣列索引 *sourceLangs / *targetLangs 取代舊有單值欄位
// - tbs：新增 *sourceLangs、*targetLangs 多值陣列索引
// - tmSegments：新增 sourceLang、targetLang（寫入時對應的語言對）
db.version(7).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle'
});

// v8：筆記與共用資訊重設計
// - privateNotes：私人筆記（每人每專案獨立，content 為 Quill HTML）
// - guidelines：共用資訊條目（共用筆記等，type: 'shared_note'；歷史資料可含已廢用之 pm_guideline）
// - guidelineReplies：討論串回覆（最多三層巢狀）
db.version(8).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId'
});

// v9：私人筆記 itemType（note|todo）、todoDone（非索引欄位，upgrade 補齊舊列）
db.version(9).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId'
}).upgrade(tx => {
    return tx.privateNotes.toCollection().modify(n => {
        if (n.itemType == null) n.itemType = 'note';
        if (n.todoDone == null) n.todoDone = false;
    });
});

// v10：字數分析報告（本機 IndexedDB，供專案頁「分析」紀錄）
db.version(10).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label'
});

// v11：AI 輔助翻譯功能
// - aiGuidelines：全系統共用的準則條目庫（content、category、mutexGroup）
// - aiStyleExamples：累積的風格學習範例（source/aiDraft/userFinal + modTags + categories）
// - aiSettings：全系統 AI 設定（API key、model 等），永遠只存 id=1 的單筆記錄
// - aiProjectSettings：每專案的 AI 指令設定（已勾選準則、特殊指示）
// - files：新增 aiDomains[]（非索引，記錄該檔案適用的類別）
db.version(11).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt',
    aiStyleExamples: '++id, sourceLang, targetLang, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId'
}).upgrade(tx => {
    return tx.files.toCollection().modify(f => {
        if (!Array.isArray(f.aiDomains)) f.aiDomains = [];
    });
});

db.version(12).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt',
    aiStyleExamples: '++id, sourceLang, targetLang, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt'
}).upgrade(async tx => {
    const existing = await tx.table('aiCategoryTags').toArray();
    if (existing.length === 0) {
        await tx.table('aiCategoryTags').add({ name: '通用', createdAt: new Date().toISOString() });
    }
});

db.version(13).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, *changeLog, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt',
    aiStyleExamples: '++id, sourceLang, targetLang, segId, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt'
});

// v14：移除 tmSegments 的 *changeLog 多值索引
// changeLog 欄位儲存的是物件陣列，不適合作為多值索引（Dexie 多值索引僅支援純量值）
// 改為普通欄位，資料不受影響
db.version(14).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt',
    aiStyleExamples: '++id, sourceLang, targetLang, segId, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt'
});

// v15：文風／預設條目、檔案層系列例外、AI 報告持久化
// - aiGuidelines：scope（translation|style）、isDefault
// - files：aiSeriesException（同檔系列例外，已廢用 UI，仍可能保留於舊列）
// - fileAiReports：每檔最新報告內文與歷程
db.version(15).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt, scope, isDefault',
    aiStyleExamples: '++id, sourceLang, targetLang, segId, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt',
    fileAiReports: 'fileId, updatedAt'
}).upgrade(async tx => {
    await tx.aiGuidelines.toCollection().modify(g => {
        if (g.scope == null) g.scope = 'translation';
        if (g.isDefault == null) g.isDefault = false;
    });
    await tx.files.toCollection().modify(f => {
        if (f.aiSeriesException == null) f.aiSeriesException = '';
    });
    await tx.aiProjectSettings.toCollection().modify(s => {
        if (!Array.isArray(s.selectedStyleGuidelineIds)) s.selectedStyleGuidelineIds = [];
    });
});

// v16：移除檔案層 aiDomains（文風類型僅由 AI 批次勾選；標籤改由 aiCategoryTags 全域管理）
db.version(16).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt, scope, isDefault',
    aiStyleExamples: '++id, sourceLang, targetLang, segId, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt',
    fileAiReports: 'fileId, updatedAt'
}).upgrade(async tx => {
    await tx.files.toCollection().modify(f => {
        if (f.aiDomains !== undefined) delete f.aiDomains;
    });
});

// v17：每檔可套用哪些特殊指示（id 對應 aiProjectSettings.specialInstructions[].id，單一真相）
db.version(17).stores({
    projects: '++id, name, createdAt, lastModified, *readTms, *writeTms',
    files: '++id, projectId, name, createdAt, lastModified, sourceLang, targetLang',
    segments: '++id, fileId, sheetName, rowIdx, colSrc, colTgt, isLocked',
    tms: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    tmSegments: '++id, tmId, sourceText, targetText, createdAt, lastModified, key, prevSegment, nextSegment, writtenFile, writtenProject, createdBy, sourceLang, targetLang',
    tbs: '++id, name, *sourceLangs, *targetLangs, createdAt, lastModified',
    moduleLogs: '++id, module, at',
    workspaceNotes: '++id, projectId, fileId, savedAt, createdBy, displayTitle',
    privateNotes: '++id, projectId, updatedAt',
    guidelines: '++id, projectId, type, updatedAt',
    guidelineReplies: '++id, guidelineId, parentReplyId',
    wordCountReports: '++id, projectId, createdAt, label',
    aiGuidelines: '++id, category, createdAt, scope, isDefault',
    aiStyleExamples: '++id, sourceLang, targetLang, segId, createdAt',
    aiSettings: '++id',
    aiProjectSettings: '++id, projectId',
    aiCategoryTags: '++id, name, createdAt',
    fileAiReports: 'fileId, updatedAt'
}).upgrade(async tx => {
    await tx.files.toCollection().modify(f => {
        if (!Array.isArray(f.applicableSpecialInstructionIds)) f.applicableSpecialInstructionIds = [];
    });
});

/** 比對／空白判定：取 HTML 可見文字並壓縮空白，與 cat-cloud-rpc / app.js 邏輯一致 */
function normalizeCatGuidelineContent(html) {
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

/** 與 app.js 準則／審校彈窗的類別欄位格式一致（JSON 陣列或單一字串） */
function _parseGuidelineCategoryField(cat) {
    if (cat == null || cat === '') return ['通用'];
    try {
        const p = JSON.parse(cat);
        if (Array.isArray(p)) return p.map(c => String(c));
    } catch (_) { /* ignore */ }
    return [String(cat)];
}
function _serializeGuidelineCategoryField(arr) {
    const a = (Array.isArray(arr) ? arr : []).map(c => String(c)).filter(c => c.length > 0);
    if (a.length === 0) return '通用';
    if (a.length === 1) return a[0];
    return JSON.stringify(a);
}

// Helper Database Methods
const DBService = {
    // ---- Module-level Logs ----
    async addModuleLog(module, payload) {
        if (!module) return;
        const base = {
            module,
            at: new Date().toISOString()
        };
        try {
            await db.moduleLogs.add({ ...base, ...payload });
        } catch (e) {
            console.error('Failed to add module log', e);
        }
    },
    async getModuleLogs(module, limit = 20) {
        if (!module) return [];
        try {
            const coll = db.moduleLogs.where('module').equals(module).reverse().sortBy('at');
            const logs = await coll;
            const ordered = logs.sort((a, b) => new Date(b.at) - new Date(a.at));
            return typeof limit === 'number' && limit > 0 ? ordered.slice(0, limit) : ordered;
        } catch (e) {
            console.error('Failed to get module logs', e);
            return [];
        }
    },

    // ---- Projects ----
    async createProject(name, sourceLangs = [], targetLangs = []) {
        return await db.projects.add({
            name: name || '未命名專案',
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
        });
    },

    async updateProjectName(projectId, newName) {
        return await db.projects.update(projectId, { 
            name: newName,
            lastModified: new Date().toISOString()
        });
    },

    async updateProjectLangs(projectId, sourceLangs, targetLangs) {
        return await db.projects.update(projectId, {
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            lastModified: new Date().toISOString()
        });
    },

    async updateProjectTMs(projectId, readTms, writeTms) {
        return await db.projects.update(projectId, {
            readTms: readTms || [],
            writeTms: writeTms || [],
            lastModified: new Date().toISOString()
        });
    },
    async updateProjectTBs(projectId, readTbs, writeTb) {
        return await db.projects.update(projectId, {
            readTbs: readTbs || [],
            writeTb: writeTb ?? null,
            lastModified: new Date().toISOString()
        });
    },
    async patchProject(projectId, updates) {
        return await db.projects.update(projectId, { ...updates, lastModified: new Date().toISOString() });
    },

    async getProjects() {
        return await db.projects.orderBy('id').toArray();
    },

    async getProject(projectId) {
        let result = await db.projects.get(projectId);
        if (result == null && typeof projectId === 'string') {
            const n = parseInt(projectId, 10);
            if (!isNaN(n)) result = await db.projects.get(n);
        }
        return result ?? null;
    },

    async deleteProject(projectId) {
        // Cascade delete files and segments
        const files = await db.files.where('projectId').equals(projectId).toArray();
        for (const f of files) {
            await db.segments.where('fileId').equals(f.id).delete();
        }
        await db.files.where('projectId').equals(projectId).delete();
        try {
            await db.workspaceNotes.where('projectId').equals(projectId).delete();
        } catch (_) {}
        await db.projects.delete(projectId);
    },

    // ---- Files ----
    async createFile(projectId, name, originalFileBuffer, sourceLang = '', targetLang = '', originalSourceLang = '', originalTargetLang = '') {
        const fileId = await db.files.add({
            projectId,
            name,
            originalFileBuffer, // Store ArrayBuffer to rebuild export
            sourceLang: sourceLang || '',
            targetLang: targetLang || '',
            originalSourceLang: originalSourceLang || '',
            originalTargetLang: originalTargetLang || '',
            applicableSpecialInstructionIds: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
        });
        
        // Update Project timestamp
        await db.projects.update(projectId, { lastModified: new Date().toISOString() });
        return fileId;
    },

    async getFiles(projectId) {
        // Dexie does not support chaining where().equals() with orderBy(). 
        // We fetch the array and sort it in memory.
        const files = await db.files.where('projectId').equals(projectId).toArray();
        return files.sort((a, b) => a.id - b.id);
    },

    async getRecentFiles(limit = 10) {
        // 依 lastModified 由新到舊取出最近使用的檔案
        const files = await db.files.orderBy('lastModified').reverse().limit(limit).toArray();
        return files;
    },

    async getFile(fileId) {
        let result = await db.files.get(fileId);
        if (result == null && typeof fileId === 'string') {
            const n = parseInt(fileId, 10);
            if (!isNaN(n)) result = await db.files.get(n);
        }
        return result ?? null;
    },

    async updateFile(fileId, updates) {
        await db.files.update(fileId, { ...updates, lastModified: new Date().toISOString() });
        const file = await db.files.get(fileId);
        if (file) await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
    },

    async deleteFile(fileId) {
        const file = await db.files.get(fileId);
        if (file) {
            await db.segments.where('fileId').equals(fileId).delete();
            try {
                await db.workspaceNotes.where('fileId').equals(fileId).delete();
            } catch (_) { /* v5 前無此表 */ }
            await db.files.delete(fileId);
            await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
        }
    },

    // ---- Segments ----
    async addSegments(segmentsArray) {
        // segmentsArray: { fileId, sheetName, rowIdx, colSrc, colTgt, idValue, extraValue, sourceText, targetText, isLocked }
        await db.segments.bulkAdd(segmentsArray);
    },

    async getSegmentsByFile(fileId) {
        let segs = await db.segments.where('fileId').equals(fileId).toArray();
        if (segs.length === 0 && typeof fileId === 'string') {
            const n = parseInt(fileId, 10);
            if (!isNaN(n)) segs = await db.segments.where('fileId').equals(n).toArray();
        }
        return segs.sort((a, b) => (a.rowIdx ?? 0) - (b.rowIdx ?? 0));
    },

    async updateSegmentTarget(segmentId, newTargetText, extra = {}, _expectedSegmentRevision) {
        await db.segments.update(segmentId, { targetText: newTargetText, ...extra });
        const seg = await db.segments.get(segmentId);
        if (seg) {
            const file = await db.files.get(seg.fileId);
            if(file) {
                await db.files.update(file.id, { lastModified: new Date().toISOString() });
                await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
            }
        }
        return {};
    },

    async updateSegmentStatus(segmentId, newStatus, extra = {}) {
        await db.segments.update(segmentId, { status: newStatus, ...extra });
        const seg = await db.segments.get(segmentId);
        if (seg) {
            const file = await db.files.get(seg.fileId);
            if(file) {
                await db.files.update(file.id, { lastModified: new Date().toISOString() });
                await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
            }
        }
    },

    async updateSegmentEditorNote(segmentId, editorNote) {
        await db.segments.update(segmentId, { editorNote: editorNote == null ? '' : String(editorNote) });
        const seg = await db.segments.get(segmentId);
        if (seg) {
            const file = await db.files.get(seg.fileId);
            if (file) {
                await db.files.update(file.id, { lastModified: new Date().toISOString() });
                await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
            }
        }
    },
    async acquireSegmentEditLease(_fileId, _segmentId, _sessionId, _holderName, _ttlSeconds = 20) {
        return { acquired: true };
    },
    async releaseSegmentEditLease(_segmentId, _sessionId) {
        return true;
    },

    // ---- Workspace notes（整檔工作筆記存檔列）----
    async addWorkspaceNote(entry) {
        const savedAt = entry.savedAt || new Date().toISOString();
        const titleTrim = entry.displayTitle != null ? String(entry.displayTitle).trim() : '';
        return await db.workspaceNotes.add({
            projectId: entry.projectId,
            fileId: entry.fileId,
            displayTitle: titleTrim || '未命名',
            content: entry.content != null ? String(entry.content) : '',
            createdBy: entry.createdBy || 'Unknown User',
            savedAt
        });
    },

    async getWorkspaceNotesByProject(projectId) {
        const list = await db.workspaceNotes.where('projectId').equals(projectId).toArray();
        return list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    },

    async getWorkspaceNote(noteId) {
        return await db.workspaceNotes.get(noteId);
    },

    async deleteWorkspaceNote(noteId) {
        return await db.workspaceNotes.delete(noteId);
    },

    async updateWorkspaceNote(noteId, updates) {
        const note = await db.workspaceNotes.get(noteId);
        if (!note) return;
        const patch = {
            ...updates,
            savedAt: updates.savedAt != null ? updates.savedAt : new Date().toISOString()
        };
        await db.workspaceNotes.update(noteId, patch);
        await db.projects.update(note.projectId, { lastModified: new Date().toISOString() });
    },

    // ---- Private Notes（私人筆記）----
    async addPrivateNote(entry) {
        const now = new Date().toISOString();
        const itemType = entry.itemType === 'todo' ? 'todo' : 'note';
        return await db.privateNotes.add({
            projectId: entry.projectId,
            userId: entry.userId || '',
            content: entry.content || '',
            createdByName: entry.createdByName || '',
            createdAt: now,
            updatedAt: now,
            itemType,
            todoDone: itemType === 'todo' ? !!entry.todoDone : false
        });
    },
    async getPrivateNotesByProject(projectId, userId) {
        let notes = await db.privateNotes.where('projectId').equals(projectId).toArray();
        if (userId) notes = notes.filter(n => n.userId === userId || !n.userId);
        return notes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    },
    async updatePrivateNote(noteId, contentOrPatch) {
        const patch = typeof contentOrPatch === 'string'
            ? { content: contentOrPatch }
            : { ...(contentOrPatch && typeof contentOrPatch === 'object' ? contentOrPatch : {}) };
        const updates = { ...patch, updatedAt: new Date().toISOString() };
        Object.keys(updates).forEach((k) => {
            if (updates[k] === undefined) delete updates[k];
        });
        return await db.privateNotes.update(noteId, updates);
    },
    async deletePrivateNote(noteId) {
        return await db.privateNotes.delete(noteId);
    },

    // ---- Guidelines（共用資訊：翻譯準則 & 共用筆記）----
    async addGuideline(entry) {
        const now = new Date().toISOString();
        return await db.guidelines.add({
            projectId: entry.projectId,
            type: entry.type || 'shared_note',
            content: entry.content || '',
            versions: [],
            createdById: entry.createdById || null,
            createdByName: entry.createdByName || '',
            createdAt: now,
            updatedAt: now,
            sortOrder: entry.sortOrder || 0
        });
    },
    async getGuidelinesByProject(projectId) {
        const list = await db.guidelines.where('projectId').equals(projectId).toArray();
        return list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(a.createdAt) - new Date(b.createdAt));
    },
    async updateGuideline(guidelineId, content, updaterName) {
        const row = await db.guidelines.get(guidelineId);
        if (!row) return;
        if (normalizeCatGuidelineContent(row.content) === normalizeCatGuidelineContent(content)) return;
        const versions = [...(row.versions || [])];
        if (normalizeCatGuidelineContent(row.content) !== '') {
            versions.push({ content: row.content, createdByName: updaterName || row.createdByName, createdAt: row.updatedAt || row.createdAt });
        }
        return await db.guidelines.update(guidelineId, { content, versions, updatedAt: new Date().toISOString() });
    },
    async deleteGuideline(guidelineId) {
        await db.guidelineReplies.where('guidelineId').equals(guidelineId).delete();
        return await db.guidelines.delete(guidelineId);
    },

    // ---- Guideline Replies（討論串回覆）----
    async addGuidelineReply(entry) {
        return await db.guidelineReplies.add({
            guidelineId: entry.guidelineId,
            parentReplyId: entry.parentReplyId || null,
            depth: entry.depth || 0,
            content: entry.content || '',
            createdById: entry.createdById || null,
            createdByName: entry.createdByName || '',
            createdAt: new Date().toISOString(),
            isResolved: false,
            resolvedByName: null,
            resolvedAt: null
        });
    },
    async getGuidelineReplies(guidelineId) {
        const list = await db.guidelineReplies.where('guidelineId').equals(guidelineId).toArray();
        return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },
    async resolveGuidelineReply(replyId, resolvedByName, isResolved) {
        return await db.guidelineReplies.update(replyId, {
            isResolved: !!isResolved,
            resolvedByName: isResolved ? resolvedByName : null,
            resolvedAt: isResolved ? new Date().toISOString() : null
        });
    },
    async deleteGuidelineReply(replyId) {
        const children = await db.guidelineReplies.where('parentReplyId').equals(replyId).toArray();
        for (const c of children) await DBService.deleteGuidelineReply(c.id);
        return await db.guidelineReplies.delete(replyId);
    },

    // ---- TM (Translation Memory) ----
    async createTM(name, sourceLangs = [], targetLangs = []) {
        return await db.tms.add({
            name: name || '未命名記憶庫',
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            changeLog: []
        });
    },

    async updateTMLangs(tmId, sourceLangs, targetLangs) {
        return await db.tms.update(tmId, {
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            lastModified: new Date().toISOString()
        });
    },
    async getTMs() { return await db.tms.orderBy('id').toArray(); },
    async getTM(tmId) { return await db.tms.get(tmId); },
    async updateTMName(tmId, newName) { return await db.tms.update(tmId, { name: newName, lastModified: new Date().toISOString() }); },
    async patchTM(tmId, updates) { return await db.tms.update(tmId, { ...updates, lastModified: new Date().toISOString() }); },
    async deleteTM(tmId) { 
        await db.tmSegments.where('tmId').equals(tmId).delete();
        return await db.tms.delete(tmId); 
    },

    // ---- TM Segments ----
    async addTMSegment(tmId, sourceText, targetText, meta = {}) {
        const id = await db.tmSegments.add({
            tmId,
            sourceText,
            targetText,
            key: meta.key || '',
            prevSegment: meta.prevSegment || '',
            nextSegment: meta.nextSegment || '',
            writtenFile: meta.writtenFile || '',
            writtenProject: meta.writtenProject || '',
            createdBy: meta.createdBy || 'Unknown User',
            changeLog: meta.changeLog != null ? meta.changeLog : [],
            sourceLang: meta.sourceLang || '',
            targetLang: meta.targetLang || '',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        });
        await db.tms.update(tmId, { lastModified: new Date().toISOString() });
        return id;
    },
    async bulkAddTMSegments(tmSegmentsArray) {
        await db.tmSegments.bulkAdd(tmSegmentsArray);
        // We assume updating the TM modified date is handled by the caller for bulk operations
    },
    async getTMSegments(tmId) {
        return await db.tmSegments.where('tmId').equals(tmId).toArray();
    },
    async getTMSegmentById(id) {
        return await db.tmSegments.get(id);
    },
    async deleteTMSegmentsByTMId(tmId) {
        return await db.tmSegments.where('tmId').equals(tmId).delete();
    },
    async updateTMSegment(id, targetText, metaUpdate = {}) {
        const updatePayload = { targetText, lastModified: new Date().toISOString() };
        if(metaUpdate.changeLog) updatePayload.changeLog = metaUpdate.changeLog;
        await db.tmSegments.update(id, updatePayload);
    },
    async deleteTMSegment(id) {
        await db.tmSegments.delete(id);
    },

    // ---- TB (Termbase) ----
    async createTB(name, sourceLangs = [], targetLangs = []) {
        return await db.tbs.add({
            name: name || '未命名術語庫',
            terms: [],
            nextTermNumber: 1,
            changeLog: [],
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        });
    },

    async updateTBLangs(tbId, sourceLangs, targetLangs) {
        return await db.tbs.update(tbId, {
            sourceLangs: sourceLangs || [],
            targetLangs: targetLangs || [],
            lastModified: new Date().toISOString()
        });
    },
    async getTBs() { return await db.tbs.orderBy('id').toArray(); },
    async getTB(tbId) { return await db.tbs.get(tbId); },
    async updateTBName(tbId, newName) {
        return await db.tbs.update(tbId, { name: newName, lastModified: new Date().toISOString() });
    },
    async updateTB(tbId, updates) {
        const lastModified = new Date().toISOString();
        const payload = { ...updates, lastModified };
        const existing = await db.tbs.get(tbId);
        if (!existing) return;
        return await db.tbs.put({ ...existing, ...payload });
    },
    async patchTB(tbId, updates) {
        return await db.tbs.update(tbId, { ...updates, lastModified: new Date().toISOString() });
    },
    async deleteTB(id) { return await db.tbs.delete(id); },
    async deleteTBName(id) { return await db.tbs.delete(id); },

    async addWordCountReport(entry) {
        return await db.wordCountReports.add({
            projectId: entry.projectId,
            label: entry.label || '',
            createdAt: new Date().toISOString(),
            payload: entry.payload != null ? entry.payload : null
        });
    },
    async listWordCountReports(projectId) {
        const rows = await db.wordCountReports.where('projectId').equals(projectId).toArray();
        return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 80);
    },
    async deleteWordCountReport(id) {
        return await db.wordCountReports.delete(id);
    },

    // ---- AI Guidelines（全系統共用準則條目庫）----
    async addAiGuideline(entry) {
        const now = new Date().toISOString();
        const scope = entry.scope === 'style' ? 'style' : 'translation';
        return await db.aiGuidelines.add({
            content: entry.content || '',
            category: entry.category || '通用',
            mutexGroup: entry.mutexGroup || null,
            sortOrder: entry.sortOrder || 0,
            scope,
            isDefault: !!entry.isDefault,
            createdAt: now
        });
    },
    async getAiGuidelines(filters = {}) {
        let rows = await db.aiGuidelines.toArray();
        rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (filters.category) rows = rows.filter(r => r.category === filters.category);
        if (filters.scope === 'style' || filters.scope === 'translation') {
            rows = rows.filter(r => (r.scope || 'translation') === filters.scope);
        }
        return rows;
    },
    async updateAiGuideline(id, patch) {
        const allowed = {};
        if (patch.category !== undefined) allowed.category = patch.category;
        if (patch.mutexGroup !== undefined) allowed.mutexGroup = patch.mutexGroup;
        if (patch.sortOrder !== undefined) allowed.sortOrder = patch.sortOrder;
        if (patch.content !== undefined) allowed.content = patch.content;
        if (patch.scope === 'style' || patch.scope === 'translation') allowed.scope = patch.scope;
        if (patch.isDefault !== undefined) allowed.isDefault = !!patch.isDefault;
        return await db.aiGuidelines.update(id, allowed);
    },
    async deleteAiGuideline(id) {
        return await db.aiGuidelines.delete(id);
    },
    async getAiGuidelineCategories() {
        const rows = await db.aiGuidelines.toArray();
        const cats = [...new Set(rows.map(r => r.category || '通用'))].sort();
        return cats;
    },

    // ---- AI Style Examples（風格學習範例）----
    async addAiStyleExample(entry) {
        const now = new Date().toISOString();
        return await db.aiStyleExamples.add({
            sourceLang: entry.sourceLang || '',
            targetLang: entry.targetLang || '',
            categories: Array.isArray(entry.categories) ? entry.categories : [],
            modTags: Array.isArray(entry.modTags) ? entry.modTags : [],
            sourceText: entry.sourceText || '',
            aiDraft: entry.aiDraft || '',
            userFinal: entry.userFinal || '',
            editNotes: Array.isArray(entry.editNotes) ? entry.editNotes : [],
            contextPrev: entry.contextPrev || '',
            contextNext: entry.contextNext || '',
            segId: entry.segId || null,
            createdAt: now
        });
    },
    async upsertAiStyleExample(entry) {
        const now = new Date().toISOString();
        const payload = {
            sourceLang: entry.sourceLang || '',
            targetLang: entry.targetLang || '',
            categories: Array.isArray(entry.categories) ? entry.categories : [],
            modTags: Array.isArray(entry.modTags) ? entry.modTags : [],
            sourceText: entry.sourceText || '',
            aiDraft: entry.aiDraft || '',
            userFinal: entry.userFinal || '',
            editNotes: Array.isArray(entry.editNotes) ? entry.editNotes : [],
            contextPrev: entry.contextPrev || '',
            contextNext: entry.contextNext || '',
            segId: entry.segId || null,
            updatedAt: now
        };
        if (entry.segId) {
            const existing = await db.aiStyleExamples.where('segId').equals(entry.segId).first().catch(() => null);
            if (existing) {
                await db.aiStyleExamples.update(existing.id, payload);
                return existing.id;
            }
        }
        return await db.aiStyleExamples.add({ ...payload, createdAt: now });
    },
    async getAiStyleExamples(filters = {}) {
        let rows = await db.aiStyleExamples.orderBy('createdAt').reverse().toArray();
        if (filters.sourceLang) rows = rows.filter(r => r.sourceLang === filters.sourceLang);
        if (filters.targetLang) rows = rows.filter(r => r.targetLang === filters.targetLang);
        if (Array.isArray(filters.categories) && filters.categories.length > 0) {
            rows = rows.filter(r =>
                Array.isArray(r.categories) && filters.categories.some(c => r.categories.includes(c))
            );
        }
        if (typeof filters.limit === 'number' && filters.limit > 0) rows = rows.slice(0, filters.limit);
        return rows;
    },
    async updateAiStyleExample(id, patch) {
        const allowed = {};
        if (Array.isArray(patch.modTags)) allowed.modTags = patch.modTags;
        if (Array.isArray(patch.categories)) allowed.categories = patch.categories;
        if (Array.isArray(patch.editNotes)) allowed.editNotes = patch.editNotes;
        return await db.aiStyleExamples.update(id, allowed);
    },
    async deleteAiStyleExample(id) {
        return await db.aiStyleExamples.delete(id);
    },

    async getFileAiReportRow(fileId) {
        if (!fileId) return null;
        return await db.fileAiReports.get(fileId) || null;
    },
    /**
     * @param {Object} opts - { text, mode?: 'replace'|'append', keepPreviousInHistory?: boolean }
     */
    async saveFileAiReport(fileId, opts) {
        if (!fileId) return;
        const now = new Date().toISOString();
        const prev = await db.fileAiReports.get(fileId);
        const oldText = prev && prev.text != null ? String(prev.text) : '';
        const newText = opts.text != null ? String(opts.text) : '';
        let history = Array.isArray(prev?.history) ? prev.history.slice() : [];
        const mode = opts.mode || 'replace';
        if (mode === 'append' && oldText) {
            const combined = oldText + '\n\n— ' + new Date().toLocaleString('zh-TW', { hour12: false }) + ' —\n\n' + newText;
            await db.fileAiReports.put({ fileId, text: combined, history, updatedAt: now });
            return;
        }
        if (oldText && opts.keepPreviousInHistory) {
            history = [{ at: now, text: oldText }, ...history].slice(0, 50);
        }
        await db.fileAiReports.put({ fileId, text: newText, history, updatedAt: now });
    },
    async clearFileAiReport(fileId) {
        if (!fileId) return;
        await db.fileAiReports.delete(fileId);
    },

    // ---- AI Settings（全系統 API 設定，永遠維持 id=1 的單筆記錄）----
    _defaultAiSettingsRow() {
        return {
            id: 1,
            apiKey: '',
            apiBaseUrl: '',
            model: 'gpt-4.1-mini',
            batchSize: 20,
            preferOpenAiProxy: true,
            prompts: {
                translateSystemPrefix: '',
                scanSystemPrefix: '',
                typoSystem: ''
            }
        };
    },
    _mergeAiSettingsPatch(existing, settings) {
        const base = this._defaultAiSettingsRow();
        const e = { ...base, ...(existing || {}) };
        const s = { ...(settings || {}) };
        const out = { ...e, ...s };
        out.prompts = { ...e.prompts, ...(s.prompts && typeof s.prompts === 'object' ? s.prompts : {}) };
        return out;
    },
    async getAiSettings() {
        const _LS_KEY = 'catToolAiSettings';
        const _def = this._defaultAiSettingsRow();
        const normalize = (raw) => {
            if (!raw || typeof raw !== 'object') return { ..._def };
            const o = { ..._def, ...raw };
            o.prompts = { ..._def.prompts, ...(raw.prompts && typeof raw.prompts === 'object' ? raw.prompts : {}) };
            return o;
        };
        try {
            const lsRaw = localStorage.getItem(_LS_KEY);
            if (lsRaw) {
                const lsData = JSON.parse(lsRaw);
                return normalize(lsData);
            }
            const row = await db.aiSettings.get(1);
            if (row && (row.apiKey || row.model)) {
                const n = normalize(row);
                localStorage.setItem(_LS_KEY, JSON.stringify(n));
                return n;
            }
        } catch (_) { /* ignore */ }
        return { ..._def };
    },
    async saveAiSettings(settings) {
        const _LS_KEY = 'catToolAiSettings';
        let merged = null;
        try {
            const existing = (localStorage.getItem(_LS_KEY) && JSON.parse(localStorage.getItem(_LS_KEY))) || {};
            merged = this._mergeAiSettingsPatch(existing, settings);
            localStorage.setItem(_LS_KEY, JSON.stringify(merged));
        } catch (_) { /* ignore */ }
        try {
            const idbEx = await db.aiSettings.get(1);
            const m = merged || this._mergeAiSettingsPatch(idbEx, settings);
            if (idbEx) await db.aiSettings.update(1, { ...m, id: 1 });
            else await db.aiSettings.put({ ...m, id: 1 });
        } catch (_) { /* ignore */ }
    },

    // ---- AI Project Settings（每專案 AI 指令：已勾選準則 ID、特殊指示）----
    async getAiProjectSettings(projectId) {
        if (!projectId) return null;
        const rows = await db.aiProjectSettings.where('projectId').equals(projectId).toArray();
        if (rows.length > 0) {
            const r = rows[0];
            if (!Array.isArray(r.selectedStyleGuidelineIds)) r.selectedStyleGuidelineIds = [];
            return r;
        }
        return { projectId, selectedGuidelineIds: [], selectedStyleGuidelineIds: [], specialInstructions: [] };
    },
    async saveAiProjectSettings(projectId, patch) {
        if (!projectId) return;
        const rows = await db.aiProjectSettings.where('projectId').equals(projectId).toArray();
        if (rows.length > 0) {
            return await db.aiProjectSettings.update(rows[0].id, { ...patch });
        } else {
            return await db.aiProjectSettings.add({
                projectId,
                selectedGuidelineIds: [],
                selectedStyleGuidelineIds: [],
                specialInstructions: [],
                ...patch
            });
        }
    },
    /** 新專案依庫內 isDefault 帶入勾選的準則／文風 id */
    async applyDefaultAiProjectSettingsForNewProject(projectId) {
        if (!projectId) return;
        const all = await db.aiGuidelines.toArray();
        const defT = all.filter(g => (g.scope || 'translation') === 'translation' && g.isDefault).map(g => g.id);
        const defS = all.filter(g => g.scope === 'style' && g.isDefault).map(g => g.id);
        if (defT.length || defS.length) {
            await this.saveAiProjectSettings(projectId, {
                selectedGuidelineIds: defT,
                selectedStyleGuidelineIds: defS
            });
        }
    },

    // ---- AI Category Tags ----
    async getAiCategoryTags() {
        return await db.aiCategoryTags.orderBy('createdAt').toArray();
    },
    async addAiCategoryTag(name) {
        if (!name || !name.trim()) throw new Error('標籤名稱不得空白');
        const existing = await db.aiCategoryTags.toArray();
        if (existing.some(t => t.name === name.trim())) throw new Error('標籤已存在');
        return await db.aiCategoryTags.add({ name: name.trim(), createdAt: new Date().toISOString() });
    },
    /**
     * 更名並一併更新學習範例 categories 與準則條目 category 欄位中的同名稱。
     */
    async renameAiCategoryTag(id, newName) {
        if (id == null) throw new Error('無效的標籤');
        const nm = String(newName || '').trim();
        if (!nm) throw new Error('標籤名稱不得空白');
        const row = await db.aiCategoryTags.get(id);
        if (!row) throw new Error('找不到標籤');
        const oldName = row.name;
        if (oldName === nm) return;
        const all = await db.aiCategoryTags.toArray();
        if (all.some(t => t.id !== id && t.name === nm)) throw new Error('已有同名標籤');
        await db.aiCategoryTags.update(id, { name: nm });

        const exRows = await db.aiStyleExamples.toArray();
        for (const r of exRows) {
            if (!Array.isArray(r.categories) || !r.categories.includes(oldName)) continue;
            const next = r.categories.map(c => (c === oldName ? nm : c));
            await db.aiStyleExamples.update(r.id, { categories: next });
        }

        const gRows = await db.aiGuidelines.toArray();
        for (const g of gRows) {
            const arr = _parseGuidelineCategoryField(g.category);
            if (!arr.includes(oldName)) continue;
            const next = arr.map(c => (c === oldName ? nm : c));
            await db.aiGuidelines.update(g.id, { category: _serializeGuidelineCategoryField(next) });
        }
    },
    /**
     * @param {object} [opts]
     * @param {boolean} [opts.removeFromReferences] 一併從學習範例與準則條目移除此名稱
     */
    async deleteAiCategoryTag(id, opts = {}) {
        const removeFromReferences = !!opts.removeFromReferences;
        const row = await db.aiCategoryTags.get(id);
        if (!row) return;
        const name = row.name;
        await db.aiCategoryTags.delete(id);
        if (!removeFromReferences) return;

        const exRows = await db.aiStyleExamples.toArray();
        for (const r of exRows) {
            if (!Array.isArray(r.categories) || !r.categories.includes(name)) continue;
            const next = r.categories.filter(c => c !== name);
            await db.aiStyleExamples.update(r.id, { categories: next });
        }

        const gRows = await db.aiGuidelines.toArray();
        for (const g of gRows) {
            const arr = _parseGuidelineCategoryField(g.category);
            if (!arr.includes(name)) continue;
            let next = arr.filter(c => c !== name);
            if (next.length === 0) next = ['通用'];
            await db.aiGuidelines.update(g.id, { category: _serializeGuidelineCategoryField(next) });
        }
    },

    // Expose tables directly if needed for custom queries or bulk operations outside this service
    db: db,
    tms: db.tms,
    tmSegments: db.tmSegments,
    segments: db.segments,
    files: db.files,
    projects: db.projects,
    tbs: db.tbs
};

// Team mode: route DBService through cloud RPC (Supabase in parent app).
;(function enableTeamCloudProvider() {
    const ctx = window.CatDataProviderContext;
    const mode = ctx && typeof ctx.getMode === 'function' ? ctx.getMode() : 'offline';
    if (mode !== 'team' || !ctx || !ctx.cloudRpc || typeof ctx.cloudRpc.call !== 'function') return;

    function abToBase64(ab) {
        if (!ab) return '';
        const bytes = new Uint8Array(ab);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const sub = bytes.subarray(i, i + chunk);
            binary += String.fromCharCode.apply(null, Array.from(sub));
        }
        return btoa(binary);
    }
    function base64ToAb(b64) {
        if (!b64) return null;
        const binary = atob(String(b64));
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }
    function hydrateFile(file) {
        if (!file) return file;
        if (file.originalFileBase64 && !file.originalFileBuffer) {
            file.originalFileBuffer = base64ToAb(file.originalFileBase64);
        }
        return file;
    }
    async function rpc(method, payload) {
        return await ctx.cloudRpc.call(method, payload || {});
    }

    // module logs
    DBService.addModuleLog = async (module, payload) => rpc('db.addModuleLog', { module, payload });
    DBService.getModuleLogs = async (module, limit = 20) => rpc('db.getModuleLogs', { module, limit });

    // projects
    DBService.createProject = async (name, sourceLangs = [], targetLangs = []) =>
        rpc('db.createProject', { name, sourceLangs, targetLangs });
    DBService.updateProjectName = async (projectId, newName) =>
        rpc('db.updateProjectName', { projectId, newName });
    DBService.updateProjectLangs = async (projectId, sourceLangs, targetLangs) =>
        rpc('db.updateProjectLangs', { projectId, sourceLangs, targetLangs });
    DBService.updateProjectTMs = async (projectId, readTms, writeTms) =>
        rpc('db.updateProjectTMs', { projectId, readTms, writeTms });
    DBService.updateProjectTBs = async (projectId, readTbs, writeTb) =>
        rpc('db.updateProjectTBs', { projectId, readTbs, writeTb });
    DBService.getProjects = async () => rpc('db.getProjects');
    DBService.getProject = async (projectId) => rpc('db.getProject', { projectId });
    DBService.deleteProject = async (projectId) => rpc('db.deleteProject', { projectId });
    DBService.patchProject = async (projectId, updates) => rpc('db.patchProject', { projectId, updates });

    // files
    DBService.createFile = async (projectId, name, originalFileBuffer, sourceLang = '', targetLang = '', originalSourceLang = '', originalTargetLang = '') =>
        rpc('db.createFile', {
            projectId,
            name,
            originalFileBase64: abToBase64(originalFileBuffer),
            sourceLang,
            targetLang,
            originalSourceLang,
            originalTargetLang
        });
    DBService.getFiles = async (projectId) => (await rpc('db.getFiles', { projectId })).map(hydrateFile);
    DBService.getRecentFiles = async (limit = 10) => (await rpc('db.getRecentFiles', { limit })).map(hydrateFile);
    DBService.getFile = async (fileId) => hydrateFile(await rpc('db.getFile', { fileId }));
    DBService.updateFile = async (fileId, updates) => {
        const patch = { ...updates };
        if (patch.originalFileBuffer) {
            patch.originalFileBase64 = abToBase64(patch.originalFileBuffer);
            delete patch.originalFileBuffer;
        }
        return rpc('db.updateFile', { fileId, updates: patch });
    };
    DBService.deleteFile = async (fileId) => rpc('db.deleteFile', { fileId });

    // segments
    DBService.addSegments = async (segmentsArray) => rpc('db.addSegments', { segmentsArray });
    DBService.getSegmentsByFile = async (fileId) => rpc('db.getSegmentsByFile', { fileId });
    DBService.updateSegmentTarget = async (segmentId, newTargetText, extra = {}, expectedSegmentRevision = 0) =>
        rpc('db.updateSegmentTarget', {
            segmentId,
            newTargetText,
            extra,
            expectedSegmentRevision: expectedSegmentRevision == null ? 0 : expectedSegmentRevision,
        });
    DBService.updateSegmentStatus = async (segmentId, newStatus, extra = {}) =>
        rpc('db.updateSegmentStatus', { segmentId, newStatus, extra });
    DBService.updateSegmentEditorNote = async (segmentId, editorNote) =>
        rpc('db.updateSegmentEditorNote', { segmentId, editorNote });
    DBService.acquireSegmentEditLease = async (fileId, segmentId, sessionId, holderName, ttlSeconds = 20) =>
        rpc('db.acquireSegmentEditLease', { fileId, segmentId, sessionId, holderName, ttlSeconds });
    DBService.releaseSegmentEditLease = async (segmentId, sessionId) =>
        rpc('db.releaseSegmentEditLease', { segmentId, sessionId });

    // workspace notes (legacy)
    DBService.addWorkspaceNote = async (entry) => rpc('db.addWorkspaceNote', { entry });
    DBService.getWorkspaceNotesByProject = async (projectId) => rpc('db.getWorkspaceNotesByProject', { projectId });
    DBService.getWorkspaceNote = async (noteId) => rpc('db.getWorkspaceNote', { noteId });
    DBService.deleteWorkspaceNote = async (noteId) => rpc('db.deleteWorkspaceNote', { noteId });
    DBService.updateWorkspaceNote = async (noteId, updates) => rpc('db.updateWorkspaceNote', { noteId, updates });

    // private notes
    DBService.addPrivateNote = async (entry) => rpc('db.addPrivateNote', { entry });
    DBService.getPrivateNotesByProject = async (projectId, userId) => rpc('db.getPrivateNotesByProject', { projectId, userId });
    DBService.updatePrivateNote = async (noteId, contentOrPatch) => {
        if (typeof contentOrPatch === 'string') {
            return rpc('db.updatePrivateNote', { noteId, content: contentOrPatch });
        }
        const p = contentOrPatch && typeof contentOrPatch === 'object' ? contentOrPatch : {};
        return rpc('db.updatePrivateNote', {
            noteId,
            ...(p.content !== undefined ? { content: p.content } : {}),
            ...(p.todoDone !== undefined ? { todoDone: p.todoDone } : {}),
        });
    };
    DBService.deletePrivateNote = async (noteId) => rpc('db.deletePrivateNote', { noteId });

    // guidelines
    DBService.addGuideline = async (entry) => rpc('db.addGuideline', { entry });
    DBService.getGuidelinesByProject = async (projectId) => rpc('db.getGuidelinesByProject', { projectId });
    DBService.updateGuideline = async (guidelineId, content, updaterName) => rpc('db.updateGuideline', { guidelineId, content, updaterName });
    DBService.deleteGuideline = async (guidelineId) => rpc('db.deleteGuideline', { guidelineId });

    // guideline replies
    DBService.addGuidelineReply = async (entry) => rpc('db.addGuidelineReply', { entry });
    DBService.getGuidelineReplies = async (guidelineId) => rpc('db.getGuidelineReplies', { guidelineId });
    DBService.resolveGuidelineReply = async (replyId, resolvedByName, isResolved) => rpc('db.resolveGuidelineReply', { replyId, resolvedByName, isResolved });
    DBService.deleteGuidelineReply = async (replyId) => rpc('db.deleteGuidelineReply', { replyId });

    // image upload (team mode only)
    DBService.uploadNoteImage = async (file, userId) => rpc('db.uploadNoteImage', { file, userId });

    // TM
    DBService.createTM = async (name, sourceLangs = [], targetLangs = []) =>
        rpc('db.createTM', { name, sourceLangs, targetLangs });
    DBService.updateTMLangs = async (tmId, sourceLangs, targetLangs) =>
        rpc('db.updateTMLangs', { tmId, sourceLangs, targetLangs });
    DBService.getTMs = async () => rpc('db.getTMs');
    DBService.getTM = async (tmId) => rpc('db.getTM', { tmId });
    DBService.updateTMName = async (tmId, newName) => rpc('db.updateTMName', { tmId, newName });
    DBService.patchTM = async (tmId, updates) => rpc('db.patchTM', { tmId, updates });
    DBService.deleteTM = async (tmId) => rpc('db.deleteTM', { tmId });
    DBService.addTMSegment = async (tmId, sourceText, targetText, meta = {}) =>
        rpc('db.addTMSegment', { tmId, sourceText, targetText, meta });
    DBService.bulkAddTMSegments = async (tmSegmentsArray) => rpc('db.bulkAddTMSegments', { tmSegmentsArray });
    DBService.getTMSegments = async (tmId) => rpc('db.getTMSegments', { tmId });
    DBService.getTMSegmentById = async (id) => rpc('db.getTMSegmentById', { id });
    DBService.updateTMSegment = async (id, targetText, metaUpdate = {}) =>
        rpc('db.updateTMSegment', { id, targetText, metaUpdate });
    DBService.deleteTMSegment = async (id) => rpc('db.deleteTMSegment', { id });
    DBService.deleteTMSegmentsByTMId = async (tmId) => rpc('db.deleteTMSegmentsByTMId', { tmId });

    // TB
    DBService.createTB = async (name, sourceLangs = [], targetLangs = []) =>
        rpc('db.createTB', { name, sourceLangs, targetLangs });
    DBService.updateTBLangs = async (tbId, sourceLangs, targetLangs) =>
        rpc('db.updateTBLangs', { tbId, sourceLangs, targetLangs });
    DBService.getTBs = async () => rpc('db.getTBs');
    DBService.getTB = async (tbId) => rpc('db.getTB', { tbId });
    DBService.updateTBName = async (tbId, newName) => rpc('db.updateTBName', { tbId, newName });
    DBService.updateTB = async (tbId, updates) => rpc('db.updateTB', { tbId, updates });
    DBService.patchTB = async (tbId, updates) => rpc('db.patchTB', { tbId, updates });
    DBService.deleteTB = async (id) => rpc('db.deleteTB', { id });
    DBService.deleteTBName = async (id) => rpc('db.deleteTB', { id });

    // table handles are local-only; prevent accidental direct Dexie usage in team mode.
    DBService.db = null;
    DBService.tms = null;
    DBService.tmSegments = null;
    DBService.segments = null;
    DBService.files = null;
    DBService.projects = null;
    DBService.tbs = null;
})();
