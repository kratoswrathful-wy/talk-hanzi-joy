;(function (global) {
  'use strict';

  const REASONS = global.CatStageSnapshot && global.CatStageSnapshot.REASONS
    ? global.CatStageSnapshot.REASONS
    : {
      BASELINE: 'baseline_before_translate',
      POST_TRANSLATE: 'post_translate',
      POST_REVIEW: 'post_review',
    };

  const COL_KEYS = ['source', 'baseline', 'translate', 'review'];

  const state = {
    active: false,
    fileId: null,
    snapshotsBySeg: {},
    annotationsBySeg: {},
    annotationOptions: { issue_type: [], severity: [] },
    layerVisibility: {
      source: true,
      baseline: true,
      translate: true,
      review: true,
      marks: true,
    },
    expandedAnnotSegId: null,
    draftAnnotSegId: null,
  };

  function $(id) { return document.getElementById(id); }

  function isTeamMode() {
    try {
      return global.CatDataProviderContext && global.CatDataProviderContext.getMode() === 'team';
    } catch (_) {
      return false;
    }
  }

  function getApi() {
    return global.CatRevTrackApi || {};
  }

  function defaultLayerVisibility() {
    return { source: true, baseline: true, translate: true, review: true, marks: true };
  }

  function getVisibleColumnOrder() {
    const vis = [];
    if (state.layerVisibility.source) vis.push('source');
    if (state.layerVisibility.baseline) vis.push('baseline');
    if (state.layerVisibility.translate) vis.push('translate');
    if (state.layerVisibility.review) vis.push('review');
    return vis;
  }

  function getLeftSnapshotForColumn(colKey, segId) {
    const snaps = state.snapshotsBySeg[String(segId)] || {};
    const order = getVisibleColumnOrder();
    const idx = order.indexOf(colKey);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i -= 1) {
      const leftCol = order[i];
      if (leftCol === 'source') {
        const seg = (getApi().getSegments && getApi().getSegments()) || [];
        const hit = seg.find((s) => String(s.id) === String(segId));
        if (!hit) return null;
        return { targetText: hit.sourceText || '', targetTags: hit.sourceTags || [] };
      }
      const reason = leftCol === 'baseline' ? REASONS.BASELINE
        : leftCol === 'translate' ? REASONS.POST_TRANSLATE
          : REASONS.POST_REVIEW;
      if (snaps[reason]) return snaps[reason];
    }
    return null;
  }

  function renderSourceCell(seg) {
    const diff = global.CatRevTrackDiff;
    if (!diff || !seg) return '';
    const tokens = diff.tokenizeWithTags(seg.sourceText || '', seg.sourceTags || []);
    return tokens.map((t) => (t.kind === 'tag'
      ? `<span class="tag-pill rev-track-tag-pill">${diff.escapeHtml(t.value)}</span>`
      : diff.escapeHtml(t.value))).join('');
  }

  function renderRow(seg, displayIdx) {
    const diff = global.CatRevTrackDiff;
    const snaps = state.snapshotsBySeg[String(seg.id)] || {};
    const vis = state.layerVisibility;
    const showMarks = !!vis.marks;
    const cols = [];
    if (vis.source) cols.push(`<td class="rev-track-cell rev-track-source">${renderSourceCell(seg)}</td>`);
    if (vis.baseline) {
      cols.push(`<td class="rev-track-cell">${diff.renderSnapshotCell(snaps[REASONS.BASELINE], null, false, '無快照紀錄')}</td>`);
    }
    if (vis.translate) {
      const left = getLeftSnapshotForColumn('translate', seg.id);
      cols.push(`<td class="rev-track-cell">${diff.renderSnapshotCell(snaps[REASONS.POST_TRANSLATE], left, showMarks, '無快照紀錄')}</td>`);
    }
    if (vis.review) {
      const left = getLeftSnapshotForColumn('review', seg.id);
      cols.push(`<td class="rev-track-cell">${diff.renderSnapshotCell(snaps[REASONS.POST_REVIEW], left, showMarks, '無快照紀錄')}</td>`);
    }

    const canAnnotate = getApi().canAddAnnotation && getApi().canAddAnnotation(seg);
    const annotBtn = canAnnotate
      ? `<button type="button" class="icon-btn btn-sm rev-track-add-annot-btn" data-seg-id="${seg.id}" data-tip="新增評註" title="新增評註">+</button>`
      : '';

    const annotHtml = renderAnnotationBlock(seg);

    return `
      <tr class="rev-track-data-row" data-seg-id="${seg.id}">
        <td class="rev-track-num">${displayIdx}</td>
        ${cols.join('')}
        <td class="rev-track-actions">${annotBtn}</td>
      </tr>
      ${annotHtml ? `<tr class="rev-track-annot-row" data-seg-id="${seg.id}"><td colspan="99">${annotHtml}</td></tr>` : ''}
    `;
  }

  function renderAnnotationBlock(seg) {
    const anns = state.annotationsBySeg[String(seg.id)] || [];
    const draftOpen = state.draftAnnotSegId === seg.id;
    const hasContent = anns.length > 0 || draftOpen;
    if (!hasContent) return '';

    let html = '<div class="rev-track-annot-block">';
    anns.filter((a) => !a.parentAnnotationId && !a.parent_annotation_id).forEach((root) => {
      html += renderRootAnnotation(root, anns);
    });
    if (draftOpen && getApi().canAddAnnotation && getApi().canAddAnnotation(seg)) {
      html += renderDraftForm(seg.id);
    }
    html += '</div>';
    return html;
  }

  function renderRootAnnotation(root, allAnns) {
    const id = root.id;
    const replies = allAnns.filter((a) => String(a.parentAnnotationId || a.parent_annotation_id || '') === String(id));
    const issue = root.issueType || root.issue_type || '—';
    const sev = root.severity || '—';
    const note = root.note || '';
    const ack = root.isTranslatorAck || root.is_translator_ack;
    let html = `<div class="rev-track-annot-item" data-annot-id="${id}">
      <div class="rev-track-annot-meta"><strong>${global.CatRevTrackDiff.escapeHtml(issue)}</strong> · ${global.CatRevTrackDiff.escapeHtml(sev)}</div>
      <div class="rev-track-annot-note">${global.CatRevTrackDiff.escapeHtml(note)}</div>`;

    if (getApi().canTranslatorAck && getApi().canTranslatorAck(root)) {
      html += `<label class="rev-track-ack-label"><input type="checkbox" class="rev-track-ack-cb" data-annot-id="${id}" ${ack ? 'checked' : ''}> 譯者確認</label>`;
    }

    replies.forEach((r) => {
      const role = r.responderRole || r.responder_role;
      const label = role === 'translator' ? '譯者回應' : '審稿回應';
      html += `<div class="rev-track-reply"><span class="rev-track-reply-label">${label}：</span>${global.CatRevTrackDiff.escapeHtml(r.note || '')}</div>`;
    });

    if (getApi().canReplyAsTranslator && getApi().canReplyAsTranslator(root)) {
      html += `<div class="rev-track-reply-form" data-parent-id="${id}" data-role="translator">
        <input type="text" class="form-input rev-track-reply-input" placeholder="譯者回應…">
        <button type="button" class="primary-btn btn-sm rev-track-reply-submit">確定</button>
      </div>`;
    } else if (getApi().canReplyAsReviewer && getApi().canReplyAsReviewer(root, replies)) {
      html += `<div class="rev-track-reply-form" data-parent-id="${id}" data-role="reviewer">
        <input type="text" class="form-input rev-track-reply-input" placeholder="審稿回應…">
        <button type="button" class="primary-btn btn-sm rev-track-reply-submit">確定</button>
      </div>`;
    }

    if (getApi().canAddAnnotation && getApi().canAddAnnotation({ id: root.segmentId || root.segment_id })) {
      html += `<button type="button" class="secondary-btn btn-sm rev-track-add-more-btn" data-seg-id="${root.segmentId || root.segment_id}">+</button>`;
    }

    html += '</div>';
    return html;
  }

  function renderDraftForm(segId) {
    const opts = state.annotationOptions;
    const issueOpts = (opts.issue_type || []).map((o) => `<option value="${global.CatRevTrackDiff.escapeHtml(o.label)}">${global.CatRevTrackDiff.escapeHtml(o.label)}</option>`).join('');
    const sevOpts = (opts.severity || []).map((o) => `<option value="${global.CatRevTrackDiff.escapeHtml(o.label)}">${global.CatRevTrackDiff.escapeHtml(o.label)}</option>`).join('');
    return `<div class="rev-track-draft-form" data-seg-id="${segId}">
      <select class="form-input rev-track-issue-type"><option value="">錯誤類型…</option>${issueOpts}</select>
      <select class="form-input rev-track-severity"><option value="">嚴重性…</option>${sevOpts}</select>
      <input type="text" class="form-input rev-track-note-input" placeholder="說明（選填）">
      <button type="button" class="primary-btn btn-sm rev-track-draft-confirm">確認</button>
      <button type="button" class="secondary-btn btn-sm rev-track-draft-cancel">取消</button>
    </div>`;
  }

  function buildHeaderRow() {
    const vis = state.layerVisibility;
    const cols = [];
    if (vis.source) cols.push('<th>原文</th>');
    if (vis.baseline) cols.push('<th>準備完成時</th>');
    if (vis.translate) cols.push('<th>翻譯完成時</th>');
    if (vis.review) cols.push('<th>審稿完成時</th>');
    return `<tr><th style="width:48px;">#</th>${cols.join('')}<th style="width:40px;"></th></tr>`;
  }

  function renderGrid() {
    const head = $('revTrackGridHead');
    const body = $('revTrackGridBody');
    if (!head || !body) return;
    const segments = (getApi().getVisibleSegments && getApi().getVisibleSegments()) || [];
    head.innerHTML = buildHeaderRow();
    body.innerHTML = segments.map((seg, idx) => renderRow(seg, idx + 1)).join('');
  }

  function syncLayerCheckboxes() {
    COL_KEYS.forEach((k) => {
      const el = $('revTrackChk' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.checked = !!state.layerVisibility[k];
    });
    const marksEl = $('revTrackChkMarks');
    if (marksEl) marksEl.checked = !!state.layerVisibility.marks;
  }

  function applyLayoutVisibility() {
    const bar = $('revTrackBar');
    const gridWrap = $('revTrackGridWrap');
    const sf = $('sfContainer');
    const editorGrid = $('editorGrid');
    const sidePanel = document.querySelector('.editor-side-panel');
    const btnShowSide = $('btnRevTrackShowSidePanel');
    if (state.active) {
      if (bar) bar.style.display = '';
      if (gridWrap) gridWrap.style.display = '';
      if (sf) sf.style.display = 'none';
      if (editorGrid) editorGrid.style.display = 'none';
      if (sidePanel) sidePanel.style.display = 'none';
      if (btnShowSide) btnShowSide.style.display = '';
      const tabMgmt = $('tabRevMgmt');
      if (tabMgmt && getApi().isPmOrExecutive && getApi().isPmOrExecutive()) tabMgmt.style.display = '';
    } else {
      if (bar) bar.style.display = 'none';
      if (gridWrap) gridWrap.style.display = 'none';
      if (sf) sf.style.display = '';
      if (editorGrid) editorGrid.style.display = '';
      if (sidePanel) sidePanel.style.display = '';
      if (btnShowSide) btnShowSide.style.display = 'none';
      const tabMgmt = $('tabRevMgmt');
      if (tabMgmt) tabMgmt.style.display = 'none';
    }
    const btnEnter = $('btnRevTrackMode');
    const btnExit = $('btnRevTrackExit');
    if (btnEnter) btnEnter.style.display = state.active ? 'none' : '';
    if (btnExit) btnExit.style.display = state.active ? '' : 'none';
  }

  async function loadData(fileId) {
    state.fileId = fileId;
    const snaps = await global.CatStageSnapshot.loadSnapshotsByFile(fileId);
    state.snapshotsBySeg = global.CatStageSnapshot.indexSnapshotsBySegment(snaps);
    if (getApi().loadAnnotations) {
      const anns = await getApi().loadAnnotations(fileId);
      state.annotationsBySeg = {};
      (anns || []).forEach((a) => {
        const sid = String(a.segmentId || a.segment_id || '');
        if (!state.annotationsBySeg[sid]) state.annotationsBySeg[sid] = [];
        state.annotationsBySeg[sid].push(a);
      });
    }
    if (getApi().loadAnnotationOptions) {
      state.annotationOptions = await getApi().loadAnnotationOptions();
    }
  }

  async function enter(fileId) {
    if (!fileId) return;
    state.active = true;
    state.layerVisibility = defaultLayerVisibility();
    state.expandedAnnotSegId = null;
    state.draftAnnotSegId = null;
    document.body.classList.add('rev-track-mode');
    syncLayerCheckboxes();
    applyLayoutVisibility();
    await loadData(fileId);
    renderGrid();
    if (getApi().onModeChanged) getApi().onModeChanged(true);
  }

  async function exit() {
    state.active = false;
    state.fileId = null;
    state.draftAnnotSegId = null;
    document.body.classList.remove('rev-track-mode');
    applyLayoutVisibility();
    if (getApi().onModeChanged) getApi().onModeChanged(false);
  }

  function bindEventsOnce() {
    if (global._revTrackEventsBound) return;
    global._revTrackEventsBound = true;

    const bar = $('revTrackBar');
    if (bar) {
      bar.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !t.classList.contains('rev-track-layer-chk')) return;
        const key = t.getAttribute('data-layer');
        if (!key) return;
        state.layerVisibility[key] = !!t.checked;
        renderGrid();
      });
    }

    $('btnRevTrackExit')?.addEventListener('click', () => { void exit(); });
    $('btnRevTrackMode')?.addEventListener('click', () => {
      const fid = getApi().getCurrentFileId && getApi().getCurrentFileId();
      if (fid) void enter(fid);
    });
    $('btnRevTrackShowSidePanel')?.addEventListener('click', () => {
      const sidePanel = document.querySelector('.editor-side-panel');
      if (sidePanel) sidePanel.style.display = sidePanel.style.display === 'none' ? '' : 'none';
    });

    const gridBody = $('revTrackGridBody');
    if (gridBody) {
      gridBody.addEventListener('click', async (e) => {
        const addBtn = e.target.closest('.rev-track-add-annot-btn, .rev-track-add-more-btn');
        if (addBtn) {
          const segId = addBtn.getAttribute('data-seg-id');
          state.draftAnnotSegId = segId;
          renderGrid();
          return;
        }
        const cancelBtn = e.target.closest('.rev-track-draft-cancel');
        if (cancelBtn) {
          state.draftAnnotSegId = null;
          renderGrid();
          return;
        }
        const confirmBtn = e.target.closest('.rev-track-draft-confirm');
        if (confirmBtn) {
          const form = confirmBtn.closest('.rev-track-draft-form');
          if (!form || !getApi().saveRootAnnotation) return;
          const segId = form.getAttribute('data-seg-id');
          const issueType = form.querySelector('.rev-track-issue-type')?.value || '';
          const severity = form.querySelector('.rev-track-severity')?.value || '';
          const note = form.querySelector('.rev-track-note-input')?.value || '';
          if (!issueType || !severity) {
            if (getApi().showToast) getApi().showToast('請選擇錯誤類型與嚴重性', 'error');
            return;
          }
          await getApi().saveRootAnnotation({ segmentId: segId, issueType, severity, note });
          state.draftAnnotSegId = null;
          await loadData(state.fileId);
          renderGrid();
          return;
        }
        const replyBtn = e.target.closest('.rev-track-reply-submit');
        if (replyBtn) {
          const form = replyBtn.closest('.rev-track-reply-form');
          if (!form || !getApi().saveReply) return;
          const parentId = form.getAttribute('data-parent-id');
          const role = form.getAttribute('data-role');
          const note = form.querySelector('.rev-track-reply-input')?.value || '';
          if (!note.trim()) {
            if (getApi().showToast) getApi().showToast('請輸入回應內容', 'error');
            return;
          }
          await getApi().saveReply({ parentAnnotationId: parentId, responderRole: role, note: note.trim() });
          await loadData(state.fileId);
          renderGrid();
        }
      });

      gridBody.addEventListener('change', async (e) => {
        const cb = e.target.closest('.rev-track-ack-cb');
        if (!cb || !getApi().updateTranslatorAck) return;
        const annotId = cb.getAttribute('data-annot-id');
        await getApi().updateTranslatorAck(annotId, !!cb.checked);
        await loadData(state.fileId);
        renderGrid();
      });
    }
  }

  function init() {
    bindEventsOnce();
    applyLayoutVisibility();
  }

  global.CatRevTrack = {
    state,
    init,
    enter,
    exit,
    isActive: () => state.active,
    refresh: () => { if (state.active) renderGrid(); },
    reload: async () => { if (state.fileId) { await loadData(state.fileId); renderGrid(); } },
  };
})(typeof window !== 'undefined' ? window : globalThis);
