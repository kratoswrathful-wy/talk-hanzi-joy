import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();
const createClientMock = vi.fn(() => ({
  auth: { getUser: getUserMock },
  from: fromMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args) => createClientMock(...args),
}));

const { requireExecutive, readSupabaseServerConfig } = await import("./require-executive.js");

function makeReq(headers = {}) {
  return { headers };
}

function selectEqChain(data, error = null) {
  return { select: () => ({ eq: () => Promise.resolve({ data, error }) }) };
}

const OLD_ENV = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe("readSupabaseServerConfig", () => {
  it("returns config when both env vars are present", () => {
    expect(readSupabaseServerConfig()).toEqual({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role-test-key",
    });
  });

  it("falls back to VITE_SUPABASE_URL when SUPABASE_URL is missing", () => {
    delete process.env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = "https://vite-fallback.supabase.co";
    expect(readSupabaseServerConfig()?.url).toBe("https://vite-fallback.supabase.co");
  });

  it("returns null when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(readSupabaseServerConfig()).toBeNull();
  });
});

describe("requireExecutive", () => {
  it("returns server_missing_supabase_config when env is incomplete", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await requireExecutive(makeReq({ authorization: "Bearer abc" }));
    expect(result).toEqual({ ok: false, error: "server_missing_supabase_config" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns unauthorized when no Authorization header present", async () => {
    const result = await requireExecutive(makeReq());
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns unauthorized when Authorization header is malformed", async () => {
    const result = await requireExecutive(makeReq({ authorization: "abc123" }));
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns unauthorized when JWT is invalid", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error("invalid jwt") });
    const result = await requireExecutive(makeReq({ authorization: "Bearer bad-token" }));
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns forbidden for member role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    fromMock.mockReturnValue(selectEqChain([{ role: "member" }]));
    const result = await requireExecutive(makeReq({ authorization: "Bearer member-jwt" }));
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("returns forbidden for pm role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    fromMock.mockReturnValue(selectEqChain([{ role: "pm" }]));
    const result = await requireExecutive(makeReq({ authorization: "Bearer pm-jwt" }));
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("allows executive role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-4" } }, error: null });
    fromMock.mockReturnValue(selectEqChain([{ role: "executive" }]));
    const result = await requireExecutive(makeReq({ authorization: "Bearer exec-jwt" }));
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-4");
    expect(result.supabaseAdmin).toBeDefined();
  });

  it("uses .some() for multi-role users with executive", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-5" } }, error: null });
    fromMock.mockReturnValue(selectEqChain([{ role: "member" }, { role: "executive" }]));
    const result = await requireExecutive(makeReq({ authorization: "Bearer multi-role-jwt" }));
    expect(result.ok).toBe(true);
  });

  it("does not leak JWT or service role key in return value", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-7" } }, error: null });
    fromMock.mockReturnValue(selectEqChain([{ role: "executive" }]));
    const result = await requireExecutive(makeReq({ authorization: "Bearer super-secret-jwt" }));
    const serialized = JSON.stringify(result, (key, value) => (key === "supabaseAdmin" ? "[omitted]" : value));
    expect(serialized).not.toContain("super-secret-jwt");
    expect(serialized).not.toContain("service-role-test-key");
  });
});
