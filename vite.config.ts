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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
