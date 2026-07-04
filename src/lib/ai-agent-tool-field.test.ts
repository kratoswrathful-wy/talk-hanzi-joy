import { describe, it, expect } from "vitest";
import type { CaseRecord, ToolEntry } from "@/data/case-types";
import {
  buildToolFieldWritePatch,
  finalizeToolSetFieldResult,
  getEffectiveToolEntries,
  isSensitiveToolFieldLabel,
  maskToolFieldReadback,
  pickToolEntryIndex,
  readToolFieldFromRecord,
  resolveToolFieldDef,
  type CaseToolSlice,
} from "./ai-agent-tool-field";

const baseCase = (): CaseToolSlice & { id: string } => ({
  id: "case-1",
  tools: [
    {
      id: "te-1",
      tool: "memoQ",
      fields: [
        { id: "fld-server", label: "伺服器", type: "text" },
        { id: "fld-pass", label: "密碼", type: "text" },
        { id: "fld-att", label: "附件", type: "file" },
      ],
      fieldValues: { "fld-server": "old-server" },
    },
  ],
});

const schema = [
  { id: "fld-server", label: "伺服器", type: "text" as const },
  { id: "fld-pass", label: "密碼", type: "text" as const },
  { id: "fld-att", label: "附件", type: "file" as const },
];

describe("getEffectiveToolEntries", () => {
  it("優先讀 tools 陣列", () => {
    const entries = getEffectiveToolEntries(baseCase(), "executionTool");
    expect(entries).toHaveLength(1);
    expect(entries[0].tool).toBe("memoQ");
  });

  it("legacy 案件回退 executionTool + toolFieldValues", () => {
    const record: CaseToolSlice = {
      executionTool: "Phrase",
      toolFieldValues: { x: "y" },
    };
    const entries = getEffectiveToolEntries(record, "executionTool");
    expect(entries[0]).toMatchObject({ tool: "Phrase", fieldValues: { x: "y" } });
  });
});

describe("pickToolEntryIndex", () => {
  const tools = baseCase().tools!;

  it("依 toolLabel 定位", () => {
    expect(pickToolEntryIndex(tools, { toolLabel: "memoQ" })).toEqual({ ok: true, data: 0 });
  });

  it("多工具時未指定識別會失敗", () => {
    const multi = [...tools, { ...tools[0], id: "te-2", tool: "Phrase", fieldValues: {} }];
    const r = pickToolEntryIndex(multi, {});
    expect(r.ok).toBe(false);
  });
});

describe("resolveToolFieldDef", () => {
  it("可用 id 或 label 解析", () => {
    expect(resolveToolFieldDef(schema, "fld-server").ok).toBe(true);
    expect(resolveToolFieldDef(schema, "伺服器").ok).toBe(true);
  });

  it("未知欄位回傳 allowed 提示", () => {
    const r = resolveToolFieldDef(schema, "不存在");
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.allowed?.length).toBeGreaterThan(0);
    }
  });
});

describe("buildToolFieldWritePatch", () => {
  it("合併 fieldValues 而非覆蓋整列", () => {
    const built = buildToolFieldWritePatch(
      baseCase(),
      { caseId: "case-1", toolLabel: "memoQ", fieldKey: "伺服器", value: "mq.example.com" },
      schema,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const next = built.data.patch.tools![0];
    expect(next.fieldValues).toEqual({
      "fld-server": "mq.example.com",
    });
  });

  it("拒絕檔案類型欄位", () => {
    const r = buildToolFieldWritePatch(
      baseCase(),
      { caseId: "case-1", toolLabel: "memoQ", fieldKey: "附件", value: "x" },
      schema,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toContain("檔案類型");
    }
  });
});

describe("readToolFieldFromRecord + finalizeToolSetFieldResult", () => {
  it("一般欄位回讀值一致", () => {
    const built = buildToolFieldWritePatch(
      baseCase(),
      { caseId: "case-1", toolLabel: "memoQ", fieldKey: "伺服器", value: "mq.example.com" },
      schema,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const patched: CaseToolSlice = { ...baseCase(), ...built.data.patch };
    const actual = readToolFieldFromRecord(patched, built.data.meta);
    const result = finalizeToolSetFieldResult(built.data.meta, "mq.example.com", actual);
    expect(result.verified).toBe(true);
    expect(result.readbackValue).toBe("mq.example.com");
  });

  it("密碼欄位回讀遮罩但仍可 verified", () => {
    const built = buildToolFieldWritePatch(
      baseCase(),
      { caseId: "case-1", toolLabel: "memoQ", fieldKey: "密碼", value: "s3cret!" },
      schema,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const patched: CaseToolSlice = { ...baseCase(), ...built.data.patch };
    const actual = readToolFieldFromRecord(patched, built.data.meta);
    const result = finalizeToolSetFieldResult(built.data.meta, "s3cret!", actual);
    expect(result.verified).toBe(true);
    expect(result.readbackValue).toBe("***");
    expect(result.readbackLength).toBe(7);
    expect(isSensitiveToolFieldLabel("密碼")).toBe(true);
    expect(maskToolFieldReadback("密碼", "abc").readbackValue).toBe("***");
  });
});
