/**
 * AI 代理檔案上傳：以 bytes/base64 上傳至 Supabase Storage，避開原生 file input。
 */
import { supabase } from "@/integrations/supabase/client";
import { asciiStorageExtension, buildCaseFilePathWithPrefix } from "@/lib/storage-case-files";
import type { AgentResult } from "@/lib/ai-agent-types";

export interface UploadFromBytesInput {
  fileName: string;
  contentType?: string;
  base64?: string;
  bytes?: number[] | Uint8Array;
  bucket?: string;
  pathPrefix?: string;
}

export interface UploadedFileItem {
  name: string;
  url: string;
  size: number;
}

function decodeToUint8Array(input: UploadFromBytesInput): Uint8Array | null {
  if (input.bytes) {
    return input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  }
  if (typeof input.base64 === "string" && input.base64.length > 0) {
    const raw = input.base64.includes(",") ? input.base64.split(",").pop()! : input.base64;
    try {
      const bin = atob(raw);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

function buildObjectPath(fileName: string, pathPrefix?: string): string {
  const ext = asciiStorageExtension(fileName);
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  if (pathPrefix?.trim()) {
    const safe = pathPrefix.replace(/[^a-z0-9-]/gi, "").replace(/^-+|-+$/g, "") || "files";
    return `${safe}/${id}/${id}.${ext}`;
  }
  return `${id}/${id}.${ext}`;
}

/** 上傳二進位至 Storage；供 __lmsAgent.upload.fromBytes 使用 */
export async function uploadFromBytes(
  input: UploadFromBytesInput,
): Promise<AgentResult<UploadedFileItem>> {
  if (!input.fileName?.trim()) {
    return { ok: false, error: "fileName 必填" };
  }
  const data = decodeToUint8Array(input);
  if (!data || data.length === 0) {
    return { ok: false, error: "需提供有效的 base64 或 bytes" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { ok: false, error: "請先登入後再上傳" };
  }

  const bucket = input.bucket || "case-files";
  const path = input.pathPrefix
    ? buildCaseFilePathWithPrefix(input.pathPrefix, new File([data], input.fileName))
    : buildObjectPath(input.fileName, input.pathPrefix);

  const contentType = input.contentType || "application/octet-stream";
  const blob = new Blob([data], { type: contentType });

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    ok: true,
    data: {
      name: input.fileName,
      url: urlData.publicUrl,
      size: data.length,
    },
  };
}
