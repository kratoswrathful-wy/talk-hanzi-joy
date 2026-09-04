#!/usr/bin/env node
/**
 * 隔離環境：建立專用 PM + 2 member（隨機密碼），寫入單次暫存 creds 檔（0600）。
 * 僅接受 stdin JSON：{ url, serviceRoleKey, anonKey }
 * stdout：creds 檔絕對路徑（供 orchestrator 讀後刪除）
 * 不輸出 email／password／token。
 *
 * 環境變數命名 MICRO3_* 為歷史相容；行為適用本機 Supabase／臨時隔離庫。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

async function main() {
  const input = await readStdinJson();
  const { url, serviceRoleKey, anonKey } = input;
  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("stdin must include url, serviceRoleKey, anonKey");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const accounts = {
    pm: { local: "PM", email: `micro3-pm-${stamp}@race.invalid`, password: randomPassword(), role: "pm" },
    m1: { local: "M1", email: `micro3-m1-${stamp}@race.invalid`, password: randomPassword(), role: "member" },
    m2: { local: "M2", email: `micro3-m2-${stamp}@race.invalid`, password: randomPassword(), role: "member" },
  };

  for (const spec of Object.values(accounts)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: { display_name: `Micro3 ${spec.local}` },
    });
    if (error) throw new Error(`createUser ${spec.local}: ${error.message}`);
    const uid = data.user.id;
    await admin.from("profiles").update({ is_test: true, display_name: `Micro3 ${spec.local}` }).eq("id", uid);
    await admin.from("user_roles").delete().eq("user_id", uid);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role: spec.role });
    if (roleErr) throw new Error(`role ${spec.local}: ${roleErr.message}`);
  }

  const dir = await mkdtemp(join(tmpdir(), "micro3-race-"));
  const credPath = join(dir, "creds.json");
  const payload = {
    url,
    anonKey,
    pm: { email: accounts.pm.email, password: accounts.pm.password },
    m1: { email: accounts.m1.email, password: accounts.m1.password },
    m2: { email: accounts.m2.email, password: accounts.m2.password },
  };
  await writeFile(credPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  await chmod(credPath, 0o600);
  process.stdout.write(credPath);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
