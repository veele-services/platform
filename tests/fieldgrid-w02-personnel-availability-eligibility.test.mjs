import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const availabilityService = readFileSync('lib/db/src/personnel-availability.ts', 'utf8');
const availabilityAction = readFileSync('artifacts/personeel-pwa/src/actions/availability.ts', 'utf8');
const availabilityUi = readFileSync('artifacts/personeel-pwa/src/app/(app)/beschikbaarheid/BeschikbaarheidForm.tsx', 'utf8');
const planningEligibility = readFileSync('lib/db/src/planning-eligibility.ts', 'utf8');
const smartPlanning = readFileSync('lib/db/src/planning-intelligence.ts', 'utf8');

test('W02 availability writes use canonical atomic service, not delete-all-then-insert', () => {
  assert.match(availabilityService, /db\.transaction/);
  assert.match(availabilityService, /saveWeeklyAvailability/);
  assert.match(availabilityService, /onConflictDoUpdate/);
  assert.doesNotMatch(availabilityAction, /\.from\("availability_windows"\)\s*\n\s*\.delete\(\)/);
  assert.match(availabilityAction, /saveDateAvailabilityExceptions/);
});

test('W02 availability persistence is tenant-bound and concurrency-aware', () => {
  assert.match(availabilityService, /tenantId: string/);
  assert.match(availabilityService, /eq\(personnelTable\.tenantId, input\.tenantId\)/);
  assert.match(availabilityService, /expectedUpdatedAt/);
  assert.match(availabilityService, /code: "conflict"/);
  assert.match(availabilityUi, /expectedUpdatedAt: selectedEntry\?\.updatedAt/);
});

test('W02 personnel availability UI exposes conflict retry and unsaved-change guard', () => {
  assert.match(availabilityUi, /beforeunload/);
  assert.match(availabilityUi, /Niet-opgeslagen wijzigingen/);
  assert.match(availabilityUi, /Vernieuw\/retry|Vernieuw en probeer opnieuw/);
  assert.match(availabilityUi, /result\.code === "conflict"/);
});

test('W02 canonical eligibility service covers inactive, leave-sick, availability and conflicts', () => {
  assert.match(planningEligibility, /getCanonicalPlanningEligibility/);
  assert.match(planningEligibility, /calculateAssignmentCapacity/);
  assert.match(smartPlanning, /Medewerker is inactief/);
  assert.match(smartPlanning, /Ziek gemeld/);
  assert.match(smartPlanning, /Op verlof/);
  assert.match(smartPlanning, /outside_availability_window/);
  assert.match(smartPlanning, /already_booked/);
});
