import { defineConfig } from "drizzle-kit";
import path from "path";
import { loadDbRuntimeEnv } from "./src/runtime-env";
import { assertDatabaseEnvironmentIsolation } from "./src/database-environment";

loadDbRuntimeEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}
assertDatabaseEnvironmentIsolation();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./migrations/generated",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: true,
  },
});
