import { test, expect, type Page } from "@playwright/test";
import {
  expectTestModePersonaUiReady,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * P0-A R1-E 冒煙：譯者承接／拒絕／完成須走語意明確動作 RPC
 *（accept_public_inquiry_case／accept_inquiry_collab_row／
 *  decline_public_inquiry_case／complete_case_translation）。
 *
 * 預設 skip：正式庫尚未套用 P0-A／P0-D migration，RPC 不存在。
 * 僅在隔離 DB（已套用 P0-A～P0-D）+ 測試模式假人下啟用：
 *   PLAYWRIGHT_P0A_CASE_RPC_SMOKE=1
 *
 * 協作承接案例驗證「公開詢案空白協作列」由譯者承接（translator／translatorUserId 留空；
 * 禁止 label→UUID 反查）。不依賴正式 production 資料。
 */

const P0A_RPC_SMOKE_ENABLED = process.env.PLAYWRIGHT_P0A_CASE_RPC_SMOKE === "1";
const describeP0a = P0A_RPC_SMOKE_ENABLED ? test.describe : test.describe.skip;

type AgentResult<T> = { ok: boolean; data?: T; error?: string };

async function waitAgent(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __lmsAgent?: unknown }).__lmsAgent, null, {
    timeout: 60_000,
  });
}

function readAuthJwtClaims(page: Page): Promise<{ email: string | null; sub: string | null; accessToken: string | null }> {
  return page.evaluate(() => {
    function b64urlDecode(s: string): string {
      let t = s.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      return atob(t);
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /sb-.*-auth-token(\.\d+)?$/.test(k)) keys.push(k);
    }
    if (!keys.length) return { email: null, sub: null, accessToken: null };
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    const parsed = JSON.parse(raw) as { access_token?: string };
    const token = parsed?.access_token;
    if (!token) return { email: null, sub: null, accessToken: null };
    const claims = JSON.parse(b64urlDecode(token.split(".")[1])) as {
      email?: string;
      sub?: string;
    };
    return {
      email: claims.email ?? null,
      sub: claims.sub ?? null,
      accessToken: token,
    };
  });
}

async function currentAuthEmail(page: Page): Promise<string | null> {
  return (await readAuthJwtClaims(page)).email;
}

/** 追蹤 P0-A 動作 RPC（非舊 apply_case_update）。 */
function trackCaseActionRpcs(page: Page) {
  const names = new Set([
    "accept_public_inquiry_case",
    "complete_case_translation",
    "accept_inquiry_collab_row",
    "decline_public_inquiry_case",
    "complete_case_collab_row",
    "update_case_permitted_fields",
  ]);
  const hits: { name: string; ok: boolean; status: number; body: string }[] = [];
  page.on("response", async (res) => {
    const name = new URL(res.url()).pathname.split("/").pop() ?? "";
    if (!names.has(name)) return;
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    hits.push({ name, ok: res.ok(), status: res.status(), body });
  });
  return hits;
}

