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

/** 讀取失敗分類。合法空結果不是失敗，不得進此型別。 */
export type IdentityFailureKind =
  | "timeout"
  | "http"
  | "aborted"
  | "lost"
  | "stale"
  | "unknown";

export interface IdentityLoadFailure {
  ok: false;
  error: string;
  kind: IdentityFailureKind;
}

export type ProfileLoadResult =
  | { ok: true; profile: AuthProfile | null }
  | IdentityLoadFailure;

export type RolesLoadResult =
  | { ok: true; roles: AuthUserRole[] }
  | IdentityLoadFailure;

export const MAX_IDENTITY_RETRIES = 5;
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
  abort: (reason: "timeout" | "switch") => void;
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

export function isIgnorableIdentityFailure(kind: IdentityFailureKind) {
  return kind === "stale" || kind === "aborted";
}

export function classifyIdentityFailure(
  e: unknown,
  abortReason: "timeout" | "switch" | null,
): IdentityLoadFailure {
  if (abortReason === "switch") {
    return { ok: false, error: "stale", kind: "stale" };
  }
  if (abortReason === "timeout") {
    return { ok: false, error: "timeout", kind: "timeout" };
  }
  const message =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e && typeof e.message === "string"
        ? e.message
        : "";
  const name =
    e instanceof Error
      ? e.name
      : typeof e === "object" && e && "name" in e && typeof e.name === "string"
        ? e.name
        : "";
  const lower = `${name} ${message}`.toLowerCase();
  if (name === "AbortError" || lower.includes("abort")) {
    return { ok: false, error: "stale", kind: "stale" };
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed")
  ) {
    return { ok: false, error: message || "lost", kind: "lost" };
  }
  if (message) {
    return { ok: false, error: message, kind: "http" };
  }
  return { ok: false, error: "unknown", kind: "unknown" };
}

function makeFlightAbort() {
  const profileCtrl = new AbortController();
  const rolesCtrl = new AbortController();
  let profileReason: "timeout" | "switch" | null = null;
  let rolesReason: "timeout" | "switch" | null = null;
  return {
    profileSignal: profileCtrl.signal,
    rolesSignal: rolesCtrl.signal,
    profileReason: () => profileReason,
    rolesReason: () => rolesReason,
    abort(next: "timeout" | "switch") {
      if (!profileReason) profileReason = next;
      if (!rolesReason) rolesReason = next;
      profileCtrl.abort();
      rolesCtrl.abort();
    },
    abortProfileTimeout() {
      if (profileReason) return;
      profileReason = "timeout";
      profileCtrl.abort();
    },
    abortRolesTimeout() {
      if (rolesReason) return;
      rolesReason = "timeout";
      rolesCtrl.abort();
    },
  };
}

async function fetchProfile(userId: string, signal: AbortSignal): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_COLUMNS)
    .eq("id", userId)
    .abortSignal(signal)
    .maybeSingle();

  if (signal.aborted) {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  }
  if (error) {
    throw new Error(error.message || "fetchProfile_error");
  }
  if (!data) return null;
  return profileFromRow(data as Record<string, unknown>);
}

async function fetchRoles(userId: string, signal: AbortSignal): Promise<AuthUserRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .abortSignal(signal);

  if (signal.aborted) {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  }
  if (error) {
    throw new Error(error.message || "fetchRoles_error");
  }
  return (data as AuthUserRole[]) || [];
}

function runBounded<T>(
  run: Promise<T>,
  ms: number,
  abortTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      abortTimeout();
      reject(Object.assign(new Error("timeout"), { name: "AbortError" }));
    }, ms);
  });
  return Promise.race([run, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
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
  if (flight) {
    flight.abort("switch");
  }
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
 * force=true 時若已有 pending，直接重用（避免重試疊加）；僅在無 pending 時開新查詢。
 * 若要在 settled 後重試，呼叫端先確定 flight 為 null 再 force。
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

  if (flight && flight.userId === userId && flight.generation === identityGeneration) {
    return {
      generation: flight.generation,
      profilePromise: flight.profilePromise,
      rolesPromise: flight.rolesPromise,
    };
  }

  if (opts?.force && flight && flight.userId === userId) {
    flight.abort("switch");
    flight = null;
  }

  const generation = identityGeneration;
  const aborts = makeFlightAbort();

  const profilePromise = runBounded(
    fetchProfile(userId, aborts.profileSignal),
    profileTimeoutMs,
    () => aborts.abortProfileTimeout(),
  )
    .then((profile): ProfileLoadResult => {
      if (!isIdentityResultCurrent(userId, generation)) {
        return { ok: false, error: "stale", kind: "stale" };
      }
      cachedProfile = { userId, generation, value: profile };
      if (profile) {
        setTestAccountFlag(profile.is_test === true);
      }
      return { ok: true, profile };
    })
    .catch((e): ProfileLoadResult => {
      const failure = classifyIdentityFailure(e, aborts.profileReason());
      if (!isIdentityResultCurrent(userId, generation) || isIgnorableIdentityFailure(failure.kind)) {
        return { ok: false, error: "stale", kind: "stale" };
      }
      console.error("[auth-identity] fetchProfile failed:", failure.kind, failure.error);
      return failure;
    });

  const rolesPromise = runBounded(
    fetchRoles(userId, aborts.rolesSignal),
    rolesTimeoutMs,
    () => aborts.abortRolesTimeout(),
  )
    .then((roles): RolesLoadResult => {
      if (!isIdentityResultCurrent(userId, generation)) {
        return { ok: false, error: "stale", kind: "stale" };
      }
      cachedRoles = { userId, generation, value: roles };
      return { ok: true, roles };
    })
    .catch((e): RolesLoadResult => {
      const failure = classifyIdentityFailure(e, aborts.rolesReason());
      if (!isIdentityResultCurrent(userId, generation) || isIgnorableIdentityFailure(failure.kind)) {
        return { ok: false, error: "stale", kind: "stale" };
      }
      console.error("[auth-identity] fetchRoles failed:", failure.kind, failure.error);
      return failure;
    });

  const candidate: Flight = {
    userId,
    generation,
    profilePromise,
    rolesPromise,
    abort: (reason) => aborts.abort(reason),
  };
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
  if (flight?.userId === userId) {
    flight.abort("switch");
    flight = null;
  }
  const { generation, profilePromise, rolesPromise } = beginIdentityLoad(userId, {
    force: true,
  });
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
  if (flight) {
    flight.abort("switch");
  }
  identityGeneration = 0;
  activeUserId = null;
  flight = null;
  cachedProfile = null;
  cachedRoles = null;
  rolesTimeoutMs = opts?.rolesTimeoutMs ?? DEFAULT_ROLES_TIMEOUT_MS;
  profileTimeoutMs = opts?.profileTimeoutMs ?? DEFAULT_PROFILE_TIMEOUT_MS;
  setTestAccountFlag(null);
}
