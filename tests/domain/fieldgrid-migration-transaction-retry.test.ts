import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  runSqlMigrationTransaction,
  type MigrationTransactionClient,
  withMigrationSessionLock,
} from "../../lib/db/src/migration-transaction-retry";

type SqlStateError = Error & { code: string };

function sqlStateError(code: string, message: string): SqlStateError {
  return Object.assign(new Error(message), { code });
}

test("deadlocked SQL is rolled back before a bounded retry and recorded once", async () => {
  const calls: string[] = [];
  const delays: number[] = [];
  const retries: unknown[] = [];
  const deadlock = sqlStateError("40P01", "deadlock detected");
  let migrationAttempts = 0;
  let journalWrites = 0;
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      return undefined;
    },
  };

  await runSqlMigrationTransaction(
    client,
    async () => {
      calls.push("migration");
      migrationAttempts += 1;
      if (migrationAttempts === 1) throw deadlock;
    },
    async () => {
      calls.push("journal");
      journalWrites += 1;
    },
    {
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      onDeadlockRetry: (retry) => retries.push(retry),
    },
  );

  assert.deepEqual(calls, [
    "begin",
    "migration",
    "rollback",
    "begin",
    "migration",
    "journal",
    "commit",
  ]);
  assert.equal(journalWrites, 1);
  assert.deepEqual(delays, [100]);
  assert.deepEqual(retries, [
    {
      sqlState: "40P01",
      failedAttempt: 1,
      nextAttempt: 2,
      maxAttempts: 3,
      delayMs: 100,
    },
  ]);
});

test("a retry rechecks the journal and never reapplies SQL completed by another migrator", async () => {
  const calls: string[] = [];
  const deadlock = sqlStateError("40P01", "deadlock detected");
  let preparations = 0;
  let migrationAttempts = 0;
  let journalWrites = 0;
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      return undefined;
    },
  };

  const result = await runSqlMigrationTransaction(
    client,
    async () => {
      calls.push("migration");
      migrationAttempts += 1;
      throw deadlock;
    },
    async () => {
      calls.push("journal");
      journalWrites += 1;
    },
    {
      prepareMigration: async () => {
        calls.push("prepare");
        preparations += 1;
        return preparations === 1 ? "apply" : "already-applied";
      },
      sleep: async () => {
        calls.push("sleep");
      },
    },
  );

  assert.equal(result, "already-applied");
  assert.equal(migrationAttempts, 1);
  assert.equal(journalWrites, 0);
  assert.deepEqual(calls, [
    "begin",
    "prepare",
    "migration",
    "rollback",
    "sleep",
    "begin",
    "prepare",
    "commit",
  ]);
});

test("journal recheck failures roll back and are never retried", async () => {
  const calls: string[] = [];
  const preparationDeadlock = sqlStateError(
    "40P01",
    "journal recheck deadlock",
  );
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      return undefined;
    },
  };

  await assert.rejects(
    runSqlMigrationTransaction(
      client,
      async () => {
        calls.push("migration");
      },
      async () => {
        calls.push("journal");
      },
      {
        prepareMigration: async () => {
          calls.push("prepare");
          throw preparationDeadlock;
        },
        sleep: async () => {
          calls.push("sleep");
        },
      },
    ),
    (error) => error === preparationDeadlock,
  );

  assert.deepEqual(calls, ["begin", "prepare", "rollback"]);
});

test("deadlock retry stops after the third transaction attempt", async () => {
  const calls: string[] = [];
  const delays: number[] = [];
  const deadlock = sqlStateError("40P01", "persistent deadlock");
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      return undefined;
    },
  };

  await assert.rejects(
    runSqlMigrationTransaction(
      client,
      async () => {
        calls.push("migration");
        throw deadlock;
      },
      async () => {
        calls.push("journal");
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    ),
    (error) => error === deadlock,
  );

  assert.deepEqual(delays, [100, 250]);
  assert.equal(calls.filter((call) => call === "begin").length, 3);
  assert.equal(calls.filter((call) => call === "migration").length, 3);
  assert.equal(calls.filter((call) => call === "rollback").length, 3);
  assert.equal(calls.filter((call) => call === "journal").length, 0);
  assert.equal(calls.filter((call) => call === "commit").length, 0);
});

