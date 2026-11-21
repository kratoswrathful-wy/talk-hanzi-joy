import { describe, expect, it } from "vitest";
import "./grid-virtual-scroll.js";

const { consumeProgrammaticScrollEcho, isUnchangedScroll } = globalThis.CatVirtGrid;

describe("scroll notifications", () => {
  it("does not treat the editor's own scroll write as the user moving the list", () => {
    expect(consumeProgrammaticScrollEcho(120, 120)).toEqual({ echo: true, assignedTop: null });
    expect(consumeProgrammaticScrollEcho(120.4, 120)).toEqual({ echo: true, assignedTop: null });
  });

  it("still counts a later scroll that lands somewhere else", () => {
    expect(consumeProgrammaticScrollEcho(80, 120)).toEqual({ echo: false, assignedTop: null });
    expect(consumeProgrammaticScrollEcho(80, null)).toEqual({ echo: false, assignedTop: null });
  });

  it("ignores a late notice for a position the return key already saw", () => {
    expect(isUnchangedScroll(30389, 30389)).toBe(true);
    expect(isUnchangedScroll(30389.4, 30389)).toBe(true);
    expect(isUnchangedScroll(24071, 30389)).toBe(false);
    expect(isUnchangedScroll(24071, null)).toBe(false);
  });
});
