const migrationDeadlockSqlState = "40P01";
const defaultDeadlockRetryDelaysMs = [100, 250] as const;
const standaloneMigrationBegin = /^[\t ]*BEGIN[\t ]*;[\t ]*(?:--[^\r\n]*)?\r?$/iu;
const standaloneMigrationCommit = /^[\t ]*COMMIT[\t ]*;[\t ]*(?:--[^\r\n]*)?\r?$/iu;
const possibleMigrationTransactionStart =
  /^(?:BEGIN|START\s+TRANSACTION)/iu;
const possibleMigrationTransactionEnd =
  /^(?:COMMIT|ROLLBACK|ABORT|PREPARE\s+TRANSACTION|END)/iu;
const sqlRoutineDeclarationStart =
  /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)(?:\s|$)/iu;
const sqlStandardAtomicBodyStart = /^BEGIN\s+ATOMIC/iu;
const sqlStandardAtomicBodyEnd = /^END/iu;
const postgresIdentifierContinuation =
  /^[a-z0-9_$\u0080-\u{10ffff}]$/iu;
const reconcilableSqlMigrationHashes = new Map<
  string,
  { canonical: string; historical: ReadonlySet<string> }
>([
  [
    "20260913171000_bind_active_tenant_invitation_reservations.sql",
    {
      canonical:
        "3c2a0a0ca7c91c59c4aedce5950d9d230dbb0c0715485e67e101b31ce21b0c0b",
      historical: new Set([
        "528faccfff900a0522ac19cadf5eb8998c1b3b5641d630a29088384b63043bcf",
      ]),
    },
  ],
]);

export type SqlMigrationHashState = "exact" | "reconcilable" | "drift";

export type MigrationTransactionClient = {
  query(queryText: string): Promise<unknown>;
};

export type MigrationDeadlockRetry = {
  sqlState: typeof migrationDeadlockSqlState;
  failedAttempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
};

type MigrationTransactionOptions = {
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  onDeadlockRetry?: (retry: MigrationDeadlockRetry) => void;
  prepareMigration?: () => Promise<"apply" | "already-applied">;
};

export type MigrationTransactionResult = "applied" | "already-applied";

type MigrationSessionLockCallbacks<T> = {
  acquire: () => Promise<unknown>;
  release: () => Promise<boolean>;
  run: () => Promise<T>;
};

function isDeadlock(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === migrationDeadlockSqlState
  );
}

function isMigrationBoundaryTrivia(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("--");
}

function maskedSqlText(sourceSql: string): string {
  return sourceSql.replace(/[^\r\n]/gu, " ");
}

function sqlCodePointAt(sourceSql: string, index: number): string {
  const codePoint = sourceSql.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}

function sqlCodePointBefore(sourceSql: string, index: number): string {
  if (index <= 0) return "";
  const precedingCodeUnit = sourceSql.charCodeAt(index - 1);
  if (
    precedingCodeUnit >= 0xdc00 &&
    precedingCodeUnit <= 0xdfff &&
    index > 1
  ) {
    const leadingCodeUnit = sourceSql.charCodeAt(index - 2);
    if (leadingCodeUnit >= 0xd800 && leadingCodeUnit <= 0xdbff) {
      return sourceSql.slice(index - 2, index);
    }
  }
  return sourceSql[index - 1] ?? "";
}

function isPostgresIdentifierContinuation(character: string): boolean {
  return character.length > 0 && postgresIdentifierContinuation.test(character);
}

function matchesPostgresKeywordPrefix(
  sourceSql: string,
  pattern: RegExp,
): boolean {
  const match = pattern.exec(sourceSql)?.[0];
  return (
    match !== undefined &&
    !isPostgresIdentifierContinuation(sqlCodePointAt(sourceSql, match.length))
  );
}

