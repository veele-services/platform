import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadDbRuntimeEnv } from "./runtime-env";
import {
  configuredDatabaseConnectionPurpose,
  databaseConnectionConfig,
} from "./database-environment";
import * as schema from "./schema";

const { Pool } = pg;

loadDbRuntimeEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseConnection = databaseConnectionConfig(
  configuredDatabaseConnectionPurpose(),
);

export const pool = new Pool(databaseConnection);
export const db = drizzle(pool, { schema });
