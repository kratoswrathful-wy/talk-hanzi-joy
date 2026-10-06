import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CaseBodyEditorBoundary } from "./CaseBodyEditorBoundary";
import { CaseBodyOmittedPreview } from "./CaseBodyOmittedPreview";
import { previewBodyText } from "@/lib/extract-block-text";

function Boom(): never {
  throw new Error("synthetic editor crash");
}

function ThrowingOmittedPreview() {
  previewBodyText([{ type: "paragraph" }], () => {
    throw new Error("synthetic omittedPreview crash");
  });
  return <div data-testid="case-detail-omitted-preview">不應顯示</div>;
}

const tableBody = [
  {
    id: "p1",
    type: "paragraph",
    content: [{ type: "text", text: "相鄰段落", styles: {} }],
    children: [],
  },
  {
    id: "t1",
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: [
            [{ type: "text", text: "表頭甲", styles: {} }],
            [{ type: "text", text: "表頭乙", styles: {} }],
          ],
        },
      ],
    },
    children: [],
  },
];

describe("CaseBodyEditorBoundary B5", () => {
  it("子元件拋錯時顯示返回清單，不要求先整站重整", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="synthetic-table-b5">
          <Boom />
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText("案件說明區無法顯示")).toBeInTheDocument();
    expect(screen.getByTestId("case-body-recover-list")).toHaveAttribute("href", "/cases");
    expect(screen.getByTestId("case-body-recover-retry")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("摘要路徑受控拋錯時同樣被邊界接住，可回清單", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="synthetic-omitted-b5">
          <ThrowingOmittedPreview />
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("case-body-error-recovery")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回案件清單" })).toHaveAttribute("href", "/cases");
    expect(screen.queryByTestId("case-detail-omitted-preview")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("換另一個案件識別後錯誤狀態清除，不必整站重整", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="case-a">
          <Boom />
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("case-body-error-recovery")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="case-b">
          <p>另一案件說明</p>
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText("另一案件說明")).toBeInTheDocument();
    expect(screen.queryByTestId("case-body-error-recovery")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("未拋錯時照常顯示子內容", () => {
    render(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="synthetic-ok">
          <p>合成說明</p>
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText("合成說明")).toBeInTheDocument();
    expect(screen.queryByText("案件說明區無法顯示")).not.toBeInTheDocument();
  });

  it("B2 省略預覽：含表格的完整 body 在子元件內計算，不拋錯", () => {
    render(
      <MemoryRouter>
        <CaseBodyEditorBoundary caseId="preview-table">
          <CaseBodyOmittedPreview body={tableBody} fallbackNote="備註不應蓋過表格" />
        </CaseBodyEditorBoundary>
      </MemoryRouter>,
    );
    const preview = screen.getByTestId("case-detail-omitted-preview");
    expect(preview).toHaveTextContent("相鄰段落");
    expect(preview).toHaveTextContent("表頭甲");
    expect(screen.queryByTestId("case-body-error-recovery")).not.toBeInTheDocument();
  });

  it("B5 點返回案件清單會切到清單路由，不只是有 href", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/cases/synthetic-table-b5"]}>
        <Routes>
          <Route path="/cases" element={<div data-testid="cases-list-page">案件清單</div>} />
          <Route
            path="/cases/:id"
            element={
              <CaseBodyEditorBoundary caseId="synthetic-table-b5">
                <Boom />
              </CaseBodyEditorBoundary>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("case-body-error-recovery")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("case-body-recover-list"));
    expect(screen.getByTestId("cases-list-page")).toBeInTheDocument();
    expect(screen.queryByTestId("case-body-error-recovery")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
