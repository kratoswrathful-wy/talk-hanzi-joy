;(function () {
  function getCatMode() {
    try {
      const m = (new URLSearchParams(window.location.search).get("catStorage") || "").toLowerCase();
      return m === "team" ? "team" : "offline";
    } catch (_) {
      return "offline";
    }
  }

  function createCloudRpcClient() {
    let seq = 0;
    const pending = new Map();

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "CAT_CLOUD_RPC_RESULT") return;

      const payload = event.data.payload || {};
      const requestId = payload.requestId;
      if (!requestId || !pending.has(requestId)) return;

      const { resolve, reject } = pending.get(requestId);
      pending.delete(requestId);
      if (payload.ok) resolve(payload.data);
      else reject(new Error(payload.error || "CAT cloud RPC failed"));
    });

    async function call(action, payload) {
      const requestId = `rpc_${Date.now()}_${seq++}`;
      const req = {
        type: "CAT_CLOUD_RPC",
        payload: { requestId, action, payload: payload || {} },
      };

      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.has(requestId)) {
            pending.delete(requestId);
            reject(new Error(`CAT cloud RPC timeout: ${action}`));
          }
        }, 30000);

        pending.set(requestId, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });

        window.parent.postMessage(req, window.location.origin);
      });
    }

    return { call };
  }

  /**
   * DataProvider contract (runtime):
   * - getMode(): "offline" | "team"
   * - cloudRpc.call(action, payload): Promise<any>
   *
   * DBService in db.js binds to this context and implements full CRUD methods.
   */
  window.CatDataProviderContext = {
    getMode,
    cloudRpc: createCloudRpcClient(),
  };
})();