test("non-deadlock SQL failures roll back and fail closed without retry", async (t) => {
  const failures: unknown[] = [
    sqlStateError("23505", "unique violation"),
    sqlStateError("40001", "serialization failure"),
    sqlStateError("55P03", "lock not available"),
    sqlStateError("08006", "connection failure"),
    new Error("deadlock detected without a structured SQLSTATE"),
  ];

  for (const failure of failures) {
    await t.test(
      failure instanceof Error ? failure.message : "unknown failure",
      async () => {
        const calls: string[] = [];
        const delays: number[] = [];
        const client: MigrationTransactionClient = {
          async query(queryText) {
            calls.push(queryText);
            return undefined;
          },
        };

        await assert.rejects(
          runSqlMigrationTransaction(
            client,
            async () => {
              calls.push("migration");
              throw failure;
            },
            async () => {
              calls.push("journal");
            },
            {
              sleep: async (delayMs) => {
                delays.push(delayMs);
              },
            },
          ),
          (error) => error === failure,
        );

        assert.deepEqual(calls, ["begin", "migration", "rollback"]);
        assert.deepEqual(delays, []);
      },
    );
  }
});

test("journal failures are rolled back but never reapply migration SQL", async () => {
  const calls: string[] = [];
  const journalDeadlock = sqlStateError("40P01", "journal deadlock");
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      return undefined;
    },
  };

  await assert.rejects(
    runSqlMigrationTransaction(
      client,
      async () => {
        calls.push("migration");
      },
      async () => {
        calls.push("journal");
        throw journalDeadlock;
      },
    ),
    (error) => error === journalDeadlock,
  );

  assert.deepEqual(calls, ["begin", "migration", "journal", "rollback"]);
});

test("commit deadlocks roll back but never reapply migration SQL", async () => {
  const calls: string[] = [];
  const commitDeadlock = sqlStateError("40P01", "commit deadlock");
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      if (queryText === "commit") throw commitDeadlock;
      return undefined;
    },
  };

  await assert.rejects(
    runSqlMigrationTransaction(
      client,
      async () => {
        calls.push("migration");
      },
      async () => {
        calls.push("journal");
      },
    ),
    (error) => error === commitDeadlock,
  );

  assert.deepEqual(calls, [
    "begin",
    "migration",
    "journal",
    "commit",
    "rollback",
  ]);
});

test("rollback failure preserves both errors and disables retry", async () => {
  const calls: string[] = [];
  const deadlock = sqlStateError("40P01", "deadlock detected");
  const rollbackFailure = new Error("connection lost during rollback");
  const client: MigrationTransactionClient = {
    async query(queryText) {
      calls.push(queryText);
      if (queryText === "rollback") throw rollbackFailure;
      return undefined;
    },
  };

  await assert.rejects(
    runSqlMigrationTransaction(
      client,
      async () => {
        calls.push("migration");
        throw deadlock;
      },
      async () => {
        calls.push("journal");
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [deadlock, rollbackFailure]);
      assert.equal(error.cause, deadlock);
      return true;
    },
  );

  assert.deepEqual(calls, ["begin", "migration", "rollback"]);
});

test("migration session lock surrounds successful work", async () => {
  const calls: string[] = [];

  const result = await withMigrationSessionLock({
    acquire: async () => {
      calls.push("acquire");
    },
    run: async () => {
      calls.push("run");
      return "complete";
    },
    release: async () => {
      calls.push("release");
      return true;
    },
  });

  assert.equal(result, "complete");
  assert.deepEqual(calls, ["acquire", "run", "release"]);
});

test("migration session lock is released when migration work fails", async () => {
  const calls: string[] = [];
  const migrationFailure = new Error("migration failed");

  await assert.rejects(
    withMigrationSessionLock({
      acquire: async () => {
        calls.push("acquire");
      },
      run: async () => {
        calls.push("run");
        throw migrationFailure;
      },
      release: async () => {
        calls.push("release");
        return true;
      },
    }),
    (error) => error === migrationFailure,
  );

  assert.deepEqual(calls, ["acquire", "run", "release"]);
});

