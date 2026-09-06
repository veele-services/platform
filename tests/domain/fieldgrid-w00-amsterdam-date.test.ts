import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  addCalendarMonths,
  amsterdamDateKey,
  parseCalendarDateKey,
} from "../../lib/db/src/amsterdam-date.ts";
import { readFileSync } from "node:fs";

const repositoryRoot = new URL("../../", import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, repositoryRoot), "utf8");
}

test("Amsterdam date keys turn over at local midnight in winter and summer", () => {
  assert.equal(amsterdamDateKey("2026-01-01T22:59:59.999Z"), "2026-01-01");
  assert.equal(amsterdamDateKey("2026-01-01T23:00:00.000Z"), "2026-01-02");
  assert.equal(amsterdamDateKey("2026-07-01T21:59:59.999Z"), "2026-07-01");
  assert.equal(amsterdamDateKey("2026-07-01T22:00:00.000Z"), "2026-07-02");
});

test("Amsterdam date keys stay correct across both 2026 DST transitions", () => {
  assert.equal(amsterdamDateKey("2026-03-28T22:59:59.999Z"), "2026-03-28");
  assert.equal(amsterdamDateKey("2026-03-28T23:00:00.000Z"), "2026-03-29");
  assert.equal(amsterdamDateKey("2026-03-29T21:59:59.999Z"), "2026-03-29");
  assert.equal(amsterdamDateKey("2026-03-29T22:00:00.000Z"), "2026-03-30");

  assert.equal(amsterdamDateKey("2026-10-24T21:59:59.999Z"), "2026-10-24");
  assert.equal(amsterdamDateKey("2026-10-24T22:00:00.000Z"), "2026-10-25");
  assert.equal(amsterdamDateKey("2026-10-25T22:59:59.999Z"), "2026-10-25");
  assert.equal(amsterdamDateKey("2026-10-25T23:00:00.000Z"), "2026-10-26");
});

test("all date-sensitive workflows use the shared Amsterdam date source", () => {
  const service = read("lib/db/src/personnel-availability.ts");
  const action = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const expiredQuotes = read(
    "artifacts/api-server/src/routes/expired-quotes.ts",
  );

  assert.match(
    service,
    /function todayDateKey\(now: Date = new Date\(\)\): string \{\s*return amsterdamDateKey\(now\);/u,
  );
  assert.match(action, /const today = amsterdamDateKey\(\);/u);
  assert.match(expiredQuotes, /const today = amsterdamDateKey\(\);/u);
  assert.doesNotMatch(
    `${service}\n${action}\n${expiredQuotes}`,
    /toISOString\(\)\.slice\(0, 10\)/u,
  );
});

test("calendar arithmetic is timezone-independent and clamps month ends", () => {
  assert.equal(addCalendarDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addCalendarDays("2026-03-29", 1), "2026-03-30");
  assert.equal(addCalendarDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(parseCalendarDateKey("2026-02-29"), null);
});
