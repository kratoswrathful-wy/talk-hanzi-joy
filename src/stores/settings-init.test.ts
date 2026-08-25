import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSettingsLogicalKey } from "./settings-key-map";

const loadSettingsMocks = {
  select_options: vi.fn(async () => undefined),
  default_pricing: vi.fn(async () => undefined),
  label_styles: vi.fn(async () => undefined),
  tool_templates: vi.fn(async () => undefined),
  page_templates: vi.fn(async () => undefined),
  common_links: vi.fn(async () => undefined),
  currencies: vi.fn(async () => undefined),
  ui_button_styles: vi.fn(async () => undefined),
};

const loadAssigneesMock = vi.fn(async () => undefined);
const getAuthenticatedUserMock = vi.fn();
const resetLoadedKeysMock = vi.fn();
const clearLoadedFlagsOnlyMock = vi.fn();

type AuthCb = (event: string, session: { user: { id: string } } | null) => void;
let authCallback: AuthCb | null = null;

function createChannelMock() {
  const api: {
    on: (...args: unknown[]) => unknown;
    subscribe: () => unknown;
  } = {
    on: () => api,
    subscribe: () => ({}),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCb) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    channel: () => createChannelMock(),
  },
}));

vi.mock("@/lib/auth-ready", () => ({
  getAuthenticatedUser: () => getAuthenticatedUserMock(),
}));

vi.mock("@/stores/settings-persistence", () => ({
  resetLoadedKeys: () => resetLoadedKeysMock(),
  clearLoadedFlagsOnly: () => clearLoadedFlagsOnlyMock(),
}));

vi.mock("@/stores/select-options-store", () => ({
  selectOptionsStore: {
    loadSettings: () => loadSettingsMocks.select_options(),
    loadAssignees: () => loadAssigneesMock(),
  },
}));
vi.mock("@/stores/default-pricing-store", () => ({
  defaultPricingStore: { loadSettings: () => loadSettingsMocks.default_pricing() },
}));
vi.mock("@/stores/label-style-store", () => ({
  labelStyleStore: { loadSettings: () => loadSettingsMocks.label_styles() },
}));
vi.mock("@/stores/tool-template-store", () => ({
  toolTemplateStore: { loadSettings: () => loadSettingsMocks.tool_templates() },
}));
vi.mock("@/stores/page-template-store", () => ({
  pageTemplateStore: { loadSettings: () => loadSettingsMocks.page_templates() },
}));
vi.mock("@/stores/common-links-store", () => ({
  commonLinksStore: { loadSettings: () => loadSettingsMocks.common_links() },
}));
vi.mock("@/stores/currency-store", () => ({
  currencyStore: { loadSettings: () => loadSettingsMocks.currencies() },
}));
vi.mock("@/stores/ui-button-style-store", () => ({
  uiButtonStyleStore: { loadSettings: () => loadSettingsMocks.ui_button_styles() },
}));

const { initSettings, __settingsInitTest } = await import("./settings-init");

function resetMocks() {
  for (const fn of Object.values(loadSettingsMocks)) fn.mockClear();
  loadAssigneesMock.mockClear();
  resetLoadedKeysMock.mockClear();
  clearLoadedFlagsOnlyMock.mockClear();
  getAuthenticatedUserMock.mockReset();
}

describe("settings-init single-flight", () => {
  beforeEach(() => {
    resetMocks();
    __settingsInitTest.resetSessionState();
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-a" });
  });

  it("INITIAL_SESSION + initSettings only run one full load", async () => {
    expect(authCallback).toBeTruthy();
    authCallback!("INITIAL_SESSION", { user: { id: "user-a" } });
    initSettings();
    await __settingsInitTest.ensureLoaded();
    await Promise.resolve();

    for (const fn of Object.values(loadSettingsMocks)) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(loadAssigneesMock).toHaveBeenCalledTimes(1);
    expect(__settingsInitTest.isLoaded()).toBe(true);
  });

  it("TOKEN_REFRESHED does not reload", async () => {
    authCallback!("INITIAL_SESSION", { user: { id: "user-a" } });
    await __settingsInitTest.ensureLoaded();
    resetMocks();
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-a" });

    authCallback!("TOKEN_REFRESHED", { user: { id: "user-a" } });
    await Promise.resolve();

    for (const fn of Object.values(loadSettingsMocks)) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(loadAssigneesMock).not.toHaveBeenCalled();
  });

  it("same-user INITIAL_SESSION does not reload after loaded", async () => {
    authCallback!("INITIAL_SESSION", { user: { id: "user-a" } });
    await __settingsInitTest.ensureLoaded();
    resetMocks();
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-a" });

    authCallback!("INITIAL_SESSION", { user: { id: "user-a" } });
    await Promise.resolve();

    for (const fn of Object.values(loadSettingsMocks)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("user switch resets session and loads for the new user", async () => {
    authCallback!("INITIAL_SESSION", { user: { id: "user-a" } });
    await __settingsInitTest.ensureLoaded();
    expect(__settingsInitTest.getCurrentUserId()).toBe("user-a");

    resetMocks();
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-b" });
    authCallback!("SIGNED_IN", { user: { id: "user-b" } });
    await __settingsInitTest.ensureLoaded();

    expect(__settingsInitTest.getCurrentUserId()).toBe("user-b");
    expect(__settingsInitTest.isLoaded()).toBe(true);
    for (const fn of Object.values(loadSettingsMocks)) {
      expect(fn).toHaveBeenCalled();
    }
  });
});

describe("settings-init key map sanity", () => {
  it("page_templates key parses for targeted reload", () => {
    expect(parseSettingsLogicalKey("production:page_templates")).toBe("page_templates");
  });
});
