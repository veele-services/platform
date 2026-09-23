import { createRequire } from "node:module";

import {
  bootstrapDatabase,
  verifyBootstrap,
} from "./disposable-staging/bootstrap.mjs";
import {
  assertNoExternalWriters,
  verifyRebuiltDatabase,
} from "./disposable-staging/database.mjs";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");

const identities = {
  platform: "30000000-0000-4000-8000-000000000001",
  tenants: [
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003",
  ],
};
const configuration = {
  platform: { email: "platform@example.invalid", name: "Platform beheerder" },
  tenants: [
    {
      id: "00000000-0000-0000-0000-000000000010",
      slug: "rebuild-a",
      host: "rebuild-a.staging.fieldgrid.nl",
      name: "Rebuild A",
      managerEmail: "a@example.invalid",
      managerName: "Beheerder A",
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      slug: "rebuild-b",
      host: "rebuild-b.staging.fieldgrid.nl",
      name: "Rebuild B",
      managerEmail: "b@example.invalid",
      managerName: "Beheerder B",
    },
  ],
};

async function main() {
  if (process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET !== "1") {
    throw new Error("local runtime-safety reset guard is required");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
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
    for (const [index, id] of [
      identities.platform,
      ...identities.tenants,
    ].entries()) {
      await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [
        id,
        `rebuild-${index}@example.invalid`,
      ]);
    }
    await bootstrapDatabase(client, configuration, identities);
    const database = await verifyRebuiltDatabase(client);
    const bootstrap = await verifyBootstrap(client, configuration, identities);
    const writerFence = await assertNoExternalWriters(client);
    process.stdout.write(
      `${JSON.stringify({ database, bootstrap, writerFence })}\n`,
    );
  } finally {
    await client.query("DROP PUBLICATION IF EXISTS supabase_realtime");
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(
    `[fieldgrid:disposable-postgres17] FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
