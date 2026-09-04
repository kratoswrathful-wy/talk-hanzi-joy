#!/usr/bin/env node
/**
 * 雙 authenticated client 競態驗收（隔離環境：本機 Supabase／臨時 Micro）。
 *
 * 憑證來源（二擇一，不得讀 .env）：
 *   1) stdin 單行 JSON（由 orchestrator 管道送入，含即時刪除）
 *   2) 環境變數 MICRO3_RACE_CREDS_FILE 指向單次暫存檔（0600；腳本結束後刪除）
 *
 * JSON 形狀：
 * { "url","anonKey","pm":{email,password},"m1":{...},"m2":{...} }
 *
 * log 僅輸出 PM/M1/M2 標籤與 uid 前 8 字，不輸出 email／密碼／token。
 */
import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";

const ALLOWED_FAIL = new Set([
  "case_revision_conflict",
  "case_unavailable",
  "collab_row_unavailable",
  "collab_row_not_assigned_to_actor",
  "not_authorized",
]);

function shortId(uuid) {
  return typeof uuid === "string" ? uuid.slice(0, 8) : "?";
}

async function readCreds() {
  const file = process.env.MICRO3_RACE_CREDS_FILE;
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
  throw new Error(
    "缺少憑證：請以 stdin JSON 或 MICRO3_RACE_CREDS_FILE 提供（不得使用 .env）",
  );
}

async function signIn(url, anonKey, account, label) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`${label} signIn failed: ${error.message}`);
  return { client, user: data.user, label };
}

async function assertIdentity(label, client, user, { expectAdmin, expectMember }) {
  const uid = user.id;
  const { data: roles, error: roleErr } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", uid);
  if (roleErr) throw roleErr;
  const roleSet = new Set((roles || []).map((r) => r.role));

  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("is_test, display_name, email")
    .eq("id", uid)
    .maybeSingle();
  if (profErr) throw profErr;

  if (expectAdmin && !roleSet.has("pm") && !roleSet.has("executive")) {
    throw new Error(`${label} must be pm or executive`);
  }
  if (expectMember && !roleSet.has("member")) {
    throw new Error(`${label} must have member role`);
  }
  if (expectMember && (roleSet.has("pm") || roleSet.has("executive"))) {
    throw new Error(`${label} must not be admin`);
  }
  if (!profile?.display_name || !String(profile.display_name).trim()) {
    throw new Error(`${label} display_name required`);
  }
  if (profile.is_test !== true) {
    throw new Error(`${label} must be test env (is_test=true)`);
  }

  const { data: frozenRow } = await client
    .from("member_translator_settings")
    .select("frozen")
    .ilike("email", profile.email)
    .maybeSingle();
  if (frozenRow?.frozen === true) {
    throw new Error(`${label} must not be frozen`);
  }

  console.log(`[${label}] ok uid=${shortId(uid)} roles=${[...roleSet].join(",")}`);
  return { uid, roles: roleSet, profile };
}

function isAcceptSuccess(res, caseId, rowId, expectedRevision) {
  if (res.error) return false;
  const d = res.data;
  if (!d || typeof d !== "object") return false;
  return (
    d.caseId === caseId &&
    d.rowId === rowId &&
    Number(d.revision) === expectedRevision + 1
  );
}

function extractFailCode(res) {
  if (res.error?.message) return res.error.message;
  if (typeof res.data === "string") return res.data;
  if (res.data?.message) return res.data.message;
  return String(res.data ?? "unknown");
}

async function signOutQuiet(client) {
  try {
    await client.auth.signOut();
  } catch {
    /* ignore */
  }
}

