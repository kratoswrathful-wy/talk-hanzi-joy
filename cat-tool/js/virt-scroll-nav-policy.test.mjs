import { describe, expect, it } from "vitest";
import { shouldForceVirtWindowRebuild } from "./virt-scroll-nav-policy.js";

describe("shouldForceVirtWindowRebuild", () => {
  it("forces rebuild when row is not mounted", () => {
    expect(
      shouldForceVirtWindowRebuild({
        rowMounted: false,
        windowStart: 0,
        windowEnd: 69,
        nextStart: 0,
        nextEnd: 69,
      }),
    ).toBe(true);
  });

  it("forces rebuild when window indices are unset", () => {
    expect(
      shouldForceVirtWindowRebuild({
        rowMounted: true,
        windowStart: -1,
        windowEnd: -1,
        nextStart: 10,
        nextEnd: 79,
      }),
    ).toBe(true);
  });

  it("skips rebuild when mounted and window range unchanged", () => {
    expect(
      shouldForceVirtWindowRebuild({
        rowMounted: true,
        windowStart: 20,
        windowEnd: 89,
        nextStart: 20,
        nextEnd: 89,
      }),
    ).toBe(false);
  });

  it("forces rebuild when centered target would change the window", () => {
    expect(
      shouldForceVirtWindowRebuild({
        rowMounted: true,
        windowStart: 0,
        windowEnd: 69,
        nextStart: 100,
        nextEnd: 169,
      }),
    ).toBe(true);
  });
});
