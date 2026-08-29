import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    primaryRole: "pm" as const,
  }),
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test" as const,
}));

const maybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: () => maybeSingle(),
            single: () => maybeSingle(),
          }),
        }),
      }),
    }),
  },
}));

describe("usePermissions fail-closed hook", () => {
  beforeEach(async () => {
    maybeSingle.mockReset();
    vi.resetModules();
    const { setPermissionFetchTimeoutMs } = await import("@/lib/permission-settings-fetch");
    setPermissionFetchTimeoutMs(40);
  });

  afterEach(async () => {
    const { setPermissionFetchTimeoutMs } = await import("@/lib/permission-settings-fetch");
    setPermissionFetchTimeoutMs(null);
    const { __setPermissionsTestTimeoutMs } = await import("./use-permissions");
    __setPermissionsTestTimeoutMs(null);
  });

  it("timeout 後 canViewField／canEditField／canViewSection 皆為 false", async () => {
    maybeSingle.mockImplementation(
      () =>
        new Promise(() => {
          /* hang */
        }),
    );

    const { usePermissions, __setPermissionsTestTimeoutMs } = await import("./use-permissions");
    __setPermissionsTestTimeoutMs(40);

    const { result } = renderHook(() => usePermissions());

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      },
      { timeout: 3_000 },
    );

    expect(result.current.ready).toBe(false);
    expect(result.current.canViewField("any")).toBe(false);
    expect(result.current.canEditField("any")).toBe(false);
    expect(result.current.canViewSection("any")).toBe(false);
    expect(result.current.checkPerm("client_invoice", "cinv_list_view", "view")).toBe(false);
  });

  it("retry 成功後恢復權限判斷", async () => {
    maybeSingle
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            /* hang first → timeout */
          }),
      )
      .mockResolvedValueOnce({
        data: {
          config: {
            fields: { pm: { title: { view: true, edit: false } } },
            settings_sections: { pm: { general: true } },
            module_permissions: {
              pm: {
                client_invoice: {
                  visible: true,
                  items: { cinv_list_view: { view: true, edit: true } },
                },
              },
            },
          },
        },
        error: null,
      });

    const { usePermissions, __setPermissionsTestTimeoutMs } = await import("./use-permissions");
    __setPermissionsTestTimeoutMs(40);

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 3_000 });
    expect(result.current.canViewField("title")).toBe(false);

    const { setPermissionFetchTimeoutMs } = await import("@/lib/permission-settings-fetch");
    setPermissionFetchTimeoutMs(2_000);
    __setPermissionsTestTimeoutMs(2_000);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.canViewField("title")).toBe(true);
    expect(result.current.canEditField("title")).toBe(false);
    expect(result.current.canViewSection("general")).toBe(true);
    expect(result.current.checkPerm("client_invoice", "cinv_list_view", "view")).toBe(true);
  });
});
