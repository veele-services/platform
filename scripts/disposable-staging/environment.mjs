import { createRequire } from "node:module";

import { databaseNodePostgresSslConfig } from "../fieldgrid-database-root-cert.mjs";
import {
  assertMigrationAdminUrl,
  assertRuntimeUrlDescriptor,
  resolveStagingPoolerHost,
} from "../fieldgrid-w00-runtime-principal.mjs";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  requireThat,
} from "./contract.mjs";

export function validateConnections(env = process.env) {
  const migration = env.FIELDGRID_MIGRATION_DATABASE_URL;
  const runtime = env.DATABASE_URL;
  requireThat(
    typeof migration === "string" && typeof runtime === "string",
    "DATABASE_CONFIGURATION_MISSING",
  );
  const migrationUrl = new URL(assertMigrationAdminUrl(migration, "staging"));
  const poolerHost = resolveStagingPoolerHost(migration, env);
  const runtimeUrl = assertRuntimeUrlDescriptor(runtime, poolerHost, "staging");
  requireThat(
    migrationUrl.search === "" &&
      migrationUrl.hash === "" &&
      runtimeUrl.search === "" &&
      runtimeUrl.hash === "",
    "DATABASE_URL_OVERRIDE",
  );
  requireThat(
    decodeURIComponent(migrationUrl.username) !==
      decodeURIComponent(runtimeUrl.username) &&
      decodeURIComponent(migrationUrl.password) !==
        decodeURIComponent(runtimeUrl.password),
    "DATABASE_PRINCIPALS_NOT_DISTINCT",
  );
  requireThat(
    !migration.includes(PRODUCTION_PROJECT_REF) &&
      !runtime.includes(PRODUCTION_PROJECT_REF),
    "PRODUCTION_TARGET_FORBIDDEN",
  );
  const ssl = databaseNodePostgresSslConfig(env);
  return { migration, runtime, poolerHost, ssl };
}

export function createDatabaseClient(config) {
  const require = createRequire(
    new URL("../../lib/db/package.json", import.meta.url),
  );
  const { Client } = require("pg");
  return new Client({
    connectionString: config.migration,
    ssl: config.ssl,
    connectionTimeoutMillis: 15000,
    query_timeout: 180000,
    application_name: "fieldgrid-disposable-staging-rebuild",
    options: "-c timezone=UTC",
  });
}

function createBoundSupabaseClient(env, key) {
  const require = createRequire(
    new URL("../../artifacts/backoffice/package.json", import.meta.url),
  );
  const { createClient } = require("@supabase/supabase-js");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options) => {
        const parsed = new URL(url);
        requireThat(
          parsed.origin === `https://${STAGING_PROJECT_REF}.supabase.co`,
          "PROVIDER_ORIGIN_INVALID",
        );
        return fetch(parsed, {
          ...options,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
      },
    },
  });
}

export function createProviderClient(env = process.env) {
  requireThat(
    env.NEXT_PUBLIC_SUPABASE_URL ===
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    "SUPABASE_ORIGIN_INVALID",
  );
  requireThat(
    typeof env.SUPABASE_SERVICE_ROLE_KEY === "string" &&
      env.SUPABASE_SERVICE_ROLE_KEY.length > 20,
    "SUPABASE_ADMIN_CONFIGURATION_MISSING",
  );
  return createBoundSupabaseClient(env, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAcceptanceClient(env = process.env) {
  requireThat(
    env.NEXT_PUBLIC_SUPABASE_URL ===
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    "SUPABASE_ORIGIN_INVALID",
  );
  requireThat(
    typeof env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 20,
    "SUPABASE_ANON_CONFIGURATION_MISSING",
  );
  return createBoundSupabaseClient(env, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
