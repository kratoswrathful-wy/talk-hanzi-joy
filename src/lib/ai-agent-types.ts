/** 結構化回傳（LMS / TMS AI bridge 共用） */
export type AgentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; allowed?: string[] };

export function agentOk<T>(data: T): AgentResult<T> {
  return { ok: true, data };
}

export function agentFail(error: string, allowed?: string[]): AgentResult<never> {
  return { ok: false, error, allowed };
}

export function agentFailFrom(result: Extract<AgentResult<unknown>, { ok: false }>): AgentResult<never> {
  return agentFail(result.error, result.allowed);
}
