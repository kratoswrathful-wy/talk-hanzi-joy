import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { toast, resetToastStore } from "@/hooks/use-toast";
import { useCreatedCaseNotice } from "@/hooks/use-created-case-notice";
import {
  CREATE_NOTICE_DURATION_MS,
  createdCaseNavigationState,
  feedbackForCaseCreateOutcome,
  type CaseCreateNotice,
} from "@/lib/case-create-outcome";

const CASE_ID = "74016a64-c0de-4b08-8d92-cf2c18feaaa4";

function openToastByText(text: string) {
  return screen.queryAllByText(text, { exact: false }).find((node) => node.closest("[data-state='open']")) ?? null;
}

function CreateThenDetail({ detailReadyAfterMs }: { detailReadyAfterMs: number }) {
  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/" element={<CreateStub />} />
        <Route path="/cases/:id" element={<DetailStub detailReadyAfterMs={detailReadyAfterMs} />} />
      </Routes>
    </>
  );
}

function CreateStub() {
  const navigate = useNavigate();
  const feedback = feedbackForCaseCreateOutcome({
    kind: "created",
    caseId: CASE_ID,
    omittedAssignmentLabels: ["審稿人員"],
  });
  return (
    <button
      type="button"
      onClick={() => navigate(`/cases/${CASE_ID}`, { state: createdCaseNavigationState(feedback) })}
    >
      新增案件
    </button>
  );
}

function DetailStub({ detailReadyAfterMs }: { detailReadyAfterMs: number }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locState = (location.state ?? {}) as {
    createNotice?: CaseCreateNotice;
    autoFocusTitle?: boolean;
  };
  const loaded = useDelayedReady(detailReadyAfterMs);

  useCreatedCaseNotice({
    caseId: id,
    loadedCaseId: loaded ? id : undefined,
    createNotice: locState.createNotice,
    autoFocusTitle: locState.autoFocusTitle,
    navigate,
  });

  return (
    <div>
      <h1>{loaded ? "案件詳情已可見" : "載入中"}</h1>
      <div data-testid="has-create-notice">{locState.createNotice ? "yes" : "no"}</div>
    </div>
  );
}

function useDelayedReady(delayMs: number) {
  const [ready, setReady] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return ready;
}

describe("created-case notice visibility", () => {
  beforeEach(() => {
    resetToastStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      resetToastStore();
    });
    cleanup();
    vi.useRealTimers();
  });

  it("keeps a 10s toast visibly open at 5s and closes after duration", () => {
    render(<Toaster />);
    act(() => {
      toast({
        title: "已新增案件",
        description: "本次未帶入",
        duration: CREATE_NOTICE_DURATION_MS,
      });
    });

    expect(openToastByText("已新增案件")).toBeTruthy();
    expect(openToastByText("本次未帶入")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(openToastByText("已新增案件")).toBeTruthy();
    expect(openToastByText("本次未帶入")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(CREATE_NOTICE_DURATION_MS - 5_000 + 50);
    });
    expect(openToastByText("已新增案件")).toBeFalsy();
    expect(openToastByText("本次未帶入")).toBeFalsy();
  });

  it("shows the omitted-reviewer notice after detail is visible, keeps it 5s, and does not replay after replace", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CreateThenDetail detailReadyAfterMs={250} />
      </MemoryRouter>,
    );

    act(() => {
      screen.getByRole("button", { name: "新增案件" }).click();
    });
    expect(screen.getByText("載入中")).toBeTruthy();
    expect(openToastByText("已新增案件")).toBeFalsy();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText("案件詳情已可見")).toBeTruthy();
    expect(openToastByText("已新增案件")).toBeTruthy();
    expect(openToastByText("本次未帶入")).toBeTruthy();
    expect(screen.getByTestId("has-create-notice").textContent).toBe("no");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(openToastByText("已新增案件")).toBeTruthy();
    expect(openToastByText("本次未帶入")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(CREATE_NOTICE_DURATION_MS - 5_000 + 50);
    });
    expect(openToastByText("已新增案件")).toBeFalsy();
  });

  it("drops the create notice when a second toast is added because the shared stack keeps only one", () => {
    render(<Toaster />);
    act(() => {
      toast({
        title: "已新增案件",
        description: "本次未帶入",
        duration: CREATE_NOTICE_DURATION_MS,
      });
    });
    expect(openToastByText("已新增案件")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2_000);
      toast({ title: "工具憑證載入失敗", duration: 5_000 });
    });

    expect(openToastByText("已新增案件")).toBeFalsy();
    expect(openToastByText("工具憑證載入失敗")).toBeTruthy();
  });
});
