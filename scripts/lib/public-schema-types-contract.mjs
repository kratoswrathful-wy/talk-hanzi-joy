/**
 * Public-schema Supabase types contract.
 *
 * Authority: only Database["public"] (Tables / Views / Functions / Enums /
 * CompositeTypes, including Row/Insert/Update fields and RPC Args/Returns).
 *
 * Out of scope for this isolation contract:
 * - __InternalSupabase (generator / PostgREST platform metadata)
 * - non-public schemas such as graphql_public
 * - declaration / property textual order (structural typing ignores order)
 *
 * Gate: write both full type files, export Database["public"], then TypeScript
 * bidirectional structural equality (Equal<A,B>) via a temp project.
 * Diagnostics: recursive AST member walk (order-independent keys).
 */
import ts from "typescript";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EQUAL_HELPERS = `
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type ExpectTrue<T extends true> = T;
`;

/**
 * @param {string} sourceText
 * @param {string} [fileName]
 * @returns {string} type text of Database["public"]
 */
export function extractDatabasePublicTypeText(sourceText, fileName = "types.ts") {
  const sf = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  /** @type {string | null} */
  let result = null;
  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === "Database" &&
      ts.isTypeLiteralNode(node.type)
    ) {
      for (const member of node.type.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === "public" &&
          member.type
        ) {
          result = member.type.getText(sf);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!result) {
    throw new Error(`Database["public"] type literal not found in ${fileName}`);
  }
  return result;
}

/**
 * @param {string} typeText
 * @param {string} label
 * @returns {ts.TypeNode}
 */
