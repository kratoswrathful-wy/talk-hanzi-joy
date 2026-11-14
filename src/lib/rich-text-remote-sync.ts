/**
 * 富文字遠端同步決策：閱讀中套新版、編輯中不覆蓋、舊回應不回帶。
 * 不依賴 BlockNote 實例，方便單元測試。
 */

export type RemoteEditorAction = "ignore" | "apply" | "adopt" | "conflict" | "ackOwn";

/** 只為比對把 +00:00 收成 Z，不經 Date，以免截掉微秒。 */
export function canonicalRevisionToken(
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return String(value);
  return String(value)
    .trim()
    .replace(" ", "T")
    .replace(/\+00:00$/, "Z")
    .replace(/-00:00$/, "Z");
}

export function isSameRevision(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const left = canonicalRevisionToken(a);
  const right = canonicalRevisionToken(b);
  if (left == null || right == null) return false;
  return left === right;
}

export function isOwnWriteRevision(
  incoming: string | number | null | undefined,
  ownWriteRevision: string | number | null | undefined,
): boolean {
  return isSameRevision(incoming, ownWriteRevision);
}

export function serializeBlocksForCompare(blocks: unknown): string {
  return JSON.stringify(stripBlockIds(blocks ?? []));
}

function stripBlockIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripBlockIds);
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id") continue;
      next[key] = stripBlockIds(nested);
    }
    return next;
  }
  return value;
}

export function isNewerRevision(
  incoming: string | number | null | undefined,
  lastApplied: string | number | null | undefined,
): boolean {
  const incomingCanon = canonicalRevisionToken(incoming);
  const lastCanon = canonicalRevisionToken(lastApplied);
  if (incomingCanon == null) return false;
  if (lastCanon == null) return true;
  if (incomingCanon === lastCanon) return false;
  const incomingNum = typeof incoming === "number" ? incoming : Number(incomingCanon);
  const lastNum = typeof lastApplied === "number" ? lastApplied : Number(lastCanon);
  if (Number.isFinite(incomingNum) && Number.isFinite(lastNum)) {
    return incomingNum > lastNum;
  }
  return incomingCanon > lastCanon;
}

export function decideRemoteEditorUpdate(input: {
  documentId: string;
  incomingDocumentId: string;
  incomingRevision: string | number | null | undefined;
  lastAppliedRevision: string | number | null | undefined;
  suppressedRevision?: string | number | null;
  ownWriteRevision?: string | number | null;
  localDirty: boolean;
  hasLocalDraft?: boolean;
  localSerialized: string;
  remoteSerialized: string;
}): RemoteEditorAction {
  if (!input.documentId || input.documentId !== input.incomingDocumentId) {
    return "ignore";
  }
  const ownWrite = isOwnWriteRevision(input.incomingRevision, input.ownWriteRevision);
  if (!ownWrite && !isNewerRevision(input.incomingRevision, input.lastAppliedRevision)) {
    return "ignore";
  }
  const unsaved = input.hasLocalDraft === true;
  if (ownWrite) {
    if (input.remoteSerialized === input.localSerialized || !unsaved) return "adopt";
    return "ackOwn";
  }
  if (input.remoteSerialized === input.localSerialized) {
    return "adopt";
  }
  if (unsaved) {
    if (
      input.suppressedRevision != null &&
      input.suppressedRevision !== "" &&
      isSameRevision(input.suppressedRevision, input.incomingRevision)
    ) {
      return "ignore";
    }
    return "conflict";
  }
  return "apply";
}

/** 閱讀中且遠端較新：外層用 key 重建編輯器，不依賴 BlockNote replaceBlocks 是否真的畫出來。 */
export function shouldRemountIdleEditor(input: {
  remoteRevision: string | number | null | undefined;
  appliedRevision: string | number | null | undefined;
  hasLocalDraft: boolean;
  conflictOpen: boolean;
  ownWriteRevision?: string | number | null;
}): boolean {
  if (input.hasLocalDraft || input.conflictOpen) return false;
  if (isOwnWriteRevision(input.remoteRevision, input.ownWriteRevision)) return false;
  return isNewerRevision(input.remoteRevision, input.appliedRevision);
}
