import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = app.indexOf(marker);
  const asyncAt = app.lastIndexOf("async ", start);
  if (asyncAt >= 0 && start - asyncAt <= 6) start = asyncAt;
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = app.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < app.length; i++) {
    const ch = app[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return app.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function load(names, extras) {
  const context = vm.createContext({
    confirmHandoffSegId: null,
    _skipFakeCaretOnBlurOnce: false,
    isResolvingRemoteConflict: false,
    queueMicrotask,
    ...extras,
  });
  vm.runInContext(names.map(extractFunction).join("\n"), context);
  return context;
}

function repetitionWorld(mode, repMode) {
  const focusLog = [];
  const scheduled = [];
  const segments = [
    { id: "5", sourceText: "SAME", targetText: "primary", repetitionType: "first", status: "unconfirmed" },
    { id: "6", sourceText: "SAME", targetText: "sibling", status: "unconfirmed" },
    { id: "7", sourceText: "OTHER", targetText: "", status: "unconfirmed" },
  ];
  const editors = new Map();
  const rows = new Map();
  let active = null;
  const blurCalls = [];
  const document = {
    activeElement: null,
    getElementById: () => null,
  };
  for (const seg of segments) {
    const editor = {
      contentEditable: "true",
      text: seg.targetText,
      focus() {
        if (active && active !== editor && active.onBlur) active.onBlur();
        active = editor;
        document.activeElement = editor;
        focusLog.push(seg.id);
      },
    };
    editors.set(seg.id, editor);
    rows.set(seg.id, { querySelector: () => editor });
  }
  active = editors.get("5");
  document.activeElement = active;
  const ctx = load(
    [
      "getAfterConfirmFocusIndex",
      "focusMountedAfterConfirmTarget",
      "applyOptimisticRepetitionAfterPrimaryConfirm",
      "beginConfirmedFocusHandoff",
    ],
    {
      document,
      currentSegmentsList: segments,
      repMode,
      editorUndoEditStart: {},
      editorUndoStatusStart: {},
      getAfterConfirmNavMode: () => mode,
      rowIndexHasEditableTarget: () => true,
      isRowVisibleForAfterConfirmNav: () => true,
      segNeedsAfterConfirmNav: (seg) => seg.status !== "confirmed",
      isDynamicForbidden: () => false,
      applyWorkflowConfirmToSegment: (seg) => { seg.status = "confirmed"; },
      refreshRepetitionSiblingRow: (seg, text) => { editors.get(seg.id).text = text; },
      updateProgress: () => {},
      getGridRowBySegId: (id) => rows.get(String(id)),
      rebuildTargetEditorFromExtractedPlain: (_editor, seg) => seg.targetText,
      collectConfirmTouchIndices: (index) => new Set([index]),
      snapshotSegForUndo: () => ({}),
      resolveSegmentConfirmDisplayState: (seg) => (seg.status === "confirmed" ? "review_confirmed" : "unconfirmed"),
      decideCtrlEnterConfirmLocal: (seg) => {
        seg.status = "confirmed";
        return { focusNext: true, confirmed: true };
      },
      maybeSwitchRightPanelToCatAfterConfirm: () => {},
      showCatToast: () => {},
      moveCaretToEndAndShowFakeInTarget: () => {},
      getAfterConfirmScrollBlock: () => "center",
      scheduleEditorFocus: (opts) => { scheduled.push(String(opts.segId)); },
    },
  );
  editors.get("5").onBlur = () => {
    const gate = ctx.absorbConfirmBlur
      ? ctx.absorbConfirmBlur(segments[0], rows.get("5"), editors.get("5"), false)
      : null;
    blurCalls.push(gate);
  };
  vm.runInContext(extractFunction("absorbConfirmBlur"), ctx);
  return { ctx, focusLog, scheduled, segments, blurCalls };
}

describe("確認只交接一個目標", () => {
  it("下一未確認且連動，直接到第 7 句，不先停第 6 句", () => {
    const world = repetitionWorld("nextUnconfirmed", "after");
    const plan = world.ctx.beginConfirmedFocusHandoff(
      world.segments[0], { querySelector: () => null }, 0, { text: "primary" }, {},
    );
    expect(world.focusLog).toEqual(["7"]);
    expect(plan.targetId).toBe("7");
    expect(world.scheduled).toEqual(["7"]);
    expect(world.segments[1].status).toBe("confirmed");
    expect(world.segments[1].targetText).toBe("primary");
    expect(world.blurCalls[0].skipConflict).toBe(true);
  });

  it("下一句且連動，停在第 6 句", () => {
    const world = repetitionWorld("nextRow", "after");
    const plan = world.ctx.beginConfirmedFocusHandoff(
      world.segments[0], { querySelector: () => null }, 0, { text: "primary" }, {},
    );
    expect(world.focusLog).toEqual(["6"]);
    expect(plan.targetId).toBe("6");
    expect(world.scheduled).toEqual(["6"]);
  });

  it("連動關閉時，依設定到第 6 句且不改第 6 句", () => {
    const world = repetitionWorld("nextUnconfirmed", "none");
    const plan = world.ctx.beginConfirmedFocusHandoff(
      world.segments[0], { querySelector: () => null }, 0, { text: "primary" }, {},
    );
    expect(world.focusLog).toEqual(["6"]);
    expect(plan.targetId).toBe("6");
    expect(world.segments[1].status).toBe("unconfirmed");
    expect(world.segments[1].targetText).toBe("sibling");
  });
});

describe("一次確認只有一個衝突決定", () => {
  it("取消時不跳句，blur 不會再開第二個等待", async () => {
    const focusLog = [];
    const segments = [
      { id: "5", sourceText: "SAME", targetText: "local-text", status: "unconfirmed" },
      { id: "6", sourceText: "OTHER", targetText: "", status: "unconfirmed" },
    ];
    let openCount = 0;
    const elements = {
      remoteConflictModal: { classList: { add() {}, remove() { openCount += 1; } } },
      remoteConflictMine: {},
      remoteConflictTheirs: {},
      remoteConflictWho: {},
      remoteConflictRadioMine: { checked: false },
      remoteConflictRadioTheirs: { checked: false },
      btnRemoteConflictOk: {},
      btnRemoteConflictCancel: {},
    };
    const editor = {
      contentEditable: "true",
      text: "local-text",
      focus() { focusLog.push("5"); },
    };
    const ctx = load(
      [
        "resolvePendingRemoteConflict",
        "remoteConflictNeedsChoice",
        "absorbConfirmBlur",
        "startEditorConfirm",
        "beginConfirmedFocusHandoff",
      ],
      {
        document: { getElementById: (id) => elements[id] || null, activeElement: editor },
        isTeamMode: () => true,
        pendingRemoteBySegId: new Map([["5", { text: "remote-text", whoLabel: "synthetic peer" }]]),
        extractTextFromEditor: (ed) => ed.text,
        normalizeCollabTargetPlainTextForCompare: (text) => text,
        buildTaggedHtml: (text) => text,
        effectiveTags: () => [],
        currentSegmentsList: segments,
        beginConfirmedFocusHandoff: () => { focusLog.push("handoff"); return { targetId: "6" }; },
      },
    );
    // The extracted begin is overwritten above if we pass it after run. Reassign so conflict path cannot focus.
    ctx.beginConfirmedFocusHandoff = () => {
      focusLog.push("handoff");
      return { targetId: "6" };
    };
    const row = {};
    ctx.startEditorConfirm(segments[0], row, 0, editor, {});
    const during = ctx.absorbConfirmBlur(segments[0], row, editor, false);
    expect(during.skipConflict).toBe(true);
    expect(openCount).toBe(1);
    elements.btnRemoteConflictCancel.onclick();
    await new Promise((resolve) => setImmediate(resolve));
    expect(focusLog).toEqual(["5"]);
    expect(ctx.isResolvingRemoteConflict).toBe(false);
  });

  it("平常離開原句仍會處理衝突", () => {
    const ctx = load(["absorbConfirmBlur", "resolvePendingRemoteConflict"], {
      document: { getElementById: () => null },
      isTeamMode: () => false,
      confirmHandoffSegId: null,
      isResolvingRemoteConflict: false,
    });
    const gate = ctx.absorbConfirmBlur({ id: "5" }, {}, {}, false);
    expect(gate.skipConflict).toBe(false);
    expect(typeof gate.promise.then).toBe("function");
  });
});