function parseTypeLiteral(typeText, label) {
  const wrapped = `type __T = ${typeText}`;
  const sf = ts.createSourceFile(
    `${label}.ts`,
    wrapped,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const stmt = sf.statements[0];
  if (!stmt || !ts.isTypeAliasDeclaration(stmt) || !stmt.type) {
    throw new Error(`failed to parse type literal for ${label}`);
  }
  return stmt.type;
}

/**
 * @param {ts.TypeNode | undefined} node
 * @param {string} path
 * @param {string[]} out
 * @param {ts.TypeNode | undefined} other
 * @param {'a'|'b'} side
 */
function collectShape(node, path, out, other, side) {
  if (!node) {
    out.push(`${path}: missing on ${side === "a" ? "checked-in" : "generated"}`);
    return;
  }
  if (!other) {
    // paired call handles missing
  }
  if (ts.isTypeLiteralNode(node) && other && ts.isTypeLiteralNode(other)) {
    const aMap = new Map();
    const bMap = new Map();
    for (const m of node.members) {
      if (ts.isPropertySignature(m) && m.name) {
        const name = m.name.getText();
        aMap.set(name, m);
      } else if (ts.isIndexSignatureDeclaration(m)) {
        aMap.set(`[index]`, m);
      }
    }
    for (const m of other.members) {
      if (ts.isPropertySignature(m) && m.name) {
        const name = m.name.getText();
        bMap.set(name, m);
      } else if (ts.isIndexSignatureDeclaration(m)) {
        bMap.set(`[index]`, m);
      }
    }
    const keys = new Set([...aMap.keys(), ...bMap.keys()]);
    for (const key of [...keys].sort()) {
      const am = aMap.get(key);
      const bm = bMap.get(key);
      const childPath = `${path}.${key}`;
      if (!am) {
        out.push(`${childPath}: present only in generated`);
        continue;
      }
      if (!bm) {
        out.push(`${childPath}: present only in checked-in`);
        continue;
      }
      const aOpt = !!am.questionToken;
      const bOpt = !!bm.questionToken;
      if (aOpt !== bOpt) {
        out.push(
          `${childPath}: optional mismatch (checked-in ${aOpt ? "?" : "required"} vs generated ${bOpt ? "?" : "required"})`,
        );
      }
      const aType = ts.isPropertySignature(am) ? am.type : am.type;
      const bType = ts.isPropertySignature(bm) ? bm.type : bm.type;
      if (aType && bType) {
        // Membership / optional only here; leaf type equality is gated by
        // TypeScript Equal (avoids false positives from union member order).
        if (
          (ts.isTypeLiteralNode(aType) && ts.isTypeLiteralNode(bType)) ||
          (ts.isTupleTypeNode(aType) && ts.isTupleTypeNode(bType))
        ) {
          collectShape(aType, childPath, out, bType, side);
        }
      }
    }
    return;
  }
  if (ts.isTupleTypeNode(node) && other && ts.isTupleTypeNode(other)) {
    const n = Math.max(node.elements.length, other.elements.length);
    for (let i = 0; i < n; i++) {
      const ae = node.elements[i];
      const be = other.elements[i];
      const aNode = ae && (ts.isNamedTupleMember(ae) ? ae.type : ae);
      const bNode = be && (ts.isNamedTupleMember(be) ? be.type : be);
      if (!ae) {
        out.push(`${path}[${i}]: present only in generated`);
        continue;
      }
      if (!be) {
        out.push(`${path}[${i}]: present only in checked-in`);
        continue;
      }
      collectShape(aNode, `${path}[${i}]`, out, bNode, side);
    }
  }
}

/**
 * Order-independent structural diagnostics for public schema type literals.
 * @param {string} checkedPublicText
 * @param {string} generatedPublicText
 * @returns {string[]}
 */
export function diffPublicSchemaTypeTexts(checkedPublicText, generatedPublicText) {
  const a = parseTypeLiteral(checkedPublicText, "checked");
  const b = parseTypeLiteral(generatedPublicText, "generated");
  /** @type {string[]} */
  const out = [];
  collectShape(a, "public", out, b, "a");
  return out;
}

/**
 * @param {{ checkedSource: string, generatedSource: string, checkedName?: string, generatedName?: string }} opts
 * @returns {{ ok: boolean, equal: boolean, diffs: string[], diagnostics: string[], compileErrors: string[] }}
 */
export function comparePublicSchemaTypes(opts) {
  const checkedName = opts.checkedName || "types.checked.ts";
  const generatedName = opts.generatedName || "types.generated.ts";
  const checkedPublicRaw = extractDatabasePublicTypeText(
    opts.checkedSource,
    checkedName,
  );
  const generatedPublicRaw = extractDatabasePublicTypeText(
    opts.generatedSource,
    generatedName,
  );

  const dir = mkdtempSync(join(tmpdir(), "public-schema-types-"));
  const checkedPath = join(dir, "checked.ts");
  const generatedPath = join(dir, "generated.ts");
  const contractPath = join(dir, "contract.ts");
  const tsconfigPath = join(dir, "tsconfig.json");

  writeFileSync(
    checkedPath,
    `${opts.checkedSource}\nexport type __P0PublicContract = Database["public"];\n`,
    "utf8",
  );
  writeFileSync(
    generatedPath,
    `${opts.generatedSource}\nexport type __P0PublicContract = Database["public"];\n`,
    "utf8",
  );
  writeFileSync(
    contractPath,
    `import type { __P0PublicContract as CheckedPublic } from "./checked";
import type { __P0PublicContract as GeneratedPublic } from "./generated";
${EQUAL_HELPERS}
type _Assert = ExpectTrue<Equal<CheckedPublic, GeneratedPublic>>;
`,
    "utf8",
  );
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        verbatimModuleSyntax: true,
      },
      files: ["contract.ts", "checked.ts", "generated.ts"],
    }),
    "utf8",
  );

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dir,
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => {
      // Ignore unused locals etc.; only type errors matter.
      return d.category === ts.DiagnosticCategory.Error;
    });
  /** @type {string[]} */
  const compileErrors = diagnostics.map((d) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && d.start != null) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      return `${d.file.fileName}:${line + 1}:${character + 1}: ${msg}`;
    }
    return msg;
  });

  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const equal = compileErrors.length === 0;
  const diffs = equal
    ? []
    : diffPublicSchemaTypeTexts(checkedPublicRaw, generatedPublicRaw);

  return {
    ok: equal,
    equal,
    diffs,
    diagnostics: diffs,
    compileErrors,
  };
}

/**
 * CLI helper: compare two files on disk.
 * @param {string} checkedPath
 * @param {string} generatedPath
 */
export function comparePublicSchemaTypeFiles(checkedPath, generatedPath) {
  return comparePublicSchemaTypes({
    checkedSource: readFileSync(checkedPath, "utf8"),
    generatedSource: readFileSync(generatedPath, "utf8"),
    checkedName: checkedPath,
    generatedName: generatedPath,
  });
}
