import { afterEach, describe, expect, it, vi } from "vitest";
import { createCaseCredentialAccess } from "./case-credential-access";
import { toolFieldValuePatch } from "./case-tool-credentials-guard";
import {
  applyToolEntryFieldPatchById,
  persistToolBlockPatch,
  resetToolCredentialPersistQueuesForTests,
} from "./case-tool-credentials-persist";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import type { ToolEntry } from "@/data/case-types";

/**
 * 呼叫端契約測試（Riot - Riftbound 260908 事故）。
 *
 * `case-tool-credentials-persist.test.ts` 的並行測試只送單一欄位的 updater
 * （`{ fieldValues: { a: "1" } }`），因此通過。但 `CaseDetailPage` 的 `ToolInstance`
 * 實際送出的是整組 `fieldValues`：
 *
 *   onUpdate({ fieldValues: { ...values, [f.id]: v } })
 *
 * 其中 `values` 是該次 render 的快照。前一筆保存尚未確認前就編輯下一欄時，
 * 這個快照仍帶著其他欄位的舊值，經 `mergeToolEntryUpdates`（updates 全勝的淺層合併）
 * 會把已確認的兄弟欄位覆蓋回舊值。
 */

const FIELD_IDS = ["f-server", "f-user", "f-pass", "f-project", "f-file"] as const;

function emptyValues(): Record<string, string> {
  return Object.fromEntries(FIELD_IDS.map((id) => [id, ""]));
}

function cred(tools: ToolEntry[], revision = 1): CaseCredentials {
  return {
    caseId: "c1",
    revision,
    loginAccount: "",
    loginPassword: "",
    otherLoginInfo: "",
    toolFieldValues: {},
    tools,
    questionTools: [{ id: "qt-default", tool: "Google Sheet", fieldValues: { q: "1" } }],
  };
}

type Deps = Parameters<typeof persistToolBlockPatch>[0]["deps"];

function makeDeps(
  access: ReturnType<typeof createCaseCredentialAccess>,
  updateCredentials: Deps["updateCredentials"],
): Deps {
  return {
    getActiveUserId: () => access.getActiveUserId(),
    scope: (caseId: string) => access.scope(caseId),
    peekConfirmed: (caseId: string) => access.peekConfirmed(caseId),
    putConfirmed: (caseId: string, c: CaseCredentials, g?: number) =>
      access.putConfirmed(caseId, c, g),
    putDraft: (caseId: string, c: CaseCredentials) => access.putDraft(caseId, c),
    peekDraft: (caseId: string) => access.peekDraft(caseId),
    load: (caseId: string) => access.load(caseId),
    updateCredentials,
  };
}

async function setupServer() {
  let server = cred([
    { id: "te-default", tool: "memoQ", fieldValues: emptyValues() },
    { id: "te-2", tool: "GlobalProtect", fieldValues: { c: "vpn" } },
  ]);
  const rpc = vi.fn().mockImplementation(async () => ({
    data: structuredClone(server),
    error: null,
  }));
  const access = createCaseCredentialAccess({ rpc } as never);
  access.setActiveUser("u1");
  await access.load("c1");
  const updateCredentials = vi.fn(async (_id: string, patch: Partial<CaseCredentials>) => {
    server = { ...server, ...patch, revision: server.revision + 1 };
    return null;
  });
  return {
    access,
    deps: makeDeps(access, updateCredentials),
    serverTools: () => structuredClone(server.tools ?? []),
  };
}

/**
 * 重現 ToolInstance 的送出形狀。`renderSnapshot` 刻意保留在簽章中：它代表該次
 * render 的兄弟欄位快照，正確的呼叫端必須「不使用」它，只送本次改動的欄位。
 */
function toolInstanceEdit(
  renderSnapshot: Record<string, string>,
  fieldId: string,
  value: string,
) {
  void renderSnapshot;
  return (current: ToolEntry[]) =>
    applyToolEntryFieldPatchById(current, "te-default", toolFieldValuePatch(fieldId, value));
}

