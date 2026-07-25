import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveFcmConfigForApp,
  type FcmEnvironment,
} from "../../artifacts/api-server/src/lib/native-push.ts";

const VEELE_APP_ID = "nl.veeleservices.personeel";
const FIELDGRID_APP_ID = "nl.fieldgrid.personeel";
const SHARED_CREDENTIALS: FcmEnvironment = {
  FCM_PROJECT_ID: "shared-project",
  FCM_CLIENT_EMAIL: "push@example.test",
  FCM_PRIVATE_KEY: "shared-private-key",
  FCM_ANDROID_CHANNEL_ID: "legacy-shared-channel",
};

test("shared credentials retain an app-specific Android channel", () => {
  const veele = resolveFcmConfigForApp(SHARED_CREDENTIALS, VEELE_APP_ID);
  const fieldgrid = resolveFcmConfigForApp(
    SHARED_CREDENTIALS,
    FIELDGRID_APP_ID,
  );

  assert.equal(veele?.projectId, "shared-project");
  assert.equal(fieldgrid?.projectId, "shared-project");
  assert.equal(veele?.androidChannelId, "veele_operations");
  assert.equal(fieldgrid?.androidChannelId, "fieldgrid_operations");
});

test("complete app-specific credentials take precedence over shared credentials", () => {
  const config = resolveFcmConfigForApp(
    {
      ...SHARED_CREDENTIALS,
      FCM_FIELDGRID_PROJECT_ID: "fieldgrid-project",
      FCM_FIELDGRID_CLIENT_EMAIL: "fieldgrid@example.test",
      FCM_FIELDGRID_PRIVATE_KEY: "fieldgrid-private-key",
      FCM_FIELDGRID_ANDROID_CHANNEL_ID: "fieldgrid_alerts",
    },
    FIELDGRID_APP_ID,
  );

  assert.equal(config?.projectId, "fieldgrid-project");
  assert.equal(config?.clientEmail, "fieldgrid@example.test");
  assert.equal(config?.androidChannelId, "fieldgrid_alerts");
});

test("an explicitly disabled app cannot fall back to shared credentials", () => {
  const environment = {
    ...SHARED_CREDENTIALS,
    FCM_FIELDGRID_ENABLED: "false",
  };

  assert.equal(resolveFcmConfigForApp(environment, FIELDGRID_APP_ID), null);
  assert.equal(
    resolveFcmConfigForApp(environment, VEELE_APP_ID)?.projectId,
    "shared-project",
  );
});

test("global disable and partial app credentials fail closed", () => {
  assert.equal(
    resolveFcmConfigForApp(
      { ...SHARED_CREDENTIALS, FCM_ENABLED: "false" },
      VEELE_APP_ID,
    ),
    null,
  );
  assert.equal(
    resolveFcmConfigForApp(
      {
        ...SHARED_CREDENTIALS,
        FCM_FIELDGRID_PROJECT_ID: "incomplete-project",
      },
      FIELDGRID_APP_ID,
    ),
    null,
  );
  assert.equal(
    resolveFcmConfigForApp(
      {
        ...SHARED_CREDENTIALS,
        FCM_FIELDGRID_SERVICE_ACCOUNT_JSON: "{invalid",
      },
      FIELDGRID_APP_ID,
    ),
    null,
  );
});
