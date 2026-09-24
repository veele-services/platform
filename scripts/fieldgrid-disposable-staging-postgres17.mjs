import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  bootstrapDatabase,
  verifyBootstrap,
} from "./disposable-staging/bootstrap.mjs";
import {
  assertNoExternalWriters,
  verifyPlatformOnlyDatabaseState,
  verifyRebuiltDatabase,
} from "./disposable-staging/database.mjs";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");

const identities = {
  platform: "30000000-0000-4000-8000-000000000001",
};
const configuration = {
  platform: {
    email: "platform@example.invalid",
    password: "platform-password-123",
    name: "Platform beheerder",
  },
};

export async function verifyPostgres17Rebuild(
  client,
  { allowedSamePrincipalPids = [], runAcceptance } = {},
) {
  try {
    // Plain postgres:17 lacks Supabase's managed publication. Install only this
    // provider compatibility object after canonical migration so the same
    // final-state verifier can run; the separate realtime migration smoke owns
    // migration-time publication coverage.
    const publication = await client.query(
      "SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime'",
    );
    if (publication.rows.length === 0) {
      await client.query("CREATE PUBLICATION supabase_realtime");
      await client.query(
        "ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_realtime_events",
      );
    }
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [
      identities.platform,
      "platform@example.invalid",
    ]);
    await bootstrapDatabase(client, configuration, identities);
    const database = await verifyRebuiltDatabase(client);
    const bootstrap = await verifyBootstrap(client, configuration, identities);
    const acceptance = runAcceptance
      ? await runAcceptance({
          bootstrap: configuration,
          database: client,
        })
      : undefined;
    const finalState = await verifyPlatformOnlyDatabaseState(
      client,
      identities.platform,
    );
    const writerFence = await assertNoExternalWriters(client, {
      allowedSamePrincipalPids,
    });
    return { database, bootstrap, acceptance, finalState, writerFence };
  } finally {
    await client.query("DROP PUBLICATION IF EXISTS supabase_realtime");
  }
}

async function main() {
  if (process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET !== "1") {
    throw new Error("local runtime-safety reset guard is required");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const proof = await verifyPostgres17Rebuild(client);
    process.stdout.write(`${JSON.stringify(proof)}\n`);
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `[fieldgrid:disposable-postgres17] FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
