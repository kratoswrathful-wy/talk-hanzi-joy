/**
 * CAT 匯入／稍後連結後，承接 LMS 既有有效指派。
 * 檔案與句段建立完成後才呼叫；失敗不撤回已匯入檔案。
 */
(function (global) {
  function cloudCall(action, payload) {
    const ctx = global.CatDataProviderContext;
    if (!ctx || !ctx.cloudRpc) return Promise.reject(new Error("no cloud rpc"));
    return ctx.cloudRpc.call(action, payload || {});
  }

  function toast(message, kind) {
    if (typeof global.showCatToast === "function") {
      global.showCatToast(message, kind || "info");
      return;
    }
    console.warn("[lms-inherit]", message);
  }

  function pickSharedRow(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return Promise.resolve(null);
    if (list.length === 1) return Promise.resolve(list[0].id);
    const lines = list.map((row, idx) => {
      const name = String(row.segment || "（無檔名）").trim();
      const range = String(row.lineRange || "").trim() || "整檔";
      return `${idx + 1}. ${name} ${range}`;
    }).join("\n");
    const raw = global.prompt(
      `此檔對到多列共用指派，請輸入要承接的列號（不必重選人員）：\n${lines}`,
      "1",
    );
    if (raw == null) return Promise.resolve(null);
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > list.length) return Promise.resolve(null);
    return Promise.resolve(list[n - 1].id);
  }

  async function afterFileReady(input) {
    const caseId = String((input && input.caseId) || "").trim();
    const fileId = String((input && input.fileId) || "").trim();
    const fileName = String((input && input.fileName) || "").trim();
    const silent = !!(input && input.silent);
    if (!caseId || !fileId) return { ok: false, skipped: true };
    try {
      let res = await cloudCall("lms.inheritAssignmentsForLinkedFile", {
        caseId,
        fileId,
        fileName,
      });
      if (res && res.needsRowChoice) {
        const chosen = await pickSharedRow(res.candidates || []);
        if (!chosen) {
          if (!silent) {
            toast("檔案已匯入，但尚未選定要承接的共用列。可稍後重試帶入人員，不必再匯入。", "error");
          }
          return { ok: false, needsRowChoice: true };
        }
        res = await cloudCall("lms.inheritAssignmentsForLinkedFile", {
          caseId,
          fileId,
          fileName,
          chosenRowId: chosen,
        });
      }
      if (!res || !res.ok) {
        if (!silent) {
          toast(
            (res && (res.description || res.title)) || "檔案已匯入，但人員尚未帶入。可重試帶入，不必再匯入一次。",
            "error",
          );
        }
        return { ok: false, reason: res && res.reason };
      }
      return { ok: true, report: res.report || null };
    } catch (err) {
      if (!silent) {
        toast("檔案已匯入，但人員尚未帶入。可重試帶入，不必再匯入一次。", "error");
      }
      return { ok: false, reason: err && err.message };
    }
  }

  global.LmsInheritAssignments = { afterFileReady };
})(window);
