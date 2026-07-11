import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("deploy workflow maps the GitHub browser secret to Next public runtime config", async () => {
  const workflow = await read(".github/workflows/deploy.yml");

  assert.match(
    workflow,
    /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY:\s*\$\{\{\s*secrets\.GOOGLE_MAPS_BROWSER_API_KEY/,
  );
  assert.match(
    workflow,
    /GOOGLE_MAPS_SERVER_API_KEY:\s*\$\{\{\s*secrets\.GOOGLE_MAPS_SERVER_API_KEY/,
  );
  assert.match(
    workflow,
    /GOOGLE_MAPS_MAP_ID:\s*\$\{\{\s*vars\.GOOGLE_MAPS_MAP_ID/,
  );
  assert.match(
    workflow,
    /printf 'NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY=%s\\n'/,
  );
  assert.match(workflow, /printf 'GOOGLE_MAPS_SERVER_API_KEY=%s\\n'/);
});

test("Google Maps config keeps the server key out of public browser config", async () => {
  const config = await read(
    "artifacts/backoffice/src/lib/google-maps/config.ts",
  );

  assert.match(config, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.doesNotMatch(
    config,
    /readOptionalEnv\(env, "GOOGLE_MAPS_BROWSER_API_KEY"\)/,
  );
  assert.doesNotMatch(
    config,
    /serverApiKey:\s*readOptionalEnv\(env,\s*"NEXT_PUBLIC_/,
  );
  assert.match(config, /PUBLIC_SECRET_ENV_NAMES/);
});

test("planning travel modes are not exported from the server action module", async () => {
  const actions = await read("artifacts/backoffice/src/app/actions/planning.ts");
  const shared = await read(
    "artifacts/backoffice/src/lib/google-maps/planning-travel-modes.ts",
  );

  assert.doesNotMatch(actions, /export const PLANNING_ROUTE_TRAVEL_MODES/);
  assert.match(shared, /export const PLANNING_ROUTE_TRAVEL_MODES/);
});
