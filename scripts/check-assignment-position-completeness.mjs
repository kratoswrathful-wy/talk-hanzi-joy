#!/usr/bin/env node
/**
 * 派案位置完整性覆核：與 src/lib/assignment-position-completeness.ts 契約對齊的 CLI。
 * （純 JS 複寫核心邏輯，避免依賴 jiti／tsx；單測仍以 TS 檔為準。）
 *
 *   node scripts/check-assignment-position-completeness.mjs \
 *     --live path/to/live.json --confirmed path/to/confirmed.json
 */
import fs from "node:fs";

function parseArgs(argv) {
  const out = { live: null, confirmed: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--live") out.live = argv[++i];
    else if (argv[i] === "--confirmed") out.confirmed = argv[++i];
  }
  return out;
}

function deriveExpectedAssignmentPositions(live) {
  const out = [];
  if (live.multiCollab) {
    for (const row of live.collabRows || []) {
      const uid = (row.translatorUserId || "").trim() || null;
      const hasLabel = !!(row.translatorLabel || "").trim() || !!uid;
      if (!hasLabel && !uid) continue;
      out.push({
        positionKind: "collab_translator_row",
        userId: uid,
        sourceRowId: row.id,
        nameOnlyGap: !uid,
      });
    }
  } else if (live.translatorUserId || live.translatorLabelCount > 0) {
    out.push({
      positionKind: "single_translator",
      userId: live.translatorUserId || null,
      nameOnlyGap: !live.translatorUserId,
    });
  }

  const rows = live.reviewRows || [];
  const hasReviewRowUids = rows.some((r) => (r.reviewerUserId || "").trim());
  const hasReviewRowLabels = rows.some(
    (r) => (r.reviewerLabel || "").trim() || (r.reviewerUserId || "").trim(),
  );
  if (hasReviewRowUids || hasReviewRowLabels) {
    for (const row of rows) {
      const uid = (row.reviewerUserId || "").trim() || null;
      const hasLabel = !!(row.reviewerLabel || "").trim() || !!uid;
      if (!hasLabel && !uid) continue;
      out.push({
        positionKind: "review_row",
        userId: uid,
        sourceRowId: row.id,
        nameOnlyGap: !uid,
      });
    }
  } else if (live.reviewerUserId || (live.reviewerLabel || "").trim()) {
    out.push({
      positionKind: "case_reviewer",
      userId: live.reviewerUserId || null,
      nameOnlyGap: !live.reviewerUserId,
    });
  }
  return out;
}

function slotKey(kind, userId, sourceRowId) {
  return `${kind}|${userId || ""}|${sourceRowId || ""}`;
}

function diffAssignmentConfirmation({ live, confirmed }) {
  const expected = deriveExpectedAssignmentPositions(live);
  const confirmedKeys = new Set(
    confirmed.map((c) => slotKey(c.positionKind, c.candidateUserId, c.sourceRowId)),
  );
  const expectedKeys = new Set(
    expected.map((e) => slotKey(e.positionKind, e.userId, e.sourceRowId)),
  );
  const nameOnlyGaps = expected.filter((e) => e.nameOnlyGap);
  return {
    nameOnlyTranslatorGap:
      !live.multiCollab && live.translatorLabelCount > 0 && !live.translatorUserId,
    nameOnlyGaps,
    missingFromConfirmation: expected.filter(
      (e) => !e.nameOnlyGap && !confirmedKeys.has(slotKey(e.positionKind, e.userId, e.sourceRowId)),
    ),
    extraInConfirmation: confirmed.filter(
      (c) => !expectedKeys.has(slotKey(c.positionKind, c.candidateUserId, c.sourceRowId)),
    ),
  };
}

const args = parseArgs(process.argv);
if (!args.live || !args.confirmed) {
  console.error("需要 --live <file> 與 --confirmed <file>");
  process.exit(2);
}

const live = JSON.parse(fs.readFileSync(args.live, "utf8").replace(/^\uFEFF/, ""));
const confirmed = JSON.parse(fs.readFileSync(args.confirmed, "utf8").replace(/^\uFEFF/, ""));
if (!Array.isArray(confirmed)) {
  console.error("confirmed 必須為陣列");
  process.exit(2);
}

const report = diffAssignmentConfirmation({ live, confirmed });
const summary = {
  nameOnlyTranslatorGap: report.nameOnlyTranslatorGap,
  nameOnlyGapCount: report.nameOnlyGaps.length,
  nameOnlyGaps: report.nameOnlyGaps.map((g) => ({
    positionKind: g.positionKind,
    sourceRowId: g.sourceRowId ?? null,
    hasUserId: !!g.userId,
  })),
  missingFromConfirmationCount: report.missingFromConfirmation.length,
  missingFromConfirmation: report.missingFromConfirmation.map((g) => ({
    positionKind: g.positionKind,
    sourceRowId: g.sourceRowId ?? null,
    hasUserId: !!g.userId,
  })),
  extraInConfirmationCount: report.extraInConfirmation.length,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(
  report.nameOnlyGaps.length > 0 || report.missingFromConfirmation.length > 0 ? 1 : 0,
);
