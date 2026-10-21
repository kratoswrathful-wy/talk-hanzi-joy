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

  function pickSharedRows(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return Promise.resolve([]);
    if (list.length === 1) return Promise.resolve([list[0].id]);
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("data-lms-inherit-picker", "1");
      overlay.style.cssText = "position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;";
      const box = document.createElement("div");
      box.style.cssText = "background:#fff;color:#0f172a;min-width:320px;max-width:480px;max-height:80vh;overflow:auto;border-radius:10px;padding:1.25rem;box-shadow:0 16px 40px rgba(15,23,42,0.28);";
      const title = document.createElement("h3");
      title.textContent = "選擇要承接的共用列";
      title.style.cssText = "margin:0 0 0.5rem;font-size:1rem;";
      const hint = document.createElement("p");
      hint.textContent = "此檔對到多列、無法依檔名唯一對應。請勾選要帶入人員的列，沒有預設列。";
      hint.style.cssText = "margin:0 0 0.75rem;font-size:0.85rem;color:#475569;";
      const form = document.createElement("div");
      list.forEach((row, idx) => {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:center;gap:0.5rem;margin:0.35rem 0;font-size:0.9rem;";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(row.id || "");
        input.setAttribute("data-inherit-row", String(idx));
        const name = String(row.segment || "（無檔名）").trim();
        const range = String(row.lineRange || "").trim() || "整檔";
        label.appendChild(input);
        label.appendChild(document.createTextNode(name + " " + range));
        form.appendChild(label);
      });
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "稍後再選";
      cancel.className = "secondary-btn";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "承接勾選列";
      ok.className = "primary-btn";
      function finish(ids) {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(ids);
      }
      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          finish([]);
        }
      }
      cancel.addEventListener("click", () => finish([]));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish([]);
      });
      ok.addEventListener("click", () => {
        const ids = Array.from(form.querySelectorAll("input[type=checkbox]:checked"))
          .map((el) => String(el.value || "").trim())
          .filter(Boolean);
        finish(ids);
      });
      document.addEventListener("keydown", onKey);
      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(title);
      box.appendChild(hint);
      box.appendChild(form);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
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
        const chosen = await pickSharedRows(res.candidates || []);
        if (!chosen.length) {
          if (!silent) {
            toast("檔案已匯入，但尚未選定要承接的共用列。可稍後重試帶入人員，不必再匯入。", "error");
          }
          return { ok: false, needsRowChoice: true };
        }
        res = await cloudCall("lms.inheritAssignmentsForLinkedFile", {
          caseId,
          fileId,
          fileName,
          chosenRowIds: chosen,
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

  global.LmsInheritAssignments = { afterFileReady, pickSharedRows };
})(window);
