import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * 測試模式身分切換：核發 magic link token 供前端 verifyOtp 免密碼登入。
 *
 * 授權規則（防止假帳號跳進真人帳號）：
 *   - 允許切換到「自己」（target === 呼叫者 email）—— 用於進入測試模式前預先取得返回票。
 *   - 允許切換到 @test.local 測試帳，但呼叫者必須是「真人執行長」或「測試帳號」。
 *   - 其餘一律 403。
 */

const TEST_EMAIL_SUFFIX = "@test.local";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. 驗證呼叫者（在函式內驗證 JWT，config.toml 設 verify_jwt = false）
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerEmail = (caller.email ?? "").toLowerCase();
    const targetEmail = String(email).toLowerCase();
    const isSelf = targetEmail === callerEmail;
    const targetIsTest = targetEmail.endsWith(TEST_EMAIL_SUFFIX);

    // 呼叫者身分：是否為測試帳號、是否為執行長
    const callerIsTest = callerEmail.endsWith(TEST_EMAIL_SUFFIX);
    let callerIsExecutive = false;
    {
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);
      callerIsExecutive = (roleRows ?? []).some((r: { role: string }) => r.role === "executive");
    }

    const allowed = isSelf || (targetIsTest && (callerIsExecutive || callerIsTest));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. 核發 magic link token
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error || !data) {
      return new Response(JSON.stringify({ error: error?.message || "failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(data.properties.action_link);
    const token = url.searchParams.get("token");
    const type = url.searchParams.get("type");

    return new Response(JSON.stringify({ token, type, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
