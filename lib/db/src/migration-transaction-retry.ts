const migrationDeadlockSqlState = "40P01";
const defaultDeadlockRetryDelaysMs = [100, 250] as const;
const standaloneMigrationBegin = /^[\t ]*BEGIN[\t ]*;[\t ]*(?:--[^\r\n]*)?\r?$/iu;
const standaloneMigrationCommit = /^[\t ]*COMMIT[\t ]*;[\t ]*(?:--[^\r\n]*)?\r?$/iu;

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
  if (!hasOuterBegin || !hasOuterCommit) return sourceSql;

  return lines
    .filter(
      (_line, index) =>
        index !== firstStatementIndex && index !== lastStatementIndex,
    )
    .join("\n");
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
