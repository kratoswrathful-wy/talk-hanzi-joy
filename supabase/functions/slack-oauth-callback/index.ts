import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const err = url.searchParams.get("error");
    const siteUrl = (Deno.env.get("SITE_URL") || Deno.env.get("SLACK_OAUTH_FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, "");

    if (err) {
      return Response.redirect(`${siteUrl}/settings?slack_error=${encodeURIComponent(err)}`);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return Response.redirect(`${siteUrl}/settings?slack_error=missing_params`);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error: stErr } = await supabase
      .from("slack_oauth_states")
      .select("user_id, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (stErr || !row || new Date(row.expires_at) < new Date()) {
      return Response.redirect(`${siteUrl}/settings?slack_error=invalid_or_expired_state`);
    }

    const clientId = Deno.env.get("SLACK_CLIENT_ID");
    const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
    const redirectUri = Deno.env.get("SLACK_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return Response.redirect(`${siteUrl}/settings?slack_error=server_config`);
    }

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const json = await tokenRes.json();
    if (!json.ok) {
      console.error("oauth.v2.access", json);
      return Response.redirect(
        `${siteUrl}/settings?slack_error=${encodeURIComponent(json.error || "oauth_failed")}`
      );
    }

    const authed = json.authed_user;
    const userToken = authed?.access_token as string | undefined;
    const slackUserId = authed?.id as string | undefined;
    const teamId = json.team?.id as string | undefined;

    if (!userToken || !slackUserId) {
      console.error("Missing user token in response", json);
      return Response.redirect(`${siteUrl}/settings?slack_error=no_user_token`);
    }

    const { error: upCred } = await supabase.from("user_slack_credentials").upsert(
      {
        user_id: row.user_id,
        access_token: userToken,
        refresh_token: authed?.refresh_token ?? null,
        token_expires_at: null,
        slack_user_id: slackUserId,
        slack_team_id: teamId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upCred) {
      console.error(upCred);
      return Response.redirect(`${siteUrl}/settings?slack_error=save_failed`);
    }

    const { error: upMeta } = await supabase.from("user_slack_meta").upsert(
      {
        user_id: row.user_id,
        slack_user_id: slackUserId,
        slack_team_id: teamId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upMeta) {
      console.error(upMeta);
    }

    await supabase.from("slack_oauth_states").delete().eq("state", state);

    return Response.redirect(`${siteUrl}/settings?slack=connected`);
  } catch (e) {
    console.error(e);
    const siteUrl = (Deno.env.get("SITE_URL") || "http://localhost:5173").replace(/\/$/, "");
    return Response.redirect(`${siteUrl}/settings?slack_error=exception`);
  }
});
