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

    const body = await req.json();
    const recipientEmails: string[] = Array.isArray(body.recipient_emails) ? body.recipient_emails : [];
    const message: string = typeof body.message === "string" ? body.message : "";

    if (!message.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uniqueEmails = [...new Set(recipientEmails.map((e) => String(e).trim().toLowerCase()))].filter(Boolean);
    if (uniqueEmails.length === 0) {
      return new Response(JSON.stringify({ error: "recipient_emails required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const email of uniqueEmails) {
      const lookup = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const lu = await lookup.json();
      if (!lu.ok || !lu.user?.id) {
        results.push({ email, ok: false, error: lu.error || "user_not_found" });
        continue;
      }

      const open = await slackApi(token, "conversations.open", { users: lu.user.id });
      if (!open.ok || !open.channel?.id) {
        results.push({ email, ok: false, error: open.error || "open_dm_failed" });
        continue;
      }

      const post = await slackApi(token, "chat.postMessage", {
        channel: open.channel.id,
        text: message,
      });

      if (!post.ok) {
        results.push({ email, ok: false, error: post.error || "post_failed" });
        continue;
      }

      results.push({ email, ok: true });
    }

    const failed = results.filter((r) => !r.ok);
    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
