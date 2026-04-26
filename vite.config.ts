import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import type { ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "cat-openai-dev-proxy",
      configureServer(server: ViteDevServer) {
        server.middlewares.use(
          "/api/cat-openai",
          (req: IncomingMessage, res: ServerResponse, _next: (err?: unknown) => void) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            return res.end("Method Not Allowed");
          }
          const key = process.env.OPENAI_API_KEY;
          if (!key) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "dev_missing_OPENAI_API_KEY" }));
          }
          let raw = "";
          req.on("data", (c: Buffer) => {
            raw += c.toString("utf8");
          });
          req.on("end", () => {
            void (async () => {
              let payload: { openaiPath?: string; openaiBody?: object };
              try {
                payload = JSON.parse(raw) as { openaiPath?: string; openaiBody?: object };
              } catch {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "invalid_json" }));
              }
              const openaiPath = payload.openaiPath || "/v1/chat/completions";
              const openaiBody = payload.openaiBody;
              if (!openaiBody || typeof openaiBody !== "object") {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "missing_openaiBody" }));
              }
              const pathNorm = openaiPath.startsWith("/") ? openaiPath : `/${openaiPath}`;
              try {
                const r = await fetch("https://api.openai.com" + pathNorm, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                  body: JSON.stringify(openaiBody),
                });
                const buf = await r.arrayBuffer();
                res.statusCode = r.status;
                const ct = r.headers.get("content-type") || "application/json";
                res.setHeader("content-type", ct);
                return res.end(Buffer.from(buf));
              } catch {
                res.statusCode = 502;
                return res.end(JSON.stringify({ error: "openai_fetch_failed" }));
              }
            })();
          });
        }
        );
      },
    },
    {
      name: "cat-google-sheet-csv-dev-proxy",
      configureServer(server: ViteDevServer) {
        const buildExportUrl = (raw: string) => {
          const s = String(raw || "").trim();
          if (!s) throw new Error("empty_url");
          const u = new URL(s);
          if (u.hostname.toLowerCase() !== "docs.google.com") throw new Error("only_docs_google");
          const m = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          if (!m) throw new Error("not_spreadsheet");
          const spreadsheetId = m[1];
          let gid = u.searchParams.get("gid");
          if (gid == null || gid === "") {
            const hm = (u.hash || "").match(/gid=(\d+)/);
            if (hm) gid = hm[1];
          }
          if (gid == null || gid === "") gid = "0";
          return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
        };
        const MAX = 12 * 1024 * 1024;
        server.middlewares.use(
          "/api/cat-google-sheet-csv",
          (req: IncomingMessage, res: ServerResponse, _next: (err?: unknown) => void) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              return res.end(JSON.stringify({ error: "method_not_allowed" }));
            }
            let raw = "";
            req.on("data", (c: Buffer) => {
              raw += c.toString("utf8");
            });
            req.on("end", () => {
              void (async () => {
                let payload: { url?: string };
                try {
                  payload = JSON.parse(raw) as { url?: string };
                } catch {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  return res.end(JSON.stringify({ error: "invalid_json" }));
                }
                const url = payload && payload.url;
                if (!url || typeof url !== "string") {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  return res.end(JSON.stringify({ error: "missing_url" }));
                }
                let exportUrl: string;
                try {
                  exportUrl = buildExportUrl(url);
                } catch (e) {
                  const code = e instanceof Error ? e.message : "bad_url";
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  return res.end(JSON.stringify({ error: code }));
                }
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), 25000);
                try {
                  const r = await fetch(exportUrl, {
                    method: "GET",
                    redirect: "follow",
                    signal: ac.signal,
                    headers: {
                      "User-Agent": "1UP-TMS-CAT/1.0 (vite dev)",
                      Accept: "text/csv,*/*",
                    },
                  });
                  clearTimeout(timer);
                  if (!r.ok) {
                    res.statusCode = 502;
                    res.setHeader("Content-Type", "application/json");
                    return res.end(JSON.stringify({ error: "upstream_http", status: r.status }));
                  }
                  const buf = await r.arrayBuffer();
                  if (buf.byteLength > MAX) {
                    res.statusCode = 413;
                    res.setHeader("Content-Type", "application/json");
                    return res.end(JSON.stringify({ error: "csv_too_large" }));
                  }
                  const csv = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json; charset=utf-8");
                  return res.end(JSON.stringify({ csv }));
                } catch {
                  clearTimeout(timer);
                  res.statusCode = 502;
                  res.setHeader("Content-Type", "application/json");
                  return res.end(JSON.stringify({ error: "fetch_failed" }));
                }
              })();
            });
          }
        );
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
