import { createHash } from "node:crypto";

const schemas = new Set(["public", "auth", "app_private", "storage"]);
const principals = new Set(["PUBLIC", "anon", "authenticated", "service_role", "fieldgrid_runtime_data", "fieldgrid_runtime_app"]);
const providerAclPrincipals = new Set(["postgres", "dashboard_user"]);
const types = new Set(["bool", "int2", "int4", "int8", "float4", "float8", "numeric", "text", "varchar", "bpchar", "uuid", "json", "jsonb", "date", "time", "timetz", "timestamp", "timestamptz", "interval", "bytea", "inet", "oid", "name", "_text", "_uuid", "_varchar", "_int4", "_int8"]);
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const sourcePathPattern = /^(?:lib\/db\/)?migrations\/[A-Za-z0-9_]+\.sql$/u;
const providerSourcePath = "tests/fixtures/fieldgrid-supabase-auth-functions.sql";
const additionalSourcePaths = new Set([providerSourcePath, "scripts/fieldgrid-runtime-safety-setup.mjs"]);
const resultKeys = ["postgresMajorMatches", "policySetMatches", "helperContractsMatch", "relationsMatch"] as const;

export type PolicyDefinitionManifest = {
  version: 1;
  postgresMajor: 17;
  sources: { path: string; sha256: string }[];
  relations: {
    schema: string; table: string; kind: "r" | "p";
    rowSecurity: boolean; forceRowSecurity: boolean;
    // Dependency columns are exact; unrelated additive columns are permitted.
    columns: { name: string; typeName: string; typeModifier: number; notNull: boolean }[];
  }[];
  policies: {
    schema: string; table: string; name: string; command: "*" | "r" | "a" | "w" | "d";
    permissive: boolean; roles: string[];
    usingExpression: string | null; checkExpression: string | null;
  }[];
  helpers: {
    schema: string; name: string; argumentTypes: string[]; returnType: string;
    body: string; language: "sql" | "plpgsql"; securityDefiner: boolean;
    volatility: "i" | "s" | "v"; parallel: "u" | "r" | "s";
    strict: boolean; leakproof: boolean;
    config: string[] | null; argNames: string[] | null; defaultCount: 0;
    ownerRelation: { schema: string; table: string };
    directAcl: { grantee: string; grantor: string; privilege: "EXECUTE"; grantable: boolean }[];
    effectiveExecute: { role: string; allowed: boolean }[];
  }[];
};
export type PolicyDefinitionResult = Record<(typeof resultKeys)[number], boolean>;
export type PolicyDefinitionQueryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};
export type CompiledPolicyDefinitionContract = Readonly<{
  sql: string; manifestHash: string; values: readonly [string];
}>;

const issuedContracts = new WeakSet<CompiledPolicyDefinitionContract>();

