import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  caseId: string;
}

interface State {
  error: Error | null;
}

/**
 * 包住案件說明編輯器與省略預覽。body_content 異常導致子樹崩潰時，
 * 不讓整個案件頁變黑屏；可用路由返回清單或再開另一案，不必先整站重整。
 */
export class CaseBodyEditorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CaseBodyEditorBoundary]", this.props.caseId, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.caseId !== this.props.caseId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-2"
          data-testid="case-body-error-recovery"
        >
          <p className="font-medium text-destructive">案件說明區無法顯示</p>
          <p className="text-muted-foreground">
            可能是此欄位存了舊版或異常格式。請先返回案件清單或再開另一案件；不必先重新整理整個網站。若仍失敗，請在資料庫檢查此案件的{" "}
            <code className="rounded bg-muted px-1 text-xs">body_content</code> 是否為合法 JSON 陣列。
          </p>
          <p className="flex flex-wrap gap-3">
            <Link
              to="/cases"
              data-testid="case-body-recover-list"
              className="text-primary underline underline-offset-4"
            >
              返回案件清單
            </Link>
            <button
              type="button"
              data-testid="case-body-recover-retry"
              className="text-primary underline underline-offset-4"
              onClick={() => this.setState({ error: null })}
            >
              再試一次此區
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
