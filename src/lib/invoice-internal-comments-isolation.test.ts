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
const filePath = process.env.ISO_INTERNAL_FILE_PATH
  ?? "invoice-internal/d2b07a27-ade0-406f-a9ec-f9932f61660b/8e1e019d-adc6-4794-9192-282cb93cb313.txt";

const isolationReady = url.includes("kymyughnkleuoyzsuiob")
  && Boolean(anon && t1Email && t1Password && pmEmail && pmPassword);

describe.skipIf(!isolationReady)("C 隔離譯者實際讀寫內部備註", () => {
  it("譯者讀不到內文、寫不進去、申請不到簽章；PM 能讀能開", async () => {
    const t1 = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: t1Login } = await t1.auth.signInWithPassword({ email: t1Email, password: t1Password });
    expect(t1Login).toBeNull();
    const { data: t1User } = await t1.auth.getUser();
    expect(t1User.user?.email).toBe(t1Email);

    const { data: t1Rows, error: t1Read } = await t1
      .from("invoice_internal_comments")
      .select("invoice_id, comments")
      .eq("invoice_id", invoiceId);
    expect(t1Read).toBeNull();
    const t1Text = JSON.stringify(t1Rows ?? []);
    expect(t1Text).not.toMatch(/AIQA-內部/);
    expect(t1Text).not.toMatch(/data:image\//);
    expect(Array.isArray(t1Rows)).toBe(true);
    expect((t1Rows ?? []).length).toBe(0);

    const { error: t1Write } = await t1.from("invoice_internal_comments").insert({
      invoice_id: invoiceId,
      env: "test",
      comments: [{ id: "t1-should-fail", author: "譯者一", content: "不該寫入", timestamp: "x" }],
    });
    expect(t1Write).toBeTruthy();

    const { data: t1Updated, error: t1Update } = await t1
      .from("invoice_internal_comments")
      .update({ comments: [{ id: "t1-update-fail", author: "譯者一", content: "不該改", timestamp: "x" }] })
      .eq("invoice_id", invoiceId)
      .select("invoice_id");
    expect(t1Update).toBeNull();
    expect(t1Updated ?? []).toHaveLength(0);

    const { data: afterWrite } = await t1
      .from("invoice_internal_comments")
      .select("comments")
      .eq("invoice_id", invoiceId);
    expect(JSON.stringify(afterWrite ?? [])).not.toContain("不該寫入");
    expect(JSON.stringify(afterWrite ?? [])).not.toContain("不該改");

    const { data: t1Signed, error: t1SignedErr } = await t1.storage
      .from("invoice-internal-files")
      .createSignedUrl(filePath, 60);
    expect(t1Signed?.signedUrl).toBeFalsy();
    expect(t1SignedErr).toBeTruthy();

    const pm = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: pmLogin } = await pm.auth.signInWithPassword({ email: pmEmail, password: pmPassword });
    expect(pmLogin).toBeNull();
    const { data: pmRows, error: pmRead } = await pm
      .from("invoice_internal_comments")
      .select("invoice_id, comments")
      .eq("invoice_id", invoiceId);
    expect(pmRead).toBeNull();
    expect((pmRows ?? []).length).toBeGreaterThan(0);
    const pmText = JSON.stringify(pmRows ?? []);
    expect(pmText).toMatch(/AIQA-內部/);
    expect(pmText).not.toContain("不該寫入");
    expect(pmText).not.toContain("不該改");

    const { data: pmSigned, error: pmSignedErr } = await pm.storage
      .from("invoice-internal-files")
      .createSignedUrl(filePath, 60);
    expect(pmSignedErr).toBeNull();
    expect(pmSigned?.signedUrl).toMatch(/^https:\/\//);
    expect(pmSigned?.signedUrl).toContain("invoice-internal-files");
  });
});
