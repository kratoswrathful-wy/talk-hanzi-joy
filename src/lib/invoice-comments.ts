import type { Json } from "@/integrations/supabase/types";

/** 客戶／稿費請款單留言（與畫面 CommentEntry 同形，timestamp 為 24 小時制字串）。 */
export type InvoiceComment = {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string;
  timestamp: string;
};

function nameUrlFromJson(x: Json): { name: string; url: string } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.name !== "string" || typeof x.url !== "string") return undefined;
  return { name: x.name, url: x.url };
}

export function invoiceCommentFromJson(x: Json): InvoiceComment | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (
    typeof x.id !== "string"
    || typeof x.author !== "string"
    || typeof x.content !== "string"
    || typeof x.timestamp !== "string"
  ) {
    return undefined;
  }
  const imageUrls = Array.isArray(x.imageUrls)
    ? x.imageUrls.filter((u): u is string => typeof u === "string")
    : undefined;
  const fileUrls = Array.isArray(x.fileUrls)
    ? x.fileUrls.flatMap((f) => {
        const p = nameUrlFromJson(f);
        return p ? [p] : [];
      })
    : undefined;
  return {
    id: x.id,
    author: x.author,
    content: x.content,
    timestamp: x.timestamp,
    ...(imageUrls?.length ? { imageUrls } : {}),
    ...(fileUrls?.length ? { fileUrls } : {}),
    ...(typeof x.replyTo === "string" ? { replyTo: x.replyTo } : {}),
  };
}

/** DB JSON／null／空陣列 → 型別；不把 note 混進來。 */
export function invoiceCommentsFromJson(raw: Json | null | undefined): InvoiceComment[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoiceComment[] = [];
  for (const item of raw) {
    const entry = invoiceCommentFromJson(item);
    if (entry) out.push(entry);
  }
  return out;
}

export function invoiceCommentsToJson(comments: InvoiceComment[]): Json {
  return comments.map((c) => ({
    id: c.id,
    author: c.author,
    content: c.content,
    ...(c.imageUrls ? { imageUrls: c.imageUrls } : {}),
    ...(c.fileUrls ? { fileUrls: c.fileUrls.map((f) => ({ name: f.name, url: f.url })) } : {}),
    ...(c.replyTo ? { replyTo: c.replyTo } : {}),
    timestamp: c.timestamp,
  }));
}
