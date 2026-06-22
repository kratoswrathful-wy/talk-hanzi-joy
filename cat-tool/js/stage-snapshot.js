;(function (global) {
  'use strict';

  const SNAPSHOT_REASONS = {
    BASELINE: 'baseline_before_translate',
    POST_TRANSLATE: 'post_translate',
    POST_REVIEW: 'post_review',
  };

  function isTeamMode() {
    try {
      return global.CatDataProviderContext && global.CatDataProviderContext.getMode() === 'team';
    } catch (_) {
      return false;
    }
  }

  function getCurrentUserId() {
    return String(global.window && global.window._tmsCurrentUserId || '').trim() || null;
  }

  function buildSnapshotRowFromSeg(seg, fileId, reason) {
    if (!seg || !fileId || !reason) return null;
    const confirmedBy = reason === SNAPSHOT_REASONS.BASELINE
      ? null
      : (reason === SNAPSHOT_REASONS.POST_REVIEW
        ? (seg.wfReviewConfirmedBy || getCurrentUserId())
        : (seg.wfTransConfirmedBy || getCurrentUserId()));
    return {
      segmentId: seg.id,
      fileId: fileId,
      snapshotReason: reason,
      targetText: seg.targetText ?? '',
      targetTags: Array.isArray(seg.targetTags) ? seg.targetTags : [],
      confirmedBy: confirmedBy,
      snapshottedAt: new Date().toISOString(),
    };
  }

  async function upsertSegmentSnapshotLocal(row) {
    if (!global.db || !row) return;
    const existing = await global.db.stageSnapshots
      .where('[segmentId+snapshotReason]')
      .equals([row.segmentId, row.snapshotReason])
      .first();
    if (existing && existing.id != null) {
      await global.db.stageSnapshots.update(existing.id, row);
    } else {
      await global.db.stageSnapshots.add(row);
    }
  }

  async function upsertSegmentSnapshotCloud(row) {
    const rpc = global.CatDataProviderContext && global.CatDataProviderContext.cloudRpc;
    if (!rpc) return;
    await rpc.call('db.upsertSegmentSnapshot', {
      segmentId: row.segmentId,
      fileId: row.fileId,
      snapshotReason: row.snapshotReason,
      targetText: row.targetText,
      targetTags: row.targetTags,
      confirmedBy: row.confirmedBy,
    });
  }

  async function upsertSegmentSnapshot(seg, fileId, reason) {
    const row = buildSnapshotRowFromSeg(seg, fileId, reason);
    if (!row) return;
    try {
      if (isTeamMode()) {
        await upsertSegmentSnapshotCloud(row);
      } else {
        await upsertSegmentSnapshotLocal(row);
      }
    } catch (e) {
      console.warn('[stage-snapshot] upsert failed', reason, seg && seg.id, e);
    }
  }

  function fireAndForgetUpsertSegmentSnapshot(seg, fileId, reason) {
    void upsertSegmentSnapshot(seg, fileId, reason);
  }

  async function batchUpsertSnapshots(fileId, segments, reason, catchUpOnly) {
    if (!fileId || !Array.isArray(segments) || !segments.length || !reason) return 0;
    const rows = segments.map((seg) => buildSnapshotRowFromSeg(seg, fileId, reason)).filter(Boolean);
    if (!rows.length) return 0;

    try {
      if (isTeamMode()) {
        const rpc = global.CatDataProviderContext && global.CatDataProviderContext.cloudRpc;
        if (!rpc) return 0;
        const action = catchUpOnly ? 'db.catchupSegmentSnapshots' : 'db.batchUpsertSegmentSnapshots';
        return await rpc.call(action, { fileId, snapshotReason: reason, rows });
      }

      let count = 0;
      for (const row of rows) {
        if (catchUpOnly) {
          const existing = await global.db.stageSnapshots
            .where('[segmentId+snapshotReason]')
            .equals([row.segmentId, row.snapshotReason])
            .first();
          if (existing) continue;
        }
        await upsertSegmentSnapshotLocal(row);
        count += 1;
      }
      return count;
    } catch (e) {
      console.warn('[stage-snapshot] batch upsert failed', reason, e);
      return 0;
    }
  }

  async function loadSnapshotsByFile(fileId) {
    if (!fileId) return [];
    try {
      if (isTeamMode()) {
        const rpc = global.CatDataProviderContext && global.CatDataProviderContext.cloudRpc;
        if (!rpc) return [];
        return await rpc.call('db.loadFileSnapshots', { fileId }) || [];
      }
      return await global.db.stageSnapshots.where('fileId').equals(fileId).toArray();
    } catch (e) {
      console.warn('[stage-snapshot] load failed', fileId, e);
      return [];
    }
  }

  function indexSnapshotsBySegment(snapshots) {
    const bySeg = {};
    (snapshots || []).forEach((s) => {
      const sid = String(s.segmentId || s.segment_id || '');
      if (!sid) return;
      if (!bySeg[sid]) bySeg[sid] = {};
      const reason = s.snapshotReason || s.snapshot_reason;
      bySeg[sid][reason] = s;
    });
    return bySeg;
  }

  global.CatStageSnapshot = {
    REASONS: SNAPSHOT_REASONS,
    upsertSegmentSnapshot,
    fireAndForgetUpsertSegmentSnapshot,
    batchUpsertSnapshots,
    loadSnapshotsByFile,
    indexSnapshotsBySegment,
    buildSnapshotRowFromSeg,
  };
})(typeof window !== 'undefined' ? window : globalThis);
