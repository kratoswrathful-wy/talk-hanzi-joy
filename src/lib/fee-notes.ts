import type { Note } from "@/data/fee-mock-data";
import type { Json } from "@/integrations/supabase/types";

function nameUrlFromJson(x: Json): { name: string; url: string } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.name !== "string" || typeof x.url !== "string") return undefined;
  return { name: x.name, url: x.url };
}

/** 讀回費用相關備註；舊列只有文字也要留下，合法附件／回覆不得丟。 */
export function notesFromJson(raw: Json | null | undefined): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    const imageUrls = Array.isArray(o.imageUrls)
      ? o.imageUrls.filter((u): u is string => typeof u === "string")
      : undefined;
    const fileUrls = Array.isArray(o.fileUrls)
      ? o.fileUrls.flatMap((f) => {
          const p = nameUrlFromJson(f);
          return p ? [p] : [];
        })
      : undefined;
    out.push({
      id: o.id,
      author: typeof o.author === "string" ? o.author : "",
      text: typeof o.text === "string" ? o.text : "",
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(fileUrls?.length ? { fileUrls } : {}),
      ...(typeof o.replyTo === "string" ? { replyTo: o.replyTo } : {}),
    });
  }
  return out;
}

export function notesToJson(notes: Note[]): Json {
  return notes.map((n) => ({
    id: n.id,
    author: n.author,
    text: n.text,
    createdAt: n.createdAt,
    ...(n.imageUrls?.length ? { imageUrls: n.imageUrls } : {}),
    ...(n.fileUrls?.length ? { fileUrls: n.fileUrls.map((f) => ({ name: f.name, url: f.url })) } : {}),
    ...(n.replyTo ? { replyTo: n.replyTo } : {}),
  }));
}

export function feeNoteToCommentFields(n: Note): {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string;
} {
  return {
    id: n.id,
    author: n.author,
    content: n.text,
    ...(n.imageUrls?.length ? { imageUrls: n.imageUrls } : {}),
    ...(n.fileUrls?.length ? { fileUrls: n.fileUrls } : {}),
    ...(n.replyTo ? { replyTo: n.replyTo } : {}),
  };
}
