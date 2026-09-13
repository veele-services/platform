import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const platformActions = readFileSync(
  "artifacts/backoffice/src/app/actions/platform.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const portalInvites = readFileSync(
  "artifacts/backoffice/src/lib/auth/portal-invites.ts",
  "utf8",
).replaceAll("\r\n", "\n");

test("an existing portal identity cannot be rewritten for another portal", () => {
  const mismatchGuard = portalInvites.match(
    /const existingPortal = existingUser\.app_metadata\?\.portal;([\s\S]*?)const hasSignedIn/u,
  );
  assert.ok(mismatchGuard, "existing portal guard must remain explicit");
  assert.match(mismatchGuard[1], /existingPortal !== opts\.portal/u);
  assert.doesNotMatch(mismatchGuard[1], /allowExistingActive/u);
});

test("platform-user creation rejects tenant identities and compensates Auth failures", () => {
  const upsertStart = platformActions.indexOf(
    "export async function upsertPlatformUser",
  );
  const inviteStart = platformActions.indexOf(
    "export async function invitePlatformUserFromForm",
  );
  const updateStart = platformActions.indexOf(
    "export async function updatePlatformUserFromForm",
  );
  assert.ok(
    upsertStart >= 0 && inviteStart > upsertStart && updateStart > inviteStart,
  );

  const upsertSource = platformActions.slice(upsertStart, inviteStart);
  const inviteSource = platformActions.slice(inviteStart, updateStart);
  for (const source of [upsertSource, inviteSource]) {
    const tenantGuard = source.indexOf(".from(tenantUsersTable)");
    const platformWrite = source.indexOf(".insert(platformUsersTable)");
    assert.ok(
      tenantGuard >= 0 && platformWrite > tenantGuard,
      "tenant identity check must precede the platform write",
    );
  }

  assert.match(inviteSource, /let invite:[\s\S]*=\s*null/u);
  assert.ok(
    [...inviteSource.matchAll(/await invite\.rollback\(\)/gu)].length >= 3,
    "all pre-binding failures must compensate the Auth invitation",
  );
  assert.match(
    inviteSource,
    /catch \{[\s\S]*await invite\.rollback\(\)[\s\S]*platformkoppeling kon niet veilig/u,
  );
});
