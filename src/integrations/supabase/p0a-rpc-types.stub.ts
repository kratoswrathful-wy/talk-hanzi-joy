/**
 * TEMP recovery: regenerate after isolated DB migration verify.
 *
 * Minimal P0-A RPC / row stubs for R1 recovery. Do NOT replace
 * `src/integrations/supabase/types.ts` with a full copy from the old tree.
 * After isolated `supabase gen types`, delete this file and wire generated types.
 */

import type { Json } from "./types";

/** Expected public Functions entries once migrations are applied + types regenerated. */
export type P0aCaseActionFunctions = {
  accept_public_inquiry_case: {
    Args: { p_case_id: string; p_expected_revision: number };
    Returns: Json;
  };
  decline_public_inquiry_case: {
    Args: {
      p_case_id: string;
      p_expected_revision: number;
      p_decline?: Json;
    };
    Returns: Json;
  };
  accept_inquiry_collab_row: {
    Args: {
      p_case_id: string;
      p_collab_row_id: string;
      p_expected_revision: number;
    };
    Returns: Json;
  };
  complete_case_collab_row: {
    Args: {
      p_case_id: string;
      p_collab_row_id: string;
      p_expected_revision: number;
    };
    Returns: Json;
  };
  complete_case_translation: {
    Args: { p_case_id: string; p_expected_revision: number };
    Returns: Json;
  };
  complete_case_review_row: {
    Args: {
      p_case_id: string;
      p_review_row_id: string;
      p_expected_revision: number;
    };
    Returns: Json;
  };
  revoke_case_participant_access: {
    Args: {
      p_case_id: string;
      p_user_id: string;
      p_role: string;
      p_expected_revision: number;
    };
    Returns: Json;
  };
  update_case_permitted_fields: {
    Args: {
      p_case_id: string;
      p_expected_revision: number;
      p_changes: Json;
    };
    Returns: Json;
  };
  get_case_credentials: {
    Args: { p_case_id: string };
    Returns: Json;
  };
  update_case_credentials: {
    Args: {
      p_case_id: string;
      p_expected_revision: number;
      p_credentials: Json;
    };
    Returns: Json;
  };
};

/** cases / cases_visible additive column until gen types. */
export type P0aCaseRevisionFields = {
  revision: number;
};

/** case_participants row shape (migration 20260830122351). */
export type P0aCaseParticipantRow = {
  id: string;
  case_id: string;
  user_id: string;
  role: "translator" | "reviewer";
  work_status: "active" | "completed" | "cancelled";
  source: "public_inquiry_accept" | "collab_accept" | "pm_assign";
  access_revoked_at: string | null;
  access_revoked_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};
