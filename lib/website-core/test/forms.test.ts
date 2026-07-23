import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONTACT_FORM_FIELDS,
  resolvePublicationForm,
  validateWebsiteFormSubmissionData,
  websiteFormDraftSchema,
  websitePublicationFormSchema,
} from "../src/forms";

const form = websitePublicationFormSchema.parse({
  id: "30000000-0000-4000-8000-000000000001",
  key: "contact",
  locale: "nl-NL",
  kind: "contact",
  name: "Contactformulier",
  fields: DEFAULT_CONTACT_FORM_FIELDS,
  submitLabel: "Versturen",
  successMessage: "Bedankt.",
});

test("form definitions reject duplicate fields and require a contact channel", () => {
  const base = {
    key: "contact",
    locale: "nl-NL",
    kind: "contact",
    name: "Contactformulier",
    submitLabel: "Versturen",
    successMessage: "Bedankt.",
    notificationEmail: "inbox@example.com",
    status: "published",
  } as const;
  assert.equal(
    websiteFormDraftSchema.safeParse({
      ...base,
      fields: [
        { key: "email", label: "E-mail", required: true },
        { key: "email", label: "E-mail nogmaals", required: false },
      ],
    }).success,
    false,
  );
  assert.equal(
    websiteFormDraftSchema.safeParse({
      ...base,
      fields: [{ key: "message", label: "Bericht", required: true }],
    }).success,
    false,
  );
});

test("submission validation accepts only configured, bounded fields", () => {
  assert.deepEqual(
    validateWebsiteFormSubmissionData(form, {
      name: "  Ada Lovelace  ",
      email: " ADA@EXAMPLE.COM ",
      message: "Vraag",
    }),
    {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Vraag",
    },
  );
  assert.throws(() =>
    validateWebsiteFormSubmissionData(form, {
      name: "Ada",
      email: "ada@example.com",
      subject: "Niet geconfigureerd",
      message: "Vraag",
    }),
  );
  assert.throws(() =>
    validateWebsiteFormSubmissionData(form, {
      email: "ada@example.com",
      message: "Naam ontbreekt",
    }),
  );
});

test("public form resolution is locale-scoped and never exposes recipients", () => {
  assert.equal(
    resolvePublicationForm([form], {
      formId: null,
      locale: "nl-NL",
    })?.id,
    form.id,
  );
  assert.equal(
    resolvePublicationForm([form], {
      formId: form.id,
      locale: "en-GB",
    }),
    null,
  );
  assert.equal("notificationEmail" in form, false);
});
