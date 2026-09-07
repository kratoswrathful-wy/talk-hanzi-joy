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

  global.CatWorkflowContextLoad = {
    resolveWorkflowStagesLoadPlan,
    classifyWorkflowLoadState,
  };
})(typeof window !== "undefined" ? window : globalThis);
