import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * 重置測試環境：清除所有 env='test' 的資料（LMS + CAT + Storage），可選擇種子資料。
 *
 * 安全：僅「真人執行長」（executive 角色且 email 非 @test.local）可呼叫。
 * 僅刪除 env='test'，不會動到任何正式資料。
 */

const CAT_ORIGINAL_FILES_BUCKET = "cat-original-files";
const CAT_NOTES_IMAGES_BUCKET = "cat-notes-images";

async function removeTestStorageRecursive(admin: ReturnType<typeof createClient>, bucket: string) {
  // 測試檔案一律放在 test/ 前綴底下；遞迴列出後刪除。
  const toRemove: string[] = [];
  const walk = async (prefix: string) => {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data) return;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // 資料夾項目的 id 為 null；檔案有 id。
      if ((entry as { id: string | null }).id === null) {
        await walk(full);
      } else {
        toRemove.push(full);
      }
    }
  };
  await walk("test");
  if (toRemove.length > 0) {
    // 分批刪，避免單次過大
    for (let i = 0; i < toRemove.length; i += 100) {
      await admin.storage.from(bucket).remove(toRemove.slice(i, i + 100));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 驗證呼叫者為真人執行長
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerIsTest = (caller.email ?? "").toLowerCase().endsWith("@test.local");
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const callerIsExecutive = (roleRows ?? []).some((r: { role: string }) => r.role === "executive");
    if (!callerIsExecutive || callerIsTest) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { seed } = await req.json().catch(() => ({ seed: false }));

    // 1. 先清 Storage（測試原始檔、筆記圖片）
    await removeTestStorageRecursive(admin, CAT_ORIGINAL_FILES_BUCKET);
    await removeTestStorageRecursive(admin, CAT_NOTES_IMAGES_BUCKET);

    // 2. 刪除 env='test' 資料（有 ON DELETE CASCADE 的母表會帶走子表）
    //    CAT：cat_projects → cat_files / cat_segments / cat_workspace_notes；cat_tms → cat_tm_segments
    await admin.from("cat_projects").delete().eq("env", "test");
    await admin.from("cat_tms").delete().eq("env", "test");
    await admin.from("cat_tbs").delete().eq("env", "test");
    //    LMS
    await admin.from("invoice_fees").delete().eq("env", "test");
    await admin.from("invoices").delete().eq("env", "test");
    await admin.from("client_invoice_fees").delete().eq("env", "test");
    await admin.from("client_invoices").delete().eq("env", "test");
    await admin.from("fees").delete().eq("env", "test");
    await admin.from("internal_notes").delete().eq("env", "test");
    await admin.from("cases").delete().eq("env", "test");
    await admin.from("icon_library").delete().eq("env", "test");

    // 3. 種子資料（可選）：建立幾個示範案件
    if (seed === true) {
      await admin.from("cases").insert([
        { title: "【測試】示範案件 A", category: "測試", task_status: "進行中", env: "test", created_by: caller.id },
        { title: "【測試】示範案件 B", category: "測試", task_status: "待處理", env: "test", created_by: caller.id },
      ]);
    }

    return new Response(JSON.stringify({ success: true, seeded: seed === true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
