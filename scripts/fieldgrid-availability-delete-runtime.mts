#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  FIXTURE,
  assertDisposableDatabaseForReset,
  connect,
  databaseUrl,
} from "./fieldgrid-runtime-safety-lib.mjs";

const parsedDatabase = new URL(databaseUrl());
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(
    parsedDatabase.hostname,
  ),
);

const { deleteDateAvailabilityException, saveDateAvailabilityExceptions } =
  await import("../lib/db/src/personnel-availability.ts");
const { pool } = await import("../lib/db/src/connection.ts");

const client = await connect();
await assertDisposableDatabaseForReset(client);

const tenantA = FIXTURE.tenants.a;
const tenantB = FIXTURE.tenants.b;
const activeUser = FIXTURE.users.tenantAPersonnel;
const inactiveUser = FIXTURE.users.tenantAInactivePersonnel;
const activePersonnel = FIXTURE.personnel.a;
const inactivePersonnel = FIXTURE.personnel.inactiveA;
const dates = {
  normal: "2098-01-01",
  stale: "2098-01-02",
  crossTenant: "2098-01-03",
  inactive: "2098-01-04",
  atomic: "2098-01-05",
  concurrent: "2098-01-06",
  saveDelete: "2098-01-07",
};

async function putEntry(personnelId: string, date: string, updatedAt: string) {
  await client.query(
    `insert into public.availability_day_entries
       (personnel_id, date, start_time, end_time, updated_at)
     values ($1, $2, '09:00', '17:00', $3::timestamptz)
     on conflict (personnel_id, date) do update set
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       updated_at = excluded.updated_at`,
    [personnelId, date, updatedAt],
  );
}

async function rowExists(personnelId: string, date: string) {
  const result = await client.query(
    `select exists(
       select 1 from public.availability_day_entries
       where personnel_id = $1 and date = $2
     ) as present`,
    [personnelId, date],
  );
  return result.rows[0]?.present === true;
}

