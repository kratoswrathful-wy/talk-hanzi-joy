import type { CaseRecord } from "@/data/case-types";

export type CaseFileItem = {
  name: string;
  url: string;
  size?: number;
  /** 可信上傳者帳號；缺此欄＝舊檔資料缺口，一般成員不能刪。 */
  uploadedBy?: string;
};

export const CASE_FINAL_FILE_FIELDS = [
  "translatorFinal",
  "internalReviewFinal",
  "trackChanges",
] as const satisfies readonly (keyof CaseRecord)[];

export const CASE_READONLY_FILE_FIELDS = [
  "clientGuidelines",
  "seriesReferenceMaterials",
  "caseReferenceMaterials",
  "sourceFiles",
  "customGuidelinesUrl",
  "commonInfo",
] as const satisfies readonly (keyof CaseRecord)[];

export const CASE_PM_PRIVATE_FIELD_KEYS = [
  "client",
  "contact",
  "keyword",
  "clientPoNumber",
  "clientCaseLink",
  "dispatchRoute",
  "internalComments",
] as const satisfies readonly (keyof CaseRecord)[];

export const CASE_BASICS_FIELD_KEYS = [
  "title",
  "bodyContent",
  "category",
  "workType",
  "workGroups",
  "billingUnit",
  "unitCount",
] as const satisfies readonly (keyof CaseRecord)[];

const MEMBER_WRITE_DENIED_KEYS = new Set<string>([
  ...CASE_PM_PRIVATE_FIELD_KEYS,
  ...CASE_BASICS_FIELD_KEYS,
  ...CASE_READONLY_FILE_FIELDS,
]);

/** 一般成員寫入不得夾帶主管私有／基本欄／只讀檔，以免整筆被後端擋下。 */
export function pickMemberPermittedChanges(
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (MEMBER_WRITE_DENIED_KEYS.has(key)) continue;
    next[key] = value;
  }
  return next;
}

/** 一般成員若送出的欄全被拿掉、又沒有留言／勾選，應拒絕而不是假裝已存。 */
export function memberPersistShouldRefuse(input: {
  beforeFilter: Record<string, unknown>;
  afterFilter: Record<string, unknown>;
  hasSocial: boolean;
}): boolean {
  if (input.hasSocial) return false;
  if (Object.keys(input.afterFilter).length > 0) return false;
  return Object.keys(input.beforeFilter).length > 0;
}

export type CaseFinalFileField = (typeof CASE_FINAL_FILE_FIELDS)[number];
export type CaseReadonlyFileField = (typeof CASE_READONLY_FILE_FIELDS)[number];

export function isCaseFinalFileField(key: string): key is CaseFinalFileField {
  return (CASE_FINAL_FILE_FIELDS as readonly string[]).includes(key);
}

export function isCaseReadonlyFileField(key: string): key is CaseReadonlyFileField {
  return (CASE_READONLY_FILE_FIELDS as readonly string[]).includes(key);
}

export function caseFileIdentity(item: { name?: string; url?: string } | null | undefined): string | null {
  if (!item) return null;
  const name = typeof item.name === "string" ? item.name : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!name && !url) return null;
  return `${name}\n${url}`;
}

export function stampUploadedBy(
  item: CaseFileItem,
  actorId: string,
): CaseFileItem {
  return { ...item, uploadedBy: actorId };
}

export function canMemberRemoveCaseFile(
  item: CaseFileItem,
  actorId: string,
): boolean {
  return typeof item.uploadedBy === "string"
    && item.uploadedBy.length > 0
    && item.uploadedBy === actorId;
}

export type FileListMergeStatus = "ok" | "readonly" | "not_owned" | "invalid";

export type FileListMergeResult =
  | { status: "ok"; next: CaseFileItem[] }
  | { status: Exclude<FileListMergeStatus, "ok">; next: CaseFileItem[]; reason: string };

function asFileList(value: unknown): CaseFileItem[] {
  if (!Array.isArray(value)) return [];
  const out: CaseFileItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.name !== "string" || typeof rec.url !== "string") continue;
    const item: CaseFileItem = { name: rec.name, url: rec.url };
    if (typeof rec.size === "number" && Number.isFinite(rec.size)) item.size = rec.size;
    if (typeof rec.uploadedBy === "string" && rec.uploadedBy.length > 0) {
      item.uploadedBy = rec.uploadedBy;
    }
    out.push(item);
  }
  return out;
}

/**
 * 依身分合併檔案列。整清單覆寫不能刪別人的檔或舊檔缺口。
 * 新增一律蓋上目前登入帳號，不信任畫面傳來的 uploadedBy。
 */
export function mergeCaseFileList(input: {
  current: unknown;
  incoming: unknown;
  actorId: string;
  isAdmin: boolean;
  memberMayWrite: boolean;
}): FileListMergeResult {
  const current = asFileList(input.current);
  const incoming = asFileList(input.incoming);
  if (!input.actorId) {
    return { status: "invalid", next: current, reason: "missing_actor" };
  }
  const currentById = new Map(current.map((item) => [caseFileIdentity(item), item] as const));
  const incomingIds = new Set(incoming.map((item) => caseFileIdentity(item)).filter(Boolean));
  const added = incoming.filter((item) => {
    const id = caseFileIdentity(item);
    return !!id && !currentById.has(id);
  });
  const removed = current.filter((item) => {
    const id = caseFileIdentity(item);
    return !!id && !incomingIds.has(id);
  });

  if (!input.isAdmin && !input.memberMayWrite) {
    if (added.length > 0 || removed.length > 0) {
      return { status: "readonly", next: current, reason: "file_category_readonly" };
    }
    return { status: "ok", next: current };
  }

  if (!input.isAdmin) {
    for (const item of removed) {
      if (!canMemberRemoveCaseFile(item, input.actorId)) {
        return { status: "not_owned", next: current, reason: "file_not_owned" };
      }
    }
  }

  const next = current.filter((item) => {
    const id = caseFileIdentity(item);
    return !!id && incomingIds.has(id);
  });
  const live = new Set(next.map((item) => caseFileIdentity(item)));
  for (const item of added) {
    const stamped = stampUploadedBy(item, input.actorId);
    const id = caseFileIdentity(stamped);
    if (!id || live.has(id)) continue;
    next.push(stamped);
    live.add(id);
  }
  return { status: "ok", next };
}

/** 複製案件時保留原上傳者，不得改成複製者。 */
export function copyFileItemsKeepUploaders(items: unknown): CaseFileItem[] {
  return asFileList(items).map((item) => {
    const next: CaseFileItem = { name: item.name, url: item.url };
    if (item.size != null) next.size = item.size;
    if (item.uploadedBy) next.uploadedBy = item.uploadedBy;
    return next;
  });
}

export function fileListPersistConfirmed(result: unknown): boolean {
  return result === null || result === true;
}

export function filePersistUserMessage(result: unknown): {
  title: string;
  description: string;
  ok: boolean;
} {
  if (fileListPersistConfirmed(result)) {
    return {
      title: "已寫入案件",
      description: "檔案列在上方；離開或重整後應仍在同一分類。",
      ok: true,
    };
  }
  const message = result instanceof Error ? result.message : String(result ?? "");
  return {
    title: "檔案未寫入案件",
    description: message
      ? `${message}。已上傳的物件仍在檔案區，不會自行消失。`
      : "案件紀錄沒有存到這次變更。已上傳的物件仍在檔案區，不會自行消失。",
    ok: false,
  };
}
