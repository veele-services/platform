import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const legacySecretFields = ["accessInfo", "keyInfo", "alarmInfo"];

test("ordinary backoffice object DTOs never serialize legacy access secrets", async () => {
  const detailLoader = await read(
    "artifacts/backoffice/src/app/actions/object-detail-safe.ts",
  );
  const objectActions = await read(
    "artifacts/backoffice/src/app/actions/objects.ts",
  );

  for (const field of legacySecretFields) {
    assert.doesNotMatch(
      detailLoader,
      new RegExp(`objectsTable\\.${field}|${field}:\\s+row\\.${field}`, "u"),
      `${field} must not be part of the ordinary detail DTO`,
    );
  }

  const getObjectStart = objectActions.indexOf("export async function getObject(");
  const getObjectEnd = objectActions.indexOf(
    "export async function getObjectPerformance(",
    getObjectStart,
  );
  const getObjectBody = objectActions.slice(getObjectStart, getObjectEnd);
  for (const field of legacySecretFields) {
    assert.doesNotMatch(
      getObjectBody,
      new RegExp(`objectsTable\\.${field}`, "u"),
      `${field} must not be returned by getObject`,
    );
  }
});

test("ordinary object UI has no secret fields or hidden secret hydration", async () => {
  const detailsTab = await read(
    "artifacts/backoffice/src/components/objects/tabs/ObjectDetailsTab.tsx",
  );
  const objectForm = await read(
    "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
  );

  for (const field of legacySecretFields) {
    assert.doesNotMatch(detailsTab, new RegExp(field, "u"));
    assert.doesNotMatch(objectForm, new RegExp(field, "u"));
  }
  assert.match(
    detailsTab,
    /Toegang en veiligheid[\s\S]*afgeschermde onderdeel/u,
  );
});

test("customer portal object lists, details and forms never expose legacy secrets", async () => {
  const actions = await read("artifacts/klant-pwa/src/actions/objects.ts");
  const listPage = await read(
    "artifacts/klant-pwa/src/app/(app)/objecten/page.tsx",
  );
  const detailPage = await read(
    "artifacts/klant-pwa/src/app/(app)/objecten/[id]/page.tsx",
  );
  const form = await read(
    "artifacts/klant-pwa/src/components/CustomerObjectForm.tsx",
  );

  for (const field of legacySecretFields) {
    const pattern = new RegExp(field, "u");
    assert.doesNotMatch(actions, pattern);
    assert.doesNotMatch(listPage, pattern);
    assert.doesNotMatch(detailPage, pattern);
    assert.doesNotMatch(form, pattern);
  }
});

test("every customer document list query binds the document row to the tenant", async () => {
  const documents = await read("artifacts/klant-pwa/src/actions/documents.ts");
  const listStart = documents.indexOf("export async function getMyDocuments(");
  const listEnd = documents.indexOf("async function canAccessDocumentEntity", listStart);
  const listBody = documents.slice(listStart, listEnd);
  const tenantBindings = listBody.match(
    /eq\(documentsTable\.tenantId, identity\.tenantId\)/gu,
  );

  assert.equal(
    tenantBindings?.length,
    3,
    "customer, object and assignment document queries must each bind documents.tenant_id",
  );
});

test("customer object writes include tenant-bound audit evidence", async () => {
  const actions = await read("artifacts/klant-pwa/src/actions/objects.ts");
  const auditBindings = actions.match(/tenantId:\s+context\.tenantId/gu);

  assert.ok(
    (auditBindings?.length ?? 0) >= 2,
    "create and update audit records must both carry tenant_id",
  );
});