// Mask regions whose contents are not file-level SQL without changing token
// separation. PostgreSQL permits nested block comments and dollar-quoted
// bodies, while a dollar tag adjacent to an identifier is part of that
// identifier rather than a quote opener.
function sqlOutsideQuotedTextAndComments(sourceSql: string): string {
  const outside: string[] = [];
  let index = 0;

  while (index < sourceSql.length) {
    if (sourceSql.startsWith("--", index)) {
      const newlineIndex = sourceSql.indexOf("\n", index + 2);
      const endIndex = newlineIndex < 0 ? sourceSql.length : newlineIndex;
      outside.push(maskedSqlText(sourceSql.slice(index, endIndex)));
      index = endIndex;
      continue;
    }

    if (sourceSql.startsWith("/*", index)) {
      let depth = 1;
      let endIndex = index + 2;
      while (endIndex < sourceSql.length && depth > 0) {
        if (sourceSql.startsWith("/*", endIndex)) {
          depth += 1;
          endIndex += 2;
        } else if (sourceSql.startsWith("*/", endIndex)) {
          depth -= 1;
          endIndex += 2;
        } else {
          endIndex += 1;
        }
      }
      outside.push(maskedSqlText(sourceSql.slice(index, endIndex)));
      index = endIndex;
      continue;
    }

    const character = sourceSql[index] ?? "";
    if (character === "'" || character === '"') {
      const quote = character;
      const possibleEscapePrefix = sourceSql[index - 1] ?? "";
      const beforeEscapePrefix = sqlCodePointBefore(sourceSql, index - 1);
      const isEscapeString =
        quote === "'" &&
        (possibleEscapePrefix === "e" || possibleEscapePrefix === "E") &&
        !isPostgresIdentifierContinuation(beforeEscapePrefix);
      let endIndex = index + 1;
      while (endIndex < sourceSql.length) {
        if (isEscapeString && sourceSql[endIndex] === "\\") {
          endIndex = Math.min(endIndex + 2, sourceSql.length);
          continue;
        }
        if (sourceSql[endIndex] !== quote) {
          endIndex += 1;
          continue;
        }
        if (sourceSql[endIndex + 1] === quote) {
          endIndex += 2;
          continue;
        }
        endIndex += 1;
        break;
      }
      outside.push(maskedSqlText(sourceSql.slice(index, endIndex)));
      index = endIndex;
      continue;
    }

    if (character === "$") {
      const precedingCharacter = sqlCodePointBefore(sourceSql, index);
      const hasTokenBoundary =
        index === 0 || !isPostgresIdentifierContinuation(precedingCharacter);
      const delimiter = hasTokenBoundary
        ? /^\$(?:[a-z_\u0080-\u{10ffff}][a-z0-9_\u0080-\u{10ffff}]*)?\$/iu.exec(
            sourceSql.slice(index),
          )?.[0]
        : undefined;
      if (delimiter) {
        const closingIndex = sourceSql.indexOf(
          delimiter,
          index + delimiter.length,
        );
        const endIndex =
          closingIndex < 0
            ? sourceSql.length
            : closingIndex + delimiter.length;
        outside.push(maskedSqlText(sourceSql.slice(index, endIndex)));
        index = endIndex;
        continue;
      }
    }

    outside.push(character);
    index += 1;
  }

  return outside.join("");
}

function statementStartsSqlStandardRoutineBody(statement: string): boolean {
  if (!sqlRoutineDeclarationStart.test(statement)) return false;

  let parenthesisDepth = 0;
  for (let index = 0; index < statement.length; ) {
    const character = sqlCodePointAt(statement, index);
    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    } else if (
      parenthesisDepth === 0 &&
      !isPostgresIdentifierContinuation(sqlCodePointBefore(statement, index))
    ) {
      if (
        matchesPostgresKeywordPrefix(
          statement.slice(index),
          sqlStandardAtomicBodyStart,
        )
      ) {
        return true;
      }
    }
    index += character.length || 1;
  }
  return false;
}

function hasFileLevelTransactionControl(sourceSql: string): boolean {
  const statements = sqlOutsideQuotedTextAndComments(sourceSql)
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  let sqlStandardRoutineBodyDepth = 0;
  for (const statement of statements) {
    // SQL-standard LANGUAGE SQL routines use an unquoted BEGIN ATOMIC ... END
    // body. Its END is compound syntax, not the transaction-ending END alias.
    if (statementStartsSqlStandardRoutineBody(statement)) {
      sqlStandardRoutineBodyDepth += 1;
      continue;
    }
    if (sqlStandardRoutineBodyDepth > 0) {
      if (matchesPostgresKeywordPrefix(statement, sqlStandardAtomicBodyEnd)) {
        sqlStandardRoutineBodyDepth -= 1;
      }
      continue;
    }
    if (
      matchesPostgresKeywordPrefix(
        statement,
        possibleMigrationTransactionStart,
      ) ||
      matchesPostgresKeywordPrefix(statement, possibleMigrationTransactionEnd)
    ) {
      return true;
    }
  }
  return sqlStandardRoutineBodyDepth !== 0;
}

/**
 * Remove only a migration file's outer transaction statements before it is
 * executed inside the runner-owned schema-and-journal transaction. The source
 * bytes remain untouched for migration-history hashing and drift detection.
 */
