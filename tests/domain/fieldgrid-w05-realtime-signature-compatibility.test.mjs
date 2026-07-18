import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const originalMigration = readFileSync("lib/db/migrations/041_portal_realtime_events.sql", "utf8");
const w05Migration = readFileSync("lib/db/migrations/20260716160000_realtime_projection_delivery.sql", "utf8");

function extractFunctionArgs(source, functionName) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  assert.notEqual(start, -1, `${functionName} definition exists`);
  const argsStart = source.indexOf("(", start) + 1;
  const argsEnd = source.indexOf("\n)", argsStart);
  assert.notEqual(argsEnd, -1, `${functionName} argument list closes on its own line`);
  return source
    .slice(argsStart, argsEnd)
    .split("\n")
    .map((line) => line.trim().replace(/,$/u, ""))
    .filter(Boolean)
    .map((line) => {
      const [name, type] = line.split(/\s+/u);
      return { name, type: type.toLowerCase() };
    });
}

function extractPerformArgs(source, wrapperName) {
  const wrapperStart = source.indexOf(`CREATE OR REPLACE FUNCTION public.${wrapperName}(`);
  assert.notEqual(wrapperStart, -1, `${wrapperName} definition exists`);
  const nextFunction = source.indexOf("CREATE OR REPLACE FUNCTION public.", wrapperStart + 1);
  const wrapperSource = source.slice(wrapperStart, nextFunction === -1 ? undefined : nextFunction);
  const marker = "PERFORM public.portal_realtime_emit(";
  const start = wrapperSource.indexOf(marker);
  assert.notEqual(start, -1, `${wrapperName} calls portal_realtime_emit`);
  const argsStart = start + marker.length;
  const argsEnd = wrapperSource.indexOf("\n  );", argsStart);
  assert.notEqual(argsEnd, -1, `${wrapperName} perform argument list closes`);
  return wrapperSource
    .slice(argsStart, argsEnd)
    .split("\n")
    .map((line) => line.trim().replace(/,$/u, ""))
    .filter(Boolean);
}

test("W05 portal_realtime_emit preserves the established positional signature", () => {
  const originalArgs = extractFunctionArgs(originalMigration, "portal_realtime_emit");
  const w05Args = extractFunctionArgs(w05Migration, "portal_realtime_emit");

  const establishedSignature = [
    ["p_tenant_id", "uuid"],
    ["p_recipient_type", "text"],
    ["p_realtime_key", "text"],
    ["p_personnel_id", "uuid"],
    ["p_customer_id", "uuid"],
    ["p_topic", "text"],
    ["p_entity_type", "text"],
    ["p_entity_id", "text"],
    ["p_event_type", "text"],
    ["p_payload", "jsonb"],
  ];

  assert.deepEqual(originalArgs.map(({ name, type }) => [name, type]), establishedSignature);
  assert.deepEqual(w05Args.map(({ name, type }) => [name, type]), establishedSignature);
  assert.equal(w05Args[1].name, "p_recipient_type", "guard catches swapping same-typed recipient/key arguments");
  assert.equal(w05Args[2].name, "p_realtime_key", "W05 keeps realtime key after recipient type");
  assert.equal(w05Args[5].name, "p_topic", "W05 preserves topic name");
  assert.equal(w05Args[6].name, "p_entity_type", "W05 preserves entity type name");
  assert.equal(w05Args[7].name, "p_entity_id", "W05 preserves entity id name");
  assert.equal(w05Args[8].name, "p_event_type", "W05 preserves event type name");
});

test("W05 wrappers keep positional portal_realtime_emit call semantics", () => {
  const managementArgs = extractPerformArgs(originalMigration, "portal_realtime_emit_management");
  const customerArgs = extractPerformArgs(originalMigration, "portal_realtime_emit_customer");

  assert.deepEqual(managementArgs.slice(0, 3), [
    "p_tenant_id",
    "'management'",
    "'management_' || p_tenant_id::text",
  ]);
  assert.deepEqual(customerArgs.slice(0, 5), [
    "v_tenant_id",
    "'customer'",
    "'customer_' || p_customer_id::text",
    "NULL",
    "p_customer_id",
  ]);
  assert.doesNotMatch(w05Migration, /=>/u, "migration does not mix in named-argument calls");
  assert.doesNotMatch(w05Migration, /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.portal_realtime_emit/iu, "W05 does not drop portal_realtime_emit");
  assert.doesNotMatch(w05Migration, /DROP\s+FUNCTION[\s\S]*CASCADE/iu, "W05 never uses DROP FUNCTION CASCADE");
});
