#!/usr/bin/env node
/**
 * 隔離環境：建立測試模式假人（固定 @test.local email）供 Playwright 冒煙。
 * stdin JSON：{ url, serviceRoleKey, anonKey }
 * stdout：creds 檔絕對路徑（含 url／anonKey／accounts；用後刪除）
 * 不輸出密碼／token 到 log。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRODUCTION_REF = "wshsmerltcakffllgyul";

function randomPassword() {
  return randomBytes(24).toString("base64url");
}

async function readStdinJson() {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (line.trim()) return JSON.parse(line);
  }
  throw new Error("stdin JSON required");
}

async function ensureUser(admin, spec) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw new Error(`listUsers: ${list.error.message}`);
  const existing = (list.data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === spec.email.toLowerCase(),
  );
  let uid;
  let password = spec.password;
  if (existing) {
    uid = existing.id;
    const { error } = await admin.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
      user_metadata: { display_name: spec.displayName },
    });
    if (error) throw new Error(`updateUser ${spec.local}: ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: spec.displayName },
    });
    if (error) throw new Error(`createUser ${spec.local}: ${error.message}`);
    uid = data.user.id;
  }

  const { error: profErr } = await admin
    .from("profiles")
    .update({
      is_test: true,
      display_name: spec.displayName,
      email: spec.email,
    })
    .eq("id", uid);
  if (profErr) throw new Error(`profile ${spec.local}: ${profErr.message}`);

  await admin.from("user_roles").delete().eq("user_id", uid);
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: uid, role: spec.role });
  if (roleErr) throw new Error(`role ${spec.local}: ${roleErr.message}`);

  return { uid, email: spec.email, password };
}

async function main() {
  const input = await readStdinJson();
  const { url, serviceRoleKey, anonKey } = input;
  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("stdin must include url, serviceRoleKey, anonKey");
  }
  if (String(url).includes(PRODUCTION_REF)) {
    throw new Error("refused: production URL detected");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const specs = [
    {
      local: "exec",
      email: "test-exec@test.local",
      displayName: "執行長（測試）",
      role: "executive",
      password: randomPassword(),
    },
    {
      local: "pm",
      email: "test-pm@test.local",
      displayName: "PM（測試）",
      role: "pm",
      password: randomPassword(),
    },
    {
      local: "t1",
      email: "test-t1@test.local",
      displayName: "譯者一（測試）",
      role: "member",
      password: randomPassword(),
    },
    {
      local: "t2",
      email: "test-t2@test.local",
      displayName: "譯者二（測試）",
      role: "member",
      password: randomPassword(),
    },
  ];

  const accounts = {};
  for (const spec of specs) {
    accounts[spec.local] = await ensureUser(admin, spec);
  }

  const dir = await mkdtemp(join(tmpdir(), "isolation-personas-"));
  const credPath = join(dir, "creds.json");
  const payload = {
    url,
    anonKey,
    exec: { email: accounts.exec.email, password: accounts.exec.password },
    pm: { email: accounts.pm.email, password: accounts.pm.password },
    t1: { email: accounts.t1.email, password: accounts.t1.password },
    t2: { email: accounts.t2.email, password: accounts.t2.password },
    // race-compatible shape
    m1: { email: accounts.t1.email, password: accounts.t1.password },
    m2: { email: accounts.t2.email, password: accounts.t2.password },
  };
  await writeFile(credPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  await chmod(credPath, 0o600);
  process.stdout.write(credPath);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
