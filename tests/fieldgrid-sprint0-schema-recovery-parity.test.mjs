import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationName =
  "20260711181500_sprint0_schema_recovery_parity.sql";

function read(path) {
  return readFileSync(
    new URL(`../${path}`, import.meta.url),
    "utf8",
  );
}

function requireFragments(content, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      content.includes(fragment),
      `Expected fragment not found: ${fragment}`,
    );
  }
}

const migration = read(
  `lib/db/migrations/${migrationName}`,
);

const customersSchema = read(
  "lib/db/src/schema/customers.ts",
);

const objectsSchema = read(
  "lib/db/src/schema/objects.ts",
);

const personnelSchema = read(
  "lib/db/src/schema/personnel.ts",
);

const quotesSchema = read(
  "lib/db/src/schema/quotes.ts",
);

const invoicesSchema = read(
  "lib/db/src/schema/invoices.ts",
);

const platformUsersSchema = read(
  "lib/db/src/schema/platform-users.ts",
);

test(
  "reconstructs missing clean-install database objects",
  () => {
    requireFragments(migration, [
      "CREATE TABLE IF NOT EXISTS public.code_sequences",
      "ALTER TABLE public.code_sequences ENABLE ROW LEVEL SECURITY",
      "CREATE OR REPLACE FUNCTION public.next_entity_code",
      "ADD COLUMN IF NOT EXISTS contact_name varchar(200)",
      "ADD COLUMN IF NOT EXISTS contact_function varchar(100)",
      "ADD COLUMN IF NOT EXISTS contact_phone varchar(50)",
      "ADD COLUMN IF NOT EXISTS contact_email varchar(255)",
    ]);
  },
);

test(
  "restores active customer personnel and quote numbering",
  () => {
    requireFragments(migration, [
      "CREATE OR REPLACE FUNCTION public.trg_customers_set_code",
      "CREATE TRIGGER customers_set_code",
      "CREATE OR REPLACE FUNCTION public.trg_personnel_set_code",
      "CREATE TRIGGER personnel_set_code",
      "CREATE OR REPLACE FUNCTION public.trg_quotes_set_number",
      "CREATE TRIGGER quotes_set_number",
      "last_value = greatest(",
    ]);
  },
);

test(
  "keeps one canonical object code generator",
  () => {
    requireFragments(migration, [
      "CREATE SEQUENCE IF NOT EXISTS public.objects_code_seq",
      "CREATE OR REPLACE FUNCTION public.set_object_code",
      "DROP TRIGGER IF EXISTS objects_set_code",
      "DROP TRIGGER IF EXISTS trg_objects_set_code",
      "DROP FUNCTION IF EXISTS public.trg_objects_set_code()",
      "CREATE TRIGGER trg_objects_set_code",
      "EXECUTE FUNCTION public.set_object_code()",
    ]);
  },
);

test(
  "removes legacy invoice numbering trigger",
  () => {
    requireFragments(migration, [
      "DROP TRIGGER IF EXISTS invoices_set_number",
      "DROP TRIGGER IF EXISTS trg_invoices_set_number",
      "DROP FUNCTION IF EXISTS public.trg_invoices_set_number()",
    ]);

    assert.equal(
      migration.includes(
        "CREATE TRIGGER invoices_set_number",
      ),
      false,
    );

    requireFragments(invoicesSchema, [
      "invoiceNumberSequencesTable",
      "numberingSettingsId",
      "periodKey",
    ]);
  },
);

test(
  "normalizes the current database column contracts",
  () => {
    requireFragments(migration, [
      "ALTER COLUMN role TYPE varchar(40)",
      "ALTER COLUMN role SET DEFAULT 'support'",
      "ALTER COLUMN status TYPE varchar(30)",
      "ALTER COLUMN status SET DEFAULT 'active'",
      "ALTER COLUMN leave_type DROP DEFAULT",
      "ALTER COLUMN quote_number DROP DEFAULT",
    ]);

    requireFragments(platformUsersSchema, [
      'varchar("role", { length: 40 })',
      '.default("support")',
      'varchar("status", { length: 30 })',
      '.default("active")',
    ]);
  },
);

test(
  "application schemas still require the repaired objects",
  () => {
    requireFragments(customersSchema, [
      "trg_customers_set_code",
    ]);

    requireFragments(personnelSchema, [
      "trg_personnel_set_code",
    ]);

    requireFragments(objectsSchema, [
      '"contact_name"',
      '"contact_function"',
      '"contact_phone"',
      '"contact_email"',
    ]);

    requireFragments(quotesSchema, [
      "trg_quotes_set_number",
    ]);
  },
);