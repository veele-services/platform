import { readFileSync } from "node:fs";

const STANDARD_API_PORT = "59321";
const STANDARD_DATABASE_PORT = "59322";
const STANDARD_MAILPIT_PORT = "59324";
const REPLAY_API_PORT = "60321";
const REPLAY_DATABASE_PORT = "60322";
const REPLAY_MAILPIT_PORT = "60324";

function isValidatedReplay() {
  const replay = process.env.FIELDGRID_LOCAL_REPLAY_DIR;
  if (!replay) return false;
  if (!/^\/tmp\/fieldgrid-release-migrations\.[A-Za-z0-9]+$/.test(replay)) {
    throw new Error("Invalid local E2E replay directory");
  }
  const config = readFileSync(`${replay}/supabase/config.toml`, "utf8");
  if (!config.includes('project_id = "fieldgrid-release-audit-20261001"')) {
    throw new Error("Invalid local E2E replay project");
  }
  return true;
}

function requireLoopbackUrl(value: string | undefined, expectedPort: string, label: string) {
  if (!value) throw new Error(`${label} is not configured`);
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" || url.port !== expectedPort) {
    throw new Error(`${label} must use the isolated local Fieldgrid target`);
  }
  return url;
}

export function requireLocalApiUrl(value = process.env.SUPABASE_URL) {
  return requireLoopbackUrl(value, isValidatedReplay() ? REPLAY_API_PORT : STANDARD_API_PORT, "Local Supabase API");
}

export function requireLocalDatabaseUrl(value = process.env.DATABASE_URL) {
  return requireLoopbackUrl(value, isValidatedReplay() ? REPLAY_DATABASE_PORT : STANDARD_DATABASE_PORT, "Local Supabase database");
}

export function requireLocalMailpitUrl() {
  return new URL(`http://127.0.0.1:${isValidatedReplay() ? REPLAY_MAILPIT_PORT : STANDARD_MAILPIT_PORT}`);
}