export function sqlForManagedMigrationTransaction(sourceSql: string): string {
  const lines = sourceSql.split("\n");
  const firstStatementIndex = lines.findIndex(
    (line) => !isMigrationBoundaryTrivia(line),
  );
  let lastStatementIndex = lines.length - 1;
  while (
    lastStatementIndex >= 0 &&
    isMigrationBoundaryTrivia(lines[lastStatementIndex] ?? "")
  ) {
    lastStatementIndex -= 1;
  }

  const hasOuterBegin =
    firstStatementIndex >= 0 &&
    standaloneMigrationBegin.test(lines[firstStatementIndex] ?? "");
  const hasOuterCommit =
    lastStatementIndex >= 0 &&
    standaloneMigrationCommit.test(lines[lastStatementIndex] ?? "");

  if (hasOuterBegin !== hasOuterCommit) {
    throw new Error(
      "SQL migration has unmatched file-level transaction control.",
    );
  }
  if (!hasOuterBegin || !hasOuterCommit) {
    if (hasFileLevelTransactionControl(sourceSql)) {
      throw new Error(
        "SQL migration has unsupported file-level transaction control.",
      );
    }
    return sourceSql;
  }

  const managedSql = lines
    .filter(
      (_line, index) =>
        index !== firstStatementIndex && index !== lastStatementIndex,
    )
    .join("\n");
  if (hasFileLevelTransactionControl(managedSql)) {
    throw new Error(
      "SQL migration has unsupported nested file-level transaction control.",
    );
  }
  return managedSql;
}

export function sqlMigrationHashState(
  migrationName: string,
  expectedHash: string,
  recordedHash: string,
): SqlMigrationHashState {
  if (recordedHash === expectedHash) return "exact";

  const reconciliation = reconcilableSqlMigrationHashes.get(migrationName);
  return reconciliation?.canonical === expectedHash &&
    reconciliation.historical.has(recordedHash)
    ? "reconcilable"
    : "drift";
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function rollbackOrThrow(
  client: MigrationTransactionClient,
  migrationError: unknown,
): Promise<void> {
  try {
    await client.query("rollback");
  } catch (rollbackError) {
    throw new AggregateError(
      [migrationError, rollbackError],
      "SQL migration failed and its transaction could not be rolled back.",
      { cause: migrationError },
    );
  }
}

export async function runSqlMigrationTransaction(
  client: MigrationTransactionClient,
  applyMigration: () => Promise<unknown>,
  recordMigration: () => Promise<unknown>,
  options: MigrationTransactionOptions = {},
): Promise<MigrationTransactionResult> {
  const retryDelaysMs = options.retryDelaysMs ?? defaultDeadlockRetryDelaysMs;
  if (
    retryDelaysMs.some(
      (delayMs) => !Number.isSafeInteger(delayMs) || delayMs < 0,
    )
  ) {
    throw new RangeError(
      "Migration deadlock retry delays must be non-negative safe integers.",
    );
  }

  const wait = options.sleep ?? sleep;
  const maxAttempts = retryDelaysMs.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await client.query("begin");
    try {
      const preparation =
        (await options.prepareMigration?.()) ?? ("apply" as const);
      if (preparation === "already-applied") {
        await client.query("commit");
        return "already-applied";
      }
    } catch (error) {
      await rollbackOrThrow(client, error);
      throw error;
    }

    try {
      await applyMigration();
    } catch (error) {
      await rollbackOrThrow(client, error);
      const delayMs = retryDelaysMs[attempt - 1];
      if (!isDeadlock(error) || delayMs === undefined) {
        throw error;
      }

      options.onDeadlockRetry?.({
        sqlState: migrationDeadlockSqlState,
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
      });
      await wait(delayMs);
      continue;
    }

    // A successful SQL application is never repeated after a journal or commit
    // failure. Only a 40P01 raised while applying the SQL is known to be safe to
    // retry after this helper has confirmed a complete rollback.
    try {
      await recordMigration();
      await client.query("commit");
      return "applied";
    } catch (error) {
      await rollbackOrThrow(client, error);
      throw error;
    }
  }

  throw new Error("SQL migration retry attempts were exhausted unexpectedly.");
}

export async function withMigrationSessionLock<T>({
  acquire,
  release,
  run,
}: MigrationSessionLockCallbacks<T>): Promise<T> {
  await acquire();

  let runFailed = false;
  let runError: unknown;
  let result: T | undefined;
  try {
    result = await run();
  } catch (error) {
    runFailed = true;
    runError = error;
  }

  try {
    const released = await release();
    if (!released) {
      throw new Error("The database migration session lock was not held.");
    }
  } catch (releaseError) {
    if (runFailed) {
      throw new AggregateError(
        [runError, releaseError],
        "Database migration failed and its session lock could not be released.",
        { cause: runError },
      );
    }
    throw releaseError;
  }

  if (runFailed) {
    throw runError;
  }

  return result as T;
}
