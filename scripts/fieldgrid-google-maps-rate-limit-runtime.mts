#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  FIXTURE,
  assertDisposableDatabaseForReset,
  connect,
  databaseUrl,
} from "./fieldgrid-runtime-safety-lib.mjs";

const parsedDatabase = new URL(databaseUrl());
assert.ok(["127.0.0.1", "localhost", "::1", "postgres"].includes(parsedDatabase.hostname));

const {
  consumeGoogleMapsRateLimit,
  shouldRecordGoogleMapsAutocompleteSession,
} = await import("../lib/db/src/google-maps-rate-limit.ts");
const { pool } = await import("../lib/db/src/connection.ts");
const client = await connect();
await assertDisposableDatabaseForReset(client);

const tenantA = FIXTURE.tenants.a;
const tenantB = FIXTURE.tenants.b;
const windowOne = new Date("2099-01-01T10:00:10.000Z");
const windowTwo = new Date("2099-01-01T10:01:10.000Z");
const actorPrefix = "runtime-maps-rate-limit";

async function consume(input: {
  tenantId?: string;
  actorKey?: string;
  action?: "places_autocomplete" | "place_details";
  limit?: number;
  now?: Date;
}) {
  return consumeGoogleMapsRateLimit({
    tenantId: input.tenantId ?? tenantA,
    actorKey: input.actorKey ?? `${actorPrefix}-actor-a`,
    action: input.action ?? "places_autocomplete",
    limit: input.limit ?? 3,
    windowMs: 60_000,
    now: input.now ?? windowOne,
  });
}

try {
  await client.query(`delete from public.google_maps_rate_limit_buckets where actor_key like $1`, [`${actorPrefix}%`]);
  await client.query(`delete from public.google_maps_autocomplete_sessions where actor_key like $1`, [`${actorPrefix}%`]);

  const first = await consume({});
  const second = await consume({});
  const exactLimit = await consume({});
  const aboveLimit = await consume({});
  assert.deepEqual(
    [first.allowed, second.allowed, exactLimit.allowed, aboveLimit.allowed],
    [true, true, true, false],
  );
  assert.equal(exactLimit.remaining, 0);
  assert.equal(aboveLimit.reason, "rate_limited");

  const newWindow = await consume({ now: windowTwo });
  assert.equal(newWindow.allowed, true);
  assert.equal(newWindow.remaining, 2);

  const tenantBFirst = await consume({ tenantId: tenantB, actorKey: `${actorPrefix}-actor-a` });
  const userBFirst = await consume({ actorKey: `${actorPrefix}-actor-b` });
  const actionFirst = await consume({ actorKey: `${actorPrefix}-actor-a`, action: "place_details" });
  assert.equal(tenantBFirst.remaining, 2);
  assert.equal(userBFirst.remaining, 2);
  assert.equal(actionFirst.remaining, 2);

  const concurrentActor = `${actorPrefix}-concurrent`;
  const concurrent = await Promise.all(
    Array.from({ length: 50 }, () => consume({ actorKey: concurrentActor, limit: 20 })),
  );
  assert.equal(concurrent.filter((result) => result.allowed).length, 20);
  assert.equal(concurrent.filter((result) => !result.allowed).length, 30);
  const concurrentRow = await client.query(
    `select request_count from public.google_maps_rate_limit_buckets
     where tenant_id=$1 and actor_key=$2 and action='places_autocomplete'`,
    [tenantA, concurrentActor],
  );
  assert.equal(concurrentRow.rows[0].request_count, 21);

  const expiredActor = `${actorPrefix}-expired`;
  await client.query(
    `insert into public.google_maps_rate_limit_buckets
       (tenant_id, actor_key, action, window_started_at, request_count, expires_at)
     values ($1,$2,'places_autocomplete','2000-01-01T00:00:00Z',1,'2000-01-01T00:01:00Z')`,
    [tenantA, expiredActor],
  );
  await consume({ actorKey: `${actorPrefix}-cleanup` });
  assert.equal(
    (await client.query(`select count(*)::int as count from public.google_maps_rate_limit_buckets where actor_key=$1`, [expiredActor])).rows[0].count,
    0,
  );

  const sessionToken = "runtime-session-token-that-must-not-be-stored";
  const sessionInput = {
    tenantId: tenantA,
    actorKey: `${actorPrefix}-session`,
    sessionToken,
    now: windowOne,
  };
  assert.equal(await shouldRecordGoogleMapsAutocompleteSession(sessionInput), true);
  assert.equal(await shouldRecordGoogleMapsAutocompleteSession(sessionInput), false);
  const sessionRow = await client.query(
    `select session_hash from public.google_maps_autocomplete_sessions where actor_key=$1`,
    [sessionInput.actorKey],
  );
  assert.equal(sessionRow.rows[0].session_hash.length, 64);
  assert.notEqual(sessionRow.rows[0].session_hash, sessionToken);

  await client.query(`
    create or replace function public.fieldgrid_runtime_reject_maps_rate_limit()
    returns trigger language plpgsql as $$
    begin
      if new.actor_key = '${actorPrefix}-db-failure' then
        raise exception 'runtime maps limiter failure' using errcode='P0001';
      end if;
      return new;
    end $$;
    create trigger fieldgrid_runtime_reject_maps_rate_limit
      before insert or update on public.google_maps_rate_limit_buckets
      for each row execute function public.fieldgrid_runtime_reject_maps_rate_limit();
  `);
  const unavailable = await consume({ actorKey: `${actorPrefix}-db-failure` });
  assert.deepEqual(
    { allowed: unavailable.allowed, remaining: unavailable.remaining, reason: unavailable.reason },
    { allowed: false, remaining: 0, reason: "service_unavailable" },
  );
  await client.query(`drop trigger fieldgrid_runtime_reject_maps_rate_limit on public.google_maps_rate_limit_buckets`);
  await client.query(`drop function public.fieldgrid_runtime_reject_maps_rate_limit()`);

  const rlsClient = await connect();
  try {
    await rlsClient.query("begin");
    await rlsClient.query("set local role authenticated");
    await rlsClient.query("set local row_security = on");
    const claims = JSON.stringify({ sub: FIXTURE.users.tenantAAdmin, role: "authenticated", tenant_id: tenantA });
    await rlsClient.query("select set_config('request.jwt.claim.sub', $1, true)", [FIXTURE.users.tenantAAdmin]);
    await rlsClient.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await assert.rejects(
      rlsClient.query(`select * from public.google_maps_rate_limit_buckets limit 1`),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await rlsClient.query("rollback");
  } finally {
    await rlsClient.end();
  }

  console.log("FG-GOOGLE-MAPS-RATE-LIMIT runtime proof passed");
} finally {
  await client.query(`drop trigger if exists fieldgrid_runtime_reject_maps_rate_limit on public.google_maps_rate_limit_buckets`).catch(() => {});
  await client.query(`drop function if exists public.fieldgrid_runtime_reject_maps_rate_limit()`).catch(() => {});
  await client.query(`delete from public.google_maps_rate_limit_buckets where actor_key like $1`, [`${actorPrefix}%`]).catch(() => {});
  await client.query(`delete from public.google_maps_autocomplete_sessions where actor_key like $1`, [`${actorPrefix}%`]).catch(() => {});
  await client.end();
  await pool.end();
}
