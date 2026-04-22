/**
 * Vercel Serverless：轉送 OpenAI Chat Completions，金鑰僅在伺服器（OPENAI_API_KEY）。
 * 請求體：{ openaiPath?: string, openaiBody: object }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "server_missing_openai_key" });
  }
  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }
  const openaiPath = (payload && payload.openaiPath) || "/v1/chat/completions";
  const openaiBody = payload && payload.openaiBody;
  if (!openaiBody || typeof openaiBody !== "object") {
    return res.status(400).json({ error: "missing_openaiBody" });
  }
  const base = "https://api.openai.com";
  const pathNorm = String(openaiPath).startsWith("/") ? String(openaiPath) : `/${openaiPath}`;
  try {
    const r = await fetch(base + pathNorm, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(openaiBody),
    });
    const ct = r.headers.get("content-type") || "application/json";
    const buf = await r.arrayBuffer();
    res.status(r.status);
    res.setHeader("content-type", ct);
    return res.end(Buffer.from(buf));
  } catch (e) {
    return res.status(502).json({ error: "openai_fetch_failed" });
  }
}