test("migration and session-lock release failures are both preserved", async () => {
  const migrationFailure = new Error("migration failed");
  const releaseFailure = new Error("connection lost during unlock");

  await assert.rejects(
    withMigrationSessionLock({
      acquire: async () => undefined,
      run: async () => {
        throw migrationFailure;
      },
      release: async () => {
        throw releaseFailure;
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [migrationFailure, releaseFailure]);
      assert.equal(error.cause, migrationFailure);
      return true;
    },
  );
});

test("a missing session lock fails closed after successful work", async () => {
  await assert.rejects(
    withMigrationSessionLock({
      acquire: async () => undefined,
      run: async () => "complete",
      release: async () => false,
    }),
    /session lock was not held/u,
  );
});

test("the required unit lane binds every migration stage to the lock-holding client", () => {
  const source = readFileSync(
    new URL("../../lib/db/src/migrate.ts", import.meta.url),
    "utf8",
  );
  const drizzleStart = source.indexOf(
    "async function runDrizzleGeneratedMigrations(",
  );
  const drizzleEnd = source.indexOf(
    "\nasync function runSqlMigrations(",
    drizzleStart,
  );
  const lockStart = source.indexOf("async function withDatabaseMigrationLock");
  const lockEnd = source.indexOf(
    "\nasync function existingPublicTables(",
    lockStart,
  );
  const sqlStart = source.indexOf("async function runSqlMigrations(");
  const sqlEnd = source.indexOf("\nasync function baseline():", sqlStart);
  const migrateStart = source.indexOf(
    "async function migrate(): Promise<void> {",
  );
  const migrateEnd = source.indexOf(
    '\nif (mode === "baseline") {',
    migrateStart,
  );

  assert.ok(drizzleStart >= 0 && drizzleEnd > drizzleStart);
  assert.ok(lockStart >= 0 && lockEnd > lockStart);
  assert.ok(sqlStart >= 0 && sqlEnd > sqlStart);
  assert.ok(migrateStart >= 0 && migrateEnd > migrateStart);

  const drizzleRunner = source.slice(drizzleStart, drizzleEnd);
  const lockRunner = source.slice(lockStart, lockEnd);
  const sqlRunner = source.slice(sqlStart, sqlEnd);
  const migrateRunner = source.slice(migrateStart, migrateEnd);
  assert.match(drizzleRunner, /client: pg\.Client/u);
  assert.match(drizzleRunner, /const db = drizzle\(client\);/u);
  assert.doesNotMatch(drizzleRunner, /\bPool\b|connectionConfig\(|\.end\(/u);
  assert.match(lockRunner, /return withMigrationSessionLock\(\{/u);
  assert.match(lockRunner, /pg_catalog\.pg_advisory_lock/u);
  assert.match(lockRunner, /pg_catalog\.pg_advisory_unlock/u);
  assert.match(lockRunner, /\[databaseMigrationSessionLock\]/u);
  assert.match(lockRunner, /return result\.rows\[0\]\?\.unlocked === true;/u);
  assert.match(lockRunner, /\n    run,\n/u);

  const orderedSqlCallbacks = [
    "await runSqlMigrationTransaction(",
    "client,",
    "() => client.query(migration.sql)",
    "() => recordSqlMigration(client, migration, false)",
    "prepareMigration: async () =>",
    "await sqlMigrationIsRecorded(client, migration)",
  ];
  let previousSqlIndex = -1;
  for (const callback of orderedSqlCallbacks) {
    const callbackIndex = sqlRunner.indexOf(callback, previousSqlIndex + 1);
    assert.ok(
      callbackIndex > previousSqlIndex,
      `SQL migration callback is missing or out of order: ${callback}`,
    );
    previousSqlIndex = callbackIndex;
  }

  const orderedStages = [
    "await withDatabaseMigrationLock(client, async () => {",
    "await ensureHistoryTables(client);",
    "await assertNoUnbaselinedExistingSchema(client, expectedTables);",
    "await runDrizzleGeneratedMigrations(client);",
    "await ensureLegacySqlPrerequisites(client);",
    "await runSqlMigrations(client, sqlMigrations);",
  ];
  let previousIndex = -1;
  for (const stage of orderedStages) {
    const stageIndex = migrateRunner.indexOf(stage);
    assert.ok(
      stageIndex > previousIndex,
      `migration stage is missing or out of order: ${stage}`,
    );
    previousIndex = stageIndex;
  }
  assert.match(migrateRunner, /finally \{\s+await client\.end\(\);\s+\}/u);
});
