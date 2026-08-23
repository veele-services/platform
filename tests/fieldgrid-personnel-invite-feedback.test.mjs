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
const portalInvites = readFileSync(
  "artifacts/backoffice/src/lib/auth/portal-invites.ts",
  "utf8",
);
const backofficeEmail = readFileSync(
  "artifacts/backoffice/src/lib/email.ts",
  "utf8",
);

test("personnel creation reports activation delivery separately from record creation", () => {
  assert.match(personnelActions, /export type PersonnelCreateResult/u);
  assert.match(personnelActions, /inviteResult = \{ sent: true \}/u);
  assert.match(personnelActions, /sent: deliveryUncertain \? null : false/u);
  assert.match(personnelActions, /activation_delivery_unknown/u);
  assert.match(personnelActions, /activation_delivery_failed/u);
  assert.match(personnelActions, /auto_invite_personnel_failed/u);
  assert.match(personnelActions, /activationInvite/u);
  assert.match(personnelActions, /portal status update failed/u);
  assert.doesNotMatch(personnelActions, /email: payload\.email/u);
  assert.doesNotMatch(
    personnelActions,
    /inviteError instanceof Error\s*\?\s*inviteError\.message/u,
  );
  assert.match(
    personnelActions,
    /data: \{ id: createdId, invite: inviteResult \}/u,
  );
});

test("personnel form distinguishes sent, failed and uncertain activation delivery", () => {
  assert.match(personnelForm, /result\.data\?\.invite/u);
  assert.match(personnelForm, /result\.data\.invite\.sent/u);
  assert.match(personnelForm, /result\.data\.invite\.message/u);
  assert.match(
    personnelForm,
    /result\.data\.invite\.sent === null/u,
  );
  assert.match(personnelForm, /mogelijk verzonden|centrale e-mailinstellingen/u);
  assert.match(personnelForm, /toast\.warning/u);
  assert.match(backofficeEmail, /deliveryEffect: result\.deliveryEffect/u);
  assert.match(portalInvites, /PortalInviteDeliveryUncertainError/u);
  assert.match(portalInvites, /sent\.deliveryEffect === "unknown"/u);
  assert.match(
    portalInvites,
    /sent\.success \|\| deliveryUncertain/u,
  );
});