describeP0a("P0-A case action RPC smoke（隔離 DB + 測試模式）", () => {
  test.describe.configure({ mode: "serial" });

  test("譯者單檔承接＋任務完成走 P0-A 專用 RPC", async ({ page }) => {
    const rpcHits = trackCaseActionRpcs(page);
    const stamp = Date.now().toString(36);
    const title = `[AI驗收] P0A單檔承接 ${stamp}`;

    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    expect(await currentAuthEmail(page)).toBe("test-exec@test.local");
    await waitAgent(page);

    const created = await page.evaluate(async (t) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: {
            create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
            update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string; status: string }>>;
          };
        };
      }).__lmsAgent;
      const c = await agent.case.create({ title: t });
      if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
      const u = await agent.case.update(c.data.id, { status: "inquiry" });
      if (!u.ok) return { ok: false as const, error: u.error || "publish failed", id: c.data.id };
      return { ok: true as const, id: c.data.id };
    }, title);
    expect(created.ok, created.ok ? "" : created.error).toBe(true);

    await switchToTestPersona(page, "譯者一");
    expect(await currentAuthEmail(page)).toBe("test-t1@test.local");
    await waitAgent(page);

    await expect(page.getByText(/譯者一（測試）/).first()).toBeVisible({ timeout: 30_000 });

    await page.goto(`/cases/${created.id}`);
    const acceptBtn = page.getByRole("button", { name: /承接本案/ });
    await expect(acceptBtn).toBeVisible({ timeout: 60_000 });
    const beforeAccept = rpcHits.length;
    await acceptBtn.click();
    await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(beforeAccept);
    const acceptRpc = rpcHits[rpcHits.length - 1];
    expect(acceptRpc.name).toBe("accept_public_inquiry_case");
    expect(acceptRpc.ok, `承接 RPC HTTP ${acceptRpc.status}: ${acceptRpc.body}`).toBe(true);
    expect(acceptRpc.body).toMatch(/"status"\s*:\s*"dispatched"/);

    await expect(page.getByText("已派出").first()).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: "load" });
    await expectTestModePersonaUiReady(page);
    await waitAgent(page);
    await expect(page.getByText("已派出").first()).toBeVisible({ timeout: 60_000 });

    await expect.poll(async () => {
      return page.evaluate((id) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            case: { get: (cid: string) => AgentResult<{ status: string; translator: string[] }> };
          };
        }).__lmsAgent;
        const g = agent.case.get(id);
        if (!g.ok || !g.data) return null;
        return { status: g.data.status, translator: g.data.translator || [] };
      }, created.id!);
    }, { timeout: 30_000 }).toEqual(expect.objectContaining({
      status: "dispatched",
      translator: expect.arrayContaining([expect.stringMatching(/譯者一/)]),
    }));

    const taskComplete = page.getByRole("button", { name: "任務完成" });
    await expect(taskComplete).toBeVisible({ timeout: 30_000 });
    const beforeComplete = rpcHits.length;
    await taskComplete.click();
    await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(beforeComplete);
    const completeRpc = rpcHits[rpcHits.length - 1];
    expect(completeRpc.name).toBe("complete_case_translation");
    expect(completeRpc.ok, `完成 RPC HTTP ${completeRpc.status}: ${completeRpc.body}`).toBe(true);

    await expect.poll(async () => {
      return page.evaluate((id) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            case: { get: (cid: string) => AgentResult<{ status: string }> | null };
          };
        }).__lmsAgent;
        const g = agent.case.get(id);
        return g && "ok" in g && g.ok ? g.data?.status : null;
      }, created.id!);
    }, { timeout: 20_000 }).toBe("task_completed");
  });

  test("譯者協作分段承接走 P0-A 專用 RPC", async ({ page }) => {
    const rpcHits = trackCaseActionRpcs(page);
    const stamp = Date.now().toString(36);
    const title = `[AI驗收] P0A協作承接 ${stamp}`;

    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    const email = await currentAuthEmail(page);
    if (email !== "test-exec@test.local") {
      await switchToTestPersona(page, "執行長");
      expect(await currentAuthEmail(page)).toBe("test-exec@test.local");
    }
    await waitAgent(page);

    // 公開詢案空白協作列：translator 與 translatorUserId 留空，
    // 任一合格 member 可承接。不使用 label→UUID 反查。
    const created = await page.evaluate(async (t) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: {
            create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
            update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
          };
        };
      }).__lmsAgent;
      const c = await agent.case.create({ title: t });
      if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
      const u = await agent.case.update(c.data.id, {
        status: "inquiry",
        multiCollab: true,
        collabCount: 2,
        collabRows: [
          {
            translator: "",
            segment: "段A",
            unitCount: 0,
            accepted: false,
            translationDeadline: null,
            reviewer: "",
            reviewDeadline: null,
            taskCompleted: false,
            delivered: false,
          },
          {
            translator: "",
            segment: "段B",
            unitCount: 0,
            accepted: false,
            translationDeadline: null,
            reviewer: "",
            reviewDeadline: null,
            taskCompleted: false,
            delivered: false,
          },
        ],
        translator: [],
      });
      if (!u.ok) return { ok: false as const, error: u.error || "setup failed", id: c.data.id };
      return { ok: true as const, id: c.data.id };
    }, title);
    expect(created.ok, created.ok ? "" : created.error).toBe(true);

    await switchToTestPersona(page, "譯者一");
    expect(await currentAuthEmail(page)).toBe("test-t1@test.local");
    await waitAgent(page);
    await page.goto(`/cases/${created.id}`);

    const acceptCell = page.getByRole("checkbox").first();
    await expect(acceptCell).toBeVisible({ timeout: 60_000 });
    const before = rpcHits.length;
    await acceptCell.click();
    await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(before);
    const hit = rpcHits[rpcHits.length - 1];
    expect(hit.name).toBe("accept_inquiry_collab_row");
    expect(hit.ok, `協作承接 RPC HTTP ${hit.status}: ${hit.body}`).toBe(true);

    const authAfter = await readAuthJwtClaims(page);
    expect(authAfter.sub, "承接後必須有登入者 UUID").toBeTruthy();
    expect(authAfter.email).toBe("test-t1@test.local");
    const actorUserId = authAfter.sub!;

    // server 必須寫入 translatorUserId = 實際登入者（不得用姓名反查）
    await expect.poll(async () => {
      return page.evaluate((id) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            case: {
              get: (cid: string) => AgentResult<{
                collabRows: {
                  id: string;
                  accepted: boolean;
                  translator: string;
                  translatorUserId?: string | null;
                }[];
              }> | null;
            };
          };
        }).__lmsAgent;
        const g = agent.case.get(id);
        if (!g || !("ok" in g) || !g.ok || !g.data) return null;
        const row = (g.data.collabRows || []).find((r) => r.accepted);
        return row
          ? {
              accepted: row.accepted,
              translatorUserId: row.translatorUserId ?? null,
              acceptedCount: (g.data.collabRows || []).filter((r) => r.accepted).length,
            }
          : null;
      }, created.id!);
    }, { timeout: 20_000 }).toEqual({
      accepted: true,
      translatorUserId: actorUserId,
      acceptedCount: 1,
    });

    // 直查 case_participants：恰一筆 active translator，且為登入者
    const apiUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    expect(apiUrl, "VITE_SUPABASE_URL 必須指向本機隔離環境").toBeTruthy();
    expect(anonKey, "VITE_SUPABASE_PUBLISHABLE_KEY 必須存在").toBeTruthy();
    expect(
      /wshsmerltcakffllgyul/i.test(apiUrl || ""),
      "禁止 fallback 到 production ref",
    ).toBe(false);
    expect(
      /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(apiUrl || ""),
      "冒煙必須指向本機 Supabase URL",
    ).toBe(true);

    const participantCheck = await page.evaluate(
      async ({ caseId, userId, url, anon, token }) => {
        const res = await fetch(
          `${url}/rest/v1/case_participants?case_id=eq.${caseId}&role=eq.translator&work_status=eq.active&select=user_id,role,source,access_revoked_at`,
          {
            headers: {
              apikey: anon,
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        if (!res.ok) {
          return { ok: false as const, status: res.status, text: await res.text() };
        }
        const rows = (await res.json()) as {
          user_id: string;
          role: string;
          source: string;
          access_revoked_at: string | null;
        }[];
        const active = rows.filter((r) => r.access_revoked_at == null);
        return {
          ok: true as const,
          count: active.length,
          userId: active[0]?.user_id ?? null,
          source: active[0]?.source ?? null,
          matchesActor: active.length === 1 && active[0]?.user_id === userId,
        };
      },
      {
        caseId: created.id!,
        userId: actorUserId,
        url: apiUrl!,
        anon: anonKey!,
        token: authAfter.accessToken!,
      },
    );
    expect(participantCheck.ok, `case_participants 查詢失敗: ${JSON.stringify(participantCheck)}`).toBe(
      true,
    );
    if (participantCheck.ok) {
      expect(participantCheck).toEqual(
        expect.objectContaining({
          count: 1,
          userId: actorUserId,
          matchesActor: true,
          source: "collab_accept",
        }),
      );
    }
  });

  test("譯者無法承接走 P0-A 專用 RPC", async ({ page }) => {
    const rpcHits = trackCaseActionRpcs(page);
    const stamp = Date.now().toString(36);
    const title = `[AI驗收] P0A無法承接 ${stamp}`;

    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    if ((await currentAuthEmail(page)) !== "test-exec@test.local") {
      await switchToTestPersona(page, "執行長");
    }
    await waitAgent(page);

    const created = await page.evaluate(async (t) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: {
            create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
            update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
          };
        };
      }).__lmsAgent;
      const c = await agent.case.create({ title: t });
      if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
      const u = await agent.case.update(c.data.id, { status: "inquiry" });
      if (!u.ok) return { ok: false as const, error: u.error || "publish failed", id: c.data.id };
      return { ok: true as const, id: c.data.id };
    }, title);
    expect(created.ok, created.ok ? "" : created.error).toBe(true);

    await switchToTestPersona(page, "譯者一");
    await waitAgent(page);
    await page.goto(`/cases/${created.id}`);

    const declineBtn = page.getByRole("button", { name: /無法承接/ });
    await expect(declineBtn).toBeVisible({ timeout: 30_000 });
    await declineBtn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const reason = dialog.locator("textarea").or(dialog.getByRole("textbox"));
    if (await reason.count()) {
      await reason.first().fill("冒煙：無法承接回歸");
    }
    const before = rpcHits.length;
    await dialog.getByRole("button", { name: /確認|送出|無法承接/ }).last().click();
    await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(before);
    const hit = rpcHits[rpcHits.length - 1];
    expect(hit.name).toBe("decline_public_inquiry_case");
    expect(hit.ok, `無法承接 RPC HTTP ${hit.status}: ${hit.body}`).toBe(true);
  });
});
