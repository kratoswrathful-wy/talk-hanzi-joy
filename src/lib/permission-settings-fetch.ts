const DEFAULT_PERM_FETCH_TIMEOUT_MS = 10_000;
let permFetchTimeoutMs = DEFAULT_PERM_FETCH_TIMEOUT_MS;

export function setPermissionFetchTimeoutMs(ms: number | null) {
  permFetchTimeoutMs = ms ?? DEFAULT_PERM_FETCH_TIMEOUT_MS;
}

export function getPermissionFetchTimeoutMs() {
  return permFetchTimeoutMs;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export type PermissionRowResult = {
  data: { config: unknown } | null;
  error: { message?: string } | null;
};

export type PermissionFetchResult =
  | { ok: true; data: { config: unknown } | null }
  | { ok: false; error: string };

/**
 * Bounded fetch for permission_settings.
 * 永不 settle 的查詢會在 timeout 後 fail-closed（ok:false），讓路由 spinner 得以結束。
 */
export async function fetchPermissionConfigBounded(
  queryFn: () => Promise<PermissionRowResult>,
  timeoutMs: number = permFetchTimeoutMs,
): Promise<PermissionFetchResult> {
  try {
    const { data, error } = await withTimeout(queryFn(), timeoutMs, "permission_settings");
    if (error) {
      return { ok: false, error: error.message || "permission_settings_error" };
    }
    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "permission_settings_error";
    return { ok: false, error: message };
  }
}
