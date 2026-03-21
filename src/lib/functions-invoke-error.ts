/**
 * supabase.functions.invoke 在 HTTP 非 2xx 時仍可能帶回已解析的 JSON body（例如 `{ error: "..." }`），
 * 但 error.message 常為泛用「Edge Function returned a non-2xx status code」。此函式優先顯示後端回傳的 error 字串。
 */
export function messageFromFunctionsInvokeError(error: unknown, data: unknown): string {
  if (data && typeof data === "object" && data !== null && "error" in data) {
    const bodyErr = (data as { error?: unknown }).error;
    if (typeof bodyErr === "string" && bodyErr.trim()) {
      return bodyErr.trim();
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Edge Function 發生錯誤";
}

const GENERIC_NON_2XX = "Edge Function returned a non-2xx status code";

/**
 * 若 body 未含 `error` 欄位，嘗試從 FunctionsHttpError 的 Response（`context`）再讀一次 JSON。
 */
export async function messageFromFunctionsInvokeErrorAsync(
  error: unknown,
  data: unknown,
): Promise<string> {
  const fromBody = messageFromFunctionsInvokeError(error, data);
  if (fromBody !== GENERIC_NON_2XX && fromBody !== "Edge Function 發生錯誤") {
    return fromBody;
  }

  const ctx = error && typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;

  if (ctx instanceof Response) {
    try {
      const json: unknown = await ctx.clone().json();
      if (json && typeof json === "object" && json !== null && "error" in json) {
        const e = (json as { error?: unknown }).error;
        if (typeof e === "string" && e.trim()) {
          return e.trim();
        }
      }
    } catch {
      /* ignore */
    }
  }

  return fromBody;
}
