/**
 * Vercel Serverless：代抓可匿名讀取之 Google 試算表 CSV（避開瀏覽器 CORS）。
 * POST JSON：{ "url": "<使用者貼上的 docs.google.com 連結>" }
 * 回應 JSON：{ "csv": "<UTF-8 字串>" } 或 { "error": "..." }
 */

const MAX_CSV_BYTES = 12 * 1024 * 1024;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** 由編輯連結正規化為 export?format=csv&gid=… */
function buildExportUrlFromUserInput(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("empty_url");
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error("invalid_url");
  }
  const host = u.hostname.toLowerCase();
  if (host !== "docs.google.com") throw new Error("only_docs_google");
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
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }
  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return json(res, 400, { error: "invalid_json" });
  }
  const url = payload && payload.url;
  if (!url || typeof url !== "string") {
    return json(res, 400, { error: "missing_url" });
  }
  let exportUrl;
  try {
    exportUrl = buildExportUrlFromUserInput(url);
  } catch (e) {
    const code = e && e.message ? String(e.message) : "bad_url";
    return json(res, 400, { error: code });
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(exportUrl, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "1UP-TMS-CAT/1.0 (server proxy)",
        Accept: "text/csv,*/*",
      },
    });
    clearTimeout(t);
    if (!r.ok) {
      return json(res, 502, { error: "upstream_http", status: r.status });
    }
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_CSV_BYTES) {
      return json(res, 413, { error: "csv_too_large" });
    }
    const csv = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
    return json(res, 200, { csv });
  } catch (e) {
    clearTimeout(t);
    if (e && e.name === "AbortError") {
      return json(res, 504, { error: "fetch_timeout" });
    }
    return json(res, 502, { error: "fetch_failed" });
  }
}
