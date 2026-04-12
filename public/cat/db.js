// Setup Dexie Database targetting v2 (Schema Update)
const db = new Dexie("LocalCatDB");

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
    async createProject(name) {
        return await db.projects.add({
            name: name || '未命名專案',
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

    async updateProjectTMs(projectId, readTms, writeTms) {
        return await db.projects.update(projectId, {
            readTms: readTms || [],
            writeTms: writeTms || [],
            lastModified: new Date().toISOString()
        });
    },

    async getProjects() {
        return await db.projects.orderBy('lastModified').reverse().toArray();
    },

    async getProject(projectId) {
        return await db.projects.get(projectId);
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
    async createFile(projectId, name, originalFileBuffer) {
        const fileId = await db.files.add({
            projectId,
            name,
            originalFileBuffer, // Store ArrayBuffer to rebuild export
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
        return await db.files.get(fileId);
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
        // 也把 matchValue 帶出來，確保翻頁後相符度仍能顯示
        return await db.segments.where('fileId').equals(fileId).toArray();
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

    // ---- TM (Translation Memory) ----
    async createTM(name) {
        return await db.tms.add({
            name: name || '未命名記憶庫',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            changeLog: []
        });
    },
    async getTMs() { return await db.tms.orderBy('lastModified').reverse().toArray(); },
    async getTM(tmId) { return await db.tms.get(tmId); },
    async updateTMName(tmId, newName) { return await db.tms.update(tmId, { name: newName, lastModified: new Date().toISOString() }); },
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
    async updateTMSegment(id, targetText, metaUpdate = {}) {
        const updatePayload = { targetText, lastModified: new Date().toISOString() };
        if(metaUpdate.changeLog) updatePayload.changeLog = metaUpdate.changeLog;
        await db.tmSegments.update(id, updatePayload);
    },
    async deleteTMSegment(id) {
        await db.tmSegments.delete(id);
    },

    // ---- TB (Termbase) ----
    async createTB(name) {
        return await db.tbs.add({
            name: name || '未命名術語庫',
            terms: [],
            nextTermNumber: 1,
            changeLog: [],
            createdAt: new Date().toISOString(),
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
    async deleteTB(id) { return await db.tbs.delete(id); },
    async deleteTBName(id) { return await db.tbs.delete(id); },

    // Expose tables directly if needed for custom queries or bulk operations outside this service
    db: db,
    tms: db.tms,
    tmSegments: db.tmSegments,
    segments: db.segments,
    files: db.files,
    projects: db.projects,
    tbs: db.tbs
};
