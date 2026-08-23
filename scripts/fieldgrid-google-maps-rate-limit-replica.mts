#!/usr/bin/env node
import { consumeGoogleMapsRateLimit, pool } from "../lib/db/src/index.ts";

const tenantId = process.env.FIELDGRID_MAPS_REPLICA_TENANT_ID;
const actorKey = process.env.FIELDGRID_MAPS_REPLICA_ACTOR_KEY;
const now = process.env.FIELDGRID_MAPS_REPLICA_NOW;
if (!tenantId || !actorKey || !now) {
  throw new Error("Maps replica runtime input is incomplete.");
}

try {
  const result = await consumeGoogleMapsRateLimit({
    tenantId,
    actorKey,
    action: "places_autocomplete",
    limit: 1,
    windowMs: 60_000,
    now: new Date(now),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
