import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { accessToken, localApi, readCaseState, restClient, type RestClient } from "./isolated-api";

const SECRET_QUERY_KEYS = new Set(["apikey", "access_token", "token", "authorization", "refresh_token"]);

/** 去敏 REST 觀測：方法＋路徑＋狀態＋耗時；不收 token／本文。攔截中尚未回應的也記 pending。 */
export function attachRestHitLog(page: Page) {
  const hits: string[] = [];
  const started = new WeakMap<object, number>();
  page.on("request", (req) => {
    if (!/\/rest\/v1\//.test(req.url())) return;
    const method = req.method();
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) return;
    started.set(req, Date.now());
    hits.push(`${method} ${sanitizeRestPath(req.url())} pending`);
  });
  page.on("response", (res) => {
    const req = res.request();
    if (!/\/rest\/v1\//.test(req.url())) return;
    const method = req.method();
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) return;
    const t0 = started.get(req);
    const ms = t0 ? Date.now() - t0 : -1;
    hits.push(`${method} ${sanitizeRestPath(req.url())} ${res.status()} ${ms}ms`);
  });
  return {
    hits,
    format() {
      return hits.slice(-24).join(" | ") || "(none)";
    },
  };
}

export function sanitizeRestPath(url: string): string {
  try {
    const parsed = new URL(url);
    const kept: string[] = [];
    parsed.searchParams.forEach((value, key) => {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) return;
      kept.push(`${key}=${value.slice(0, 96)}`);
    });
    return kept.length ? `${parsed.pathname}?${kept.join("&")}` : parsed.pathname;
  } catch {
    return url.replace(/https?:\/\/[^/]+/i, "");
  }
}

export async function readSavePhase(page: Page): Promise<string> {
  return (
    (await page.getByTestId("case-detail-completeness").getAttribute("data-save-phase").catch(() => null)) ??
    "missing-completeness"
  );
}

/** 隔離測試專用 REST 寫入；拒絕正式 ref 的檢查沿用 localApi()。 */

export async function restFor(page: Page): Promise<{ token: string; rest: RestClient }> {
  const token = await accessToken(page);
  return { token, rest: restClient(page.request, token) };
}

export async function createDraftViaRpc(page: Page, title: string): Promise<string> {
  const { rest } = await restFor(page);
  const id = crypto.randomUUID();
  const created = await rest.rpc<{ ok?: boolean; error?: string }>("admin_create_case", {
    p_case_id: id,
    p_payload: { title, status: "draft" },
  });
  expect(created.ok, created.text).toBe(true);
  expect(created.data?.ok, created.text).toBe(true);
  await page.goto(`/cases/${id}`);
  await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
    timeout: 30_000,
  });
  return id;
}

export type IsolatedToolEntry = {
  id: string;
  tool: string;
  fields?: { id: string; label: string; type?: "text" | "file" }[];
  fieldValues?: Record<string, string>;
};

export async function seedCaseToolCredentials(
  page: Page,
  caseId: string,
  patch: { tools?: IsolatedToolEntry[]; questionTools?: IsolatedToolEntry[] },
): Promise<void> {
  const { rest } = await restFor(page);
  const state = await readCaseState(rest, caseId);
  expect(state, "seed 憑證前讀不到案件").toBeTruthy();
  const result = await rest.rpc("update_case_credentials", {
    p_case_id: caseId,
    p_expected_revision: state!.revision,
    p_credentials: patch,
  });
  expect(result.ok, `update_case_credentials ${result.status}: ${result.text}`).toBe(true);
}

export async function readCaseToolCredentials(
  page: Page,
  caseId: string,
): Promise<{ tools: IsolatedToolEntry[]; questionTools: IsolatedToolEntry[] }> {
  const { rest } = await restFor(page);
  const result = await rest.rpc<{
    tools?: IsolatedToolEntry[];
    questionTools?: IsolatedToolEntry[];
  }>("get_case_credentials", { p_case_id: caseId });
  expect(result.ok, `get_case_credentials ${result.status}: ${result.text}`).toBe(true);
  return {
    tools: Array.isArray(result.data?.tools) ? result.data.tools : [],
    questionTools: Array.isArray(result.data?.questionTools) ? result.data.questionTools : [],
  };
}

export async function seedCatSegmentViaRest(
  page: Page,
  opts: { name: string; src: string; tgt: string },
): Promise<{ fileId: string; segmentId: string; revision: number }> {
  const { token, rest } = await restFor(page);
  const projectId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const project = await restMutate(page.request, token, "POST", "cat_projects", {
    id: projectId,
    name: opts.name,
    source_langs: ["en-US"],
    target_langs: ["zh-TW"],
    env: "test",
  }, { Prefer: "return=minimal" });
  expect(project.ok, `無法判定覆寫：cat_projects ${project.status} ${project.text}`).toBe(true);

  const file = await restMutate(page.request, token, "POST", "cat_files", {
    id: fileId,
    project_id: projectId,
    name: `${opts.name}.xliff`,
    source_lang: "en-US",
    target_lang: "zh-TW",
    original_source_lang: "en-US",
    original_target_lang: "zh-TW",
    env: "test",
  }, { Prefer: "return=minimal" });
  expect(file.ok, `無法判定覆寫：cat_files ${file.status} ${file.text}`).toBe(true);

  const segment = await restMutate(page.request, token, "POST", "cat_segments", {
    id: segmentId,
    file_id: fileId,
    sheet_name: "Sheet1",
    row_idx: 0,
    source_text: opts.src,
    target_text: opts.tgt,
    xliff_tu_id: "1",
    global_id: 1,
    status: "",
  }, { Prefer: "return=minimal" });
  expect(segment.ok, `無法判定覆寫：cat_segments ${segment.status} ${segment.text}`).toBe(true);

  const rows = await rest.get<Array<{ id: string; segment_revision: number }>>(
    `cat_segments?select=id,segment_revision&id=eq.${segmentId}`,
  );
  return {
    fileId,
    segmentId: rows[0]?.id ?? segmentId,
    revision: rows[0]?.segment_revision ?? 0,
  };
}

export async function restMutate(
  request: APIRequestContext,
  token: string,
  method: "POST" | "PATCH" | "GET",
  pathAndQuery: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string; contentRange: string | null }> {
  const { url, anonKey } = localApi();
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...extraHeaders,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const abs = `${url}/rest/v1/${pathAndQuery}`;
  const res =
    method === "GET"
      ? await request.get(abs, { headers })
      : method === "POST"
        ? await request.post(abs, { headers, data: body })
        : await request.patch(abs, { headers, data: body });
  return {
    ok: res.ok(),
    status: res.status(),
    text: await res.text(),
    contentRange: res.headers()["content-range"] ?? null,
  };
}
