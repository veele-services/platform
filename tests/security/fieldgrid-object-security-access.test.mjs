import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("management unlock is re-authorized and bound to mutable context", async () => {
  const service = await read("lib/db/src/object-security-access.ts");
  const action = await read("artifacts/backoffice/src/app/actions/object-security.ts");
  const emailService = await read("lib/db/src/email-service.ts");

  assert.match(action, /requirePermission\("object_security", "read"\)/u);
  assert.match(action, /auth\.getUser\(\)/u);
  assert.match(action, /auth\.getSession\(\)/u);
  assert.match(service, /tenant_id = \$\{input\.tenantId\}::uuid/u);
  assert.match(service, /user_id = \$\{input\.userId\}::uuid/u);
  assert.match(service, /object_id = \$\{input\.objectId\}::uuid/u);
  assert.match(service, /auth_session_id !== input\.authSessionId/u);
  assert.match(service, /FROM auth\.sessions/u);
  assert.match(service, /not_after IS NULL OR not_after > \$\{input\.now\}/u);
  assert.match(service, /business_email_revision !== input\.businessEmailRevision/u);
  assert.match(service, /record_generation_changed/u);
  assert.match(service, /is_active = true/u);
});

test("OTP delivery and verification fail closed", async () => {
  const service = await read("lib/db/src/object-security-access.ts");
  const action = await read("artifacts/backoffice/src/app/actions/object-security.ts");
  const emailService = await read("lib/db/src/email-service.ts");

  assert.match(service, /OBJECT_SECURITY_OTP_TTL_MS = 10 \* 60 \* 1000/u);
  assert.match(service, /OBJECT_SECURITY_MAX_ATTEMPTS = 5/u);
  assert.match(service, /status IN \('pending_delivery', 'delivered'\)/u);
  assert.match(service, /invalidation_reason = 'superseded'/u);
  assert.match(service, /status = 'used', consumed_at = \$\{now\}, code_hmac = NULL/u);
  assert.match(service, /FOR UPDATE/u);
  assert.match(action, /delivered: delivery\.success/u);
  assert.match(action, /sendSensitiveOtpEmail/u);
  assert.doesNotMatch(action, /sendEmailWithResult/u);
  const sensitiveAdapter = emailService.slice(
    emailService.indexOf("export async function sendSensitiveOtpEmail"),
    emailService.indexOf("export async function sendEmail(", emailService.indexOf("export async function sendSensitiveOtpEmail")),
  );
  assert.doesNotMatch(sensitiveAdapter, /appendFile|logDelivery|FIELDGRID_EMAIL_TEST_OUTBOX_PATH/u);
  assert.match(action, /De aanvraag is ongeldig gemaakt/u);
  const requestResultType = action.slice(
    action.indexOf("export type RequestObjectSecurityOtpResult"),
    action.indexOf("export type VerifyObjectSecurityOtpResult"),
  );
  assert.doesNotMatch(requestResultType, /\bcode\??:/u);
});

test("secret reads are audited, short lived and decrypted only after unlock", async () => {
  const service = await read("lib/db/src/object-security-access.ts");
  const action = await read("artifacts/backoffice/src/app/actions/object-security.ts");
  const component = await read(
    "artifacts/backoffice/src/components/objects/tabs/ObjectSecurityTab.tsx",
  );
  const safeLoader = await read(
    "artifacts/backoffice/src/app/actions/object-detail-safe.ts",
  );

  assert.match(service, /OBJECT_SECURITY_UNLOCK_IDLE_MS = 2 \* 60 \* 1000/u);
  assert.match(service, /OBJECT_SECURITY_UNLOCK_ABSOLUTE_MS = 10 \* 60 \* 1000/u);
  assert.match(service, /decryptObjectSecurityPayload/u);
  assert.match(service, /eventType: "secret_read"/u);
  assert.match(service, /INSERT INTO public\.object_security_access_audit/u);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB/u);
  assert.match(component, /visibilitychange/u);
  assert.match(component, /pagehide/u);
  assert.match(component, /data-object-security-state="locked"/u);
  assert.doesNotMatch(component, /setHandle|handle:/u);
  assert.match(action, /httpOnly: true/u);
  assert.match(action, /sameSite: "strict"/u);
  assert.doesNotMatch(action, /handle: result\.handle/u);
  assert.doesNotMatch(safeLoader, /accessInfo|keyInfo|alarmInfo|encryptedPayload/u);
});

test("legacy plaintext object secrets have no ordinary application read path", async () => {
  const assignments = await read("artifacts/backoffice/src/app/actions/assignments.ts");
  const assignmentPage = await read(
    "artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx",
  );
  for (const source of [assignments, assignmentPage]) {
    assert.doesNotMatch(source, /objectAccessInfo|objectKeyInfo|objectAlarmInfo/u);
    assert.doesNotMatch(source, /objectsTable\.(?:accessInfo|keyInfo|alarmInfo)/u);
  }
  assert.match(assignmentPage, /tab=veiligheid/u);
  assert.match(assignmentPage, /prefetch=\{false\}/u);
});

test("management writes create encrypted immutable versions and revoke prior context", async () => {
  const service = await read("lib/db/src/object-security-access.ts");
  const action = await read("artifacts/backoffice/src/app/actions/object-security.ts");

  assert.match(service, /createManagementObjectSecurityRecord/u);
  assert.match(service, /encryptObjectSecurityPayload\(input\.payload/u);
  assert.match(service, /SET status = 'superseded'/u);
  assert.match(service, /ORDER BY version DESC/u);
  assert.match(service, /record_version_created/u);
  assert.doesNotMatch(service, /console\.(?:log|warn|error)\([^\n]*input\.payload/u);
  assert.match(action, /requirePermission\("object_security", "write"\)/u);
  assert.match(action, /payload: \{ waarde: parsed\.data\.value \}/u);
  assert.doesNotMatch(action, /revalidatePath|unstable_cache/u);
});

test("object security is module-gated and deployment fails closed without crypto material", async () => {
  const modules = await read("lib/db/src/module-permissions.ts");
  const workflow = await read(".github/workflows/deploy.yml");
  assert.match(modules, /object_security: "objects"/u);
  for (const name of [
    "FIELDGRID_OBJECT_SECURITY_ENCRYPTION_KEYS",
    "FIELDGRID_OBJECT_SECURITY_ACTIVE_KEY_VERSION",
    "FIELDGRID_OBJECT_SECURITY_OTP_PEPPER",
  ]) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`, "u"));
    assert.match(workflow, new RegExp(`printf '${name}=%s`, "u"));
  }
});

test("legacy plaintext has an encrypted staging-only backfill and safe seed", async () => {
  const backfill = await read("scripts/fieldgrid-object-security-legacy-backfill.mts");
  const seed = await read("lib/db/src/seed/staging-demo.ts");
  assert.match(backfill, /encryptObjectSecurityPayload/u);
  assert.match(backfill, /isolation\.environment !== "staging"/u);
  assert.match(backfill, /SET access_info = NULL, key_info = NULL, alarm_info = NULL/u);
  assert.doesNotMatch(seed, /contact_email, service_type, access_info, key_info, alarm_info/u);
});
