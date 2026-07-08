import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/require-executive.js", () => ({
  requireExecutive: vi.fn(),
}));

const { requireExecutive } = await import("./lib/require-executive.js");
const { default: handler } = await import("./cat-ai-model-sync.js");

function makeReq({ method = "POST", body = {}, headers = {} } = {}) {
  return { method, body, headers };
}

function makeRes() {
  const res = {
    statusCode: undefined,
    headers: {},
    body: undefined,
    ended: false,
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  res.end = (payload) => {
    res.ended = true;
    res.body = payload ? JSON.parse(payload) : undefined;
    return res;
  };
  return res;
}

function makeSupabaseAdminMock({
  providerModelIds = [],
  optionIds = [],
  failRunInsert = false,
  failProviderUpsert = false,
  failMissingUpdate = false,
  failOptionUpsert = false,
  failReadExisting = false,
} = {}) {
  const runs = [];
  return {
    _runs: runs,
    from(table) {
      return {
        insert(row) {
          if (table === "ai_model_sync_runs") {
            const id = `run-${runs.length + 1}`;
            runs.push({ id, ...row });
            return {
              select() {
                return {
                  single: async () =>
                    failRunInsert
                      ? { data: null, error: new Error("insert failed") }
                      : { data: { id }, error: null },
                };
              },
            };
          }
          throw new Error(`unexpected insert on ${table}`);
        },
        select() {
          return {
            eq() {
              if (failReadExisting) return Promise.resolve({ data: null, error: new Error("read failed") });
              if (table === "ai_provider_models") {
                return Promise.resolve({ data: providerModelIds.map((id) => ({ model_id: id })), error: null });
              }
              if (table === "cat_ai_model_options") {
                return Promise.resolve({ data: optionIds.map((id) => ({ model_id: id })), error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        update(patch) {
          return {
            eq(_col, val) {
              if (table === "ai_model_sync_runs") {
                const run = runs.find((r) => r.id === val);
                if (run) Object.assign(run, patch);
                return Promise.resolve({ error: null });
              }
              if (table === "ai_provider_models") {
                return {
                  in() {
                    return Promise.resolve({ error: failMissingUpdate ? new Error("update failed") : null });
                  },
                };
              }
              return Promise.resolve({ error: null });
            },
          };
        },
        upsert() {
          if (table === "ai_provider_models") {
            return Promise.resolve({ error: failProviderUpsert ? new Error("upsert failed") : null });
          }
          if (table === "cat_ai_model_options") {
            return Promise.resolve({ error: failOptionUpsert ? new Error("upsert failed") : null });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function mockFetchOnce(impl) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/cat-ai-model-sync — method & auth gating", () => {
  it("rejects non-POST with 405", async () => {
    const res = makeRes();
    await handler(makeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 401 unauthorized when no Authorization header (requireExecutive reports unauthorized)", async () => {
    requireExecutive.mockResolvedValue({ ok: false, error: "unauthorized" });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized for invalid/expired JWT", async () => {
    requireExecutive.mockResolvedValue({ ok: false, error: "unauthorized" });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer invalid-token" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 forbidden for member role", async () => {
    requireExecutive.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer member-jwt" } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "executive role required" });
  });

  it("returns 403 forbidden for pm role (pm is not executive)", async () => {
    requireExecutive.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer pm-jwt" } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("returns 503 server_missing_supabase_config when server env missing", async () => {
    requireExecutive.mockResolvedValue({ ok: false, error: "server_missing_supabase_config" });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer x" } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "server_missing_supabase_config" });
  });
});

describe("POST /api/cat-ai-model-sync — executive happy path", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, OPENAI_API_KEY: "sk-test-key" };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 200 with sync counts for an executive request", async () => {
    const supabaseAdmin = makeSupabaseAdminMock({
      providerModelIds: ["gpt-4.1-mini"],
      optionIds: ["gpt-4.1-mini"],
    });
    requireExecutive.mockResolvedValue({ ok: true, userId: "exec-1", supabaseAdmin });
    mockFetchOnce(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-4.1-mini", object: "model", owned_by: "openai", created: 1700000000 },
          { id: "gpt-5-mini", object: "model", owned_by: "openai", created: 1700000001 },
          { id: "whisper-1", object: "model", owned_by: "openai" },
        ],
      }),
    }));

    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.providerKey).toBe("openai");
    expect(res.body.discoveredCount).toBe(3);
    expect(res.body.filteredCount).toBe(2);
    expect(res.body.upsertedProviderModels).toBe(2);
    expect(res.body.newOptionsCreated).toBe(1);
    expect(res.body.markedUnavailable).toBe(0);
    expect(typeof res.body.runId).toBe("string");
    expect(supabaseAdmin._runs[0].status).toBe("success");
  });
});

describe("POST /api/cat-ai-model-sync — OpenAI failure mapping", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, OPENAI_API_KEY: "sk-test-key" };
    requireExecutive.mockResolvedValue({
      ok: true,
      userId: "exec-1",
      supabaseAdmin: makeSupabaseAdminMock(),
    });
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 503 openai_invalid_key when OpenAI responds 401 (not the JWT 401)", async () => {
    mockFetchOnce(async () => ({ status: 401, ok: false, json: async () => ({}) }));
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("openai_invalid_key");
    expect(res.body.message).toContain("API Key");
  });

  it("returns 429 openai_insufficient_quota when OpenAI responds quota error", async () => {
    mockFetchOnce(async () => ({
      status: 429,
      ok: false,
      json: async () => ({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }),
    }));
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe("openai_insufficient_quota");
    expect(res.body.message).toContain("加值");
  });

  it("returns 504 openai_timeout when OpenAI request aborts", async () => {
    mockFetchOnce(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(504);
    expect(res.body.error).toBe("openai_timeout");
  });

  it("returns 502 openai_invalid_response when response.data is not an array", async () => {
    mockFetchOnce(async () => ({ status: 200, ok: true, json: async () => ({ data: "not-an-array" }) }));
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("openai_invalid_response");
  });

  it("returns 502 openai_fetch_failed on network error", async () => {
    mockFetchOnce(async () => {
      throw new Error("network down");
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("openai_fetch_failed");
  });

  it("returns 502 openai_fetch_failed on OpenAI 5xx", async () => {
    mockFetchOnce(async () => ({ status: 500, ok: false, json: async () => ({ error: { message: "internal" } }) }));
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("openai_fetch_failed");
  });
});

describe("POST /api/cat-ai-model-sync — DB write failure", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, OPENAI_API_KEY: "sk-test-key" };
    mockFetchOnce(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ data: [{ id: "gpt-5-mini", object: "model" }] }),
    }));
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 500 db_write_failed when provider model upsert fails", async () => {
    const supabaseAdmin = makeSupabaseAdminMock({ failProviderUpsert: true });
    requireExecutive.mockResolvedValue({ ok: true, userId: "exec-1", supabaseAdmin });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "db_write_failed" });
    expect(supabaseAdmin._runs[0].status).toBe("failed");
  });

  it("returns 500 db_write_failed when reading existing registry rows fails", async () => {
    const supabaseAdmin = makeSupabaseAdminMock({ failReadExisting: true });
    requireExecutive.mockResolvedValue({ ok: true, userId: "exec-1", supabaseAdmin });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "db_write_failed" });
  });

  it("returns 500 db_write_failed when the initial sync-run insert fails", async () => {
    const supabaseAdmin = makeSupabaseAdminMock({ failRunInsert: true });
    requireExecutive.mockResolvedValue({ ok: true, userId: "exec-1", supabaseAdmin });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer exec-jwt" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "db_write_failed" });
  });
});

describe("POST /api/cat-ai-model-sync — provider key validation", () => {
  it("rejects unsupported providerKey with 400 before hitting auth", async () => {
    const res = makeRes();
    await handler(makeReq({ body: { providerKey: "anthropic" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("unsupported_provider_key");
  });
});
