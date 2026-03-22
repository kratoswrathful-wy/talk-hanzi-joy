import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  caseId: string;
}

interface State {
  error: Error | null;
}

/**
 * 包住 BlockNote 富文本；若 body_content 異常導致編輯器崩潰，避免整個案件頁變黑屏。
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
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-2">
          <p className="font-medium text-destructive">案件說明區無法顯示</p>
          <p className="text-muted-foreground">
            可能是此欄位存了舊版或異常格式。請重新整理頁面；若仍失敗，請在資料庫檢查此案件的{" "}
            <code className="rounded bg-muted px-1 text-xs">body_content</code> 是否為合法 JSON 陣列。
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
