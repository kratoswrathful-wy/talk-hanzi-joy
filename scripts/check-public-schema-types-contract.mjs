#!/usr/bin/env node
/**
 * Compare checked-in vs locally generated Supabase types for Database["public"] only.
 *
 * Usage:
 *   node scripts/check-public-schema-types-contract.mjs <checked-in types.ts> <generated types.ts>
 *
 * Boundary (also recorded in Gate1):
 * - In scope: Database["public"] Tables/Views/Functions/Enums/CompositeTypes
 * - Out of scope: __InternalSupabase, graphql_public (and other non-public schemas),
 *   textual declaration order
 */
import { comparePublicSchemaTypeFiles } from "./lib/public-schema-types-contract.mjs";

function main() {
  const checked = process.argv[2];
  const generated = process.argv[3];
  if (!checked || !generated) {
    console.error(
      "usage: node scripts/check-public-schema-types-contract.mjs <checked> <generated>",
    );
    process.exit(2);
  }
  const result = comparePublicSchemaTypeFiles(checked, generated);
  if (result.ok) {
    console.log("public_schema_types_contract=PASS");
    console.log(
      "scope=Database[\"public\"] (order-independent; excludes __InternalSupabase / non-public schemas)",
    );
    process.exit(0);
  }
  console.error("public_schema_types_contract=FAIL");
  console.error("TypeScript Equal<CheckedPublic, GeneratedPublic> did not hold.");
  if (result.compileErrors.length) {
    console.error("--- compile diagnostics ---");
    for (const e of result.compileErrors.slice(0, 40)) console.error(e);
  }
  if (result.diffs.length) {
    console.error("--- structural membership / optional diffs (public) ---");
    for (const d of result.diffs.slice(0, 80)) console.error(d);
  }
  process.exit(1);
}

main();
