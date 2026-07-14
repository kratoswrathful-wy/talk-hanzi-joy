/**
 * 欄位對應視窗（Key／額外資訊）：只影響顯示層；不改 xliffTuId／匯出。
 * 掛 window.MetaDisplayMapUi
 */
(function (global) {
  "use strict";

  const MODAL_ID = "metaDisplayMapModal";
  let _state = {
    fileId: null,
    projectId: null,
    sourceFormat: "",
    kinds: [],
    keyItem: null,
    extraItems: [],
    hiddenItems: [],
  };

  function getDB() {
    if (typeof DBService !== "undefined") return DBService;
    return global.DBService || null;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showModal(visible) {
    const el = $(MODAL_ID);
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function currentConfigFromState() {
    const keyItem = _state.keyItem || null;
    const extraItems = (_state.extraItems || []).filter(Boolean);
    const hiddenItems = (_state.hiddenItems || []).filter(Boolean);
    if (!keyItem && !extraItems.length && !hiddenItems.length) return null;
    return { keyItem, extraItems, hiddenItems };
  }

  function applyConfigToState(cfg) {
    const Apply = global.MetaDisplayApply;
    const norm =
      Apply && typeof Apply.normalizeMetaDisplayConfig === "function"
        ? Apply.normalizeMetaDisplayConfig(cfg)
        : null;
    _state.keyItem = (norm && norm.keyItem) || null;
    _state.extraItems = (norm && norm.extraItems) || [];
    _state.hiddenItems = (norm && norm.hiddenItems) || [];
  }

  function roleOf(key) {
    if (_state.keyItem === key) return "key";
    if ((_state.hiddenItems || []).includes(key)) return "hidden";
    if ((_state.extraItems || []).includes(key)) return "extra";
    return "unset";
  }

  function setRole(key, role) {
    _state.keyItem = _state.keyItem === key ? null : _state.keyItem;
    _state.extraItems = (_state.extraItems || []).filter((k) => k !== key);
    _state.hiddenItems = (_state.hiddenItems || []).filter((k) => k !== key);
    if (role === "key") _state.keyItem = key;
    else if (role === "extra") _state.extraItems.push(key);
    else if (role === "hidden") _state.hiddenItems.push(key);
    renderKinds();
  }

  function moveExtra(key, dir) {
    const arr = _state.extraItems.slice();
    const i = arr.indexOf(key);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    _state.extraItems = arr;
    renderKinds();
  }

  function renderKinds() {
    const host = $("metaDisplayMapKinds");
    if (!host) return;
    const kinds = _state.kinds || [];
    if (!kinds.length) {
      host.innerHTML =
        '<p style="margin:0; font-size:0.85rem; color:#64748b;">此檔前 20 句沒有可對應的中繼欄位（或為舊匯入尚未刷新）。可關閉視窗；顯示將維持原本 Key／額外資訊。</p>';
      return;
    }
    host.innerHTML = kinds
      .map((k) => {
        const role = roleOf(k.key);
        const samples = (k.sampleValues || []).map(escapeHtml).join(" · ");
        const extraControls =
          role === "extra"
            ? `<span class="meta-map-order">
                <button type="button" class="secondary-btn btn-sm meta-map-up" data-key="${escapeHtml(k.key)}">↑</button>
                <button type="button" class="secondary-btn btn-sm meta-map-down" data-key="${escapeHtml(k.key)}">↓</button>
              </span>`
            : "";
        return `<div class="meta-map-kind-row" data-key="${escapeHtml(k.key)}">
          <div class="meta-map-kind-main">
            <div class="meta-map-kind-title"><code>${escapeHtml(k.key)}</code>
              <span class="meta-map-kind-count">${k.count || 0}</span></div>
            <div class="meta-map-kind-samples" title="${samples}">${samples || "（無範例）"}</div>
          </div>
          <div class="meta-map-kind-roles">
            <label><input type="radio" name="meta-role-${escapeHtml(k.key)}" value="key" ${role === "key" ? "checked" : ""}> Key</label>
            <label><input type="radio" name="meta-role-${escapeHtml(k.key)}" value="extra" ${role === "extra" ? "checked" : ""}> 額外</label>
            <label><input type="radio" name="meta-role-${escapeHtml(k.key)}" value="hidden" ${role === "hidden" ? "checked" : ""}> 隱藏</label>
            <label><input type="radio" name="meta-role-${escapeHtml(k.key)}" value="unset" ${role === "unset" ? "checked" : ""}> 未指定</label>
            ${extraControls}
          </div>
        </div>`;
      })
      .join("");

    host.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", () => {
        const row = input.closest(".meta-map-kind-row");
        const key = row && row.getAttribute("data-key");
        if (!key) return;
        setRole(key, input.value);
      });
    });
    host.querySelectorAll(".meta-map-up").forEach((btn) => {
      btn.addEventListener("click", () => moveExtra(btn.getAttribute("data-key"), -1));
    });
    host.querySelectorAll(".meta-map-down").forEach((btn) => {
      btn.addEventListener("click", () => moveExtra(btn.getAttribute("data-key"), 1));
    });
  }

  async function loadTemplates() {
    const sel = $("metaDisplayMapTemplates");
    if (!sel || !_state.projectId || !getDB()) return;
    sel.innerHTML = '<option value="">— 套用專案範本 —</option>';
    try {
      const proj = await getDB().getProject(_state.projectId);
      const templates = (proj && Array.isArray(proj.metaDisplayTemplates) && proj.metaDisplayTemplates) || [];
      templates.forEach((t, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${t.name || "未命名"}（${t.sourceFormat || "any"}）`;
        sel.appendChild(opt);
      });
      sel._templates = templates;
    } catch (e) {
      console.warn("[MetaDisplayMapUi] loadTemplates", e);
    }
  }

  function bindOnce() {
    if (bindOnce._done) return;
    bindOnce._done = true;
    const close = () => showModal(false);
    const btnClose = $("btnMetaDisplayMapClose");
    const btnCancel = $("btnMetaDisplayMapCancel");
    if (btnClose) btnClose.addEventListener("click", close);
    if (btnCancel) btnCancel.addEventListener("click", close);

    const btnSave = $("btnMetaDisplayMapSave");
    if (btnSave) {
      btnSave.addEventListener("click", async () => {
        if (!_state.fileId || !getDB()) return;
        const config = currentConfigFromState();
        btnSave.disabled = true;
        try {
          await getDB().updateFile(_state.fileId, { metaDisplayConfig: config });
          showModal(false);
          try {
            if (typeof global.onMetaDisplayConfigSaved === "function") {
              await global.onMetaDisplayConfigSaved(_state.fileId, config);
            }
          } catch (redrawErr) {
            console.warn("[MetaDisplayMapUi] redraw after save", redrawErr);
          }
          if (typeof global.showCatToast === "function") {
            global.showCatToast(config ? "已套用欄位對應" : "已清除欄位對應（恢復舊顯示）", "info");
          }
        } catch (e) {
          console.error(e);
          alert("儲存欄位對應失敗：" + ((e && e.message) || e));
        } finally {
          btnSave.disabled = false;
        }
      });
    }

    const btnTpl = $("btnMetaDisplayMapSaveTemplate");
    if (btnTpl) {
      btnTpl.addEventListener("click", async () => {
        if (!_state.projectId || !getDB()) return;
        const config = currentConfigFromState();
        if (!config) {
          alert("請先至少指定 Key 或額外欄位，再存成範本。");
          return;
        }
        const name = window.prompt("範本名稱", "預設欄位對應");
        if (name == null) return;
        const trimmed = String(name).trim() || "預設欄位對應";
        try {
          const proj = await getDB().getProject(_state.projectId);
          const prev = (proj && Array.isArray(proj.metaDisplayTemplates) && proj.metaDisplayTemplates) || [];
          const next = prev.concat([
            {
              name: trimmed,
              sourceFormat: _state.sourceFormat || "",
              config,
            },
          ]);
          await getDB().patchProject(_state.projectId, { metaDisplayTemplates: next });
          await loadTemplates();
          if (typeof global.showCatToast === "function") {
            global.showCatToast("已存成專案範本", "info");
          }
        } catch (e) {
          console.error(e);
          alert("存範本失敗：" + ((e && e.message) || e));
        }
      });
    }

    const sel = $("metaDisplayMapTemplates");
    if (sel) {
      sel.addEventListener("change", () => {
        const idx = sel.value;
        const templates = sel._templates || [];
        if (idx === "" || !templates[Number(idx)]) return;
        applyConfigToState(templates[Number(idx)].config);
        renderKinds();
      });
    }
  }

  /**
   * @param {{ fileId: string|number, projectId?: string|number, segments?: object[], sourceFormat?: string, config?: object|null }} opts
   */
  async function open(opts) {
    bindOnce();
    const fileId = opts && opts.fileId;
    if (fileId == null) return;
    let file = null;
    let segs = Array.isArray(opts.segments) ? opts.segments : null;
    try {
      if (getDB()) {
        file = await getDB().getFile(fileId);
        if (!segs) segs = await getDB().getSegmentsByFile(fileId);
      }
    } catch (e) {
      console.warn("[MetaDisplayMapUi] open load", e);
    }
    const Coll = global.MetaItemsCollector;
    const kinds =
      Coll && typeof Coll.summarizeMetaItemKinds === "function"
        ? Coll.summarizeMetaItemKinds(segs || [], 20)
        : [];
    _state = {
      fileId,
      projectId: (opts && opts.projectId) || (file && file.projectId) || null,
      sourceFormat: (opts && opts.sourceFormat) || (file && file.fileFormat) || "",
      kinds,
      keyItem: null,
      extraItems: [],
      hiddenItems: [],
    };
    applyConfigToState(
      opts && opts.config !== undefined ? opts.config : file && file.metaDisplayConfig,
    );
    const title = $("metaDisplayMapTitle");
    if (title) {
      title.textContent = file && file.name ? `欄位對應：${file.name}` : "欄位對應（Key／額外資訊）";
    }
    renderKinds();
    await loadTemplates();
    showModal(true);
  }

  /**
   * 匯入成功後：僅 XLIFF 家族且有 meta 種類時自動開啟（可跳過）。
   * @param {{ fileIds: Array<string|number> }} opts
   */
  async function openAfterImport(opts) {
    const ids = (opts && opts.fileIds) || [];
    if (!ids.length) return;
    const firstId = ids[0];
    try {
      if (!getDB()) return;
      const segs = await getDB().getSegmentsByFile(firstId);
      const Coll = global.MetaItemsCollector;
      const kinds =
        Coll && typeof Coll.summarizeMetaItemKinds === "function"
          ? Coll.summarizeMetaItemKinds(segs || [], 20)
          : [];
      if (!kinds.length) return;
      await open({ fileId: firstId, segments: segs });
    } catch (e) {
      console.warn("[MetaDisplayMapUi] openAfterImport", e);
    }
  }

  function isOpen() {
    const el = $(MODAL_ID);
    return !!(el && !el.classList.contains("hidden"));
  }

  function close() {
    showModal(false);
  }

  global.MetaDisplayMapUi = {
    open,
    openAfterImport,
    close,
    isOpen,
    _getStateForTest: () => ({ ..._state, config: currentConfigFromState() }),
  };
})(typeof window !== "undefined" ? window : globalThis);