async function main() {
  const creds = await readCreds();
  const url = creds.url;
  const anonKey = creds.anonKey;
  if (!url || !anonKey) throw new Error("creds missing url or anonKey");

  let pm;
  let m1;
  let m2;
  try {
    pm = await signIn(url, anonKey, creds.pm, "PM");
    m1 = await signIn(url, anonKey, creds.m1, "M1");
    m2 = await signIn(url, anonKey, creds.m2, "M2");

    if (new Set([pm.user.id, m1.user.id, m2.user.id]).size !== 3) {
      throw new Error("PM/M1/M2 user ids must be distinct");
    }

    await assertIdentity("PM", pm.client, pm.user, { expectAdmin: true, expectMember: false });
    const id1 = await assertIdentity("M1", m1.client, m1.user, {
      expectAdmin: false,
      expectMember: true,
    });
    const id2 = await assertIdentity("M2", m2.client, m2.user, {
      expectAdmin: false,
      expectMember: true,
    });
    if (id1.uid === id2.uid) throw new Error("M1/M2 must differ");

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
      throw new Error(`admin_create_case failed`);
    }

    const { data: caseRow, error: caseErr } = await pm.client
      .from("cases_visible")
      .select("revision")
      .eq("id", caseId)
      .single();
    if (caseErr) throw caseErr;
    const revision = caseRow.revision;

    const attempt = (session, label) =>
      session.client
        .rpc("accept_inquiry_collab_row", {
          p_case_id: caseId,
          p_collab_row_id: collabRowId,
          p_expected_revision: revision,
        })
        .then((res) => ({ label, session, res }));

    const [r1, r2] = await Promise.all([attempt(m1, "M1"), attempt(m2, "M2")]);

    const expectedRev = revision + 1;
    const successes = [r1, r2].filter((r) =>
      isAcceptSuccess(r.res, caseId, collabRowId, revision),
    );
    const failures = [r1, r2].filter(
      (r) => !isAcceptSuccess(r.res, caseId, collabRowId, revision),
    );

    console.log(`[M1] success=${successes.some((s) => s.label === "M1")}`);
    console.log(`[M2] success=${successes.some((s) => s.label === "M2")}`);

    if (successes.length !== 1 || failures.length !== 1) {
      throw new Error(`expected exactly one success; got ${successes.length}`);
    }

    const failCode = extractFailCode(failures[0].res);
    const allowed = [...ALLOWED_FAIL].some((code) => failCode.includes(code));
    if (!allowed) {
      throw new Error(`failure not in allowed set: ${failCode}`);
    }

    const winner = successes[0];
    const loser = failures[0];
    const winnerId = winner.session.user.id;
    const loserId = loser.session.user.id;

    const { data: afterCase, error: afterErr } = await pm.client
      .from("cases_visible")
      .select("revision, collab_rows")
      .eq("id", caseId)
      .single();
    if (afterErr) throw afterErr;
    if (afterCase.revision !== expectedRev) {
      throw new Error(`revision must increment once`);
    }

    const row = (afterCase.collab_rows || []).find((r) => r.id === collabRowId);
    if (row?.translatorUserId !== winnerId) {
      throw new Error(`collab row translatorUserId must equal winner`);
    }

    const { data: participants, error: pErr } = await pm.client
      .from("case_participants")
      .select("user_id, role")
      .eq("case_id", caseId)
      .eq("role", "translator");
    if (pErr) throw pErr;
    if ((participants || []).length !== 1) {
      throw new Error(`expected one translator participant`);
    }
    if (participants[0].user_id !== winnerId) {
      throw new Error(`participant user_id must equal winner`);
    }

    const { data: audits, error: aErr } = await pm.client
      .from("case_mutation_audit")
      .select("actor_user_id, action")
      .eq("case_id", caseId)
      .eq("action", "accept_inquiry_collab_row");
    if (aErr) throw aErr;
    if ((audits || []).length !== 1) {
      throw new Error(`expected one success audit`);
    }
    if (audits[0].actor_user_id !== winnerId) {
      throw new Error(`audit actor must equal winner`);
    }

    const { data: loserParts } = await pm.client
      .from("case_participants")
      .select("user_id")
      .eq("case_id", caseId)
      .eq("user_id", loserId);
    if ((loserParts || []).length > 0) {
      throw new Error(`loser must not have participant row`);
    }

    const { data: loserAudits } = await pm.client
      .from("case_mutation_audit")
      .select("actor_user_id")
      .eq("case_id", caseId)
      .eq("actor_user_id", loserId);
    if ((loserAudits || []).length > 0) {
      throw new Error(`loser must not have audit rows`);
    }

    console.log("dual-client-collab-race: PASS");
  } finally {
    if (pm) await signOutQuiet(pm.client);
    if (m1) await signOutQuiet(m1.client);
    if (m2) await signOutQuiet(m2.client);
  }
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
