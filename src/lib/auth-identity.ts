import { supabase } from "@/integrations/supabase/client";
import { PROFILE_SELECT_COLUMNS } from "@/lib/profile-columns";
import { setTestAccountFlag } from "@/lib/environment";

export interface AuthProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
  timezone: string | null;
  status_message: string | null;
  phone: string | null;
  mobile: string | null;
  bio: string | null;
  receive_translator_case_reply_slack_dms?: boolean | null;
  slack_message_defaults?: unknown;
  is_test?: boolean | null;
}

export interface AuthUserRole {
  role: "member" | "pm" | "executive";
}

const DEFAULT_ROLES_TIMEOUT_MS = 12_000;
const DEFAULT_PROFILE_TIMEOUT_MS = 12_000;

let rolesTimeoutMs = DEFAULT_ROLES_TIMEOUT_MS;
let profileTimeoutMs = DEFAULT_PROFILE_TIMEOUT_MS;
let identityGeneration = 0;

type Flight = {
  userId: string;
  generation: number;
  profilePromise: Promise<AuthProfile | null>;
  rolesPromise: Promise<AuthUserRole[]>;
};

let flight: Flight | null = null;
let cachedProfile: { userId: string; generation: number; value: AuthProfile | null } | null =
  null;
let cachedRoles: { userId: string; generation: number; value: AuthUserRole[] } | null = null;

function profileFromRow(row: Record<string, unknown>): AuthProfile {
  return {
    id: String(row.id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    email: typeof row.email === "string" ? row.email : "",
    timezone: typeof row.timezone === "string" ? row.timezone : null,
    status_message: typeof row.status_message === "string" ? row.status_message : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    mobile: typeof row.mobile === "string" ? row.mobile : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    receive_translator_case_reply_slack_dms:
      typeof row.receive_translator_case_reply_slack_dms === "boolean"
        ? row.receive_translator_case_reply_slack_dms
        : null,
    slack_message_defaults: row.slack_message_defaults,
    is_test: typeof row.is_test === "boolean" ? row.is_test : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function fetchProfile(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchProfile error:", error.message);
    return null;
  }
  if (!data) return null;
  return profileFromRow(data as Record<string, unknown>);
}

async function fetchRoles(userId: string): Promise<AuthUserRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("fetchRoles error:", error.message);
    return [];
  }
  return (data as AuthUserRole[]) || [];
}

/**
 * 丟棄進行中的身分載入（SIGNED_OUT／切換 user／retry）。
 * 晚到的結果一律不得寫入 cache。
 */
export function invalidateIdentity() {
  identityGeneration += 1;
  flight = null;
  cachedProfile = null;
  cachedRoles = null;
  setTestAccountFlag(null);
  return identityGeneration;
}

export function getIdentityGeneration() {
  return identityGeneration;
}

export function getCachedRoles(userId: string): AuthUserRole[] | null {
  if (!cachedRoles || cachedRoles.userId !== userId) return null;
  if (cachedRoles.generation !== identityGeneration) return null;
  return cachedRoles.value;
}

export function getCachedProfile(userId: string): AuthProfile | null | undefined {
  if (!cachedProfile || cachedProfile.userId !== userId) return undefined;
  if (cachedProfile.generation !== identityGeneration) return undefined;
  return cachedProfile.value;
}

/**
 * 同一 userId + generation 多 consumer 共用 single-flight。
 */
export function beginIdentityLoad(userId: string): {
  generation: number;
  profilePromise: Promise<AuthProfile | null>;
  rolesPromise: Promise<AuthUserRole[]>;
} {
  if (flight && flight.userId === userId && flight.generation === identityGeneration) {
    return {
      generation: flight.generation,
      profilePromise: flight.profilePromise,
      rolesPromise: flight.rolesPromise,
    };
  }

  const generation = identityGeneration;

  const profilePromise = withTimeout(
    fetchProfile(userId),
    profileTimeoutMs,
    "fetchProfile",
  )
    .then((profile) => {
      if (generation !== identityGeneration) return null;
      cachedProfile = { userId, generation, value: profile };
      if (profile) {
        setTestAccountFlag(profile.is_test === true);
      }
      return profile;
    })
    .catch((e) => {
      console.error("[auth-identity] fetchProfile failed:", e);
      if (generation !== identityGeneration) return null;
      cachedProfile = { userId, generation, value: null };
      return null;
    });

  const rolesPromise = withTimeout(fetchRoles(userId), rolesTimeoutMs, "fetchRoles")
    .then((roles) => {
      if (generation !== identityGeneration) return [] as AuthUserRole[];
      cachedRoles = { userId, generation, value: roles };
      return roles;
    })
    .catch((e) => {
      console.error("[auth-identity] fetchRoles failed:", e);
      if (generation !== identityGeneration) return [] as AuthUserRole[];
      cachedRoles = { userId, generation, value: [] };
      return [] as AuthUserRole[];
    });

  flight = { userId, generation, profilePromise, rolesPromise };

  return { generation, profilePromise, rolesPromise };
}

/** 套用結果前檢查：過期 generation 或 userId 不符則丟棄。 */
export function isIdentityResultCurrent(userId: string, generation: number) {
  return generation === identityGeneration && Boolean(userId);
}

export function __resetAuthIdentityForTests(opts?: {
  rolesTimeoutMs?: number;
  profileTimeoutMs?: number;
}) {
  identityGeneration = 0;
  flight = null;
  cachedProfile = null;
  cachedRoles = null;
  rolesTimeoutMs = opts?.rolesTimeoutMs ?? DEFAULT_ROLES_TIMEOUT_MS;
  profileTimeoutMs = opts?.profileTimeoutMs ?? DEFAULT_PROFILE_TIMEOUT_MS;
  setTestAccountFlag(null);
}
