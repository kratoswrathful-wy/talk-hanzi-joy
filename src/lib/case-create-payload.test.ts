import { describe, expect, it, vi } from "vitest";
import type { CaseRecord } from "@/data/case-types";
import { mapPartialCaseToDb } from "@/stores/case-store";
import { adminCreateCase } from "@/lib/case-admin-rpc";
import {
  ADMIN_CREATE_FORBIDDEN_PAYLOAD_KEYS,
  buildAdminCreateRpcPayload,
  findAdminCreateForbiddenKeys,
} from "./case-create-payload";

function buildAdminCreateCaseRpcArgs(
  caseId: string,
  partial: Partial<CaseRecord>,
): { p_case_id: string; p_payload: Record<string, unknown> } {
  return {
    p_case_id: caseId,
    p_payload: buildAdminCreateRpcPayload(mapPartialCaseToDb(partial)),
  };
}

describe("case create RPC payload contract", () => {
  it("mapPartialCaseToDb does not emit created_by even when snapshot includes createdBy", () => {
    const db = mapPartialCaseToDb({
      title: "restored",
      createdBy: "00000000-0000-0000-0000-000000000099",
    } as Partial<CaseRecord>);
    expect(db.created_by).toBeUndefined();
    expect(findAdminCreateForbiddenKeys(db)).toEqual([]);
  });

  it("buildAdminCreateRpcPayload strips identity keys from deletedSnapshot-like partial", () => {
    const snapshot = {
      id: "11111111-1111-1111-1111-111111111111",
      env: "test",
      createdBy: "22222222-2222-2222-2222-222222222222",
      revision: 5,
      title: "[undo] restored case",
      status: "draft",
      client: "ClientCo",
      processNote: "from snapshot",
      workGroups: [{ workType: "translation", billingUnit: "字", unitCount: 100 }],
    } as Partial<CaseRecord>;

    const payload = buildAdminCreateRpcPayload(mapPartialCaseToDb(snapshot));
    for (const key of ADMIN_CREATE_FORBIDDEN_PAYLOAD_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.title).toBe("[undo] restored case");
    expect(payload.client).toBe("ClientCo");
    expect(payload.process_note).toBe("from snapshot");
    expect(payload.work_groups).toEqual([
      { workType: "translation", billingUnit: "字", unitCount: 100 },
    ]);
  });

  it("template fields survive the full partial → toDb → payload chain", () => {
    const templatePartial: Partial<CaseRecord> = {
      title: "新案件",
      status: "inquiry",
      client: "TemplateCo",
      category: "game",
      multiCollab: true,
      collabCount: 2,
      inquiryNote: "template note",
    };
    const payload = buildAdminCreateRpcPayload(mapPartialCaseToDb(templatePartial));
    expect(payload).toMatchObject({
      title: "新案件",
      status: "inquiry",
      client: "TemplateCo",
      category: "game",
      multi_collab: true,
      collab_count: 2,
      inquiry_note: "template note",
    });
    expect(findAdminCreateForbiddenKeys(payload)).toEqual([]);
  });

  it("buildAdminCreateCaseRpcArgs keeps case id separate from payload", () => {
    const caseId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const args = buildAdminCreateCaseRpcArgs(caseId, {
      title: "x",
      status: "draft",
    });
    expect(args.p_case_id).toBe(caseId);
    expect(args.p_payload).toEqual({ title: "x", status: "draft" });
    expect(args.p_payload).not.toHaveProperty("id");
  });

  it("throws if forbidden keys would reach server (no silent strip at call site)", () => {
    expect(() =>
      buildAdminCreateRpcPayload({
        title: "x",
        login_password: "secret",
      }),
    ).toThrow(/forbidden keys.*login_password/);
  });

  it("adminCreateCase forwards only business payload to RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, id: "c1", revision: 0 }, error: null });
    const client = { rpc } as never;
    const payload = buildAdminCreateRpcPayload(
      mapPartialCaseToDb({
        title: "RPC chain",
        status: "draft",
        client: "Acme",
      }),
    );
    await adminCreateCase(client, "c1", payload);
    expect(rpc).toHaveBeenCalledWith("admin_create_case", {
      p_case_id: "c1",
      p_payload: {
        title: "RPC chain",
        status: "draft",
        client: "Acme",
      },
    });
  });
});
