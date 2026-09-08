import { defineConfig } from "drizzle-kit";
import path from "path";
import { loadDbRuntimeEnv } from "./src/runtime-env";
import { databaseConnectionConfig } from "./src/database-environment";

loadDbRuntimeEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}
const databaseConnection = databaseConnectionConfig("migration");

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./migrations/generated",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseConnection.connectionString,
    ssl: databaseConnection.ssl,
  },
});
