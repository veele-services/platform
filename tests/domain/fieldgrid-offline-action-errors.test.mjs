import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeOfflineServerActionError,
} from "../../artifacts/personeel-pwa/src/lib/offline/offline-action-errors.server.ts";

test("expected-version conflicts remain distinct from serialization failures", () => {
  const conflict = normalizeOfflineServerActionError({
    code: "40001",
    message: "Conflict: deze werkbon is aangepast door een andere gebruiker",
    conflictVersion: 9,
  });
  assert.equal(conflict.failure.category, "conflict");
  assert.equal(conflict.failure.code, "expected_version_conflict");
  assert.equal(conflict.failure.retryable, false);
  assert.equal(conflict.failure.conflictVersion, 9);

  const serialization = normalizeOfflineServerActionError({
    code: "40001",
    message: "could not serialize access due to concurrent update",
  });
  assert.equal(serialization.failure.category, "transient");
  assert.equal(serialization.failure.code, "serialization_failure");
  assert.equal(serialization.failure.retryable, true);
});

test("required transient SQLSTATEs are preserved through bounded cause traversal", () => {
  for (const sqlState of ["40P01", "55P03", "08000", "08007", "08P01", "53300", "57P01", "57P02", "57P03"]) {
    const result = normalizeOfflineServerActionError({
      message: "outer wrapper",
      cause: { message: "middle wrapper", cause: { code: sqlState, message: "raw internal detail" } },
    });
    assert.equal(result.failure.category, "transient", sqlState);
    assert.equal(result.failure.retryable, true, sqlState);
    assert.equal(result.failure.sqlState, sqlState, sqlState);
  }
});

test("normalization returns only safe allowlisted metadata", () => {
  const result = normalizeOfflineServerActionError({
    code: "42501",
    message: "permission denied for table secret_table",
    detail: "token=supersecret",
    hint: "SELECT * FROM secret_table",
    query: "SELECT password FROM users",
    stack: "private stack",
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.failure.category, "permanent");
  assert.equal(result.failure.code, "authorization_denied");
  assert.match(result.failure.diagnosticId, /^offline-[0-9a-f-]{36}$/u);
  assert.doesNotMatch(serialized, /secret_table|supersecret|SELECT|private stack/u);
});