try {
  await client.query(
    `insert into auth.users (id, email)
     values ($1, 'inactive-availability@tenant-a.runtime.fieldgrid.test')
     on conflict (id) do nothing`,
    [inactiveUser],
  );
  await client.query(
    `insert into public.personnel
       (id, tenant_id, user_id, code, first_name, last_name, email, is_active, is_available)
     values ($1, $2, $3, 'RTA-INACTIVE-AV', 'Inactieve', 'Medewerker',
       'inactive-availability@tenant-a.runtime.fieldgrid.test', false, false)
     on conflict (id) do update set is_active = false, is_available = false`,
    [inactivePersonnel, tenantA, inactiveUser],
  );
  await client.query(
    `delete from public.availability_day_entries
     where personnel_id in ($1, $2) and date = any($3::text[])`,
    [activePersonnel, inactivePersonnel, Object.values(dates)],
  );
  await client.query(
    `delete from public.audit_log
     where action = 'availability.exception.delete'
       and metadata->>'date' = any($1::text[])`,
    [Object.values(dates)],
  );

  const v1 = "2097-12-01T10:00:00.000Z";
  const v2 = "2097-12-01T11:00:00.000Z";

  await putEntry(activePersonnel, dates.normal, v1);
  const normal = await deleteDateAvailabilityException({
    tenantId: tenantA,
    userId: activeUser,
    date: dates.normal,
    expectedUpdatedAt: v1,
  });
  assert.deepEqual(normal, { ok: true, deleted: true, replayed: false });
  assert.equal(await rowExists(activePersonnel, dates.normal), false);
  const audit = await client.query(
    `select tenant_id, user_id, resource, metadata->>'date' as date
     from public.audit_log
     where action = 'availability.exception.delete' and metadata->>'date' = $1`,
    [dates.normal],
  );
  assert.deepEqual(audit.rows, [
    {
      tenant_id: tenantA,
      user_id: activeUser,
      resource: "availability_day_entries",
      date: dates.normal,
    },
  ]);

  const replay = await deleteDateAvailabilityException({
    tenantId: tenantA,
    userId: activeUser,
    date: dates.normal,
    expectedUpdatedAt: v1,
  });
  assert.deepEqual(replay, { ok: true, deleted: false, replayed: true });

  await putEntry(activePersonnel, dates.stale, v1);
  await putEntry(activePersonnel, dates.stale, v2);
  const stale = await deleteDateAvailabilityException({
    tenantId: tenantA,
    userId: activeUser,
    date: dates.stale,
    expectedUpdatedAt: v1,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.ok ? null : stale.code, "conflict");
  assert.equal(await rowExists(activePersonnel, dates.stale), true);

  await putEntry(activePersonnel, dates.crossTenant, v1);
  const crossTenant = await deleteDateAvailabilityException({
    tenantId: tenantB,
    userId: activeUser,
    date: dates.crossTenant,
    expectedUpdatedAt: v1,
  });
  assert.equal(crossTenant.ok, false);
  assert.equal(crossTenant.ok ? null : crossTenant.code, "not_found");
  assert.equal(await rowExists(activePersonnel, dates.crossTenant), true);

  await putEntry(inactivePersonnel, dates.inactive, v1);
  const inactive = await deleteDateAvailabilityException({
    tenantId: tenantA,
    userId: inactiveUser,
    date: dates.inactive,
    expectedUpdatedAt: v1,
  });
  assert.equal(inactive.ok, false);
  assert.equal(inactive.ok ? null : inactive.code, "not_found");
  assert.equal(await rowExists(inactivePersonnel, dates.inactive), true);

  await client.query(`
    create or replace function public.fieldgrid_runtime_reject_availability_delete_audit()
    returns trigger language plpgsql as $$
    begin
      if new.action = 'availability.exception.delete'
         and new.metadata->>'date' = '${dates.atomic}' then
        raise exception 'runtime audit rejection' using errcode = 'P0001';
      end if;
      return new;
    end
    $$;
    drop trigger if exists fieldgrid_runtime_reject_availability_delete_audit on public.audit_log;
    create trigger fieldgrid_runtime_reject_availability_delete_audit
      before insert on public.audit_log
      for each row execute function public.fieldgrid_runtime_reject_availability_delete_audit();
  `);
  await putEntry(activePersonnel, dates.atomic, v1);
  await assert.rejects(
    deleteDateAvailabilityException({
      tenantId: tenantA,
      userId: activeUser,
      date: dates.atomic,
      expectedUpdatedAt: v1,
    }),
    (error: unknown) => {
      const candidate = error as {
        cause?: { code?: string; message?: string };
      };
      return (
        candidate.cause?.code === "P0001" &&
        candidate.cause.message === "runtime audit rejection"
      );
    },
  );
  assert.equal(await rowExists(activePersonnel, dates.atomic), true);
  await client.query(`
    drop trigger fieldgrid_runtime_reject_availability_delete_audit on public.audit_log;
    drop function public.fieldgrid_runtime_reject_availability_delete_audit();
  `);

  await putEntry(activePersonnel, dates.concurrent, v1);
  const concurrent = await Promise.all([
    deleteDateAvailabilityException({
      tenantId: tenantA,
      userId: activeUser,
      date: dates.concurrent,
      expectedUpdatedAt: v1,
    }),
    deleteDateAvailabilityException({
      tenantId: tenantA,
      userId: activeUser,
      date: dates.concurrent,
      expectedUpdatedAt: v1,
    }),
  ]);
  assert.equal(
    concurrent.filter((result) => result.ok && result.deleted).length,
    1,
  );
  assert.equal(
    concurrent.filter((result) => result.ok && result.replayed).length,
    1,
  );
  assert.equal(await rowExists(activePersonnel, dates.concurrent), false);

  const saved = await saveDateAvailabilityExceptions({
    tenantId: tenantA,
    userId: activeUser,
    exception: {
      date: dates.saveDelete,
      startTime: "10:00",
      endTime: "16:00",
      repeatType: "none",
      isEmergencyAvailable: false,
    },
    maxDate: dates.saveDelete,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) throw new Error(saved.message);
  const storedVersion = await client.query(
    `select updated_at from public.availability_day_entries
     where personnel_id=$1 and date=$2`,
    [activePersonnel, dates.saveDelete],
  );
  assert.equal(
    new Date(saved.version).getTime(),
    new Date(storedVersion.rows[0].updated_at).getTime(),
  );
  const savedDelete = await deleteDateAvailabilityException({
    tenantId: tenantA,
    userId: activeUser,
    date: dates.saveDelete,
    expectedUpdatedAt: saved.version,
  });
  assert.deepEqual(savedDelete, {
    ok: true,
    deleted: true,
    replayed: false,
  });

  console.log("FG-AVAILABILITY-DELETE runtime proof passed");
} finally {
  await client.query(
    `drop trigger if exists fieldgrid_runtime_reject_availability_delete_audit on public.audit_log`,
  );
  await client.query(
    `drop function if exists public.fieldgrid_runtime_reject_availability_delete_audit()`,
  );
  await client.end();
  await pool.end();
}