class DefinitionContractError extends Error {
  constructor(code: "manifest_invalid" | "source_hash_mismatch" | "search_path_invalid" | "catalog_invalid" | "catalog_read_failed") {
    super(`policy_definition_${code}`);
    this.name = "PolicyDefinitionContractError";
  }
}
const invalid = (): never => { throw new DefinitionContractError("manifest_invalid"); };
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum ||
      Object.keys(value).length !== value.length) invalid();
  for (let index = 0; index < (value as unknown[]).length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  }
  return value as unknown[];
}
function text(value: unknown, maximum = 65536): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.includes("\0")) invalid();
  return value as string;
}
function identifier(value: unknown): string {
  const result = text(value, 63);
  if (!identifierPattern.test(result)) invalid();
  return result;
}
function schema(value: unknown): string {
  const result = identifier(value);
  if (!schemas.has(result)) invalid();
  return result;
}
function principal(value: unknown, owner = false): string {
  const result = text(value, 63);
  if (!(owner && result === "$owner") && !principals.has(result)) invalid();
  return result;
}
function aclPrincipal(value: unknown): string {
  const result = text(value, 63);
  return providerAclPrincipals.has(result) ? result : principal(result, true);
}
function type(value: unknown): string {
  const result = identifier(value);
  if (!types.has(result)) invalid();
  return result;
}
function boolean(value: unknown): void { if (typeof value !== "boolean") invalid(); }
function unique(values: string[]): void { if (new Set(values).size !== values.length) invalid(); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateManifest(value: unknown, sourceBytes: ReadonlyMap<string, string>): PolicyDefinitionManifest {
  const manifest = object(value, ["version", "postgresMajor", "sources", "relations", "policies", "helpers"]);
  if (manifest.version !== 1 || manifest.postgresMajor !== 17) invalid();
  const sourcePaths = list(manifest.sources, 16, 1).map((item) => {
    const entry = object(item, ["path", "sha256"]);
    const path = text(entry.path, 255), expected = text(entry.sha256, 64);
    if ((!sourcePathPattern.test(path) && !additionalSourcePaths.has(path)) || !/^[a-f0-9]{64}$/u.test(expected)) invalid();
    const source = sourceBytes.get(path);
    if (typeof source !== "string" || createHash("sha256")
      .update(path === providerSourcePath ? source : source.replaceAll("\r\n", "\n")).digest("hex") !== expected) {
      throw new DefinitionContractError("source_hash_mismatch");
    }
    return path;
  });
  unique(sourcePaths);
  const relationKeys = list(manifest.relations, 32, 1).map((item) => {
    const entry = object(item, ["schema", "table", "kind", "rowSecurity", "forceRowSecurity", "columns"]);
    const key = `${schema(entry.schema)}.${identifier(entry.table)}`;
    if (!["r", "p"].includes(entry.kind as string)) invalid();
    boolean(entry.rowSecurity); boolean(entry.forceRowSecurity);
    unique(list(entry.columns, 256, 1).map((item) => {
      const column = object(item, ["name", "typeName", "typeModifier", "notNull"]);
      type(column.typeName); boolean(column.notNull);
      if (!Number.isSafeInteger(column.typeModifier) || (column.typeModifier as number) < -1 || (column.typeModifier as number) > 2147483647) invalid();
      return identifier(column.name);
    }));
    return key;
  });
  unique(relationKeys);
  unique(list(manifest.policies, 256).map((item) => {
    const entry = object(item, ["schema", "table", "name", "command", "permissive", "roles", "usingExpression", "checkExpression"]);
    const relation = `${schema(entry.schema)}.${identifier(entry.table)}`;
    if (!relationKeys.includes(relation) || !["*", "r", "a", "w", "d"].includes(entry.command as string)) invalid();
    boolean(entry.permissive);
    const roles = list(entry.roles, 6, 1).map((role) => principal(role));
    unique(roles);
    if (roles.some((role, index) => role !== [...roles].sort()[index])) invalid();
    for (const key of ["usingExpression", "checkExpression"]) if (entry[key] !== null) text(entry[key]);
    if ((entry.command === "a" && entry.usingExpression !== null) ||
        (["r", "d"].includes(entry.command as string) && entry.checkExpression !== null)) invalid();
    return `${relation}.${identifier(entry.name)}`;
  }));
  unique(list(manifest.helpers, 32).map((item) => {
    const entry = object(item, ["schema", "name", "argumentTypes", "returnType", "body", "language", "securityDefiner", "volatility", "parallel", "strict", "leakproof", "config", "argNames", "defaultCount", "ownerRelation", "directAcl", "effectiveExecute"]);
    const args = list(entry.argumentTypes, 16).map(type);
    const identity = `${schema(entry.schema)}.${identifier(entry.name)}(${args.join(",")})`;
    type(entry.returnType); text(entry.body);
    if (!["sql", "plpgsql"].includes(entry.language as string) || !["i", "s", "v"].includes(entry.volatility as string) ||
        !["u", "r", "s"].includes(entry.parallel as string) || entry.defaultCount !== 0) invalid();
    for (const key of ["securityDefiner", "strict", "leakproof"]) boolean(entry[key]);
    if (entry.argNames !== null) {
      const names = list(entry.argNames, 16).map(identifier);
      if (names.length !== args.length) invalid();
      unique(names);
    }
    if (entry.config !== null) {
      const config = list(entry.config, 1, 1).map((item) => text(item, 255));
      if (!/^search_path=(?:pg_catalog|public|auth|app_private|storage|pg_temp)(?:, (?:pg_catalog|public|auth|app_private|storage|pg_temp))*$/u.test(config[0]!)) invalid();
      unique(config[0]!.slice("search_path=".length).split(", "));
    }
    const owner = object(entry.ownerRelation, ["schema", "table"]);
    const ownerKey = `${schema(owner.schema)}.${identifier(owner.table)}`;
    // Provider auth helpers share auth.users ownership; its unrelated RLS policies
    // are outside the application policy contract. Public owners remain bound.
    if (ownerKey !== "auth.users" && !relationKeys.includes(ownerKey)) invalid();
    unique(list(entry.directAcl, 32).map((item) => {
      const acl = object(item, ["grantee", "grantor", "privilege", "grantable"]);
      boolean(acl.grantable);
      if (acl.privilege !== "EXECUTE") invalid();
      const grantee = aclPrincipal(acl.grantee), grantor = aclPrincipal(acl.grantor);
      if (grantor === "PUBLIC") invalid();
      return `${grantee}/${grantor}`;
    }));
    const effective = list(entry.effectiveExecute, 7, 7).map((item) => {
      const permission = object(item, ["role", "allowed"]);
      boolean(permission.allowed);
      return principal(permission.role, true);
    });
    unique(effective);
    if (["$owner", ...principals].some((role) => !effective.includes(role))) invalid();
    return identity;
  }));
  return value as PolicyDefinitionManifest;
}

// All expression/body text remains JSON parameter data. Only catalog functions
// deparse installed nodes; source expressions are never executed or rewritten.
function policyDefinitionComparisonSql(selfPinning: boolean): string {
  const pathMatches = selfPinning
    ? "pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog'"
    : "pg_catalog.current_setting('search_path') = 'pg_catalog'";
  // The relation argument cannot exist before the volatile setting call has
  // completed. This does not rely on CTE/join/WHERE evaluation order.
  const deparseRelation = selfPinning
    ? `(CASE WHEN ${pathMatches} THEN policy.polrelid END)`
    : "policy.polrelid";
  return `WITH manifest AS (SELECT $1::pg_catalog.jsonb AS value),
context AS (
  SELECT ${pathMatches} AS path_matches,
    pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 = 17 AS major_matches
), expected_relations AS (
  SELECT relation AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'relations') relation
), expected_policies AS (
  SELECT policy AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'policies') policy
), actual_policies AS (
  SELECT pg_catalog.jsonb_build_object(
    'schema', namespace.nspname, 'table', relation.relname, 'name', policy.polname,
    'command', policy.polcmd::pg_catalog.text, 'permissive', policy.polpermissive,
    'roles', (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE pg_catalog."C") FROM (
      SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid)::pg_catalog.text END AS role_name
      FROM pg_catalog.unnest(policy.polroles) role_oid) names),
    'usingExpression', pg_catalog.pg_get_expr(policy.polqual, ${deparseRelation}, false),
    'checkExpression', pg_catalog.pg_get_expr(policy.polwithcheck, ${deparseRelation}, false)
  ) AS value
  FROM pg_catalog.pg_policy policy
  JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE EXISTS (SELECT 1 FROM expected_relations expected
    WHERE expected.value->>'schema' = namespace.nspname AND expected.value->>'table' = relation.relname)
), expected_helpers AS (
  SELECT helper AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'helpers') helper
)
SELECT context.major_matches AS "postgresMajorMatches",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    (SELECT value FROM actual_policies EXCEPT SELECT value FROM expected_policies)
    UNION ALL (SELECT value FROM expected_policies EXCEPT SELECT value FROM actual_policies)
  )) AS "policySetMatches",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    SELECT 1 FROM expected_relations expected WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = expected.value->>'schema' AND relation.relname = expected.value->>'table'
        AND relation.relkind::pg_catalog.text = expected.value->>'kind'
        AND relation.relrowsecurity = (expected.value->>'rowSecurity')::pg_catalog.bool
        AND relation.relforcerowsecurity = (expected.value->>'forceRowSecurity')::pg_catalog.bool
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'columns') dependency
          WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute attribute
            JOIN pg_catalog.pg_type column_type ON column_type.oid = attribute.atttypid
            JOIN pg_catalog.pg_namespace type_schema ON type_schema.oid = column_type.typnamespace
            WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
              AND attribute.attname = dependency->>'name' AND type_schema.nspname = 'pg_catalog'
              AND column_type.typname = dependency->>'typeName'
              AND attribute.atttypmod = (dependency->>'typeModifier')::pg_catalog.int4
              AND attribute.attnotnull = (dependency->>'notNull')::pg_catalog.bool))
    )
  )) AS "relationsMatch",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    SELECT 1 FROM expected_helpers expected WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc helper
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = helper.pronamespace
      JOIN pg_catalog.pg_language language ON language.oid = helper.prolang
      JOIN pg_catalog.pg_class owner_relation ON owner_relation.relname = expected.value->'ownerRelation'->>'table'
      JOIN pg_catalog.pg_namespace owner_schema ON owner_schema.oid = owner_relation.relnamespace
        AND owner_schema.nspname = expected.value->'ownerRelation'->>'schema'
      WHERE namespace.nspname = expected.value->>'schema' AND helper.proname = expected.value->>'name'
        AND helper.proargtypes::pg_catalog.text = coalesce((SELECT pg_catalog.string_agg(
          pg_catalog.to_regtype('pg_catalog.' || argument)::pg_catalog.oid::pg_catalog.text, ' ' ORDER BY position)
          FROM pg_catalog.jsonb_array_elements_text(expected.value->'argumentTypes') WITH ORDINALITY arguments(argument, position)), '')
        AND helper.pronargs = pg_catalog.jsonb_array_length(expected.value->'argumentTypes')
        AND helper.prorettype = pg_catalog.to_regtype('pg_catalog.' || (expected.value->>'returnType'))
        AND helper.prosrc = expected.value->>'body' AND helper.prosqlbody IS NULL
        AND language.lanname = expected.value->>'language' AND helper.prokind = 'f'
        AND helper.prosecdef = (expected.value->>'securityDefiner')::pg_catalog.bool
        AND helper.provolatile::pg_catalog.text = expected.value->>'volatility'
        AND helper.proparallel::pg_catalog.text = expected.value->>'parallel'
        AND helper.proisstrict = (expected.value->>'strict')::pg_catalog.bool
        AND helper.proleakproof = (expected.value->>'leakproof')::pg_catalog.bool
        AND NOT helper.proretset AND helper.proargmodes IS NULL AND helper.proallargtypes IS NULL
        AND helper.prosupport = 0
        AND helper.pronargdefaults = 0 AND helper.proargdefaults IS NULL
        AND coalesce(pg_catalog.to_jsonb(helper.proconfig), 'null'::pg_catalog.jsonb) = expected.value->'config'
        AND coalesce(pg_catalog.to_jsonb(helper.proargnames), 'null'::pg_catalog.jsonb) = expected.value->'argNames'
        AND helper.proowner = owner_relation.relowner
        AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))))
          = pg_catalog.jsonb_array_length(expected.value->'directAcl')
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))) acl
          WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'directAcl') required
            WHERE acl.privilege_type = required->>'privilege' AND acl.is_grantable = (required->>'grantable')::pg_catalog.bool
              AND acl.grantee = CASE required->>'grantee' WHEN '$owner' THEN helper.proowner WHEN 'PUBLIC' THEN 0::pg_catalog.oid
                ELSE pg_catalog.to_regrole(required->>'grantee')::pg_catalog.oid END
              AND acl.grantor = CASE required->>'grantor' WHEN '$owner' THEN helper.proowner
                ELSE pg_catalog.to_regrole(required->>'grantor')::pg_catalog.oid END))
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'effectiveExecute') permission
          WHERE CASE permission->>'role'
            WHEN 'PUBLIC' THEN EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))) acl
              WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
            WHEN '$owner' THEN pg_catalog.has_function_privilege(helper.proowner, helper.oid, 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
            ELSE CASE WHEN pg_catalog.to_regrole(permission->>'role') IS NULL THEN true
              ELSE pg_catalog.has_function_privilege(pg_catalog.to_regrole(permission->>'role')::pg_catalog.oid, helper.oid, 'EXECUTE')
                IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool END
          END)
    )
  )) AS "helperContractsMatch"
FROM context`;
}

const comparisonSql = policyDefinitionComparisonSql(false);
const selfPinningComparisonSql = policyDefinitionComparisonSql(true);

function assertCompiledPolicyDefinitionContract(contract: CompiledPolicyDefinitionContract): void {
  if (!issuedContracts.has(contract) || !Object.isFrozen(contract) || !Object.isFrozen(contract.values) ||
      contract.sql !== comparisonSql || contract.values.length !== 1 ||
      createHash("sha256").update(contract.values[0]).digest("hex") !== contract.manifestHash) {
    throw new DefinitionContractError("catalog_invalid");
  }
}

// For composition into owner/proof SELECTs and migration DO blocks. Parse-time
// names must still resolve in the trusted pg_catalog/public caller namespace;
// executing a GUC setter cannot change already-bound SQL operators or names.
// The pin lasts until transaction end (including implicit autocommit), so this
// entrypoint never changes the explicit-path reader's connection contract.
export function compileSelfPinningPolicyDefinitionContractSql(
  contract: CompiledPolicyDefinitionContract,
): string {
  assertCompiledPolicyDefinitionContract(contract);
  return selfPinningComparisonSql;
}

export function compilePolicyDefinitionContract(
  manifest: PolicyDefinitionManifest, sourceBytes: ReadonlyMap<string, string>,
): CompiledPolicyDefinitionContract {
  try {
    const validated = validateManifest(manifest, sourceBytes);
    const serialized = canonicalJson(validated);
    if (serialized.length > 1048576) invalid();
    const contract = Object.freeze({ sql: comparisonSql,
      values: Object.freeze([serialized]) as readonly [string],
      manifestHash: createHash("sha256").update(serialized).digest("hex"),
    });
    issuedContracts.add(contract);
    return contract;
  } catch (error) {
    throw error instanceof DefinitionContractError ? error : new DefinitionContractError("manifest_invalid");
  }
}

// The owner controls the enclosing READ ONLY transaction and explicitly sets
// SET LOCAL search_path = pg_catalog. This reader executes SELECT statements only.
export async function readPolicyDefinitionContract(
  queryable: PolicyDefinitionQueryable, contract: CompiledPolicyDefinitionContract,
): Promise<PolicyDefinitionResult> {
  try {
    assertCompiledPolicyDefinitionContract(contract);
    const path = await queryable.query<{ search_path: string }>(
      "SELECT pg_catalog.current_setting('search_path') AS search_path",
    );
    if (path.rows.length !== 1 || path.rows[0]?.search_path !== "pg_catalog") {
      throw new DefinitionContractError("search_path_invalid");
    }
    const response = await queryable.query(contract.sql, [...contract.values]);
    if (response.rows.length !== 1 || response.rowCount !== 1) throw new DefinitionContractError("catalog_invalid");
    const row = response.rows[0]!;
    if (Object.keys(row).length !== resultKeys.length || Object.keys(row).some((key) => !resultKeys.includes(key as typeof resultKeys[number])) ||
        resultKeys.some((key) => typeof row[key] !== "boolean")) throw new DefinitionContractError("catalog_invalid");
    return Object.fromEntries(resultKeys.map((key) => [key, row[key]])) as PolicyDefinitionResult;
  } catch (error) {
    throw error instanceof DefinitionContractError ? error : new DefinitionContractError("catalog_read_failed");
  }
}
