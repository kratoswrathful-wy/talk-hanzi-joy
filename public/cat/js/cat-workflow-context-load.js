/**
 * CAT 工作階段載入策略（純函式）。
 * 團隊模式讀取不得依賴無權的 ensure_cat_file_workflow_stages。
 */
(function (global) {
  "use strict";

  function resolveWorkflowStagesLoadPlan(input) {
    const existing = Array.isArray(input.existingStages) ? input.existingStages : [];
    if (existing.length > 0) {
      return { action: "use_existing", stages: existing };
    }
    if (input.isTeamMode) {
      return { action: "empty_ok", stages: [] };
    }
    return { action: "ensure_local", stages: [] };
  }

  function classifyWorkflowLoadState(input) {
    if (input.error) return "error";
    if (input.loading) return "loading";
    if (Array.isArray(input.stages) && input.stages.length > 0) return "ready";
    return "empty";
  }

  /** 開視窗／套用前：是否允許操作目前載入結果 */
  function canOperateWorkflowContext(input) {
    const state = String(input.loadState || "");
    if (state === "loading" || state === "error") return false;
    if (input.expectedFileId != null && input.loadedFileId != null
      && String(input.expectedFileId) !== String(input.loadedFileId)) {
      return false;
    }
    return state === "ready" || state === "empty";
  }

  function emptyWorkflowStagesUserMessage(input) {
    if (input.isTeamMode) {
      return "此檔目前沒有工作階段。請由專案管理員在 CAT 指派／工作流程設定建立階段（團隊模式不會在此自動 ensure）。";
    }
    return "此檔目前沒有工作階段。可於本機模式建立後再調整狀態。";
  }

  function shouldApplyWorkflowLoadResult(input) {
    const req = Number(input.requestSeq);
    const latest = Number(input.latestSeq);
    if (!Number.isFinite(req) || !Number.isFinite(latest)) return false;
    if (req !== latest) return false;
    if (input.expectedFileId != null && input.resultFileId != null
      && String(input.expectedFileId) !== String(input.resultFileId)) {
      return false;
    }
    return true;
  }

  global.CatWorkflowContextLoad = {
    resolveWorkflowStagesLoadPlan,
    classifyWorkflowLoadState,
    canOperateWorkflowContext,
    emptyWorkflowStagesUserMessage,
    shouldApplyWorkflowLoadResult,
  };
})(typeof window !== "undefined" ? window : globalThis);
