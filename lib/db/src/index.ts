import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadDbRuntimeEnv } from "./runtime-env";
import * as schema from "./schema";

const { Pool } = pg;

loadDbRuntimeEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./tenant-context";
export * from "./tenant-entitlements";
export * from "./module-permissions";
export * from "./content-visibility";
export * from "./knowledgebase-content";
export * from "./knowledgebase-tooltips";
export * from "./release-content";
export * from "./tenant-branding";
export * from "./planning-realtime";
export * from "./email-templates";
export * from "./tenant-provisioning";
export * from "./custom-domains";
export * from "./platform-access";
export * from "./storage-paths";
export * from "./security-data-classification";
export * from "./security-masking";
export * from "./security-permissions";
export * from "./security-audit";
export * from "./sensitive-access";
