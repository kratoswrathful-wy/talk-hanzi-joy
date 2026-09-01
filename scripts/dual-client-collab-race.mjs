#!/usr/bin/env node
/**
 * 真正雙 authenticated client 競態驗收（第三次 Micro 專用）。
 *
 * 前置：.env 或 .env.playwright.local 含
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD（PM，用於建案）
 *   P0_RACE_MEMBER1_EMAIL / P0_RACE_MEMBER1_PASSWORD
 *   P0_RACE_MEMBER2_EMAIL / P0_RACE_MEMBER2_PASSWORD
 *
 * 用法：node scripts/dual-client-collab-race.mjs
 */
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const file of [".env", ".env.playwright.local"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* optional */
    }
  }
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const pmEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const pmPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
const m1Email = process.env.P0_RACE_MEMBER1_EMAIL;
const m1Password = process.env.P0_RACE_MEMBER1_PASSWORD;
const m2Email = process.env.P0_RACE_MEMBER2_EMAIL;
const m2Password = process.env.P0_RACE_MEMBER2_PASSWORD;

function requireEnv(name, value) {
  if (!value) {
    console.error(`缺少環境變數 ${name}`);
    process.exit(2);
  }
}

requireEnv("SUPABASE_URL", url);
requireEnv("SUPABASE_ANON_KEY", anonKey);
requireEnv("PLAYWRIGHT_TEST_EMAIL", pmEmail);
requireEnv("PLAYWRIGHT_TEST_PASSWORD", pmPassword);
requireEnv("P0_RACE_MEMBER1_EMAIL", m1Email);
requireEnv("P0_RACE_MEMBER1_PASSWORD", m1Password);
requireEnv("P0_RACE_MEMBER2_EMAIL", m2Email);
requireEnv("P0_RACE_MEMBER2_PASSWORD", m2Password);

async function signIn(email, password) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { client, user: data.user, session: data.session };
}

async function assertIdentity(label, client, user) {
  const { data: roles, error: roleErr } = await client.from("user_roles").select("role").eq("user_id", user.id);
  if (roleErr) throw roleErr;
  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("is_test, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) throw profErr;
  console.log(`[${label}] uid=${user.id} roles=${(roles || []).map((r) => r.role).join(",")} is_test=${profile?.is_test} display_name=${profile?.display_name ?? ""}`);
}

async function main() {
  const pm = await signIn(pmEmail, pmPassword);
  const m1 = await signIn(m1Email, m1Password);
  const m2 = await signIn(m2Email, m2Password);

  await assertIdentity("PM", pm.client, pm.user);
  await assertIdentity("M1", m1.client, m1.user);
  await assertIdentity("M2", m2.client, m2.user);

  const caseId = crypto.randomUUID();
  const collabRowId = `race-${Date.now()}`;

  const createRes = await pm.client.rpc("admin_create_case", {
    p_case_id: caseId,
    p_payload: {
      title: "[P0-RACE] dual client collab",
      status: "inquiry",
      client: "RaceCo",
      multi_collab: true,
      collab_rows: [
        {
          id: collabRowId,
          segment: "1-50",
          translator: "",
          unitCount: 100,
          accepted: false,
        },
      ],
    },
  });
  if (createRes.error || createRes.data?.ok !== true) {
    throw new Error(`admin_create_case failed: ${JSON.stringify(createRes)}`);
  }

  const { data: caseRow, error: caseErr } = await pm.client
    .from("cases_visible")
    .select("revision")
    .eq("id", caseId)
    .single();
  if (caseErr) throw caseErr;
  const revision = caseRow.revision;

  const attempt = (client, label) =>
    client.rpc("accept_inquiry_collab_row", {
      p_case_id: caseId,
      p_collab_row_id: collabRowId,
      p_expected_revision: revision,
    }).then((res) => ({ label, res }));

  const [r1, r2] = await Promise.all([attempt(m1.client, "M1"), attempt(m2.client, "M2")]);

  const oks = [r1, r2].filter((r) => r.res.data?.ok === true);
  const fails = [r1, r2].filter((r) => r.res.data?.ok !== true);

  console.log("M1:", JSON.stringify(r1.res.data ?? r1.res.error));
  console.log("M2:", JSON.stringify(r2.res.data ?? r2.res.error));

  if (oks.length !== 1 || fails.length !== 1) {
    throw new Error(`expected exactly one success; got ok=${oks.length} fail=${fails.length}`);
  }

  const failErr = fails[0].res.data?.error || fails[0].res.error?.message;
  if (!/case_revision_conflict|case_unavailable|collab_row_not_assigned_to_actor/i.test(String(failErr))) {
    throw new Error(`unexpected failure error: ${failErr}`);
  }

  const { data: afterCase, error: afterErr } = await pm.client
    .from("cases_visible")
    .select("revision, collab_rows")
    .eq("id", caseId)
    .single();
  if (afterErr) throw afterErr;

  if (afterCase.revision !== revision + 1) {
    throw new Error(`revision must increment once: before=${revision} after=${afterCase.revision}`);
  }

  const row = (afterCase.collab_rows || []).find((r) => r.id === collabRowId);
  const translatorIds = new Set(
    (afterCase.collab_rows || [])
      .map((r) => r.translatorUserId)
      .filter(Boolean),
  );
  if (translatorIds.size !== 1) {
    throw new Error(`expected one translatorUserId across collab rows; got ${translatorIds.size}`);
  }

  const winnerId = oks[0].label === "M1" ? m1.user.id : m2.user.id;
  if (row?.translatorUserId !== winnerId) {
    throw new Error(`winner participant mismatch: row=${row?.translatorUserId} winner=${winnerId}`);
  }

  const { count: participantCount, error: pErr } = await pm.client
    .from("case_participants")
    .select("*", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("role", "translator");
  if (pErr) throw pErr;
  if (participantCount !== 1) {
    throw new Error(`expected one translator participant; got ${participantCount}`);
  }

  const { count: auditCount, error: aErr } = await pm.client
    .from("case_mutation_audit")
    .select("*", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("action", "accept_inquiry_collab_row");
  if (aErr) throw aErr;
  if (auditCount !== 1) {
    throw new Error(`expected one success audit; got ${auditCount}`);
  }

  console.log("dual-client-collab-race: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
