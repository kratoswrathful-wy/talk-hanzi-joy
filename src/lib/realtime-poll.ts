import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";

/**
 * Creates a polling fallback for a Supabase table.
 * Checks max(updated_at) every `interval` ms; calls `onChanged` when it differs.
 */
export function createPollFallback(
  table: string,
  onChanged: () => void,
  interval = 3000
) {
  let lastMaxUpdatedAt: string | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  async function poll() {
    if (!active) return;
    try {
      const env = getEnvironment();
      const { data } = await supabase
        .from(table as any)
        .select("updated_at")
        .eq("env", env)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latest = (data as any)?.updated_at ?? null;
      if (lastMaxUpdatedAt !== null && latest !== lastMaxUpdatedAt) {
        onChanged();
      }
      lastMaxUpdatedAt = latest;
    } catch {
      // ignore polling errors
    }
    if (active) timerId = setTimeout(poll, interval);
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastMaxUpdatedAt = null;
      timerId = setTimeout(poll, interval);
    },
    stop() {
      active = false;
      if (timerId) clearTimeout(timerId);
      timerId = null;
    },
    reset() {
      lastMaxUpdatedAt = null;
    },
  };
}
