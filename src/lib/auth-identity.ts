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

export type ProfileLoadResult =
  | { ok: true; profile: AuthProfile | null }
  | { ok: false; error: string };

export type RolesLoadResult =
  | { ok: true; roles: AuthUserRole[] }
  | { ok: false; error: string };

const DEFAULT_ROLES_TIMEOUT_MS = 12_000;
const DEFAULT_PROFILE_TIMEOUT_MS = 12_000;

let rolesTimeoutMs = DEFAULT_ROLES_TIMEOUT_MS;
let profileTimeoutMs = DEFAULT_PROFILE_TIMEOUT_MS;
let identityGeneration = 0;
/** 目前有效身分；isIdentityResultCurrent 必須同時比對此值。 */
let activeUserId: string | null = null;

type Flight = {
  userId: string;
  generation: number;
  profilePromise: Promise<ProfileLoadResult>;
  rolesPromise: Promise<RolesLoadResult>;
};

/** 僅代表仍在進行的請求；settled 後必須清除。 */
let flight: Flight | null = null;

/** 僅快取成功結果；錯誤／timeout 不得寫入。 */
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
    throw new Error(error.message || "fetchProfile_error");
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
    throw new Error(error.message || "fetchRoles_error");
  }
  return (data as AuthUserRole[]) || [];
}

function clearFlightIfCurrent(candidate: Flight) {
  if (
    flight &&
    flight.userId === candidate.userId &&
    flight.generation === candidate.generation &&
    flight.profilePromise === candidate.profilePromise
  ) {
    flight = null;
  }
}

/**
 * 丟棄進行中的身分載入（SIGNED_OUT／切換 user／retry）。
 * 晚到的結果一律不得寫入 cache。
 */
export function invalidateIdentity() {
  identityGeneration += 1;
  activeUserId = null;
  flight = null;
  cachedProfile = null;
  cachedRoles = null;
  setTestAccountFlag(null);
  return identityGeneration;
}

export function setActiveUserId(userId: string | null) {
  activeUserId = userId;
}

export function getActiveUserId() {
  return activeUserId;
}

export function getIdentityGeneration() {
  return identityGeneration;
}

export function getCachedRoles(userId: string): AuthUserRole[] | null {
  if (!cachedRoles || cachedRoles.userId !== userId) return null;
  if (cachedRoles.generation !== identityGeneration) return null;
  if (activeUserId !== userId) return null;
  return cachedRoles.value;
}

export function getCachedProfile(userId: string): AuthProfile | null | undefined {
  if (!cachedProfile || cachedProfile.userId !== userId) return undefined;
  if (cachedProfile.generation !== identityGeneration) return undefined;
  if (activeUserId !== userId) return undefined;
  return cachedProfile.value;
}

export function getPendingFlightForTests() {
  return flight;
}

/**
 * 同一 userId + generation 多 consumer 共用仍在 pending 的 single-flight。
 * force=true 時必定開新查詢（refetchProfile）。
 */
export function beginIdentityLoad(
  userId: string,
  opts?: { force?: boolean },
): {
  generation: number;
  profilePromise: Promise<ProfileLoadResult>;
  rolesPromise: Promise<RolesLoadResult>;
} {
  activeUserId = userId;

  if (
    !opts?.force &&
    flight &&
    flight.userId === userId &&
    flight.generation === identityGeneration
  ) {
    return {
      generation: flight.generation,
      profilePromise: flight.profilePromise,
      rolesPromise: flight.rolesPromise,
    };
  }

  const generation = identityGeneration;

  const profilePromise = withTimeout(fetchProfile(userId), profileTimeoutMs, "fetchProfile")
    .then((profile): ProfileLoadResult => {
      if (!isIdentityResultCurrent(userId, generation)) {
        return { ok: false, error: "stale" };
      }
      cachedProfile = { userId, generation, value: profile };
      if (profile) {
        setTestAccountFlag(profile.is_test === true);
      }
      return { ok: true, profile };
    })
    .catch((e): ProfileLoadResult => {
      const message = e instanceof Error ? e.message : "fetchProfile_error";
      console.error("[auth-identity] fetchProfile failed:", message);
      // 錯誤不得快取為可信 null
      return { ok: false, error: message };
    });

  const rolesPromise = withTimeout(fetchRoles(userId), rolesTimeoutMs, "fetchRoles")
    .then((roles): RolesLoadResult => {
      if (!isIdentityResultCurrent(userId, generation)) {
        return { ok: false, error: "stale" };
      }
      cachedRoles = { userId, generation, value: roles };
      return { ok: true, roles };
    })
    .catch((e): RolesLoadResult => {
      const message = e instanceof Error ? e.message : "fetchRoles_error";
      console.error("[auth-identity] fetchRoles failed:", message);
      // 錯誤不得快取為空角色（避免 PM 被降級成 member）
      return { ok: false, error: message };
    });

  const candidate: Flight = { userId, generation, profilePromise, rolesPromise };
  flight = candidate;

  let remaining = 2;
  const markSettled = () => {
    remaining -= 1;
    if (remaining <= 0) clearFlightIfCurrent(candidate);
  };
  void profilePromise.finally(markSettled);
  void rolesPromise.finally(markSettled);

  return { generation, profilePromise, rolesPromise };
}

/** 強制重新查詢 profile（清除成功快取與 pending flight）。 */
export function beginForcedProfileRefresh(userId: string): {
  generation: number;
  profilePromise: Promise<ProfileLoadResult>;
} {
  activeUserId = userId;
  if (cachedProfile?.userId === userId) {
    cachedProfile = null;
  }
  // 拆掉既有 flight，避免重用已完成／pending 的 profilePromise
  if (flight?.userId === userId) {
    flight = null;
  }
  const { generation, profilePromise, rolesPromise } = beginIdentityLoad(userId, {
    force: true,
  });
  // beginIdentityLoad force 會同時重查 roles；保留 rolesPromise 消化即可
  void rolesPromise;
  return { generation, profilePromise };
}

/** 套用結果前：必須同時比對 activeUserId 與 generation。 */
export function isIdentityResultCurrent(userId: string, generation: number) {
  return (
    generation === identityGeneration &&
    activeUserId === userId &&
    Boolean(userId)
  );
}

export function __resetAuthIdentityForTests(opts?: {
  rolesTimeoutMs?: number;
  profileTimeoutMs?: number;
}) {
  identityGeneration = 0;
  activeUserId = null;
  flight = null;
  cachedProfile = null;
  cachedRoles = null;
  rolesTimeoutMs = opts?.rolesTimeoutMs ?? DEFAULT_ROLES_TIMEOUT_MS;
  profileTimeoutMs = opts?.profileTimeoutMs ?? DEFAULT_PROFILE_TIMEOUT_MS;
  setTestAccountFlag(null);
}
