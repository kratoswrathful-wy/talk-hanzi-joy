import type { CaseRecord, ToolEntry } from "@/data/case-types";
import {
  type AgentResult,
  agentOk as ok,
  agentFail as fail,
  agentFailFrom as failFrom,
} from "@/lib/ai-agent-types";

/** 對應 select-options 的 executionTool / questionTool */
export type ToolBlockKey = "executionTool" | "questionTool";

export interface ToolFieldSchema {
  id: string;
  label: string;
  type?: "text" | "file";
}

export interface ToolSetFieldInput {
  caseId: string;
  /** 欄位 id 或 label（與 getToolSchema 回傳一致） */
  fieldKey: string;
  value: string;
  toolLabel?: string;
  toolIndex?: number;
  toolEntryId?: string;
  toolFieldKey?: ToolBlockKey;
}

export interface ToolSetFieldResult {
  caseId: string;
  toolFieldKey: ToolBlockKey;
  toolLabel: string;
  toolIndex: number;
  toolEntryId: string;
  fieldId: string;
  fieldLabel: string;
  fieldType: "text" | "file";
  written: true;
  verified: boolean;
  /** 回讀值；敏感欄位（標籤含「密碼」）遮罩 */
  readbackValue: string;
  readbackLength?: number;
}

export type CaseToolSlice = Partial<
  Pick<CaseRecord, "tools" | "executionTool" | "toolFieldValues" | "questionTools">
>;

export function getEffectiveToolEntries(
  record: CaseToolSlice,
  toolFieldKey: ToolBlockKey,
): ToolEntry[] {
  if (toolFieldKey === "questionTool") {
    return record.questionTools?.length
      ? record.questionTools
      : [{ id: "qt-default", tool: "", fieldValues: {} }];
  }
  if (Array.isArray(record.tools)) return record.tools;
  return [
    {
      id: "te-default",
      tool: record.executionTool || "",
      fieldValues: record.toolFieldValues || {},
    },
  ];
}

export function pickToolEntryIndex(
  tools: ToolEntry[],
  input: Pick<ToolSetFieldInput, "toolLabel" | "toolIndex" | "toolEntryId">,
): AgentResult<number> {
  if (input.toolEntryId) {
    const idx = tools.findIndex((t) => t.id === input.toolEntryId);
    if (idx < 0) return fail(`找不到 toolEntryId=${input.toolEntryId}`);
    return ok(idx);
  }
  if (input.toolIndex !== undefined) {
    if (!Number.isInteger(input.toolIndex) || input.toolIndex < 0 || input.toolIndex >= tools.length) {
      return fail(`toolIndex=${input.toolIndex} 超出範圍（共 ${tools.length} 個工具）`);
    }
    return ok(input.toolIndex);
  }
  if (input.toolLabel) {
    const idx = tools.findIndex((t) => t.tool === input.toolLabel);
    if (idx < 0) {
      return fail(`找不到工具「${input.toolLabel}」`, tools.map((t) => t.tool).filter(Boolean));
    }
    return ok(idx);
  }
  if (tools.length === 1) return ok(0);
  return fail("請提供 toolLabel、toolIndex 或 toolEntryId 以指定要寫入的工具");
}

export function resolveToolFieldDef(
  fields: ToolFieldSchema[],
  fieldKey: string,
): AgentResult<ToolFieldSchema> {
  if (!fieldKey.trim()) return fail("fieldKey 不可為空");
  const byId = fields.find((f) => f.id === fieldKey);
  if (byId) return ok(byId);
  const exactLabel = fields.find((f) => f.label === fieldKey);
  if (exactLabel) return ok(exactLabel);
  const normalized = fieldKey.trim().toLowerCase();
  const byLabelCi = fields.find((f) => f.label.trim().toLowerCase() === normalized);
  if (byLabelCi) return ok(byLabelCi);
  return fail(
    `找不到欄位「${fieldKey}」`,
    fields.map((f) => `${f.label} (${f.id})`),
  );
}

export function isSensitiveToolFieldLabel(label: string): boolean {
  return /密碼|password/i.test(label);
}

export function maskToolFieldReadback(
  label: string,
  value: string,
): { readbackValue: string; readbackLength?: number } {
  if (!isSensitiveToolFieldLabel(label)) {
    return { readbackValue: value };
  }
  if (!value) return { readbackValue: "", readbackLength: 0 };
  return { readbackValue: "***", readbackLength: value.length };
}

export function buildToolFieldWritePatch(
  record: CaseToolSlice,
  input: ToolSetFieldInput,
  toolFields: ToolFieldSchema[],
): AgentResult<{
  patch: Partial<CaseRecord>;
  meta: Omit<ToolSetFieldResult, "written" | "verified" | "readbackValue" | "readbackLength">;
}> {
  const toolFieldKey = input.toolFieldKey ?? "executionTool";
  const tools = getEffectiveToolEntries(record, toolFieldKey);
  const idxResult = pickToolEntryIndex(tools, input);
  if (idxResult.ok === false) return failFrom(idxResult);
  const idx = idxResult.data;

  const entry = tools[idx];
  if (!entry.tool?.trim() && toolFieldKey === "executionTool") {
    return fail("此案件尚未選定執行工具，請先用 case.update 設定 tools[].tool 或 executionTool");
  }

  const fieldResult = resolveToolFieldDef(toolFields, input.fieldKey);
  if (fieldResult.ok === false) return failFrom(fieldResult);
  const field = fieldResult.data;

  if ((field.type ?? "text") === "file") {
    return fail(
      `欄位「${field.label}」為檔案類型，請改用 upload.fromBytes 後以 case.update 寫入 fileValues，不可用 tool.setField 寫入文字`,
    );
  }

  if (typeof input.value !== "string") {
    return fail("value 必須為字串");
  }

  const nextEntry: ToolEntry = {
    ...entry,
    fieldValues: { ...(entry.fieldValues || {}), [field.id]: input.value },
  };
  const nextTools = tools.map((t, i) => (i === idx ? nextEntry : t));

  const patch: Partial<CaseRecord> =
    toolFieldKey === "questionTool" ? { questionTools: nextTools } : { tools: nextTools };

  return ok({
    patch,
    meta: {
      caseId: input.caseId,
      toolFieldKey,
      toolLabel: nextEntry.tool,
      toolIndex: idx,
      toolEntryId: nextEntry.id,
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: (field.type ?? "text") as "text" | "file",
    },
  });
}

export function readToolFieldFromRecord(
  record: CaseToolSlice,
  meta: Pick<ToolSetFieldResult, "toolFieldKey" | "toolIndex" | "fieldId">,
): string {
  const tools = getEffectiveToolEntries(record, meta.toolFieldKey);
  const entry = tools[meta.toolIndex];
  return entry?.fieldValues?.[meta.fieldId] ?? "";
}

export function finalizeToolSetFieldResult(
  meta: Omit<ToolSetFieldResult, "written" | "verified" | "readbackValue" | "readbackLength">,
  expectedValue: string,
  actualValue: string,
): ToolSetFieldResult {
  const masked = maskToolFieldReadback(meta.fieldLabel, actualValue);
  return {
    ...meta,
    written: true,
    verified: actualValue === expectedValue,
    readbackValue: masked.readbackValue,
    readbackLength: masked.readbackLength,
  };
}
