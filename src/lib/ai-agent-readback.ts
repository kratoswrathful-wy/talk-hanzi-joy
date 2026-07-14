/**
 * AI agent bridge：寫入本地 store 後的短輪詢回讀。
 * 避免 optimistic／realtime／reload 競態造成「寫成功卻立刻 getById 失敗」的假失敗。
 */
import { type AgentResult, agentFail, agentOk } from "@/lib/ai-agent-types";

export const STORE_READBACK_TIMEOUT_MS = 3000;
export const STORE_READBACK_INTERVAL_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 輪詢讀取本地 store，直到得到非 null／undefined，或逾時回 null。
 */
export async function awaitStoreReadback<T>(
  read: () => T | null | undefined,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<T | null> {
  const timeoutMs = options?.timeoutMs ?? STORE_READBACK_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? STORE_READBACK_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value != null) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/** 真正寫入失敗（DB／RLS 等）——呼叫端可依情況重試寫入。 */
export function failWriteFailed(entityLabel: string, detail?: string): AgentResult<never> {
  const suffix = detail && String(detail).trim() ? `：${String(detail).trim()}` : "";
  return agentFail(`寫入失敗（${entityLabel}）${suffix}`);
}

/**
 * 寫入路徑已完成，但本地 store 回讀逾時。
 * 呼叫端（含 AI agent）應以 get(id) 確認，**勿重寫**以免重複資料。
 */
export function failReadbackTimedOut(entityLabel: string, id: string): AgentResult<never> {
  return agentFail(
    `寫入成功但回讀逾時（${entityLabel} id=${id}）：本地 store 暫不可見，請用 get(id) 確認，勿重寫`,
  );
}

/** 短輪詢回讀；成功回 ok(data)，逾時回 failReadbackTimedOut。 */
export async function readbackAfterWrite<T>(
  entityLabel: string,
  id: string,
  read: () => T | null | undefined,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<AgentResult<T>> {
  const data = await awaitStoreReadback(read, options);
  if (data == null) return failReadbackTimedOut(entityLabel, id);
  return agentOk(data);
}
