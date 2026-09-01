#!/usr/bin/env node
/**
 * P0-V：以 Data API 確認 private helper 不可經 PostgREST 直呼（第三次 Micro）。
 * 憑證：stdin 單行 JSON 或 MICRO3_API_CREDS_FILE（同 dual-client 規範；不讀 .env）。
 *
 * { "url","anonKey","member":{email,password} }
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";

async function readCreds() {
  const file = process.env.MICRO3_API_CREDS_FILE;
  if (file) {
    const raw = await readFile(file, "utf8");
    await unlink(file).catch(() => {});
    return JSON.parse(raw);
  }
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      if (line.trim()) return JSON.parse(line);
    }
  }
  throw new Error("missing creds via stdin or MICRO3_API_CREDS_FILE");
}

async function main() {
  const creds = await readCreds();
  const client = createClient(creds.url, creds.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword(creds.member);
  if (signErr) throw new Error(`member signIn: ${signErr.message}`);

  const helpers = [
    "public_tool_structure",
    "case_field_permission_allowed",
    "p0_admin_create_validate_payload",
  ];

  for (const fn of helpers) {
    const { error } = await client.rpc(fn, {});
    if (!error) {
      throw new Error(`RPC ${fn} should not be reachable via Data API`);
    }
    const msg = error.message || "";
    if (!/Could not find the function|function .* does not exist|permission denied|PGRST202/i.test(msg)) {
      throw new Error(`unexpected RPC block for ${fn}: ${msg}`);
    }
  }

  // cases_visible join + scalar subquery must not leak masked client
  const { data, error } = await client
    .from("cases_visible")
    .select("id, client")
    .ilike("client", "%secret%")
    .limit(5);
  if (error) throw error;
  if ((data || []).some((r) => r.client && String(r.client).includes("secret"))) {
    throw new Error("cases_visible filter leaked masked client");
  }

  const { count, error: cntErr } = await client
    .from("cases_visible")
    .select("*", { count: "exact", head: true })
    .ilike("keyword", "%secret-kw%");
  if (cntErr) throw cntErr;
  if (count > 0) throw new Error("cases_visible count leaked masked keyword");

  await client.auth.signOut();
  console.log("micro3-definer-view-api-check: PASS");
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
