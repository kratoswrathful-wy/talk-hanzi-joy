import { describe, expect, it } from "vitest";
import { statusForSyncError } from "./error-codes";

describe("statusForSyncError", () => {
  it("maps unauthorized to 401 (JWT missing/invalid only)", () => {
    expect(statusForSyncError("unauthorized")).toBe(401);
  });

  it("maps forbidden to 403 (authenticated but not executive)", () => {
    expect(statusForSyncError("forbidden")).toBe(403);
  });

  it("does not map OpenAI key errors to 401", () => {
    expect(statusForSyncError("openai_invalid_key")).not.toBe(401);
    expect(statusForSyncError("openai_invalid_key")).toBe(503);
  });

  it("maps timeout to 504", () => {
    expect(statusForSyncError("openai_timeout")).toBe(504);
  });

  it("maps db write failure to 500", () => {
    expect(statusForSyncError("db_write_failed")).toBe(500);
  });

  it("maps invalid json to 400", () => {
    expect(statusForSyncError("invalid_json")).toBe(400);
  });

  it("maps missing server env to 503", () => {
    expect(statusForSyncError("server_missing_openai_key")).toBe(503);
    expect(statusForSyncError("server_missing_supabase_config")).toBe(503);
  });

  it("maps openai quota/rate errors to 429", () => {
    expect(statusForSyncError("openai_insufficient_quota")).toBe(429);
    expect(statusForSyncError("openai_rate_limited")).toBe(429);
  });

  it("maps openai permission/region to 403", () => {
    expect(statusForSyncError("openai_permission_denied")).toBe(403);
    expect(statusForSyncError("openai_unsupported_region")).toBe(403);
  });

  it("maps openai overloaded to 503", () => {
    expect(statusForSyncError("openai_overloaded")).toBe(503);
  });

  it("maps openai fetch/response failures to 502", () => {
    expect(statusForSyncError("openai_fetch_failed")).toBe(502);
    expect(statusForSyncError("openai_invalid_response")).toBe(502);
  });
});
