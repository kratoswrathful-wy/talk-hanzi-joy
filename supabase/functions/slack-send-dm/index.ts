import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

async function slackApi(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function lookupSlackUserIdByEmail(
  token: string,
  email: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const lookup = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const lu = await lookup.json();
  if (!lu.ok || !lu.user?.id) {
    return { ok: false, error: (lu.error as string) || "user_not_found" };
  }
  return { ok: true, userId: lu.user.id as string };
}

/** Open DM and post; used for both stored Slack id and email-resolved id */
async function openDmAndPostMessage(
  token: string,
  slackMemberId: string,
  message: string,
  notificationFallback: string,
): Promise<{ ok: true } | { ok: false; stage: "open" | "post"; error: string }> {
  const open = await slackApi(token, "conversations.open", { users: slackMemberId });
  if (!open.ok || !open.channel?.id) {
    return { ok: false, stage: "open", error: (open.error as string) || "open_dm_failed" };
  }
  const post = await slackApi(token, "chat.postMessage", {
    channel: open.channel.id,
    text: notificationFallback,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: message },
      },
    ],
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!post.ok) {
    return { ok: false, stage: "post", error: (post.error as string) || "post_failed" };
  }
  return { ok: true };
}

/**
 * 承接／無法承接：目標優先使用 OAuth 寫入的 Slack user id（與 profiles.email 是否一致無關）。
 * 只有在 open/post 失敗時，才依 profiles.email 做備援 lookupByEmail 重試。
 */
type CaseReplyRecipient = {
  userId: string;
  /** 僅供 API 回傳／前端顯示，不作路由依據 */
  profileEmail: string;
  slackUserId: string;
};

async function resolveCaseReplyRecipients(
  supabase: ReturnType<typeof createClient>,
  senderUserId: string,
): Promise<CaseReplyRecipient[]> {
  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["pm", "executive"]);

  if (roleErr || !roleRows?.length) {
    return [];
  }

  const pmExecIds = [...new Set(roleRows.map((r: { user_id: string }) => r.user_id))];

  const { data: linkedRows, error: linkErr } = await supabase
    .from("user_slack_meta")
    .select("user_id, slack_user_id")
    .in("user_id", pmExecIds);

  if (linkErr || !linkedRows?.length) {
    return [];
  }

  const slackIdByUserId = new Map<string, string>();
  for (const r of linkedRows as { user_id: string; slack_user_id: string | null }[]) {
    if (r.slack_user_id) slackIdByUserId.set(r.user_id, r.slack_user_id);
  }

  const linkedIdSet = new Set(linkedRows.map((r: { user_id: string }) => r.user_id));

  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("id, email, receive_translator_case_reply_slack_dms")
    .in("id", [...linkedIdSet]);

  if (profErr || !profs?.length) {
    return [];
  }

  const out: CaseReplyRecipient[] = [];
  for (const p of profs as {
    id: string;
    email: string;
    receive_translator_case_reply_slack_dms?: boolean | null;
  }[]) {
    if (!linkedIdSet.has(p.id)) continue;
    if (p.receive_translator_case_reply_slack_dms === false) continue;
    if (p.id === senderUserId) continue;
    const sid = slackIdByUserId.get(p.id);
    if (!sid) continue;
    out.push({
      userId: p.id,
      profileEmail: String(p.email || "").trim().toLowerCase() || p.id,
      slackUserId: sid,
    });
  }

  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const caseReplyNotification = body.case_reply_notification === true;

    if (!caseReplyNotification) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["pm", "executive"]);

      if (!roles?.length) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: cred, error: credErr } = await supabase
      .from("user_slack_credentials")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credErr || !cred?.access_token) {
      return new Response(JSON.stringify({ error: "Slack not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = cred.access_token as string;

    const message: string = typeof body.message === "string" ? body.message : "";
    const notificationFallback: string =
      typeof body.notification_fallback === "string" && body.notification_fallback.trim()
        ? body.notification_fallback.trim()
        : message.split("\n")[0]?.slice(0, 300) || "詢案訊息";

    if (!message.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    if (caseReplyNotification) {
      const caseReplyRecipients = await resolveCaseReplyRecipients(supabase, user.id);

      if (caseReplyRecipients.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            results: [] as { email: string; ok: boolean; error?: string }[],
            skipped: "no_recipients_after_filter",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      for (const rec of caseReplyRecipients) {
        const sent = await openDmAndPostMessage(token, rec.slackUserId, message, notificationFallback);
        if (sent.ok) {
          results.push({ email: rec.profileEmail, ok: true });
        } else {
          // Fallback: try by email only after open/post fails.
          const lu = await lookupSlackUserIdByEmail(token, rec.profileEmail);
          if (lu.ok) {
            const retry = await openDmAndPostMessage(token, lu.userId, message, notificationFallback);
            if (retry.ok) {
              results.push({ email: rec.profileEmail, ok: true });
              continue;
            }
            results.push({
              email: rec.profileEmail,
              ok: false,
              error: `${sent.stage}:${sent.error};fallback:${retry.stage}:${retry.error}`,
            });
          } else {
            results.push({
              email: rec.profileEmail,
              ok: false,
              error: `${sent.stage}:${sent.error}`,
            });
          }
        }
      }
    } else {
      const recipientEmails: string[] = Array.isArray(body.recipient_emails) ? body.recipient_emails : [];
      const uniqueEmails = [...new Set(recipientEmails.map((e) => String(e).trim().toLowerCase()))].filter(Boolean);

      if (uniqueEmails.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            results: [] as { email: string; ok: boolean; error?: string }[],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      for (const email of uniqueEmails) {
        const lu = await lookupSlackUserIdByEmail(token, email);
        if (!lu.ok) {
          results.push({ email, ok: false, error: lu.error });
          continue;
        }

        const sent = await openDmAndPostMessage(token, lu.userId, message, notificationFallback);
        if (!sent.ok) {
          results.push({ email, ok: false, error: `${sent.stage}:${sent.error}` });
          continue;
        }

        results.push({ email, ok: true });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
