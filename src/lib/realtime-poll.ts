import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";

const isBrowser = typeof document !== "undefined";

/** 可輪詢的資料表：須同時具備 `updated_at`／`env` 欄位，僅列出目前實際呼叫端使用的表名。 */
type PollableTable =
  | "invoices"
  | "fees"
  | "internal_notes"
  | "client_invoices"
  | "cases";

/**
 * Creates a polling fallback for a Supabase table.
 * Checks max(updated_at) every `interval` ms; calls `onChanged` when it differs.
 *
 * 效能（W3）：分頁不在前景（`document.visibilityState !== 'visible'`）時跳過本輪查詢，
 * 回到前景時立即補跑一次，避免背景分頁持續空打資料庫。
 */
export function createPollFallback(
  table: PollableTable,
  onChanged: () => void,
  interval = 30000
) {
  let lastMaxUpdatedAt: string | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  async function checkOnce() {
    try {
      const env = getEnvironment();
      const { data } = await supabase
        .from(table)
        .select("updated_at")
        .eq("env", env)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latest = data?.updated_at ?? null;
      if (lastMaxUpdatedAt !== null && latest !== lastMaxUpdatedAt) {
        onChanged();
      }
      lastMaxUpdatedAt = latest;
    } catch {
      // ignore polling errors
    }
  }

  async function poll() {
    if (!active) return;
    // 背景分頁跳過查詢；回前景由 visibilitychange 立即補跑
    if (!isBrowser || document.visibilityState === "visible") {
      await checkOnce();
    }
    if (active) timerId = setTimeout(poll, interval);
  }

  function onVisibilityChange() {
    if (active && isBrowser && document.visibilityState === "visible") {
      // 回到前景：立即補跑一次，補上背景期間的變更
      void checkOnce();
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastMaxUpdatedAt = null;
      if (isBrowser) {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      timerId = setTimeout(poll, interval);
    },
    stop() {
      active = false;
      if (timerId) clearTimeout(timerId);
      timerId = null;
      if (isBrowser) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    },
    reset() {
      lastMaxUpdatedAt = null;
    },
  };
}
