/**
 * 隔離後端真身分登入探測：只印通過／失敗碼，不印 token／密碼／憑證正文。
 * 僅連 kymyughnkleuoyzsuiob。
 */
const ISO = "kymyughnkleuoyzsuiob";
const FORMAL = "wshsmerltcakffllgyul";
const url = (process.env.CASE_ISO_URL || "").replace(/\/$/, "");
const anon = process.env.CASE_ISO_ANON || "";
const caseA = process.env.CASE_ISO_CASE_A || "";
const caseB = process.env.CASE_ISO_CASE_B || "";

if (!url.includes(ISO) || url.includes(FORMAL)) {
  throw new Error("refused: CASE_ISO_URL is not isolation");
}
if (!anon || anon.includes(FORMAL)) {
  throw new Error("refused: CASE_ISO_ANON missing or formal");
}

const accounts = [
  { code: "pm", email: "test-pm@test.local", pass: process.env.CASE_ISO_PM_PASS },
  { code: "t1", email: "test-t1@test.local", pass: process.env.CASE_ISO_T1_PASS },
  { code: "t2", email: "test-t2@test.local", pass: process.env.CASE_ISO_T2_PASS },
];
for (const a of accounts) {
  if (!a.pass) throw new Error(`missing password env for ${a.code}`);
}

function headers(token) {
  const h = {
    apikey: anon,
    Authorization: `Bearer ${token || anon}`,
    "Content-Type": "application/json",
  };
  return h;
}

async function login(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok && typeof body.access_token === "string",
    status: res.status,
    token: typeof body.access_token === "string" ? body.access_token : "",
    userId: body.user?.id || "",
  };
}

async function restSelect(token, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: headers(token),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function rpc(token, name, args) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    return { status: 0, ok: false, msg: e instanceof Error ? e.name : "fetch_error", body: null };
  }
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const msg =
    body && typeof body === "object"
      ? String(body.message || body.code || body.error || "")
      : String(body || "");
  return { status: res.status, ok: res.ok, msg, body };
}

function credKeys(payload) {
  if (!payload || typeof payload !== "object") return [];
  return Object.keys(payload).sort();
}

function hasPrivateLeak(row) {
  if (!row || typeof row !== "object") return false;
  const client = String(row.client || "");
  const keyword = String(row.keyword || "");
  const po = String(row.client_po_number || "");
  const comments = row.internal_comments;
  const leakedComments =
    Array.isArray(comments) && comments.length > 0 &&
    comments.some((c) => String(c?.content || "").trim() !== "");
  return (
    client.includes("合成客戶") ||
    keyword.includes("keep-keyword") ||
    po.includes("PO-A") ||
    leakedComments
  );
}

