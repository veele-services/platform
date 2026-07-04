/**
 * Staging-only demo data seed for the Veele platform.
 *
 * This script creates realistic Den Haag test data across the full platform:
 * customers, contacts, objects, object contacts, linked personnel, planning,
 * assignments, reports, quotes, invoices, payments, documents, availability
 * and leave periods.
 *
 * Safety:
 * - Refuses to run unless APP_ENV=staging.
 * - Refuses to run unless STAGING_SEED_CONFIRM=seed-den-haag.
 * - Cleans up only rows marked with VEELE_STAGING_DEMO_DEN_HAAG.
 */
import type { PoolClient } from "pg";
import pg from "pg";
import { loadDbRuntimeEnv } from "../runtime-env";

const { Pool } = pg;

loadDbRuntimeEnv();

const SEED_MARKER = "VEELE_STAGING_DEMO_DEN_HAAG";
const CONFIRM_VALUE = "seed-den-haag";
const DEMO_EMAIL_DOMAIN = "staging.veele.test";
const DEMO_ACTOR_ID = "00000000-0000-4000-8000-000000000001";

let seedAuthActorId: string | null = null;

type Row = Record<string, unknown>;
type IdRow = { id: string };

function requireStagingSafety() {
  const appEnv = process.env.APP_ENV;
  const confirmation = process.env.STAGING_SEED_CONFIRM;

  if (appEnv !== "staging") {
    throw new Error(
      `Refusing to run staging seed: APP_ENV must be "staging" but is "${appEnv ?? ""}".`,
    );
  }

  if (confirmation !== CONFIRM_VALUE) {
    throw new Error(
      `Refusing to run staging seed: set STAGING_SEED_CONFIRM=${CONFIRM_VALUE}.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  if (/production|prod|app\.veele/i.test(databaseUrl)) {
    throw new Error("Refusing to run staging seed: DATABASE_URL looks production-like.");
  }
}

function dateKey(offsetDays = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function euro(value: number): string {
  return value.toFixed(2);
}

async function one<T extends Row>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T> {
  const result = await client.query(sql, params);
  const row = result.rows[0] as T | undefined;
  if (!row) throw new Error(`Expected one row for query: ${sql}`);
  return row;
}

async function maybeOne<T extends Row>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await client.query(sql, params);
  return (result.rows[0] as T | undefined) ?? null;
}

function authActorId(): string | null {
  return seedAuthActorId;
}

function actorId(): string {
  return seedAuthActorId ?? DEMO_ACTOR_ID;
}

async function resolveSeedActor(client: PoolClient) {
  try {
    const actor = await maybeOne<{ id: string; email: string | null }>(
      client,
      `select id, email
         from auth.users
        order by case when email is null then 1 else 0 end, created_at asc
        limit 1`,
    );

    seedAuthActorId = actor?.id ?? null;

    if (actor) {
      console.log(`Using auth.users actor for staging seed: ${actor.email ?? actor.id}`);
    } else {
      console.log("No auth.users actor found; nullable auth FK fields will be NULL.");
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "42P01" || code === "42501") {
      seedAuthActorId = null;
      console.log("Could not read auth.users; nullable auth FK fields will be NULL.");
      return;
    }
    throw error;
  }
}

async function cleanupDemoData(client: PoolClient) {
  const like = `%${SEED_MARKER}%`;

  await client.query("delete from payments where mollie_payment_id like 'tr_staging_demo_%'");
  await client.query("delete from documents where storage_path like 'staging-demo/%'");
  await client.query(
    `delete from invoices
      where notes like $1
         or assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query(
    `delete from quotes
      where notes like $1
         or assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query(
    `delete from reports
      where content like $1
         or assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query("delete from assignment_photos where storage_path like 'staging-demo/%'");
  await client.query(
    `delete from assignment_extra_work
      where description like $1
         or assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query(
    `delete from assignment_tasks
      where assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query(
    `delete from assignment_personnel
      where assignment_id in (select id from assignments where notes like $1)`,
    [like],
  );
  await client.query("delete from assignments where notes like $1", [like]);

  await client.query(
    `delete from object_personnel
      where object_id in (select id from objects where special_notes like $1 or description like $1)
         or personnel_id in (select id from personnel where email like $2)`,
    [like, `%@${DEMO_EMAIL_DOMAIN}`],
  );
  await client.query(
    `delete from object_contacts
      where object_id in (select id from objects where special_notes like $1 or description like $1)`,
    [like],
  );
  await client.query("delete from objects where special_notes like $1 or description like $1", [like]);
  await client.query("delete from customer_notes where notes like $1", [like]);
  await client.query("delete from customer_contacts where email like $1", [`%@${DEMO_EMAIL_DOMAIN}`]);
  await client.query("delete from customers where contact_email like $1 or notes like $2", [`%@${DEMO_EMAIL_DOMAIN}`, like]);
  await client.query(
    `delete from leave_periods
      where reason like $1
         or personnel_id in (select id from personnel where email like $2)`,
    [like, `%@${DEMO_EMAIL_DOMAIN}`],
  );
  await client.query(
    `delete from availability_windows
      where personnel_id in (select id from personnel where email like $1)`,
    [`%@${DEMO_EMAIL_DOMAIN}`],
  );
  await client.query("delete from personnel where email like $1", [`%@${DEMO_EMAIL_DOMAIN}`]);
  await client.query("delete from task_codes where code like 'DH-DEMO-%'");
  await client.query("delete from customer_types where slug like 'staging-demo-%'");
  await client.query("delete from sectors where description like $1", [like]);
  await client.query("delete from audit_log where metadata->>'seed' = $1", [SEED_MARKER]);
}

async function ensureSector(client: PoolClient, name: string, description: string): Promise<string> {
  const existing = await maybeOne<IdRow>(client, "select id from sectors where name = $1", [name]);
  if (existing) return existing.id;

  const inserted = await one<IdRow>(
    client,
    `insert into sectors (name, description, is_active)
     values ($1, $2, true)
     returning id`,
    [name, `${description} (${SEED_MARKER})`],
  );
  return inserted.id;
}

async function ensureRole(client: PoolClient, name: string, description: string): Promise<string> {
  const role = await one<IdRow>(
    client,
    `insert into roles (name, description, is_system)
     values ($1, $2, true)
     on conflict (name) do update set name = excluded.name
     returning id`,
    [name, description],
  );
  return role.id;
}

async function createCustomerType(client: PoolClient, name: string, slug: string): Promise<string> {
  const inserted = await one<IdRow>(
    client,
    `insert into customer_types (name, slug, is_active)
     values ($1, $2, true)
     returning id`,
    [name, `staging-demo-${slug}`],
  );
  return inserted.id;
}

async function createTaskCode(
  client: PoolClient,
  input: {
    code: string;
    name: string;
    sectorId: string;
    description: string;
    price: number;
    durationMinutes: number;
    requiredRoleId: string;
    requiredCertificates?: string[];
    requiredDiploma?: string | null;
    requiredKnowledge?: string[];
    photoRequired?: boolean;
    reportRequired?: boolean;
    invoiceable?: boolean;
  },
): Promise<string> {
  const row = await one<IdRow>(
    client,
    `insert into task_codes (
       code, name, sector_id, description, price, duration_minutes,
       required_role_id, required_certificates, required_diploma,
       required_knowledge, photo_required, report_required, invoiceable, is_active
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, true)
     returning id`,
    [
      input.code,
      input.name,
      input.sectorId,
      `${input.description} (${SEED_MARKER})`,
      euro(input.price),
      input.durationMinutes,
      input.requiredRoleId,
      JSON.stringify(input.requiredCertificates ?? []),
      input.requiredDiploma ?? null,
      JSON.stringify(input.requiredKnowledge ?? []),
      input.photoRequired ?? false,
      input.reportRequired ?? true,
      input.invoiceable ?? true,
    ],
  );
  return row.id;
}

async function createPersonnel(
  client: PoolClient,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    roleId: string;
    sectorId: string;
    region: string;
    certificates: Array<{ name: string; expires_at?: string }>;
    diplomas: string[];
    knowledge: string[];
    personnelType: string;
    emergencyAvailable?: boolean;
    preferredRegions: string[];
    hoursPerWeek: number;
  },
): Promise<string> {
  const row = await one<IdRow>(
    client,
    `insert into personnel (
       first_name, last_name, email, phone, role_id, sector_id, region,
       certificates, diplomas, knowledge, is_active, is_available,
       personnel_type, emergency_available, preferred_regions, contract_info
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, true, true, $11, $12, $13::jsonb, $14::jsonb)
     returning id`,
    [
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.roleId,
      input.sectorId,
      input.region,
      JSON.stringify(input.certificates),
      JSON.stringify(input.diplomas),
      JSON.stringify(input.knowledge),
      input.personnelType,
      input.emergencyAvailable ?? false,
      JSON.stringify(input.preferredRegions),
      JSON.stringify({
        start_date: "2025-01-01",
        contract_type: input.personnelType,
        hours_per_week: input.hoursPerWeek,
      }),
    ],
  );
  return row.id;
}

async function createAvailability(client: PoolClient, personnelId: string, start = "08:00", end = "17:00") {
  for (const dayOfWeek of [1, 2, 3, 4, 5]) {
    await client.query(
      `insert into availability_windows (personnel_id, day_of_week, start_time, end_time)
       values ($1, $2, $3, $4)
       on conflict do nothing`,
      [personnelId, dayOfWeek, start, dayOfWeek === 5 ? "15:30" : end],
    );
  }
}

async function createCustomer(
  client: PoolClient,
  input: {
    name: string;
    sectorId: string;
    customerTypeId: string;
    address: string;
    city?: string;
    postalCode: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    legalEntity: string;
    vatNumber: string;
    kvk: string;
    website: string;
    status: string;
    notes: string;
  },
): Promise<string> {
  const row = await one<IdRow>(
    client,
    `insert into customers (
       name, sector_id, customer_type_id, address, city, postal_code, country,
       contact_name, contact_email, contact_phone, legal_entity, vat_number,
       chamber_of_commerce_number, website, status, is_active, notes, created_by
     )
     values ($1, $2, $3, $4, $5, $6, 'NL', $7, $8, $9, $10, $11, $12, $13, $14, true, $15, $16)
     returning id`,
    [
      input.name,
      input.sectorId,
      input.customerTypeId,
      input.address,
      input.city ?? "Den Haag",
      input.postalCode,
      input.contactName,
      input.contactEmail,
      input.contactPhone,
      input.legalEntity,
      input.vatNumber,
      input.kvk,
      input.website,
      input.status,
      `${SEED_MARKER}: ${input.notes}`,
      authActorId(),
    ],
  );
  return row.id;
}

async function createCustomerContact(
  client: PoolClient,
  customerId: string,
  firstName: string,
  lastName: string,
  role: string,
  email: string,
  isPrimary = false,
) {
  await client.query(
    `insert into customer_contacts (
       customer_id, first_name, last_name, function, email, phone, mobile,
       preferred_comm, is_emergency_contact, is_primary
     )
     values ($1, $2, $3, $4, $5, $6, $7, 'email', $8, $9)`,
    [
      customerId,
      firstName,
      lastName,
      role,
      email,
      "070 210 10 10",
      "06 12 34 56 78",
      !isPrimary,
      isPrimary,
    ],
  );
}

async function createObject(
  client: PoolClient,
  input: {
    customerId: string;
    sectorId: string;
    name: string;
    address: string;
    postalCode: string;
    description: string;
    serviceType: string;
    accessInfo: string;
    fixedInstructions: string;
    requiredRoles: string[];
    requiredCertificates: string[];
  },
): Promise<string> {
  const row = await one<IdRow>(
    client,
    `insert into objects (
       customer_id, sector_id, name, address, city, postal_code,
       description, is_active, contact_name, contact_function, contact_phone,
       contact_email, service_type, access_info, key_info, alarm_info,
       fixed_instructions, special_notes, required_roles, required_certificates, created_by
     )
     values ($1, $2, $3, $4, 'Den Haag', $5, $6, true, $7, $8, '070 210 20 20', $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18)
     returning id`,
    [
      input.customerId,
      input.sectorId,
      input.name,
      input.address,
      input.postalCode,
      `${SEED_MARKER}: ${input.description}`,
      "Receptie",
      "Locatiecontact",
      `object-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@${DEMO_EMAIL_DOMAIN}`,
      input.serviceType,
      input.accessInfo,
      "Sleutelkluis bij hoofdingang, code beschikbaar bij planning.",
      "Alarm via meldkamer; uitschakelen met tijdelijke code van locatiecontact.",
      input.fixedInstructions,
      `${SEED_MARKER}: Let op scenario-specifieke testdata.`,
      JSON.stringify(input.requiredRoles),
      JSON.stringify(input.requiredCertificates),
      authActorId(),
    ],
  );
  return row.id;
}

async function createObjectContact(client: PoolClient, objectId: string, firstName: string, lastName: string, role: string) {
  await client.query(
    `insert into object_contacts (object_id, first_name, last_name, function, phone, email, is_primary)
     values ($1, $2, $3, $4, '070 210 30 30', $5, true)`,
    [objectId, firstName, lastName, role, `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`],
  );
}

async function linkObjectPersonnel(client: PoolClient, objectId: string, personnelIds: string[]) {
  for (const personnelId of personnelIds) {
    await client.query(
      `insert into object_personnel (object_id, personnel_id)
       values ($1, $2)
       on conflict do nothing`,
      [objectId, personnelId],
    );
  }
}

async function createAssignment(
  client: PoolClient,
  input: {
    title: string;
    description: string;
    customerId: string;
    objectId: string;
    status: string;
    priority: string;
    date?: string | null;
    start?: string | null;
    end?: string | null;
    requiredRegion?: string | null;
    taskCodeIds: string[];
    assignedPersonnelIds?: string[];
  },
): Promise<string> {
  const row = await one<IdRow>(
    client,
    `insert into assignments (
       title, description, customer_id, object_id, status, priority,
       scheduled_date, scheduled_start, scheduled_end, required_region,
       notes, is_active, created_by
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
     returning id`,
    [
      input.title,
      input.description,
      input.customerId,
      input.objectId,
      input.status,
      input.priority,
      input.date ?? null,
      input.start ?? null,
      input.end ?? null,
      input.requiredRegion ?? "Den Haag",
      `${SEED_MARKER}: ${input.description}`,
      actorId(),
    ],
  );

  for (const [index, taskCodeId] of input.taskCodeIds.entries()) {
    await client.query(
      `insert into assignment_tasks (assignment_id, task_code_id, notes, sort_order)
       values ($1, $2, $3, $4)`,
      [row.id, taskCodeId, `${SEED_MARKER}: taak ${index + 1}`, index],
    );
  }

  for (const personnelId of input.assignedPersonnelIds ?? []) {
    await client.query(
      `insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
       values ($1, $2, 'assigned', $3)
       on conflict do nothing`,
      [row.id, personnelId, actorId()],
    );
  }

  return row.id;
}

async function createReport(
  client: PoolClient,
  assignmentId: string,
  status: "submitted" | "approved" | "rejected",
  hours: number,
  content: string,
) {
  await client.query(
    `insert into reports (
       assignment_id, submitted_by, status, content, hours_worked,
       submitter_notes, notes, reviewed_by, reviewed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      assignmentId,
      actorId(),
      status,
      `${SEED_MARKER}: ${content}`,
      euro(hours),
      "Foto's en checklist zijn gecontroleerd in de demo.",
      status === "approved" ? "Akkoord voor facturatie." : null,
      status === "approved" ? actorId() : null,
      status === "approved" ? new Date() : null,
    ],
  );
}

async function createQuote(
  client: PoolClient,
  assignmentId: string,
  customerId: string,
  status: string,
  amount: number,
  validityOffsetDays: number,
) {
  await client.query(
    `insert into quotes (
       assignment_id, customer_id, amount, validity_date, status,
       notes, approved_by, approved_at, created_by
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      assignmentId,
      customerId,
      euro(amount),
      dateKey(validityOffsetDays),
      status,
      `${SEED_MARKER}: Offerte voor Den Haag demo-scenario.`,
      status === "approved" ? actorId() : null,
      status === "approved" ? new Date() : null,
      actorId(),
    ],
  );
}

async function createInvoice(
  client: PoolClient,
  assignmentId: string,
  customerId: string,
  status: string,
  amount: number,
  dueOffsetDays: number,
  paidOffsetDays?: number,
): Promise<string> {
  const vat = amount * 0.21;
  const total = amount + vat;
  const row = await one<IdRow>(
    client,
    `insert into invoices (
       customer_id, assignment_id, amount, vat_percentage, vat_amount,
       total_amount, status, due_date, paid_date, notes, created_by
     )
     values ($1, $2, $3, '21.00', $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      customerId,
      assignmentId,
      euro(amount),
      euro(vat),
      euro(total),
      status,
      dateKey(dueOffsetDays),
      status === "paid" && paidOffsetDays !== undefined ? dateKey(paidOffsetDays) : null,
      `${SEED_MARKER}: Demo factuur voor ketentest.`,
      actorId(),
    ],
  );
  return row.id;
}

async function createPayment(client: PoolClient, invoiceId: string, amountCents: number, status: string) {
  await client.query(
    `insert into payments (
       invoice_id, mollie_payment_id, amount_cents, currency, status, checkout_url, paid_at
     )
     values ($1, $2, $3, 'EUR', $4, $5, $6)`,
    [
      invoiceId,
      `tr_staging_demo_${invoiceId.slice(0, 8)}_${status}`,
      amountCents,
      status,
      `https://www.mollie.com/checkout/staging-demo/${invoiceId}`,
      status === "paid" ? new Date() : null,
    ],
  );
}

async function createDocument(
  client: PoolClient,
  entityType: string,
  entityId: string | null,
  name: string,
  filename: string,
  sizeBytes = 184000,
) {
  await client.query(
    `insert into documents (
       name, filename, mime_type, storage_path, size_bytes, entity_type, entity_id, uploaded_by
     )
     values ($1, $2, 'application/pdf', $3, $4, $5, $6, $7)`,
    [
      name,
      filename,
      `staging-demo/${entityType}/${filename}`,
      sizeBytes,
      entityType,
      entityId,
      actorId(),
    ],
  );
}

async function createAudit(client: PoolClient, action: string, resource: string, resourceId: string | null, label: string) {
  await client.query(
    `insert into audit_log (user_id, action, resource, resource_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      actorId(),
      action,
      resource,
      resourceId,
      JSON.stringify({ seed: SEED_MARKER, label, city: "Den Haag" }),
    ],
  );
}

async function seedDemoData(client: PoolClient) {
  const roleIds = {
    management: await ensureRole(client, "Management", "Full platform access"),
    planning: await ensureRole(client, "Planning", "Manages planning and assignment scheduling"),
    teamlead: await ensureRole(client, "Teamlead", "Oversees team assignments and reports"),
    employee: await ensureRole(client, "Employee", "Field worker"),
    flex: await ensureRole(client, "Flex Employee", "External/flex worker"),
  };

  const sectorIds = {
    facilitair: await ensureSector(client, "Facilitair", "Facilitaire dienstverlening, beheer en onderhoud"),
    schoonmaak: await ensureSector(client, "Schoonmaak", "Reguliere, specialistische en calamiteitenschoonmaak"),
    beveiliging: await ensureSector(client, "Beveiliging", "Beveiliging, toezicht, surveillance en alarmopvolging"),
  };

  const customerTypeIds = {
    business: await createCustomerType(client, "Zakelijke klant", "zakelijke-klant"),
    vve: await createCustomerType(client, "VvE", "vve"),
    zorg: await createCustomerType(client, "Zorginstelling", "zorginstelling"),
    onderwijs: await createCustomerType(client, "Onderwijsinstelling", "onderwijsinstelling"),
    horeca: await createCustomerType(client, "Horeca", "horeca"),
  };

  const taskIds = {
    schoonmaak: await createTaskCode(client, {
      code: "DH-DEMO-SCH-001",
      name: "Dagelijkse schoonmaak en sanitairronde",
      sectorId: sectorIds.schoonmaak,
      description: "Reguliere schoonmaakronde voor entree, algemene ruimtes en sanitair.",
      price: 145,
      durationMinutes: 90,
      requiredRoleId: roleIds.employee,
      requiredCertificates: ["VOG"],
      requiredKnowledge: ["Schoonmaakprotocol"],
      reportRequired: true,
    }),
    glas: await createTaskCode(client, {
      code: "DH-DEMO-GLAS-002",
      name: "Glasbewassing met hoogwerker",
      sectorId: sectorIds.schoonmaak,
      description: "Buitenzijde glas, inclusief hoogwerker en afzetting.",
      price: 360,
      durationMinutes: 150,
      requiredRoleId: roleIds.employee,
      requiredCertificates: ["VCA", "Hoogwerker"],
      requiredDiploma: "SVS Glasbewassing",
      requiredKnowledge: ["Veilig werken op hoogte"],
      photoRequired: true,
      reportRequired: true,
    }),
    calamiteit: await createTaskCode(client, {
      code: "DH-DEMO-CAL-003",
      name: "Calamiteitenreiniging na lekkage",
      sectorId: sectorIds.schoonmaak,
      description: "Spoedreiniging, waterschadebeperking en rapportage.",
      price: 525,
      durationMinutes: 180,
      requiredRoleId: roleIds.teamlead,
      requiredCertificates: ["BHV", "VCA"],
      requiredKnowledge: ["Calamiteitenreiniging"],
      photoRequired: true,
    }),
    beveiliging: await createTaskCode(client, {
      code: "DH-DEMO-BEV-004",
      name: "Avondsluiting en surveillance",
      sectorId: sectorIds.beveiliging,
      description: "Sluitronde, alarmcontrole en rapportage van bijzonderheden.",
      price: 195,
      durationMinutes: 120,
      requiredRoleId: roleIds.employee,
      requiredCertificates: ["VOG"],
      requiredKnowledge: ["Sleutelbeheer"],
    }),
    techniek: await createTaskCode(client, {
      code: "DH-DEMO-TEC-005",
      name: "Kleine facilitaire reparatie",
      sectorId: sectorIds.facilitair,
      description: "Herstelmelding voor deurdrangers, verlichting en klein onderhoud.",
      price: 210,
      durationMinutes: 120,
      requiredRoleId: roleIds.employee,
      requiredCertificates: ["VCA"],
      requiredKnowledge: ["Basis techniek"],
    }),
    inspectie: await createTaskCode(client, {
      code: "DH-DEMO-INS-006",
      name: "Objectinspectie en servicerapport",
      sectorId: sectorIds.facilitair,
      description: "Kwaliteitscontrole met digitale rapportage.",
      price: 175,
      durationMinutes: 75,
      requiredRoleId: roleIds.teamlead,
      requiredKnowledge: ["Rapportage"],
      photoRequired: true,
    }),
  };

  const personnelIds = {
    farid: await createPersonnel(client, {
      firstName: "Farid",
      lastName: "El Amrani",
      email: `farid.elamrani@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 41",
      roleId: roleIds.teamlead,
      sectorId: sectorIds.schoonmaak,
      region: "Den Haag Centrum",
      certificates: [{ name: "BHV" }, { name: "VCA" }, { name: "Hoogwerker", expires_at: "2027-04-30" }],
      diplomas: ["SVS Glasbewassing"],
      knowledge: ["Rapportage", "Calamiteitenreiniging", "Veilig werken op hoogte"],
      personnelType: "vast",
      emergencyAvailable: true,
      preferredRegions: ["Scheveningen", "Binckhorst", "Statenkwartier"],
      hoursPerWeek: 40,
    }),
    sanne: await createPersonnel(client, {
      firstName: "Sanne",
      lastName: "van Dijk",
      email: `sanne.vandijk@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 42",
      roleId: roleIds.employee,
      sectorId: sectorIds.schoonmaak,
      region: "Scheveningen",
      certificates: [{ name: "VOG" }, { name: "BHV" }],
      diplomas: ["SVS Basis schoonmaak"],
      knowledge: ["Schoonmaakprotocol", "Gastvrij werken"],
      personnelType: "parttime",
      preferredRegions: ["Scheveningen", "Statenkwartier"],
      hoursPerWeek: 28,
    }),
    mitchell: await createPersonnel(client, {
      firstName: "Mitchell",
      lastName: "Rijsdijk",
      email: `mitchell.rijsdijk@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 43",
      roleId: roleIds.employee,
      sectorId: sectorIds.beveiliging,
      region: "Binckhorst",
      certificates: [{ name: "VOG" }, { name: "VCA" }],
      diplomas: ["Beveiliging niveau 2"],
      knowledge: ["Sleutelbeheer", "Basis techniek"],
      personnelType: "vast",
      emergencyAvailable: true,
      preferredRegions: ["Binckhorst", "Centrum"],
      hoursPerWeek: 36,
    }),
    lotte: await createPersonnel(client, {
      firstName: "Lotte",
      lastName: "Jansen",
      email: `lotte.jansen@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 44",
      roleId: roleIds.employee,
      sectorId: sectorIds.schoonmaak,
      region: "Den Haag Centrum",
      certificates: [{ name: "VOG" }],
      diplomas: ["SVS Basis schoonmaak"],
      knowledge: ["Schoonmaakprotocol", "Rapportage"],
      personnelType: "tijdelijk",
      preferredRegions: ["Centrum", "Bezuidenhout"],
      hoursPerWeek: 32,
    }),
    nour: await createPersonnel(client, {
      firstName: "Nour",
      lastName: "Benali",
      email: `nour.benali@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 45",
      roleId: roleIds.employee,
      sectorId: sectorIds.facilitair,
      region: "Escamp",
      certificates: [{ name: "VOG" }, { name: "VCA" }],
      diplomas: ["MBO Facilitair"],
      knowledge: ["Basis techniek", "Schoonmaakprotocol"],
      personnelType: "oproep",
      preferredRegions: ["Escamp", "Loosduinen"],
      hoursPerWeek: 20,
    }),
    pieter: await createPersonnel(client, {
      firstName: "Pieter",
      lastName: "van der Meer",
      email: `pieter.vandermeer@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 46",
      roleId: roleIds.employee,
      sectorId: sectorIds.schoonmaak,
      region: "Statenkwartier",
      certificates: [{ name: "VCA" }, { name: "Hoogwerker" }],
      diplomas: ["SVS Glasbewassing"],
      knowledge: ["Veilig werken op hoogte"],
      personnelType: "zzp",
      preferredRegions: ["Statenkwartier", "Scheveningen"],
      hoursPerWeek: 24,
    }),
    koen: await createPersonnel(client, {
      firstName: "Koen",
      lastName: "Bos",
      email: `koen.bos@${DEMO_EMAIL_DOMAIN}`,
      phone: "06 11 22 33 47",
      roleId: roleIds.flex,
      sectorId: sectorIds.schoonmaak,
      region: "Den Haag Centrum",
      certificates: [{ name: "VOG" }],
      diplomas: [],
      knowledge: ["Schoonmaakprotocol"],
      personnelType: "flex",
      preferredRegions: ["Centrum", "Scheveningen"],
      hoursPerWeek: 16,
    }),
  };

  for (const [personnelId, hours] of Object.entries({
    [personnelIds.farid]: ["07:30", "16:30"],
    [personnelIds.sanne]: ["08:30", "15:30"],
    [personnelIds.mitchell]: ["12:00", "20:00"],
    [personnelIds.lotte]: ["08:00", "16:00"],
    [personnelIds.nour]: ["09:00", "17:00"],
    [personnelIds.pieter]: ["07:00", "15:00"],
    [personnelIds.koen]: ["10:00", "18:00"],
  })) {
    await createAvailability(client, personnelId, hours[0]!, hours[1]!);
  }

  await client.query(
    `insert into leave_periods (personnel_id, start_date, end_date, leave_type, reason, status, created_by)
     values
       ($1, $2, $2, 'vakantie', $3, 'approved', $4),
       ($5, $6, $7, 'vakantie', $8, 'pending', $4),
       ($9, $2, $2, 'ziekte', $10, 'approved', $4)`,
    [
      personnelIds.sanne,
      dateKey(0),
      `${SEED_MARKER}: Vrije dag voor planningsconflict-test.`,
      actorId(),
      personnelIds.koen,
      dateKey(5),
      dateKey(7),
      `${SEED_MARKER}: Flexmedewerker vraagt verlof aan voor PWA/verlof-inbox test.`,
      personnelIds.nour,
      `${SEED_MARKER}: Ziekmelding voor beschikbaarheidsbadge.`,
    ],
  );

  const customers = {
    hofjes: await createCustomer(client, {
      name: "Haagse Hofjes Zorggroep",
      sectorId: sectorIds.schoonmaak,
      customerTypeId: customerTypeIds.zorg,
      address: "Prinsegracht 42",
      postalCode: "2512 GA",
      contactName: "Marieke de Groot",
      contactEmail: `marieke.degroot@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 10",
      legalEntity: "Haagse Hofjes Zorggroep B.V.",
      vatNumber: "NL862345678B01",
      kvk: "87234561",
      website: "https://haagsehofjes.example",
      status: "active",
      notes: "Zorglocatie met strikte hygiëneregels en interne notities die klanten niet mogen zien.",
    }),
    staten: await createCustomer(client, {
      name: "VvE Residence Statenkwartier",
      sectorId: sectorIds.schoonmaak,
      customerTypeId: customerTypeIds.vve,
      address: "Frederik Hendriklaan 102",
      postalCode: "2582 BE",
      contactName: "Herman van Leeuwen",
      contactEmail: `herman.vanleeuwen@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 20",
      legalEntity: "VvE Residence Statenkwartier",
      vatNumber: "NL001234567B02",
      kvk: "59123488",
      website: "https://residencestatenkwartier.example",
      status: "active",
      notes: "Bewonerscommunicatie gevoelig; plan lawaaiwerkzaamheden buiten rusttijden.",
    }),
    zuiderstrand: await createCustomer(client, {
      name: "Strandpaviljoen Zuiderlicht",
      sectorId: sectorIds.schoonmaak,
      customerTypeId: customerTypeIds.horeca,
      address: "Strandslag 12",
      postalCode: "2586 JK",
      contactName: "Nina Hoek",
      contactEmail: `nina.hoek@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 30",
      legalEntity: "Zuiderlicht Hospitality B.V.",
      vatNumber: "NL865551234B01",
      kvk: "90441231",
      website: "https://zuiderlicht.example",
      status: "prospect",
      notes: "Seizoensdrukte; spoedwerk vaak vroeg in de ochtend uitvoeren.",
    }),
    binck: await createCustomer(client, {
      name: "Logistiek Centrum Binckhorst",
      sectorId: sectorIds.facilitair,
      customerTypeId: customerTypeIds.business,
      address: "Binckhorstlaan 117",
      postalCode: "2516 BA",
      contactName: "Ravi Mehta",
      contactEmail: `ravi.mehta@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 40",
      legalEntity: "LCB Warehousing B.V.",
      vatNumber: "NL859998887B01",
      kvk: "74229913",
      website: "https://lcb.example",
      status: "active",
      notes: "Laadkades blijven operationeel; veiligheidsvest verplicht.",
    }),
    hofvijver: await createCustomer(client, {
      name: "Basisschool De Hofvijver",
      sectorId: sectorIds.facilitair,
      customerTypeId: customerTypeIds.onderwijs,
      address: "Turfmarkt 99",
      postalCode: "2511 DC",
      contactName: "Eline Bakker",
      contactEmail: `eline.bakker@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 50",
      legalEntity: "Stichting Onderwijs Hofvijver",
      vatNumber: "NL812345999B01",
      kvk: "40123455",
      website: "https://hofvijver.example",
      status: "active",
      notes: "Werkzaamheden buiten lestijden plannen; VOG vereist.",
    }),
    noordeinde: await createCustomer(client, {
      name: "Boutique Hotel Noordeinde",
      sectorId: sectorIds.beveiliging,
      customerTypeId: customerTypeIds.horeca,
      address: "Noordeinde 64",
      postalCode: "2514 GK",
      contactName: "Thomas Vermeer",
      contactEmail: `thomas.vermeer@${DEMO_EMAIL_DOMAIN}`,
      contactPhone: "070 310 45 60",
      legalEntity: "Hotel Noordeinde Exploitatie B.V.",
      vatNumber: "NL867771111B01",
      kvk: "83222110",
      website: "https://hotelnoordeinde.example",
      status: "lead",
      notes: "Nieuwe lead met offerteaanvraag voor periodiek onderhoud.",
    }),
  };

  await createCustomerContact(client, customers.hofjes, "Marieke", "de Groot", "Locatiemanager", `marieke.degroot@${DEMO_EMAIL_DOMAIN}`, true);
  await createCustomerContact(client, customers.hofjes, "Jeroen", "Mulder", "Facilitair coordinator", `jeroen.mulder@${DEMO_EMAIL_DOMAIN}`);
  await createCustomerContact(client, customers.staten, "Herman", "van Leeuwen", "Voorzitter VvE", `herman.vanleeuwen@${DEMO_EMAIL_DOMAIN}`, true);
  await createCustomerContact(client, customers.zuiderstrand, "Nina", "Hoek", "Bedrijfsleider", `nina.hoek@${DEMO_EMAIL_DOMAIN}`, true);
  await createCustomerContact(client, customers.binck, "Ravi", "Mehta", "Operations manager", `ravi.mehta@${DEMO_EMAIL_DOMAIN}`, true);
  await createCustomerContact(client, customers.hofvijver, "Eline", "Bakker", "Directeur", `eline.bakker@${DEMO_EMAIL_DOMAIN}`, true);
  await createCustomerContact(client, customers.noordeinde, "Thomas", "Vermeer", "Hotelmanager", `thomas.vermeer@${DEMO_EMAIL_DOMAIN}`, true);

  for (const [customerId, note] of [
    [customers.hofjes, "Let op: interne notitie over infectiepreventie en sleutelprotocol."],
    [customers.staten, "Bestuur wil maandelijkse rapportage per e-mail ontvangen."],
    [customers.binck, "Heftruckverkeer maakt planning tussen 10:00 en 12:00 onhandig."],
  ] as const) {
    await client.query(
      "insert into customer_notes (customer_id, notes, updated_by) values ($1, $2, $3)",
      [customerId, `${SEED_MARKER}: ${note}`, authActorId()],
    );
  }

  const objects = {
    zorgAtrium: await createObject(client, {
      customerId: customers.hofjes,
      sectorId: sectorIds.schoonmaak,
      name: "Zorglocatie Atrium Prinsegracht",
      address: "Prinsegracht 42",
      postalCode: "2512 GA",
      description: "Atrium, gangen, wachtruimtes en sanitaire zones.",
      serviceType: "Dagelijkse schoonmaak",
      accessInfo: "Aanmelden bij receptie; bezoekersbadge verplicht.",
      fixedInstructions: "Gebruik geurvrije middelen en registreer per zone.",
      requiredRoles: ["Employee"],
      requiredCertificates: ["VOG", "BHV"],
    }),
    statenGarage: await createObject(client, {
      customerId: customers.staten,
      sectorId: sectorIds.schoonmaak,
      name: "Residence Statenkwartier - entree en parkeergarage",
      address: "Frederik Hendriklaan 102",
      postalCode: "2582 BE",
      description: "Entree, liftportalen, parkeergarage en glaspartijen.",
      serviceType: "VvE onderhoud",
      accessInfo: "Sleutel ophalen bij beheerder tussen 07:00 en 09:00.",
      fixedInstructions: "Geen lawaai tussen 12:00 en 14:00.",
      requiredRoles: ["Employee"],
      requiredCertificates: ["VCA", "Hoogwerker"],
    }),
    strand: await createObject(client, {
      customerId: customers.zuiderstrand,
      sectorId: sectorIds.schoonmaak,
      name: "Paviljoen Zuiderlicht - terras en keukenroute",
      address: "Strandslag 12",
      postalCode: "2586 JK",
      description: "Terras, glaswand en logistieke keukenroute.",
      serviceType: "Horeca schoonmaak",
      accessInfo: "Alleen bereikbaar via strandopgang; parkeren bij boulevard.",
      fixedInstructions: "Werk afronden voor lunchservice.",
      requiredRoles: ["Employee"],
      requiredCertificates: ["VOG"],
    }),
    binckDock: await createObject(client, {
      customerId: customers.binck,
      sectorId: sectorIds.facilitair,
      name: "Binckhorst distributiehal A",
      address: "Binckhorstlaan 117",
      postalCode: "2516 BA",
      description: "Laadkades, expeditievloer en kantoorunit.",
      serviceType: "Logistiek facility",
      accessInfo: "PBM verplicht; melden bij dock office.",
      fixedInstructions: "Laadkade 3 vrijhouden.",
      requiredRoles: ["Teamlead", "Employee"],
      requiredCertificates: ["VCA"],
    }),
    school: await createObject(client, {
      customerId: customers.hofvijver,
      sectorId: sectorIds.facilitair,
      name: "De Hofvijver hoofdgebouw",
      address: "Turfmarkt 99",
      postalCode: "2511 DC",
      description: "Leslokalen, gymzaal, pleinzijde en technische ruimte.",
      serviceType: "Schoolonderhoud",
      accessInfo: "Buiten schooltijden via conciërge-ingang.",
      fixedInstructions: "Kindveilige middelen gebruiken; VOG verplicht.",
      requiredRoles: ["Employee"],
      requiredCertificates: ["VOG"],
    }),
    hotel: await createObject(client, {
      customerId: customers.noordeinde,
      sectorId: sectorIds.beveiliging,
      name: "Hotel Noordeinde publieke ruimtes",
      address: "Noordeinde 64",
      postalCode: "2514 GK",
      description: "Lobby, trappenhuis, ontbijtruimte en entreeglas.",
      serviceType: "Hotel facility",
      accessInfo: "Aanmelden bij front office.",
      fixedInstructions: "Gastenstromen vermijden tussen 08:00 en 10:00.",
      requiredRoles: ["Employee"],
      requiredCertificates: ["VOG"],
    }),
  };

  await createObjectContact(client, objects.zorgAtrium, "Jeroen", "Mulder", "Facilitair coordinator");
  await createObjectContact(client, objects.statenGarage, "Herman", "van Leeuwen", "Beheerder");
  await createObjectContact(client, objects.strand, "Nina", "Hoek", "Bedrijfsleider");
  await createObjectContact(client, objects.binckDock, "Ravi", "Mehta", "Dock manager");
  await createObjectContact(client, objects.school, "Eline", "Bakker", "Directeur");
  await createObjectContact(client, objects.hotel, "Thomas", "Vermeer", "Front office manager");

  await linkObjectPersonnel(client, objects.zorgAtrium, [personnelIds.farid, personnelIds.sanne, personnelIds.lotte]);
  await linkObjectPersonnel(client, objects.statenGarage, [personnelIds.farid, personnelIds.pieter]);
  await linkObjectPersonnel(client, objects.binckDock, [personnelIds.farid, personnelIds.mitchell, personnelIds.nour]);
  await linkObjectPersonnel(client, objects.school, [personnelIds.lotte, personnelIds.nour]);

  const assignments = {
    requested: await createAssignment(client, {
      title: "Nieuwe aanvraag: extra schoonmaak na ouderavond",
      description: "Klant vraagt extra schoonmaakronde aan voor lokalen en entree.",
      customerId: customers.hofvijver,
      objectId: objects.school,
      status: "requested",
      priority: "normal",
      date: null,
      taskCodeIds: [taskIds.schoonmaak],
    }),
    review: await createAssignment(client, {
      title: "Review: periodiek onderhoud hotelruimtes",
      description: "Lead vraagt maandelijkse dienstverlening; management moet beoordelen.",
      customerId: customers.noordeinde,
      objectId: objects.hotel,
      status: "review",
      priority: "normal",
      date: null,
      taskCodeIds: [taskIds.schoonmaak, taskIds.inspectie],
    }),
    quoteSent: await createAssignment(client, {
      title: "Offerte ter goedkeuring: glasbewassing VvE",
      description: "Offerte is verzonden voor glasbewassing met hoogwerker.",
      customerId: customers.staten,
      objectId: objects.statenGarage,
      status: "awaiting_approval",
      priority: "high",
      date: null,
      taskCodeIds: [taskIds.glas],
    }),
    approved: await createAssignment(client, {
      title: "Goedgekeurd: schoonmaak terras voor seizoenstart",
      description: "Klant heeft opdracht goedgekeurd; klaar om planbaar te maken.",
      customerId: customers.zuiderstrand,
      objectId: objects.strand,
      status: "approved",
      priority: "normal",
      date: null,
      taskCodeIds: [taskIds.schoonmaak],
    }),
    openTeam: await createAssignment(client, {
      title: "Open werkbon: spoedreiniging zorglocatie",
      description: "Teamopdracht met teamlead en medewerker vereist.",
      customerId: customers.hofjes,
      objectId: objects.zorgAtrium,
      status: "plannable",
      priority: "urgent",
      date: dateKey(0),
      requiredRegion: "Den Haag Centrum",
      taskCodeIds: [taskIds.calamiteit, taskIds.schoonmaak],
    }),
    openGlass: await createAssignment(client, {
      title: "Open werkbon: glasbewassing Statenkwartier",
      description: "Planbare glasbewassing met hoogwerker en VCA.",
      customerId: customers.staten,
      objectId: objects.statenGarage,
      status: "plannable",
      priority: "high",
      date: dateKey(1),
      requiredRegion: "Statenkwartier",
      taskCodeIds: [taskIds.glas],
    }),
    scheduledTeam: await createAssignment(client, {
      title: "Ingepland team: distributiehal inspectie en herstel",
      description: "Meerdere personeelsleden gekoppeld voor inspectie plus klein herstel.",
      customerId: customers.binck,
      objectId: objects.binckDock,
      status: "scheduled",
      priority: "high",
      date: dateKey(0),
      start: "09:00",
      end: "12:00",
      requiredRegion: "Binckhorst",
      taskCodeIds: [taskIds.inspectie, taskIds.techniek],
      assignedPersonnelIds: [personnelIds.farid, personnelIds.mitchell],
    }),
    conflict: await createAssignment(client, {
      title: "Conflict-test: schoonmaak tijdens verlof",
      description: "Bewust gepland op medewerker met goedgekeurd verlof voor badge-test.",
      customerId: customers.zuiderstrand,
      objectId: objects.strand,
      status: "scheduled",
      priority: "normal",
      date: dateKey(0),
      start: "10:00",
      end: "11:30",
      requiredRegion: "Scheveningen",
      taskCodeIds: [taskIds.schoonmaak],
      assignedPersonnelIds: [personnelIds.sanne],
    }),
    inProgress: await createAssignment(client, {
      title: "In uitvoering: avondsluiting centrumlocatie",
      description: "Scenario voor personeels-PWA status in uitvoering.",
      customerId: customers.noordeinde,
      objectId: objects.hotel,
      status: "in_progress",
      priority: "normal",
      date: dateKey(0),
      start: "17:00",
      end: "19:00",
      requiredRegion: "Den Haag Centrum",
      taskCodeIds: [taskIds.beveiliging],
      assignedPersonnelIds: [personnelIds.mitchell],
    }),
    submitted: await createAssignment(client, {
      title: "Rapport ingediend: schoonmaak zorglocatie",
      description: "Veldrapport wacht op beoordeling door management.",
      customerId: customers.hofjes,
      objectId: objects.zorgAtrium,
      status: "report_submitted",
      priority: "normal",
      date: dateKey(-1),
      start: "08:00",
      end: "10:00",
      taskCodeIds: [taskIds.schoonmaak],
      assignedPersonnelIds: [personnelIds.lotte],
    }),
    invoiceReady: await createAssignment(client, {
      title: "Factuur gereed: reparatie schoolgebouw",
      description: "Rapport is goedgekeurd en kan gefactureerd worden.",
      customerId: customers.hofvijver,
      objectId: objects.school,
      status: "invoice_ready",
      priority: "normal",
      date: dateKey(-3),
      start: "14:00",
      end: "16:00",
      taskCodeIds: [taskIds.techniek],
      assignedPersonnelIds: [personnelIds.nour],
    }),
    invoiced: await createAssignment(client, {
      title: "Gefactureerd: glasbewassing residence",
      description: "Factuur verzonden en betaling staat nog open.",
      customerId: customers.staten,
      objectId: objects.statenGarage,
      status: "invoiced",
      priority: "normal",
      date: dateKey(-10),
      start: "07:30",
      end: "10:00",
      taskCodeIds: [taskIds.glas],
      assignedPersonnelIds: [personnelIds.pieter],
    }),
    paid: await createAssignment(client, {
      title: "Betaald: calamiteitenreiniging distributiehal",
      description: "Volledige keten afgerond tot betaalde factuur.",
      customerId: customers.binck,
      objectId: objects.binckDock,
      status: "paid",
      priority: "urgent",
      date: dateKey(-16),
      start: "13:00",
      end: "16:00",
      taskCodeIds: [taskIds.calamiteit],
      assignedPersonnelIds: [personnelIds.farid],
    }),
  };

  await createQuote(client, assignments.quoteSent, customers.staten, "sent", 720, 14);
  await createQuote(client, assignments.approved, customers.zuiderstrand, "approved", 285, 21);
  await createQuote(client, assignments.review, customers.noordeinde, "draft", 1280, 30);
  await createQuote(client, assignments.paid, customers.binck, "approved", 615, -2);

  await createReport(client, assignments.submitted, "submitted", 2.25, "Sanitair en wachtruimte zijn gereinigd; twee dispensers waren leeg.");
  await createReport(client, assignments.invoiceReady, "approved", 2.0, "Deurdranger hersteld, losse plint vastgezet en noodverlichting gecontroleerd.");
  await createReport(client, assignments.invoiced, "approved", 2.5, "Glasbewassing uitgevoerd; bewoner heeft toegang tot dakrand bevestigd.");
  await createReport(client, assignments.paid, "approved", 3.25, "Waterlekkage gereinigd, droogloopmatten vervangen en fotolog toegevoegd.");

  await client.query(
    `insert into assignment_extra_work (assignment_id, task_code_id, task_code_name, description, hours, price, created_by)
     values ($1, $2, 'Extra droogloopmatten vervangen', $3, '0.75', '95.00', $4)`,
    [
      assignments.paid,
      taskIds.calamiteit,
      `${SEED_MARKER}: Meerwerk voor logistieke hal na lekkage.`,
      actorId(),
    ],
  );
  await client.query(
    `insert into assignment_photos (assignment_id, storage_path, uploaded_by, is_approved)
     values ($1, $2, $3, true), ($1, $4, $3, false)`,
    [
      assignments.paid,
      "staging-demo/photos/binckhorst-lekkage-voor.jpg",
      actorId(),
      "staging-demo/photos/binckhorst-lekkage-na.jpg",
    ],
  );

  const openInvoice = await createInvoice(client, assignments.invoiced, customers.staten, "sent", 720, -3);
  const paidInvoice = await createInvoice(client, assignments.paid, customers.binck, "paid", 615, -5, -1);
  const draftInvoice = await createInvoice(client, assignments.invoiceReady, customers.hofvijver, "draft", 210, 21);
  await createPayment(client, openInvoice, 87120, "open");
  await createPayment(client, paidInvoice, 74415, "paid");
  await createPayment(client, draftInvoice, 25410, "expired");

  await createDocument(client, "customer", customers.hofjes, "Serviceafspraken Haagse Hofjes", "haagse-hofjes-serviceafspraken.pdf");
  await createDocument(client, "object", objects.statenGarage, "VvE sleutelprotocol", "residence-statenkwartier-sleutelprotocol.pdf");
  await createDocument(client, "assignment", assignments.paid, "Fotolog calamiteitenreiniging", "binckhorst-calamiteit-fotolog.pdf");
  await createDocument(client, "personnel", personnelIds.farid, "Certificaat hoogwerker Farid", "farid-hoogwerker-certificaat.pdf");
  await createDocument(client, "general", null, "Staging demo testplan", "staging-demo-testplan.pdf", 96000);

  await createAudit(client, "seed", "staging_demo", null, "Den Haag demo dataset aangemaakt");
  await createAudit(client, "update", "assignments", assignments.scheduledTeam, "Teamplanning demo");
  await createAudit(client, "approve", "reports", assignments.invoiceReady, "Rapport goedgekeurd demo");
  await createAudit(client, "send", "invoices", openInvoice, "Factuur verzonden demo");

  return {
    customers: Object.keys(customers).length,
    objects: Object.keys(objects).length,
    personnel: Object.keys(personnelIds).length,
    assignments: Object.keys(assignments).length,
  };
}

async function main() {
  requireStagingSafety();

  const dryRun = process.argv.includes("--dry-run");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await resolveSeedActor(client);
    await cleanupDemoData(client);
    const summary = await seedDemoData(client);

    if (dryRun) {
      await client.query("rollback");
      console.log("Staging demo seed dry-run complete; transaction rolled back.");
    } else {
      await client.query("commit");
      console.log("Staging demo seed complete.");
    }

    console.log(`  Customers:   ${summary.customers}`);
    console.log(`  Objects:     ${summary.objects}`);
    console.log(`  Personnel:   ${summary.personnel}`);
    console.log(`  Assignments: ${summary.assignments}`);
    console.log(`  Marker:      ${SEED_MARKER}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Staging demo seed failed:");
  console.error(error);
  process.exit(1);
});
