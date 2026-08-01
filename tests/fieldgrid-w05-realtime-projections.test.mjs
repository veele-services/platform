import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("lib/db/migrations/20260716160000_realtime_projection_delivery.sql", "utf8");
const backofficeProvider = readFileSync("artifacts/backoffice/src/components/realtime/BackofficeRealtimeProvider.tsx", "utf8");
const customerProvider = readFileSync("artifacts/klant-pwa/src/components/CustomerRealtimeProvider.tsx", "utf8");
const personnelProvider = readFileSync("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx", "utf8");
const backofficeClient = readFileSync("artifacts/backoffice/src/lib/realtime/portal-realtime-client.ts", "utf8");
const customerClient = readFileSync("artifacts/klant-pwa/src/lib/realtime/portal-realtime-client.ts", "utf8");
const personnelClient = readFileSync("artifacts/personeel-pwa/src/lib/realtime/portal-realtime-client.ts", "utf8");
const clientModules = await Promise.all(
  ["backoffice", "klant-pwa", "personeel-pwa"].map(
    (surface) =>
      import(
        `../artifacts/${surface}/src/lib/realtime/portal-realtime-client.ts`
      ),
  ),
);

for (const [surface, source] of [
  ["backoffice", backofficeClient],
  ["customer", customerClient],
  ["personnel", personnelClient],
]) {
  test(`W05 ${surface} realtime client subscribes by server-derived realtime key and catches up on reconnect`, () => {
    assert.match(source, /table:\s*"portal_realtime_events"/u);
    assert.match(source, /filter:\s*`realtime_key=eq\.\$\{options\.realtimeKey\}`/u);
    assert.match(source, /status === "SUBSCRIBED"/u);
    assert.match(source, /options\.scheduleRefresh\(true\)/u);
    assert.match(source, /CHANNEL_ERROR|TIMED_OUT|CLOSED/u);
  });
}

test("W05 providers share debounced duplicate-safe refresh scheduling", () => {
  assert.match(backofficeProvider, /createPortalRefreshScheduler/u);
  assert.match(customerProvider, /createPortalRefreshScheduler/u);
  assert.match(personnelProvider, /createPortalRefreshScheduler/u);
  assert.match(backofficeClient, /minRefreshIntervalMs/u);
  assert.match(backofficeClient, /clearTimeout\(input\.timerRef\.current\)/u);
  assert.equal(backofficeClient, customerClient);
  assert.equal(backofficeClient, personnelClient);
});

test("W05 a queued portal refresh stays dormant offline and resumes online", (context) => {
  context.mock.timers.enable({
    apis: ["Date", "setTimeout"],
    now: 10_000,
  });

  for (const { createPortalRefreshScheduler } of clientModules) {
    let online = true;
    let refreshCount = 0;
    let timerWasClearedBeforeRefresh = false;
    const timerRef = { current: null };
    const lastRefreshAtRef = { current: 0 };
    const scheduleRefresh = createPortalRefreshScheduler({
      router: {
        refresh() {
          refreshCount += 1;
          timerWasClearedBeforeRefresh = timerRef.current === null;
        },
      },
      timerRef,
      lastRefreshAtRef,
      debounceMs: 50,
      minRefreshIntervalMs: 10,
      isOnline: () => online,
    });

    scheduleRefresh();
    assert.notEqual(timerRef.current, null);
    online = false;
    context.mock.timers.tick(50);
    assert.equal(timerRef.current, null);
    assert.equal(refreshCount, 0);
    assert.equal(lastRefreshAtRef.current, 0);

    online = true;
    scheduleRefresh();
    context.mock.timers.tick(50);
    assert.equal(refreshCount, 1);
    assert.equal(timerWasClearedBeforeRefresh, true);
    assert.equal(lastRefreshAtRef.current, Date.now());
  }
});

test("W05 canonical realtime events are tenant scoped, correlated, and payload-minimized", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS correlation_id uuid DEFAULT gen_random_uuid\(\) NOT NULL/u);
  assert.match(migration, /portal_realtime_events_tenant_correlation_idx/u);
  assert.match(migration, /fieldgrid_realtime_event_name/u);
  for (const eventName of [
    "assignment_planning_changed",
    "staffing_changed",
    "assignment_scheduled",
    "participant_started",
    "participant_completed",
    "aggregate_assignment_completed",
    "availability_changed",
    "report_approved",
    "customer_visible_projection_changed",
  ]) {
    assert.match(migration, new RegExp(eventName, "u"));
  }
  assert.match(migration, /cu\.tenant_id = portal_realtime_events\.tenant_id/u);
  assert.match(migration, /coalesce\(p_payload, '\{\}'::jsonb\) - 'secret' - 'token' - 'access_token' - 'refresh_token' - 'password' - 'email' - 'phone'/u);
});

test("W05 assignment trigger classifies schedule/start/completion projection changes", () => {
  assert.match(migration, /NEW\.actual_started_at IS NOT NULL/u);
  assert.match(migration, /v_action := 'started'/u);
  assert.match(migration, /NEW\.actual_completed_at IS NOT NULL/u);
  assert.match(migration, /v_action := 'completed'/u);
  assert.match(migration, /NEW\.scheduled_date IS DISTINCT FROM OLD\.scheduled_date/u);
  assert.match(migration, /v_action := 'scheduled'/u);
});