const out = [];
function rec(id, pass, detail) {
  out.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${detail}`);
}

const tokens = {};
for (const a of accounts) {
  const r = await login(a.email, a.pass);
  rec(`login_${a.code}`, r.ok && !!r.userId, `http=${r.status} user=${r.userId ? "yes" : "no"}`);
  tokens[a.code] = r;
}

if (!tokens.pm.ok || !tokens.t1.ok || !tokens.t2.ok) {
  console.log(JSON.stringify({ summary: "login_blocked", results: out }));
  process.exit(2);
}

const visT2 = await restSelect(
  tokens.t2.token,
  `cases_visible?id=eq.${caseA}&select=id,title,client,keyword,client_po_number,dispatch_route,internal_comments,billing_unit,unit_count,login_account,login_password`,
);
const rowT2 = Array.isArray(visT2.body) ? visT2.body[0] : null;
rec(
  "t2_visible_no_pm_private",
  visT2.status === 200 && rowT2 && !hasPrivateLeak(rowT2) && String(rowT2.login_account || "") === "",
  `http=${visT2.status} leak=${rowT2 ? hasPrivateLeak(rowT2) : "no-row"}`,
);

const visPm = await restSelect(
  tokens.pm.token,
  `cases_visible?id=eq.${caseA}&select=id,client,keyword,client_po_number,internal_comments`,
);
const rowPm = Array.isArray(visPm.body) ? visPm.body[0] : null;
rec(
  "pm_visible_has_private",
  visPm.status === 200 && rowPm && hasPrivateLeak(rowPm),
  `http=${visPm.status} private=${rowPm ? hasPrivateLeak(rowPm) : "no-row"}`,
);

for (const code of ["pm", "t1", "t2"]) {
  const cred = await rpc(tokens[code].token, "get_case_credentials", { p_case_id: caseA });
  const payload = cred.body && typeof cred.body === "object" ? cred.body : {};
  const keys = credKeys(payload);
  const hasLogin = String(payload.loginAccount || "") === "iso-tool-user";
  const noPrivate = !("keyword" in payload) && !("client" in payload) && !("dispatchRoute" in payload);
  rec(
    `cred_A_${code}`,
    cred.ok && hasLogin && noPrivate,
    `http=${cred.status} keys=${keys.join(",")} login=${hasLogin} noPrivate=${noPrivate}`,
  );
}

const credB = await rpc(tokens.t2.token, "get_case_credentials", { p_case_id: caseB });
const emptyOk =
  credB.ok &&
  String(credB.body?.loginAccount || "") === "" &&
  (Array.isArray(credB.body?.tools) ? credB.body.tools.length === 0 : true);
rec("cred_B_t2_empty_ok", emptyOk, `http=${credB.status} empty=${emptyOk}`);

const visRev = await restSelect(
  tokens.pm.token,
  `cases_visible?id=eq.${caseA}&select=revision`,
);
const startRev = Array.isArray(visRev.body) ? Number(visRev.body[0]?.revision ?? 0) : 0;

const denyTitle = await rpc(tokens.t1.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: startRev,
  p_changes: { title: "不該被改" },
});
rec(
  "t1_deny_title",
  !denyTitle.ok && /field_not_permitted/.test(denyTitle.msg),
  `http=${denyTitle.status} msg=${denyTitle.msg}`,
);

const denyKw = await rpc(tokens.t2.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: startRev,
  p_changes: { keyword: "leak-try" },
});
rec(
  "t2_deny_keyword",
  !denyKw.ok && /field_not_permitted|active_participant_required/.test(denyKw.msg),
  `http=${denyKw.status} msg=${denyKw.msg}`,
);

const addFinal = await rpc(tokens.t1.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: startRev,
  p_changes: {
    translatorFinal: [
      { name: "t1-a.txt", url: "https://ex.test/t1-a", uploadedBy: "spoof" },
    ],
  },
});
rec("t1_add_final", addFinal.ok, `http=${addFinal.status} msg=${addFinal.msg}`);

const afterFinal = await restSelect(
  tokens.pm.token,
  `cases_visible?id=eq.${caseA}&select=translator_final,title,keyword,revision`,
);
const finals = Array.isArray(afterFinal.body) ? afterFinal.body[0] : null;
const stamped =
  Array.isArray(finals?.translator_final) &&
  finals.translator_final.some(
    (f) => f.name === "t1-a.txt" && f.uploadedBy === "10000000-0000-4000-8000-000000000003",
  );
rec(
  "t1_final_stamped_and_title_kept",
  stamped && finals?.title === "[AI驗收] 案件權限-A-有工具261001" && finals?.keyword === "keep-keyword-A",
  `stamped=${stamped} titleKept=${finals?.title === "[AI驗收] 案件權限-A-有工具261001"}`,
);

const t2Del = await rpc(tokens.t2.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: finals?.revision ?? 1,
  p_changes: { translatorFinal: [] },
});
rec(
  "t2_cannot_delete_t1_file",
  !t2Del.ok && /file_not_owned/.test(t2Del.msg),
  `http=${t2Del.status} msg=${t2Del.msg}`,
);

const t2Guide = await rpc(tokens.t2.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: finals?.revision ?? 1,
  p_changes: { clientGuidelines: [{ name: "g.txt", url: "https://ex.test/g" }] },
});
rec(
  "t2_deny_guidelines",
  !t2Guide.ok && /field_not_permitted|active_participant_required/.test(t2Guide.msg),
  `http=${t2Guide.status} msg=${t2Guide.msg}`,
);

const t1Guide = await rpc(tokens.t1.token, "update_case_permitted_fields", {
  p_case_id: caseA,
  p_expected_revision: finals?.revision ?? 1,
  p_changes: { clientGuidelines: [{ name: "g.txt", url: "https://ex.test/g" }] },
});
rec(
  "t1_deny_guidelines",
  !t1Guide.ok && /field_not_permitted/.test(t1Guide.msg),
  `http=${t1Guide.status} msg=${t1Guide.msg}`,
);

const t2Comment = await rpc(tokens.t2.token, "update_case_social_fields", {
  p_case_id: caseA,
  p_expected_revision: finals?.revision ?? 1,
  p_changes: {
    comments: [
      { id: "c-old", author: "PM", content: "舊則留言", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "c-t2", author: "譯者二", content: "t2回覆", createdAt: "2026-10-01T01:00:00.000Z" },
    ],
  },
});
rec("t2_append_comment", t2Comment.ok, `http=${t2Comment.status} msg=${t2Comment.msg}`);

const t2Toggle = await rpc(tokens.t2.token, "update_case_social_fields", {
  p_case_id: caseA,
  p_expected_revision: (typeof t2Comment.body?.revision === "number" ? t2Comment.body.revision : (finals?.revision ?? 1)),
  p_changes: { clientQuestionForm: true },
});
rec(
  "t2_deny_question_toggle",
  !t2Toggle.ok && /field_not_permitted/.test(t2Toggle.msg),
  `http=${t2Toggle.status} msg=${t2Toggle.msg}`,
);

const t1Toggle = await rpc(tokens.t1.token, "update_case_social_fields", {
  p_case_id: caseA,
  p_expected_revision: (typeof t2Comment.body?.revision === "number" ? t2Comment.body.revision : (finals?.revision ?? 1)),
  p_changes: { clientQuestionForm: true },
});
rec("t1_toggle_question", t1Toggle.ok, `http=${t1Toggle.status} msg=${t1Toggle.msg}`);

const wipe = await rpc(tokens.t2.token, "update_case_social_fields", {
  p_case_id: caseA,
  p_expected_revision: (typeof t1Toggle.body?.revision === "number" ? t1Toggle.body.revision : 2),
  p_changes: { comments: [] },
});
rec(
  "t2_cannot_wipe_comments",
  !wipe.ok && /comment_not_deletable/.test(wipe.msg),
  `http=${wipe.status} msg=${wipe.msg}`,
);

const failed = out.filter((x) => !x.pass);
console.log(JSON.stringify({ failed: failed.length, total: out.length, failedIds: failed.map((x) => x.id) }));
process.exit(failed.length ? 1 : 0);
