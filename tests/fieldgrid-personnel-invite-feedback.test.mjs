import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const personnelActions = readFileSync(
  "artifacts/backoffice/src/app/actions/personnel.ts",
  "utf8",
);
const personnelForm = readFileSync(
  "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
  "utf8",
);

test("personnel creation reports activation delivery separately from record creation", () => {
  assert.match(personnelActions, /export type PersonnelCreateResult/u);
  assert.match(personnelActions, /inviteResult = \{ sent: true \}/u);
  assert.match(personnelActions, /inviteResult = \{ sent: false, message \}/u);
  assert.match(personnelActions, /auto_invite_personnel_failed/u);
  assert.match(personnelActions, /activationInvite/u);
  assert.match(personnelActions, /portal status update failed/u);
  assert.doesNotMatch(personnelActions, /email: payload\.email/u);
  assert.match(
    personnelActions,
    /data: \{ id: createdId, invite: inviteResult \}/u,
  );
});

test("personnel form never claims a failed activation email was sent", () => {
  assert.match(personnelForm, /result\.data\?\.invite/u);
  assert.match(personnelForm, /result\.data\.invite\.sent/u);
  assert.match(personnelForm, /result\.data\.invite\.message/u);
  assert.match(
    personnelForm,
    /Personeelsrecord aangemaakt, maar activatiemail niet verstuurd/u,
  );
  assert.match(personnelForm, /toast\.warning/u);
});
