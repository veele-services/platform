import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDuration,
  parseClockMinutes,
  suggestEndTime,
  validateTimeRange,
} from "../../lib/db/src/form-time-range";

test("time ranges require a paired start and end", () => {
  assert.deepEqual(validateTimeRange("", ""), {
    valid: true,
    durationMinutes: null,
  });
  assert.equal(validateTimeRange("08:00", "").valid, false);
  assert.equal(validateTimeRange("", "09:00").valid, false);
});

test("time ranges reject invalid and non-increasing values", () => {
  assert.equal(validateTimeRange("08:61", "09:00").valid, false);
  assert.equal(validateTimeRange("09:00", "09:00").valid, false);
  assert.equal(validateTimeRange("10:00", "09:00").valid, false);
});

test("time ranges calculate duration and a safe one-hour suggestion", () => {
  assert.equal(parseClockMinutes("08:30"), 510);
  assert.deepEqual(validateTimeRange("08:30", "10:15"), {
    valid: true,
    durationMinutes: 105,
  });
  assert.equal(suggestEndTime("08:30"), "09:30");
  assert.equal(suggestEndTime("23:30"), null);
  assert.equal(formatDuration(105), "1 uur 45 min");
});
