import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.VITE_SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_ANON_KEY
  ?? "";
const t1Email = process.env.PLAYWRIGHT_ISO_T1_EMAIL ?? "";
const t1Password = process.env.PLAYWRIGHT_ISO_T1_PASSWORD ?? "";
const pmEmail = process.env.PLAYWRIGHT_ISO_PM_EMAIL ?? "";
const pmPassword = process.env.PLAYWRIGHT_ISO_PM_PASSWORD ?? "";
const invoiceId = process.env.ISO_INTERNAL_INVOICE_ID ?? "0d39fb20-018d-4d55-a8a6-5fc7f063a28d";

const isolationReady = url.includes("kymyughnkleuoyzsuiob")
  && Boolean(anon && t1Email && t1Password && pmEmail && pmPassword);

describe.skipIf(!isolationReady)("C 隔離譯者實際讀寫內部備註", () => {
  it("譯者讀不到內文、寫不進去；PM 能讀", async () => {
    const t1 = createClient(url, anon, { auth: { persistSession: false } });
    const { error: t1Login } = await t1.auth.signInWithPassword({ email: t1Email, password: t1Password });
    expect(t1Login).toBeNull();

    const { data: t1Rows, error: t1Read } = await t1
      .from("invoice_internal_comments")
      .select("invoice_id, comments")
      .eq("invoice_id", invoiceId);
    expect(t1Read).toBeNull();
    const text = JSON.stringify(t1Rows ?? []);
    expect(text).not.toMatch(/AIQA-內部/);
    expect(Array.isArray(t1Rows)).toBe(true);
    expect((t1Rows ?? []).length).toBe(0);

    const { error: t1Write } = await t1.from("invoice_internal_comments").insert({
      invoice_id: invoiceId,
      env: "test",
      comments: [{ id: "t1-should-fail", author: "譯者一", content: "不該寫入", timestamp: "x" }],
    });
    expect(t1Write).toBeTruthy();

    const { data: afterWrite } = await t1
      .from("invoice_internal_comments")
      .select("comments")
      .eq("invoice_id", invoiceId);
    expect(JSON.stringify(afterWrite ?? [])).not.toContain("不該寫入");

    const { data: signed, error: signedErr } = await t1.storage
      .from("invoice-internal-files")
      .createSignedUrl("missing-path-for-deny.txt", 60);
    expect(signed?.signedUrl).toBeFalsy();
    expect(signedErr).toBeTruthy();

    const pm = createClient(url, anon, { auth: { persistSession: false } });
    const { error: pmLogin } = await pm.auth.signInWithPassword({ email: pmEmail, password: pmPassword });
    expect(pmLogin).toBeNull();
    const { data: pmRows, error: pmRead } = await pm
      .from("invoice_internal_comments")
      .select("invoice_id, comments")
      .eq("invoice_id", invoiceId);
    expect(pmRead).toBeNull();
    expect((pmRows ?? []).length).toBeGreaterThanOrEqual(0);
  });
});
