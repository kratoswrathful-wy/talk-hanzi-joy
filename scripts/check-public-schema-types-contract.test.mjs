/**
 * Self-tests for public-schema types contract checker.
 * Run: node --test scripts/check-public-schema-types-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparePublicSchemaTypes,
  extractDatabasePublicTypeText,
} from "./lib/public-schema-types-contract.mjs";

const JSON_DEF = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
`;

function wrapDatabase(publicBody, extrasBefore = "", extrasAfter = "") {
  return `${JSON_DEF}
export type Database = {
${extrasBefore}  public: {
${publicBody}
  }
${extrasAfter}}
`;
}

const BASE_PUBLIC = `    Tables: {
      cases: {
        Row: {
          id: string
          title: string | null
        }
        Insert: {
          id?: string
          title?: string | null
        }
        Update: {
          id?: string
          title?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_case: {
        Args: { p_payload: Json }
        Returns: Json
      }
      pm_update_case_assignments: {
        Args: { p_case_id: string; p_expected_revision: number; p_patch: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "member" | "pm" | "executive"
    }
    CompositeTypes: {
      [_ in never]: never
    }`;

/** Same members, different property order inside Row / Functions. */
const REORDERED_PUBLIC = `    Functions: {
      pm_update_case_assignments: {
        Args: { p_patch: Json; p_case_id: string; p_expected_revision: number }
        Returns: Json
      }
      admin_create_case: {
        Args: { p_payload: Json }
        Returns: Json
      }
    }
    Tables: {
      cases: {
        Relationships: []
        Update: {
          title?: string | null
          id?: string
        }
        Insert: {
          title?: string | null
          id?: string
        }
        Row: {
          title: string | null
          id: string
        }
      }
    }
    CompositeTypes: {
      [_ in never]: never
    }
    Enums: {
      app_role: "executive" | "member" | "pm"
    }
    Views: {
      [_ in never]: never
    }`;

test("only declaration order differs → PASS", () => {
  const a = wrapDatabase(BASE_PUBLIC, `  __InternalSupabase: { PostgrestVersion: "14.5" }\n`);
  const b = wrapDatabase(REORDERED_PUBLIC);
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, true, r.compileErrors.join("\n") || r.diffs.join("\n"));
});

test("only __InternalSupabase / graphql_public differ → PASS", () => {
  const a = wrapDatabase(
    BASE_PUBLIC,
    `  __InternalSupabase: { PostgrestVersion: "14.5" }\n`,
  );
  const b = wrapDatabase(
    BASE_PUBLIC,
    `  graphql_public: {
    Tables: { [_ in never]: never }
    Views: { [_ in never]: never }
    Functions: {
      graphql: {
        Args: { query?: string }
        Returns: Json
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
`,
  );
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, true, r.compileErrors.join("\n"));
  assert.match(extractDatabasePublicTypeText(a), /Tables:/);
});

test("public column added → FAIL", () => {
  const a = wrapDatabase(BASE_PUBLIC);
  const b = wrapDatabase(BASE_PUBLIC.replace(
    "title: string | null",
    "title: string | null\n          status: string",
  ));
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, false);
});

test("public column type change → FAIL", () => {
  const a = wrapDatabase(BASE_PUBLIC);
  const b = wrapDatabase(BASE_PUBLIC.replace("title: string | null", "title: string"));
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, false);
});

test("RPC Args change → FAIL", () => {
  const a = wrapDatabase(BASE_PUBLIC);
  const b = wrapDatabase(
    BASE_PUBLIC.replace(
      "Args: { p_payload: Json }",
      "Args: { p_payload: Json; p_extra: string }",
    ),
  );
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, false);
});

test("RPC Returns change → FAIL", () => {
  const a = wrapDatabase(BASE_PUBLIC);
  const b = wrapDatabase(
    BASE_PUBLIC.replace(
      "admin_create_case: {\n        Args: { p_payload: Json }\n        Returns: Json\n      }",
      "admin_create_case: {\n        Args: { p_payload: Json }\n        Returns: string\n      }",
    ),
  );
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, false);
});

test("table removed → FAIL", () => {
  const a = wrapDatabase(BASE_PUBLIC);
  const b = wrapDatabase(`    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_case: {
        Args: { p_payload: Json }
        Returns: Json
      }
      pm_update_case_assignments: {
        Args: { p_case_id: string; p_expected_revision: number; p_patch: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "member" | "pm" | "executive"
    }
    CompositeTypes: {
      [_ in never]: never
    }`);
  const r = comparePublicSchemaTypes({
    checkedSource: a,
    generatedSource: b,
  });
  assert.equal(r.ok, false);
});
