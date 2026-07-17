import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const originalMigration = readFileSync("lib/db/migrations/041_portal_realtime_events.sql", "utf8");
const w05Migration = readFileSync("lib/db/migrations/20260716160000_realtime_projection_delivery.sql", "utf8");

function extractFunctionArgs(source, functionName) {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${functionName}\\s*\\((?<args>[\\s\\S]*?)\\)\\s*(?:RETURNS|LANGUAGE)`, "u");
  const match = source.match(pattern);
  assert.ok(match?.groups?.args, `${functionName} signature was not found`);

  return match.groups.args
    .split("\n")
    .map((line) => line.trim().replace(/,$/u, ""))
    .filter(Boolean)
    .map((line) => {
      const [name, type] = line.split(/\s+/u);
      return { name, type };
    });
}

test("W05 portal_realtime_emit preserves the existing positional contract", () => {
  const originalArgs = extractFunctionArgs(originalMigration, "portal_realtime_emit");
  const w05Args = extractFunctionArgs(w05Migration, "portal_realtime_emit");

  assert.deepEqual(
    w05Args.slice(0, 6),
    originalArgs.slice(0, 6),
    "tenant, recipient type, realtime key, personnel, customer, and topic arguments must not drift",
  );
  assert.deepEqual(
    w05Args.map(({ type }) => type),
    originalArgs.map(({ type }) => type),
    "argument types alone are insufficient; same-typed argument swaps must be caught by name/order checks",
  );
  assert.deepEqual(
    w05Args.map(({ name }) => name).slice(0, 3),
    ["p_tenant_id", "p_recipient_type", "p_realtime_key"],
    "p_recipient_type and p_realtime_key are both text and must retain their original positional order",
  );
});
