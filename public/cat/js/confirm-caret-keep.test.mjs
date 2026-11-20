import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const current = readFileSync(resolve(root, "cat-tool/app.js"), "utf8").replace(/\r\n/g, "\n");
const beforeFix = execFileSync("git", ["show", "6c7f0fcc:cat-tool/app.js"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
}).replace(/\r\n/g, "\n");

function extract(source, name) {
  const re = new RegExp(`^    (?:async )?function ${name}\\(`, "m");
  const hit = re.exec(source);
  if (!hit) throw new Error(`missing ${name}`);
  const end = source.indexOf("\n    }\n", hit.index);
  if (end < 0) throw new Error(`unclosed ${name}`);
  return source.slice(hit.index, end + 6);
}

function caretCase(source, restoreCaret, options = {}) {
  const synchronized = !!options.synchronized;
  const events = [];
  let offset = options.initialOffset == null ? 2 : options.initialOffset;
  const seg = { id: "70", targetText: synchronized ? "甲乙新增丙丁" : "甲乙丙丁" };
  const row = {
    dataset: { segId: "70" },
    getAttribute: () => "70",
    querySelector: () => editor,
  };
  const editor = {
    text: "甲乙新增丙丁",
    contentEditable: "true",
    classList: {
      contains: (name) => name === "grid-textarea" || name === "col-target",
    },
    closest: (selector) => (selector === ".grid-data-row" ? row : {}),
    focus: () => {
      events.push({ kind: "focus", offset });
      if (options.rebuildResetsCaret) offset = 0;
    },
  };
  const selection = {
    isCollapsed: true,
    rangeCount: 0,
    removeAllRanges() {},
    addRange(range) {
      offset = range.offset != null ? range.offset : range.startOffset;
      events.push({ kind: "restore", offset });
    },
  };
  const pending = {
    segId: "70",
    gen: 1,
    restoreCaret,
    plainOffset: options.plainOffset == null ? 2 : options.plainOffset,
    scrollBlock: "nearest",
    skipVirtScroll: true,
  };
  const names = [
    "adoptLiveEditorTextIntoSegment",
    "applyEditorFocusAtSegId",
    "setCaretAtEditorEnd",
    "flushPendingEditorFocus",
  ];
  for (const extra of ["readLiveTargetCaret", "placePlainSelection"]) {
    if (source.includes(`function ${extra}(`)) names.splice(names.length - 1, 0, extra);
  }
  const ctx = vm.createContext({
    document: {
      activeElement: editor,
      createRange: () => ({
        offset: 0,
        startOffset: 0,
        selectNodeContents(ed) {
          this.offset = ed.text.length;
          this.startOffset = ed.text.length;
        },
        collapse() {},
        setStart(_node, value) {
          this.startOffset = value;
          this.offset = value;
        },
        setEnd() {},
      }),
    },
    window: {
      CatVirtGrid: { isEnabled: () => true },
      getSelection: () => selection,
    },
    currentSegmentsList: [seg],
    _pendingEditorFocus: pending,
    _pendingEditorFocusRetry: 0,
    _pendingEditorCenterRetry: 0,
    _pendingVirtScrollIssued: false,
    isSegmentVisibleInEditor: () => true,
    virtScrollBlockFromPending: (value) => value,
    getAfterConfirmScrollBlock: () => "nearest",
    getGridRowBySegId: () => row,
    extractTextFromEditor: (ed) => ed.text,
    getPlainCaretOffsetViaRangeClone: () => offset,
    CAT_NAV_DEBUG: () => false,
    logExplicitCenterDiagnostic() {},
    setActiveGridRow() {},
    withProgrammaticEditorFocus: (fn) => fn(),
    buildCollapsedRangeAtPlainTextOffsetUsingSegments: (_ed, n) => ({
      offset: n,
      startContainer: editor,
      startOffset: n,
    }),
    catFakeCaret: { setSavedCaret() {}, hide() {} },
    saveCatCaretFromSelection() {},
  });
  for (const name of names) vm.runInContext(extract(source, name), ctx);
  ctx.flushPendingEditorFocus();
  return { finalOffset: offset, text: seg.targetText, events };
}

describe("confirm caret stays where it was told", () => {
  it("6c7f0fcc pushed a restored mid-sentence caret to the end", () => {
    for (const restoreCaret of [true, false]) {
      expect(caretCase(beforeFix, restoreCaret).finalOffset).toBe(6);
    }
  });

  it("keeps offset 2 when the live text differs from the segment", () => {
    for (const restoreCaret of [true, false]) {
      const result = caretCase(current, restoreCaret);
      expect(result.finalOffset).toBe(2);
      expect(result.text).toBe("甲乙新增丙丁");
    }
  });

  it("keeps offset 2 when the live text already matches", () => {
    const result = caretCase(current, true, { synchronized: true });
    expect(result.finalOffset).toBe(2);
    expect(result.text).toBe("甲乙新增丙丁");
  });

  it("puts the caret back at the end after a rebuild when that is where it was", () => {
    const result = caretCase(current, false, { initialOffset: 6, rebuildResetsCaret: true });
    expect(result.finalOffset).toBe(6);
  });

  it("does not let a live end caret overwrite an explicit restore offset", () => {
    const result = caretCase(current, true, {
      initialOffset: 6,
      plainOffset: 2,
      rebuildResetsCaret: true,
    });
    expect(result.finalOffset).toBe(2);
  });

  it("saves a real clear and ignores an unfinished composition", () => {
    const cleared = { id: "1", targetText: "甲" };
    const composing = { id: "2", targetText: "甲" };
    const clearedEditor = {
      text: "",
      classList: { contains: (name) => name === "grid-textarea" },
      closest: () => ({ getAttribute: () => "1" }),
    };
    const composingEditor = {
      text: "甲乙",
      classList: { contains: () => true },
      closest: () => ({ getAttribute: () => "2" }),
    };
    const ctx = vm.createContext({
      document: { activeElement: clearedEditor },
      currentSegmentsList: [cleared, composing],
      extractTextFromEditor: (ed) => ed.text,
    });
    vm.runInContext(extract(current, "adoptLiveEditorTextIntoSegment"), ctx);
    expect(ctx.adoptLiveEditorTextIntoSegment("1")).toBe(true);
    expect(cleared.targetText).toBe("");
    ctx.document.activeElement = composingEditor;
    expect(ctx.adoptLiveEditorTextIntoSegment("2")).toBe(false);
    expect(composing.targetText).toBe("甲");
  });
});
