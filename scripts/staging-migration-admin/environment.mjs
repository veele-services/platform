import { createRequire } from "node:module";

import { databaseNodePostgresSslConfig } from "../fieldgrid-database-root-cert.mjs";
import {
  MIGRATION_ROLE,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  requireThat,
} from "./contract.mjs";

function parseDatabaseUrl(value, code) {
  requireThat(typeof value === "string" && value.length > 0, code);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    requireThat(false, code);
  }
  requireThat(
    parsed.protocol === "postgresql:" &&
      parsed.pathname === "/postgres" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.port === "5432" &&
      !value.includes(PRODUCTION_PROJECT_REF),
    code,
  );
  return parsed;
}

export function validateLegacyConnection(env = process.env) {
  const legacy = parseDatabaseUrl(
    env.DATABASE_URL,
    "LEGACY_DATABASE_URL_INVALID",
  );
  const username = decodeURIComponent(legacy.username);
  const direct =
    legacy.hostname === `db.${STAGING_PROJECT_REF}.supabase.co` &&
    username === "postgres";
  const pooler =
    legacy.hostname === env.FIELDGRID_STAGING_DATABASE_POOLER_HOST &&
    username === `postgres.${STAGING_PROJECT_REF}`;
  requireThat(direct || pooler, "LEGACY_DATABASE_URL_INVALID");
  requireThat(
    typeof env.FIELDGRID_STAGING_DATABASE_POOLER_HOST === "string" &&
      /^[a-z0-9.-]+\.supabase\.(?:com|net)$/u.test(
        env.FIELDGRID_STAGING_DATABASE_POOLER_HOST,
      ) &&
      !env.FIELDGRID_STAGING_DATABASE_POOLER_HOST.includes(
        PRODUCTION_PROJECT_REF,
      ),
    "POOLER_HOST_INVALID",
  );
  return {
    legacy: env.DATABASE_URL,
    poolerHost: env.FIELDGRID_STAGING_DATABASE_POOLER_HOST,
    ssl: databaseNodePostgresSslConfig(env),
  };
}

export function targetConnection(config, password) {
  requireThat(/^[0-9a-f]{64}$/u.test(password), "MIGRATION_PASSWORD_INVALID");
  return {
    connectionString:
      `postgresql://${MIGRATION_ROLE}.${STAGING_PROJECT_REF}:` +
      `${password}@${config.poolerHost}:5432/postgres`,
    ssl: config.ssl,
  };
}

export function createDatabaseClient(connection, applicationName) {
  const require = createRequire(
    new URL("../../lib/db/package.json", import.meta.url),
  );
  const { Client } = require("pg");
  return new Client({
    ...connection,
    connectionTimeoutMillis: 15000,
    query_timeout: 180000,
    application_name: applicationName,
    options: "-c timezone=UTC",
  });
}
