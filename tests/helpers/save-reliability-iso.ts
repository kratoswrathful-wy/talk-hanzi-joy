import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { accessToken, localApi, restClient, type RestClient } from "./isolated-api";

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
