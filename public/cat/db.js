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
// - guidelines：共用資訊條目（翻譯準則 & 共用筆記，type: 'pm_guideline'|'shared_note'）
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
        return await db.projects.orderBy('lastModified').reverse().toArray();
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
        return files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
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

    async updateSegmentTarget(segmentId, newTargetText, extra = {}) {
        await db.segments.update(segmentId, { targetText: newTargetText, ...extra });
        const seg = await db.segments.get(segmentId);
        if (seg) {
            const file = await db.files.get(seg.fileId);
            if(file) {
                await db.files.update(file.id, { lastModified: new Date().toISOString() });
                await db.projects.update(file.projectId, { lastModified: new Date().toISOString() });
            }
        }
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
    async getTMs() { return await db.tms.orderBy('lastModified').reverse().toArray(); },
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
    async getTBs() { return await db.tbs.orderBy('lastModified').reverse().toArray(); },
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
    DBService.updateSegmentTarget = async (segmentId, newTargetText, extra = {}) =>
        rpc('db.updateSegmentTarget', { segmentId, newTargetText, extra });
    DBService.updateSegmentStatus = async (segmentId, newStatus, extra = {}) =>
        rpc('db.updateSegmentStatus', { segmentId, newStatus, extra });
    DBService.updateSegmentEditorNote = async (segmentId, editorNote) =>
        rpc('db.updateSegmentEditorNote', { segmentId, editorNote });

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
