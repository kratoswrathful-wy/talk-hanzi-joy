import { StrictMode, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { computeThenSet } from "./commit-latest-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderCounter(
  container: HTMLElement,
  persist: (n: number) => void,
  errors: Error[],
  wrapStrict: boolean,
) {
  function Probe() {
    const latest = useRef(0);
    const [n, setN] = useState(0);
    return (
      <button
        type="button"
        onClick={() => {
          try {
            persist(computeThenSet(latest, setN, (prev) => prev + 1));
            persist(computeThenSet(latest, setN, (prev) => prev + 1));
          } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }}
      >
        {n}
      </button>
    );
  }
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(wrapStrict ? <StrictMode><Probe /></StrictMode> : <Probe />);
  });
  return root!;
}

describe("computeThenSet 真 React 契約", () => {
  const containers: HTMLElement[] = [];
  const roots: Root[] = [];

  afterEach(() => {
    act(() => {
      for (const root of roots) root.unmount();
    });
    roots.length = 0;
    for (const node of containers) node.remove();
    containers.length = 0;
  });

  it("同一事件連續兩次 +1：後續儲存都拿到值，畫面為 2，不拋 updater 未跑", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const persisted: number[] = [];
    const errors: Error[] = [];
    const root = renderCounter(container, (n) => persisted.push(n), errors, false);
    roots.push(root);

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(errors.map((error) => error.message)).toEqual([]);
    expect(persisted).toEqual([1, 2]);
    expect(button!.textContent).toBe("2");
  });

  it("StrictMode 下同一事件連續兩次也不重複寫入、不拋錯", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const persisted: number[] = [];
    const errors: Error[] = [];
    const root = renderCounter(container, (n) => persisted.push(n), errors, true);
    roots.push(root);

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(errors.map((error) => error.message)).toEqual([]);
    expect(persisted).toEqual([1, 2]);
    expect(button!.textContent).toBe("2");
  });

  it("連續兩個事件各自 +1，第二次用上一事件結果", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const persisted: number[] = [];
    const errors: Error[] = [];

    function Probe() {
      const latest = useRef(0);
      const [n, setN] = useState(0);
      return (
        <button
          type="button"
          onClick={() => {
            try {
              persisted.push(computeThenSet(latest, setN, (prev) => prev + 1));
            } catch (error) {
              errors.push(error instanceof Error ? error : new Error(String(error)));
            }
          }}
        >
          {n}
        </button>
      );
    }

    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    roots.push(root!);

    const button = container.querySelector("button");
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(errors).toEqual([]);
    expect(persisted).toEqual([1, 2]);
    expect(button!.textContent).toBe("2");
  });

  it("已有待更新狀態時，同一事件後值仍依序累加", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const persisted: number[] = [];

    function Probe() {
      const latest = useRef(0);
      const [n, setN] = useState(0);
      return (
        <button
          type="button"
          onClick={() => {
            setN((prev) => prev + 10);
            latest.current += 10;
            persisted.push(computeThenSet(latest, setN, (prev) => prev + 1));
            persisted.push(computeThenSet(latest, setN, (prev) => prev + 1));
          }}
        >
          {n}
        </button>
      );
    }

    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    roots.push(root!);

    act(() => {
      container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(persisted).toEqual([11, 12]);
    expect(container.querySelector("button")!.textContent).toBe("12");
  });
});
