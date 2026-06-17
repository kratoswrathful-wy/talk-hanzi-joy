/**
 * B-7：Workflow 顯示層狀態（與 DB stage.status 分離）
 * 供 app.js 檔案清單／儀表板共用。
 */
(function (global) {
    'use strict';

    function wfStageByKind(stages, kind) {
        return (stages || []).find((s) => s.stageKind === kind) || null;
    }

    function wfStageById(stages, id) {
        if (id == null) return null;
        return (stages || []).find((s) => String(s.id) === String(id)) || null;
    }

    function isPrepIncomplete(stages) {
        const prep = wfStageByKind(stages, 'prep');
        return !!(prep && prep.status !== 'completed');
    }

    function isPrepActive(stages) {
        const prep = wfStageByKind(stages, 'prep');
        return !!(prep && prep.status === 'active');
    }

    function assignmentFirstEditedAt(assignment) {
        if (!assignment) return null;
        return assignment.firstEditedAt || assignment.first_edited_at || null;
    }

    function assignmentWorkflowStatus(assignment) {
        if (!assignment) return null;
        return assignment.workflowStatus || assignment.workflow_status || null;
    }

    function assignmentLineStart(a) {
        if (!a) return null;
        const v = a.lineStart != null ? a.lineStart : a.line_start;
        return v != null ? Number(v) : null;
    }

    function assignmentLineEnd(a) {
        if (!a) return null;
        const v = a.lineEnd != null ? a.lineEnd : a.line_end;
        return v != null ? Number(v) : null;
    }

    function lineInAssignment(line, assignment) {
        if (!assignment) return false;
        const ls = assignmentLineStart(assignment);
        const le = assignmentLineEnd(assignment);
        if (ls == null && le == null) return true;
        if (ls != null && line < ls) return false;
        if (le != null && line > le) return false;
        return true;
    }

    function reviewAssignmentLineSpan(reviewAssignment) {
        if (!reviewAssignment) return null;
        const ls = assignmentLineStart(reviewAssignment);
        const le = assignmentLineEnd(reviewAssignment);
        if (ls == null && le == null) return null;
        const start = ls != null ? ls : 1;
        const end = le != null ? le : start;
        return { start, end };
    }

    function translateAssignmentsForStages(stages, allAssignments) {
        const translateStage = wfStageByKind(stages, 'translate');
        if (!translateStage) return [];
        return (allAssignments || []).filter(
            (a) => String(a.fileWorkflowStageId) === String(translateStage.id),
        );
    }

    /**
     * 審稿「待開始」閘門：覆蓋範圍內每一列皆有已完成翻譯指派；無 stage 指派時 fallback 整檔 translate 步驟。
     */
    function reviewTranslateGatePassed(stages, reviewAssignment, allAssignments) {
        if (isPrepIncomplete(stages)) return false;
        const translateStage = wfStageByKind(stages, 'translate');
        const translateAssigns = translateAssignmentsForStages(stages, allAssignments);

        if (!translateAssigns.length) {
            return !!(translateStage && translateStage.status === 'completed');
        }

        const span = reviewAssignmentLineSpan(reviewAssignment);
        if (!span) {
            return translateAssigns.every((a) => assignmentWorkflowStatus(a) === 'completed');
        }

        for (let line = span.start; line <= span.end; line += 1) {
            const covered = translateAssigns.some(
                (a) => assignmentWorkflowStatus(a) === 'completed' && lineInAssignment(line, a),
            );
            if (!covered) return false;
        }
        return true;
    }

    /**
     * @param {{
     *   stages?: object[],
     *   assignment?: object|null,
     *   stage?: object|null,
     *   stageKind?: string,
     *   allAssignments?: object[],
     * }} input
     * @returns {{ label: string, tone: 'danger'|'muted'|'warning'|'success' }}
     */
    function resolveAssignmentDisplayStatus(input) {
        const stages = input.stages || [];
        const assignment = input.assignment || null;
        const allAssignments = input.allAssignments || [];
        const stage = input.stage
            || (assignment ? wfStageById(stages, assignment.fileWorkflowStageId) : null);
        const stageKind = input.stageKind || stage?.stageKind;
        const prepDone = !isPrepIncomplete(stages);
        const firstEditedAt = assignmentFirstEditedAt(assignment);
        const wfStatus = assignmentWorkflowStatus(assignment);

        if (stageKind === 'translate') {
            if (!prepDone) return { label: '等待準備完成', tone: 'muted' };
            if (assignment && wfStatus === 'completed') {
                return { label: '完成', tone: 'success' };
            }
            const translateStage = wfStageByKind(stages, 'translate');
            if (!assignment && translateStage?.status === 'completed') {
                return { label: '完成', tone: 'success' };
            }
            if (firstEditedAt) return { label: '進行中', tone: 'warning' };
            return { label: '待開始', tone: 'muted' };
        }

        if (stageKind === 'review') {
            if (!prepDone) return { label: '等待準備完成', tone: 'muted' };
            if (assignment && wfStatus === 'completed') {
                return { label: '完成', tone: 'success' };
            }
            const reviewStage = wfStageByKind(stages, 'review');
            if (!assignment && reviewStage?.status === 'completed') {
                return { label: '完成', tone: 'success' };
            }
            if (!reviewTranslateGatePassed(stages, assignment, allAssignments)) {
                return { label: '等待翻譯完成', tone: 'muted' };
            }
            if (firstEditedAt) return { label: '進行中', tone: 'warning' };
            return { label: '待開始', tone: 'muted' };
        }

        return { label: '—', tone: 'muted' };
    }

    const TONE_COLORS = {
        danger: '#dc2626',
        muted: '#64748b',
        warning: '#d97706',
        success: '#16a34a',
    };

    function toneToColor(tone) {
        return TONE_COLORS[tone] || TONE_COLORS.muted;
    }

    function esc(s) {
        return String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderAssigneeEntry(whoHtml, stages, assignment, stage, stageKind, allAssignments) {
        const { label, tone } = resolveAssignmentDisplayStatus({
            stages,
            assignment,
            stage,
            stageKind,
            allAssignments,
        });
        const color = toneToColor(tone);
        return (
            `<div style="line-height:1.35; font-size:0.78rem;">`
            + `<span style="color:#334155;">${whoHtml}</span>`
            + `<span style="color:#94a3b8;"> · </span>`
            + `<span style="color:${color};">${esc(label)}</span>`
            + `</div>`
        );
    }

    /**
     * @param {{
     *   stages?: object[],
     *   assignments?: object[],
     *   fileAssigneeNames?: string[],
     *   resolveName?: (userId: string) => string,
     *   formatScopeSuffix?: (assignment: object) => string,
     * }} opts
     */
    function formatWorkflowListCellHtml(opts) {
        const o = opts || {};
        const stages = Array.isArray(o.stages)
            ? o.stages.slice().sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0))
            : [];
        const assignments = Array.isArray(o.assignments) ? o.assignments : [];
        const fileAssigneeNames = Array.isArray(o.fileAssigneeNames) ? o.fileAssigneeNames : [];
        const resolveName = typeof o.resolveName === 'function' ? o.resolveName : (uid) => String(uid || '—');
        const formatScope = typeof o.formatScopeSuffix === 'function' ? o.formatScopeSuffix : () => '';

        const translateStage = wfStageByKind(stages, 'translate');
        const reviewStage = wfStageByKind(stages, 'review');

        function assignForStage(stage) {
            if (!stage) return [];
            return assignments.filter((a) => String(a.fileWorkflowStageId) === String(stage.id));
        }

        function renderStageEntries(stageKind, stage, stageAssigns) {
            const parts = [];
            if (stageAssigns.length) {
                stageAssigns.forEach((a) => {
                    const who = esc(resolveName(a.assigneeUserId) + formatScope(a));
                    parts.push(renderAssigneeEntry(who, stages, a, stage, stageKind, assignments));
                });
                return parts.join('');
            }
            if (fileAssigneeNames.length && stageKind === 'translate' && translateStage) {
                fileAssigneeNames.forEach((name) => {
                    const who = esc(`${name}（整檔）`);
                    parts.push(renderAssigneeEntry(who, stages, null, translateStage, 'translate', assignments));
                });
                return parts.join('');
            }
            if (fileAssigneeNames.length && stageKind === 'review' && reviewStage) {
                fileAssigneeNames.forEach((name) => {
                    const who = esc(name);
                    parts.push(renderAssigneeEntry(who, stages, null, reviewStage, 'review', assignments));
                });
                return parts.join('');
            }
            return '<span style="color:#94a3b8; font-size:0.78rem;">—</span>';
        }

        if (!stages.length) {
            return '<span style="color:#94a3b8; font-size:0.8rem;">—</span>';
        }

        let html = '<div class="wf-assign-cell" style="display:flex; flex-direction:column; gap:0.25rem;">';
        if (isPrepActive(stages)) {
            html += '<div style="color:#dc2626; font-size:0.78rem; font-weight:600; line-height:1.3;">準備中</div>';
        }
        html += '<div style="display:flex; flex-direction:column; gap:0.2rem;">';
        [
            { label: '翻譯', stageKind: 'translate', stage: translateStage, assigns: assignForStage(translateStage) },
            { label: '審稿', stageKind: 'review', stage: reviewStage, assigns: assignForStage(reviewStage) },
        ].forEach((row) => {
            html += '<div style="display:grid; grid-template-columns:auto 1fr; gap:0.25rem 0.45rem; align-items:start;">';
            html += `<div style="color:#475569; font-size:0.78rem; font-weight:600; align-self:center; white-space:nowrap;">${esc(row.label)}</div>`;
            html += `<div>${renderStageEntries(row.stageKind, row.stage, row.assigns)}</div>`;
            html += '</div>';
        });
        html += '</div></div>';
        return html;
    }

    global.WfDisplayStatus = {
        resolveAssignmentDisplayStatus,
        toneToColor,
        formatWorkflowListCellHtml,
        isPrepIncomplete,
        isPrepActive,
        assignmentFirstEditedAt,
        reviewTranslateGatePassed,
    };
})(typeof window !== 'undefined' ? window : globalThis);
