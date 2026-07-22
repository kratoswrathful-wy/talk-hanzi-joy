import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("formatWorkflowListCellHtml：審稿欄不得回退翻譯人", () => {
  let formatWorkflowListCellHtml;

  beforeAll(() => {
    const code = fs.readFileSync(path.join(__dirname, "wf-display-status.js"), "utf8");
    const sandbox = vm.createContext({ console });
    sandbox.global = sandbox;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInContext(code, sandbox);
    formatWorkflowListCellHtml = sandbox.WfDisplayStatus.formatWorkflowListCellHtml;
  });

  const stages = [
    { id: "st-t", stageKind: "translate", stageOrder: 1, status: "active" },
    { id: "st-r", stageKind: "review", stageOrder: 2, status: "active" },
  ];

  it("無 review assignment＋有 fileAssigneeNames → 審稿欄不出現翻譯人名", () => {
    const html = formatWorkflowListCellHtml({
      stages,
      assignments: [],
      fileAssigneeNames: ["翻譯小明"],
      resolveName: (uid) => String(uid || "—"),
    });
    expect(html).toContain("翻譯小明");
    // 翻譯欄可顯示整檔回退人名；審稿欄禁止同一人名
    expect(html).toMatch(/翻譯[\s\S]*翻譯小明（整檔）/);
    expect(html).toContain("⚠ 尚未建立指派");
    const reviewCellMatch = html.match(/>審稿<\/div><div>([\s\S]*?)<\/div><\/div>/);
    expect(reviewCellMatch?.[1]).not.toContain("翻譯小明");
    expect(reviewCellMatch?.[1]).toContain("尚未建立指派");
  });

  it("有 review assignment → 顯示審稿指派人，不受 fileAssigneeNames 影響", () => {
    const html = formatWorkflowListCellHtml({
      stages,
      assignments: [
        {
          id: "a1",
          fileWorkflowStageId: "st-r",
          assigneeUserId: "u-reviewer",
          workflowStatus: "assigned",
        },
      ],
      fileAssigneeNames: ["翻譯小明"],
      resolveName: (uid) => (uid === "u-reviewer" ? "威儀" : String(uid)),
    });
    expect(html).toContain("威儀");
    // 以「審稿」標籤後的格子為準（避免人名含「審稿」時 split 誤切）
    const reviewCellMatch = html.match(/>審稿<\/div><div>([\s\S]*?)<\/div><\/div>/);
    expect(reviewCellMatch?.[1]).toContain("威儀");
    expect(reviewCellMatch?.[1]).not.toContain("翻譯小明");
  });
});
