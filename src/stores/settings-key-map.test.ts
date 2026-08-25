import { describe, it, expect } from "vitest";
import { parseSettingsLogicalKey } from "./settings-key-map";

describe("parseSettingsLogicalKey", () => {
  it("maps production-prefixed keys", () => {
    expect(parseSettingsLogicalKey("production:page_templates")).toBe("page_templates");
    expect(parseSettingsLogicalKey("production:select_options")).toBe("select_options");
  });

  it("maps test-prefixed keys", () => {
    expect(parseSettingsLogicalKey("test:select_options")).toBe("select_options");
    expect(parseSettingsLogicalKey("test:default_pricing")).toBe("default_pricing");
  });

  it("maps legacy unprefixed keys", () => {
    expect(parseSettingsLogicalKey("page_templates")).toBe("page_templates");
    expect(parseSettingsLogicalKey("currencies")).toBe("currencies");
  });

  it("returns null for unknown or empty keys", () => {
    expect(parseSettingsLogicalKey("unknown_key")).toBeNull();
    expect(parseSettingsLogicalKey("production:not_a_setting")).toBeNull();
    expect(parseSettingsLogicalKey("")).toBeNull();
    expect(parseSettingsLogicalKey(null)).toBeNull();
    expect(parseSettingsLogicalKey(undefined)).toBeNull();
  });
});
