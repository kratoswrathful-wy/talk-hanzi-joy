/**
 * 富文字遠端同步決策：閱讀中套新版、編輯中不覆蓋、舊回應不回帶。
 * 不依賴 BlockNote 實例，方便單元測試。
 */

export type RemoteEditorAction = "ignore" | "apply" | "adopt" | "conflict";

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
  if (incoming == null || incoming === "") return false;
  if (lastApplied == null || lastApplied === "") return true;
  if (incoming === lastApplied) return false;
  const incomingNum = typeof incoming === "number" ? incoming : Number(incoming);
  const lastNum = typeof lastApplied === "number" ? lastApplied : Number(lastApplied);
  if (Number.isFinite(incomingNum) && Number.isFinite(lastNum)) {
    return incomingNum > lastNum;
  }
  return String(incoming) > String(lastApplied);
}

export function decideRemoteEditorUpdate(input: {
  documentId: string;
  incomingDocumentId: string;
  incomingRevision: string | number | null | undefined;
  lastAppliedRevision: string | number | null | undefined;
  suppressedRevision?: string | number | null;
  localDirty: boolean;
  localSerialized: string;
  remoteSerialized: string;
}): RemoteEditorAction {
  if (!input.documentId || input.documentId !== input.incomingDocumentId) {
    return "ignore";
  }
  if (!isNewerRevision(input.incomingRevision, input.lastAppliedRevision)) {
    return "ignore";
  }
  if (input.remoteSerialized === input.localSerialized) {
    return "adopt";
  }
  if (input.localDirty) {
    if (
      input.suppressedRevision != null &&
      input.suppressedRevision !== "" &&
      String(input.suppressedRevision) === String(input.incomingRevision)
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
}): boolean {
  if (input.hasLocalDraft || input.conflictOpen) return false;
  return isNewerRevision(input.remoteRevision, input.appliedRevision);
}