afterEach(() => {
  resetToolCredentialPersistQueuesForTests();
});

describe("ToolInstance 呼叫端：整組 fieldValues 不得覆蓋已確認的兄弟欄位", () => {
  it("逐欄依序保存（每次都等確認）後五欄全部保留", async () => {
    const { access, deps, serverTools } = await setupServer();
    const typed: Array<[string, string]> = [
      ["f-server", "mq.synthetic.local"],
      ["f-user", "synthetic-user"],
      ["f-pass", "synthetic-pass"],
      ["f-project", "synthetic-project"],
      ["f-file", "synthetic-file.mqxliff"],
    ];

    for (const [fieldId, value] of typed) {
      // 已等待確認 → render 快照是最新的
      const snapshot = { ...(access.peekConfirmed("c1")?.tools?.[0].fieldValues ?? {}) };
      const r = await persistToolBlockPatch({
        caseId: "c1",
        userId: "u1",
        generation: access.generation("c1"),
        block: "tools",
        updater: toolInstanceEdit(snapshot, fieldId, value),
        draftCredentials: access.peekConfirmed("c1")!,
        credentialsReady: true,
        usedPublicFallback: false,
        deps,
      });
      expect(r.status).toBe("ok");
    }

    expect(serverTools()[0].fieldValues).toEqual({
      "f-server": "mq.synthetic.local",
      "f-user": "synthetic-user",
      "f-pass": "synthetic-pass",
      "f-project": "synthetic-project",
      "f-file": "synthetic-file.mqxliff",
    });
    expect(serverTools()[1].fieldValues).toEqual({ c: "vpn" });
  });

  it("前一筆未確認就改下一欄時，先前欄位不得被舊 render 快照覆蓋", async () => {
    const { access, deps, serverTools } = await setupServer();
    // 兩次編輯共用同一份 render 快照（前一筆尚未確認，closure 未更新）
    const staleSnapshot = { ...(access.peekConfirmed("c1")?.tools?.[0].fieldValues ?? {}) };
    const gen = access.generation("c1");

    const p1 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: toolInstanceEdit(staleSnapshot, "f-server", "mq.synthetic.local"),
      draftCredentials: access.peekConfirmed("c1")!,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    const p2 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: toolInstanceEdit(staleSnapshot, "f-user", "synthetic-user"),
      draftCredentials: access.peekConfirmed("c1")!,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");

    // 兩次都是合法修改，兩者都必須留下
    expect(serverTools()[0].fieldValues).toMatchObject({
      "f-server": "mq.synthetic.local",
      "f-user": "synthetic-user",
    });
  });

  it("五欄快速連續編輯（皆未等確認）不得只剩最後一欄", async () => {
    const { access, deps, serverTools } = await setupServer();
    // 重現 Riot 案軌跡：短時間內多筆 update_case_credentials，最後只剩一欄有值
    const staleSnapshot = { ...(access.peekConfirmed("c1")?.tools?.[0].fieldValues ?? {}) };
    const gen = access.generation("c1");
    const typed: Array<[string, string]> = [
      ["f-server", "mq.synthetic.local"],
      ["f-user", "synthetic-user"],
      ["f-pass", "synthetic-pass"],
      ["f-project", "synthetic-project"],
      ["f-file", "synthetic-file.mqxliff"],
    ];

    const results = await Promise.all(
      typed.map(([fieldId, value]) =>
        persistToolBlockPatch({
          caseId: "c1",
          userId: "u1",
          generation: gen,
          block: "tools",
          updater: toolInstanceEdit(staleSnapshot, fieldId, value),
          draftCredentials: access.peekConfirmed("c1")!,
          credentialsReady: true,
          usedPublicFallback: false,
          deps,
        }),
      ),
    );
    for (const r of results) expect(r.status).toBe("ok");

    const nonEmpty = Object.entries(serverTools()[0].fieldValues ?? {})
      .filter(([, v]) => String(v ?? "").length > 0)
      .map(([k]) => k);
    expect(nonEmpty.sort()).toEqual([...FIELD_IDS].sort());
  });
});
