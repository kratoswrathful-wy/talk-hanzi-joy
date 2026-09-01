import { supabase } from "@/integrations/supabase/client";

export type OwnSlackMetaRow = {
  user_id: string;
  slack_user_id: string;
  slack_team_id: string | null;
};

/** 讀取目前登入者的 Slack 連結 meta（經 RPC；不可直查 user_slack_meta）。 */
export async function fetchOwnSlackMeta(): Promise<OwnSlackMetaRow | null> {
  const { data, error } = await supabase.rpc("get_own_slack_meta");
  if (error) throw error;
  const row = (data as OwnSlackMetaRow[] | null)?.[0];
  return row ?? null;
}
