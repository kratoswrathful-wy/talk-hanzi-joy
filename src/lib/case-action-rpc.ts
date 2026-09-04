import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ToolEntry } from "@/data/case-types";

export interface CaseActionResult {
  caseId: string;
  revision: number;
  status?: string;
  rowId?: string;
}

export interface CaseCredentials {
  caseId: string;
  revision: number;
  loginAccount: string;
  loginPassword: string;
  otherLoginInfo: string;
  toolFieldValues: Record<string, string>;
  tools: ToolEntry[];
  questionTools: ToolEntry[];
}

export type CaseRpcErrorKind =
  | "conflict"
  | "forbidden"
  | "unavailable"
  | "invalid"
  | "unknown";

type RpcResponse<T> = {
  data?: T | null;
  error: PostgrestError | Error | null;
};

function localValidationError(message: string): RpcResponse<never> {
  return { error: new Error(message) };
}

function requireCaseAndRevision(
  caseId: string,
  expectedRevision: number,
): RpcResponse<never> | undefined {
  if (!caseId) return localValidationError("missing caseId");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return localValidationError("invalid expectedRevision");
  }
  return undefined;
}

async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResponse<T>> {
  const { data, error } = await client.rpc(name, args);
  return { data: (data ?? null) as T | null, error };
}

export function caseRpcErrorKind(
  error: PostgrestError | Error | null | undefined,
): CaseRpcErrorKind {
  if (!error) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error.message || "";
  if (code === "40001" || message.includes("case_revision_conflict")) return "conflict";
  if (code === "42501" || /not_authorized|access_denied|not_assigned/.test(message)) {
    return "forbidden";
  }
  if (code === "P0002" || message.includes("unavailable")) return "unavailable";
  if (code === "22023" || message.includes("invalid_")) return "invalid";
  return "unknown";
}

export async function acceptPublicInquiryCase(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  return rpc(client, "accept_public_inquiry_case", {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
  });
}

export interface DeclineInquiryInput {
  proposedDeadline?: string;
  availableCount?: number;
  message?: string;
}

export async function declinePublicInquiryCase(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
  decline: DeclineInquiryInput,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  return rpc(client, "decline_public_inquiry_case", {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
    p_decline: decline,
  });
}

export async function acceptInquiryCollabRow(
  client: SupabaseClient,
  caseId: string,
  collabRowId: string,
  expectedRevision: number,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  if (!collabRowId) return localValidationError("missing collabRowId");
  return rpc(client, "accept_inquiry_collab_row", {
    p_case_id: caseId,
    p_collab_row_id: collabRowId,
    p_expected_revision: expectedRevision,
  });
}

export async function completeCaseCollabRow(
  client: SupabaseClient,
  caseId: string,
  collabRowId: string,
  expectedRevision: number,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  if (!collabRowId) return localValidationError("missing collabRowId");
  return rpc(client, "complete_case_collab_row", {
    p_case_id: caseId,
    p_collab_row_id: collabRowId,
    p_expected_revision: expectedRevision,
  });
}

export async function completeCaseTranslation(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  return rpc(client, "complete_case_translation", {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
  });
}

export async function completeCaseReviewRow(
  client: SupabaseClient,
  caseId: string,
  reviewRowId: string,
  expectedRevision: number,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  if (!reviewRowId) return localValidationError("missing reviewRowId");
  return rpc(client, "complete_case_review_row", {
    p_case_id: caseId,
    p_review_row_id: reviewRowId,
    p_expected_revision: expectedRevision,
  });
}

export async function updateCasePermittedFields(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
  changes: Record<string, unknown>,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  if (Object.keys(changes).length === 0) return localValidationError("empty changes");
  return rpc(client, "update_case_permitted_fields", {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
    p_changes: changes,
  });
}

export async function getCaseCredentials(
  client: SupabaseClient,
  caseId: string,
): Promise<RpcResponse<CaseCredentials>> {
  if (!caseId) return localValidationError("missing caseId");
  return rpc(client, "get_case_credentials", { p_case_id: caseId });
}

export async function updateCaseCredentials(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
  credentials: Record<string, unknown>,
): Promise<RpcResponse<CaseActionResult>> {
  const invalid = requireCaseAndRevision(caseId, expectedRevision);
  if (invalid) return invalid;
  if (Object.keys(credentials).length === 0) {
    return localValidationError("empty credentials");
  }
  return rpc(client, "update_case_credentials", {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
    p_credentials: credentials,
  });
}
