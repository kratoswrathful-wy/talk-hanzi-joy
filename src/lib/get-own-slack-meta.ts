import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OwnSlackMetaRow = {
  user_id: string;
  slack_user_id: string;
  slack_team_id: string | null;
};

export type OwnSlackMetaLoadResult =
  | { ok: true; meta: OwnSlackMetaRow | null }
  | { ok: false; error: { message: string; code?: string } };

export type OwnSlackMetaStatus =
  | { kind: "loading" }
  | { kind: "connected"; slackUserId: string }
  | { kind: "not_connected" }
  | { kind: "error"; message: string };

export const OWN_SLACK_META_LOAD_ERROR_MESSAGE =
  "無法讀取 Slack 連結狀態，請稍後再試。";

/** 讀取目前登入者的 Slack 連結 meta（經 RPC；不可直查 Slack 表）。 */
export async function fetchOwnSlackMeta(): Promise<OwnSlackMetaLoadResult> {
  try {
    const { data, error } = await supabase.rpc("get_own_slack_meta");
    if (error) {
      return {
        ok: false,
        error: { message: error.message, code: error.code },
      };
    }
    const row = (data as OwnSlackMetaRow[] | null)?.[0];
    return { ok: true, meta: row ?? null };
  } catch (e) {
    return {
      ok: false,
      error: {
        message: e instanceof Error ? e.message : "unknown",
      },
    };
  }
}

export function mapOwnSlackMetaLoadResult(result: OwnSlackMetaLoadResult): OwnSlackMetaStatus {
  if (!result.ok) {
    return { kind: "error", message: OWN_SLACK_META_LOAD_ERROR_MESSAGE };
  }
  if (!result.meta) {
    return { kind: "not_connected" };
  }
  return { kind: "connected", slackUserId: result.meta.slack_user_id };
}

/** 含 stale／unmount guard 的 Slack 綁定狀態讀取。 */
export function useOwnSlackMetaStatus(
  enabled: boolean,
  userId: string | null | undefined,
) {
  const [status, setStatus] = useState<OwnSlackMetaStatus>({ kind: "loading" });
  const requestIdRef = useRef(0);
  const active = enabled && !!userId;

  const reload = useCallback(async () => {
    if (!userId) {
      requestIdRef.current += 1;
      setStatus({ kind: "not_connected" });
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus({ kind: "loading" });
    const result = await fetchOwnSlackMeta();
    if (requestId !== requestIdRef.current) return;
    setStatus(mapOwnSlackMetaLoadResult(result));
  }, [userId]);

  useEffect(() => {
    if (!active) {
      requestIdRef.current += 1;
      setStatus({ kind: "not_connected" });
      return;
    }

    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [active, userId, reload]);

  return { status, reload };
}
