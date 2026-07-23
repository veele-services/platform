import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  DEFAULT_CONTACT_FORM_FIELDS,
  WEBSITE_FORM_SUBMISSION_STATUSES,
  validateWebsiteFormSubmissionData,
  websiteFormDraftSchema,
  websiteFormSourceSchema,
  websitePublicationFormSchema,
  type WebsiteFormDraft,
  type WebsiteFormSource,
  type WebsiteFormSubmissionData,
  type WebsiteFormSubmissionStatus,
} from "@workspace/website-core/forms";
import { pool } from "./connection";
import { resolveWebsiteDeliveryByHost } from "./website-public-runtime";

export type {
  WebsiteFormDraft,
  WebsiteFormField,
  WebsiteFormKind,
  WebsiteFormStatus,
  WebsiteFormSubmissionData,
  WebsiteFormSubmissionStatus,
} from "@workspace/website-core/forms";

type Queryable = Pick<PoolClient, "query">;
type DeliveryMode = "managed_cms" | "custom_nextjs";

const uuidSchema = z.string().uuid();
const adminScopeSchema = z
  .object({
    tenantId: uuidSchema,
    actorUserId: uuidSchema,
  })
  .strict();
const siteMutationSchema = adminScopeSchema
  .extend({
    siteId: uuidSchema,
    expectedAuthoringRevision: z.number().int().positive(),
  })
  .strict();
const createFormSchema = siteMutationSchema
  .extend({ form: websiteFormDraftSchema })
  .strict();
const updateFormSchema = siteMutationSchema
  .extend({
    formId: uuidSchema,
    expectedFormRevision: z.number().int().positive(),
    form: websiteFormDraftSchema,
  })
  .strict();
const transitionSubmissionSchema = adminScopeSchema
  .extend({
    submissionId: uuidSchema,
    status: z.enum(["read", "in_progress", "archived", "spam"] as const),
  })
  .strict();
const submissionCommandSchema = adminScopeSchema
  .extend({ submissionId: uuidSchema })
  .strict();
const publicSubmissionSchema = z
  .object({
    host: z.string().trim().min(1).max(512),
    formId: uuidSchema,
    data: z.unknown(),
    idempotencyKey: z
      .string()
      .trim()
      .min(16)
      .max(200)
      .regex(/^[A-Za-z0-9._:@+-]+$/u)
      .optional(),
    networkSignal: z.string().trim().min(1).max(512),
    userAgent: z.string().trim().max(512).default(""),
    honeypot: z.string().max(200).default(""),
  })
  .strict();

const HASH_SECRET_ENV = "WEBSITE_FORM_HASH_SECRET";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;

export class PublicWebsiteFormError extends Error {
  readonly statusCode: 400 | 404 | 409 | 413 | 429 | 503;
  readonly publicCode:
    | "invalid"
    | "not_found"
    | "conflict"
    | "too_large"
    | "throttled"
    | "unavailable";

  constructor(
    statusCode: PublicWebsiteFormError["statusCode"],
    publicCode: PublicWebsiteFormError["publicCode"],
    message: string,
  ) {
    super(message);
    this.name = "PublicWebsiteFormError";
    this.statusCode = statusCode;
    this.publicCode = publicCode;
  }
}

export type WebsiteFormsView = {
  siteId: string;
  siteName: string;
  defaultLocale: string;
  deliveryMode: DeliveryMode;
  authoringRevision: number;
  forms: Array<
    WebsiteFormDraft & {
      id: string;
      authoringRevision: number;
      createdAt: string;
      updatedAt: string;
    }
  >;
};

export type WebsiteSubmissionListItem = {
  id: string;
  formId: string;
  formName: string;
  formKind: WebsiteFormSource["kind"];
  status: WebsiteFormSubmissionStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notificationStatus: string;
  customerId: string | null;
  isRedacted: boolean;
  receivedAt: string;
  updatedAt: string;
};

export type WebsiteSubmissionsView = {
  siteId: string;
  siteName: string;
  submissions: WebsiteSubmissionListItem[];
};

export type WebsiteSubmissionDetail = WebsiteSubmissionListItem & {
  siteId: string;
  formKey: string;
  payload: WebsiteFormSubmissionData;
  sourceHostname: string;
  retentionUntil: string;
  convertedAt: string | null;
  events: Array<{
    id: string;
    eventType: string;
    actorUserId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type PublicWebsiteSubmissionResult = {
  accepted: true;
  reference: string;
  replayed: boolean;
};

type FormRow = {
  id: string;
  key: string;
  locale: string;
  kind: WebsiteFormSource["kind"];
  name: string;
  fields: unknown;
  submit_label: string;
  success_message: string;
  notification_email: string | null;
  status: WebsiteFormSource["status"];
  authoring_revision: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function requireOne<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

function asIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function inTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function requireHashSecret(): string {
  const secret = process.env[HASH_SECRET_ENV]?.trim();
  if (!secret || secret.length < 32) {
    throw new PublicWebsiteFormError(
      503,
      "unavailable",
      `${HASH_SECRET_ENV} must contain at least 32 characters`,
    );
  }
  return secret;
}

function hmac(secret: string, namespace: string, value: string): string {
  return createHmac("sha256", secret)
    .update(`fieldgrid:${namespace}:v1\n`)
    .update(value)
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cleanError(error: unknown): string {
  return String(
    error instanceof Error ? error.message : "Onbekende notificatiefout",
  )
    .replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
    .replace(
      /(?:key|token|secret|password)\s*[:=]\s*\S+/giu,
      "credential=[redacted]",
    )
    .slice(0, 500);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formSourceFromRow(row: FormRow): WebsiteFormSource {
  return websiteFormSourceSchema.parse({
    id: row.id,
    key: row.key,
    locale: row.locale,
    kind: row.kind,
    name: row.name,
    fields: row.fields,
    submitLabel: row.submit_label,
    successMessage: row.success_message,
    status: row.status,
  });
}

export async function loadWebsiteFormSource(
  query: Queryable,
  tenantId: string,
  siteId: string,
): Promise<WebsiteFormSource[]> {
  const result = await query.query<FormRow>(
    `SELECT id, key, locale, kind, name, fields, submit_label,
            success_message, notification_email, status,
            authoring_revision, created_at, updated_at
     FROM public.website_forms
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY locale, key, id`,
    [tenantId, siteId],
  );
  return result.rows.map(formSourceFromRow);
}

function formDraftFromRow(row: FormRow): WebsiteFormDraft {
  return websiteFormDraftSchema.parse({
    key: row.key,
    locale: row.locale,
    kind: row.kind,
    name: row.name,
    fields: row.fields,
    submitLabel: row.submit_label,
    successMessage: row.success_message,
    notificationEmail: row.notification_email,
    status: row.status,
  });
}

export async function getWebsiteForms(
  tenantId: string,
): Promise<WebsiteFormsView | null> {
  uuidSchema.parse(tenantId);
  const siteResult = await pool.query<{
    id: string;
    name: string;
    default_locale: string;
    delivery_mode: DeliveryMode;
    authoring_revision: number;
  }>(
    `SELECT id, name, default_locale, delivery_mode, authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND status <> 'disabled'
     ORDER BY is_primary DESC, created_at
     LIMIT 1`,
    [tenantId],
  );
  const site = siteResult.rows[0];
  if (!site) return null;
  const result = await pool.query<FormRow>(
    `SELECT id, key, locale, kind, name, fields, submit_label,
            success_message, notification_email, status,
            authoring_revision, created_at, updated_at
     FROM public.website_forms
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY locale, status, name, id`,
    [tenantId, site.id],
  );
  return {
    siteId: site.id,
    siteName: site.name,
    defaultLocale: site.default_locale,
    deliveryMode: site.delivery_mode,
    authoringRevision: Number(site.authoring_revision),
    forms: result.rows.map((row) => ({
      ...formDraftFromRow(row),
      id: row.id,
      authoringRevision: Number(row.authoring_revision),
      createdAt: asIsoString(row.created_at),
      updatedAt: asIsoString(row.updated_at),
    })),
  };
}

async function lockWebsiteSite(
  client: PoolClient,
  input: z.infer<typeof siteMutationSchema>,
): Promise<void> {
  const result = await client.query<{
    authoring_revision: number;
    tenant_active: boolean;
    tenant_status: string;
    module_enabled: boolean;
  }>(
    `SELECT site.authoring_revision,
            tenant.is_active AS tenant_active,
            tenant.status AS tenant_status,
            EXISTS (
              SELECT 1
              FROM public.tenant_modules entitlement
              JOIN public.modules module ON module.id = entitlement.module_id
              WHERE entitlement.tenant_id = site.tenant_id
                AND module.key = 'website'
                AND entitlement.is_enabled = true
            ) AS module_enabled
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE site.tenant_id = $1
       AND site.id = $2
       AND site.status <> 'disabled'
     FOR UPDATE OF site`,
    [input.tenantId, input.siteId],
  );
  const site = requireOne(result.rows, "Website niet gevonden");
  if (
    !site.tenant_active ||
    !["trial", "active"].includes(site.tenant_status) ||
    !site.module_enabled
  ) {
    throw new Error("De website-module is niet actief");
  }
  if (Number(site.authoring_revision) !== input.expectedAuthoringRevision) {
    throw new Error(
      "Website is intussen gewijzigd. Laad de formulieren opnieuw.",
    );
  }
}

async function currentSiteRevision(
  client: PoolClient,
  tenantId: string,
  siteId: string,
): Promise<number> {
  const result = await client.query<{ authoring_revision: number }>(
    `SELECT authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, siteId],
  );
  return Number(
    requireOne(result.rows, "Website niet gevonden").authoring_revision,
  );
}

export async function createWebsiteForm(
  rawInput: z.input<typeof createFormSchema>,
): Promise<{
  id: string;
  formAuthoringRevision: number;
  siteAuthoringRevision: number;
}> {
  const input = createFormSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockWebsiteSite(client, input);
    const form = input.form;
    const result = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `INSERT INTO public.website_forms (
         tenant_id, site_id, key, locale, kind, name, fields, submit_label,
         success_message, notification_email, status, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $12
       )
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        form.key,
        form.locale,
        form.kind,
        form.name,
        JSON.stringify(form.fields),
        form.submitLabel,
        form.successMessage,
        form.notificationEmail,
        form.status,
        input.actorUserId,
      ],
    );
    const created = requireOne(
      result.rows,
      "Formulier kon niet worden aangemaakt",
    );
    const siteAuthoringRevision = await currentSiteRevision(
      client,
      input.tenantId,
      input.siteId,
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_form_created', 'website_forms', $3,
         jsonb_build_object(
           'siteId', $4::text,
           'key', $5::text,
           'status', $6::text,
           'siteRevision', $7::integer
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        created.id,
        input.siteId,
        form.key,
        form.status,
        siteAuthoringRevision,
      ],
    );
    return {
      id: created.id,
      formAuthoringRevision: Number(created.authoring_revision),
      siteAuthoringRevision,
    };
  });
}

export async function updateWebsiteForm(
  rawInput: z.input<typeof updateFormSchema>,
): Promise<{
  formAuthoringRevision: number;
  siteAuthoringRevision: number;
}> {
  const input = updateFormSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockWebsiteSite(client, input);
    const form = input.form;
    const result = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_forms
       SET key = $6,
           locale = $7,
           kind = $8,
           name = $9,
           fields = $10::jsonb,
           submit_label = $11,
           success_message = $12,
           notification_email = $13,
           status = $14,
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1
         AND site_id = $2
         AND id = $3
         AND authoring_revision = $4
       RETURNING authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.formId,
        input.expectedFormRevision,
        input.actorUserId,
        form.key,
        form.locale,
        form.kind,
        form.name,
        JSON.stringify(form.fields),
        form.submitLabel,
        form.successMessage,
        form.notificationEmail,
        form.status,
      ],
    );
    const updated = requireOne(
      result.rows,
      "Formulier is intussen gewijzigd. Laad de pagina opnieuw.",
    );
    const siteAuthoringRevision = await currentSiteRevision(
      client,
      input.tenantId,
      input.siteId,
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_form_updated', 'website_forms', $3,
         jsonb_build_object(
           'fromRevision', $4::integer,
           'toRevision', $5::integer,
           'status', $6::text,
           'siteRevision', $7::integer
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.formId,
        input.expectedFormRevision,
        Number(updated.authoring_revision),
        form.status,
        siteAuthoringRevision,
      ],
    );
    return {
      formAuthoringRevision: Number(updated.authoring_revision),
      siteAuthoringRevision,
    };
  });
}

export async function createDefaultWebsiteContactForm(
  query: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    locale: string;
    notificationEmail: string | null;
    actorUserId: string;
  },
): Promise<string> {
  const parsed = z
    .object({
      tenantId: uuidSchema,
      siteId: uuidSchema,
      locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
      notificationEmail: z.string().email().max(254).nullable(),
      actorUserId: uuidSchema,
    })
    .strict()
    .parse(input);
  const result = await query.query<{ id: string }>(
    `INSERT INTO public.website_forms (
       tenant_id, site_id, key, locale, kind, name, fields, submit_label,
       success_message, notification_email, status, created_by, updated_by
     ) VALUES (
       $1, $2, 'contact', $3, 'contact', 'Contactformulier', $4::jsonb,
       'Versturen', 'Bedankt. We nemen zo snel mogelijk contact met u op.',
       $5, 'published', $6, $6
     )
     RETURNING id`,
    [
      parsed.tenantId,
      parsed.siteId,
      parsed.locale,
      JSON.stringify(DEFAULT_CONTACT_FORM_FIELDS),
      parsed.notificationEmail,
      parsed.actorUserId,
    ],
  );
  return requireOne(result.rows, "Standaardformulier kon niet worden gemaakt")
    .id;
}

async function consumeRateLimit(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    formId: string;
    requestFingerprint: string;
    now: Date;
  },
): Promise<void> {
  const windowStartMs =
    Math.floor(input.now.getTime() / RATE_LIMIT_WINDOW_MS) *
    RATE_LIMIT_WINDOW_MS;
  const windowStartedAt = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + RATE_LIMIT_WINDOW_MS * 2);
  await client.query(
    `DELETE FROM public.website_form_rate_limits
     WHERE tenant_id = $1
       AND site_id = $2
       AND form_id = $3
       AND expires_at < $4`,
    [input.tenantId, input.siteId, input.formId, input.now],
  );
  const result = await client.query<{ request_count: number }>(
    `INSERT INTO public.website_form_rate_limits (
       tenant_id, site_id, form_id, request_fingerprint,
       window_started_at, request_count, expires_at
     ) VALUES ($1, $2, $3, $4, $5, 1, $6)
     ON CONFLICT (
       tenant_id, form_id, request_fingerprint, window_started_at
     ) DO UPDATE
       SET request_count =
             public.website_form_rate_limits.request_count + 1,
           updated_at = now()
     RETURNING request_count`,
    [
      input.tenantId,
      input.siteId,
      input.formId,
      input.requestFingerprint,
      windowStartedAt,
      expiresAt,
    ],
  );
  const count = Number(
    requireOne(result.rows, "Rate-limit kon niet worden bijgewerkt")
      .request_count,
  );
  if (count > RATE_LIMIT_MAX) {
    throw new PublicWebsiteFormError(
      429,
      "throttled",
      "Te veel formulierverzoeken",
    );
  }
}

export async function submitPublicWebsiteForm(
  rawInput: z.input<typeof publicSubmissionSchema>,
): Promise<PublicWebsiteSubmissionResult> {
  let input: z.output<typeof publicSubmissionSchema>;
  try {
    input = publicSubmissionSchema.parse(rawInput);
  } catch {
    throw new PublicWebsiteFormError(
      400,
      "invalid",
      "Ongeldige formulierinzending",
    );
  }
  const resolution = await resolveWebsiteDeliveryByHost(input.host);
  if (resolution.status !== "ready") {
    throw new PublicWebsiteFormError(
      resolution.status === "not_found" ? 404 : 503,
      resolution.status === "not_found" ? "not_found" : "unavailable",
      "Websiteformulier niet beschikbaar",
    );
  }
  const { tenantId, siteId, requestHostname } = resolution.website;
  const formResult = await pool.query<FormRow>(
    `SELECT id, key, locale, kind, name, fields, submit_label,
            success_message, notification_email, status,
            authoring_revision, created_at, updated_at
     FROM public.website_forms
     WHERE tenant_id = $1
       AND site_id = $2
       AND id = $3
     LIMIT 1`,
    [tenantId, siteId, input.formId],
  );
  const formRow = formResult.rows[0];
  if (
    !formRow ||
    (resolution.deliveryMode === "custom_nextjs" &&
      formRow.status !== "published")
  ) {
    throw new PublicWebsiteFormError(
      404,
      "not_found",
      "Websiteformulier niet beschikbaar",
    );
  }
  const form =
    resolution.deliveryMode === "managed_cms"
      ? (resolution.website.snapshot.forms.find(
          (candidate) => candidate.id === input.formId,
        ) ?? null)
      : (() => {
          const { status: _status, ...publicForm } = formSourceFromRow(formRow);
          return websitePublicationFormSchema.parse(publicForm);
        })();
  if (!form) {
    throw new PublicWebsiteFormError(
      404,
      "not_found",
      "Websiteformulier niet beschikbaar",
    );
  }

  const secret = requireHashSecret();
  const requestFingerprint = hmac(
    secret,
    "website-form-request",
    [tenantId, siteId, input.formId, input.networkSignal, input.userAgent].join(
      "\n",
    ),
  );
  const now = new Date();

  if (input.honeypot.trim()) {
    await inTransaction((client) =>
      consumeRateLimit(client, {
        tenantId,
        siteId,
        formId: input.formId,
        requestFingerprint,
        now,
      }),
    );
    return { accepted: true, reference: randomUUID(), replayed: false };
  }

  let data: WebsiteFormSubmissionData;
  try {
    data = validateWebsiteFormSubmissionData(form, input.data);
  } catch {
    throw new PublicWebsiteFormError(
      400,
      "invalid",
      "Controleer de ingevulde velden",
    );
  }

  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const idempotencyHash = hmac(
    secret,
    "website-form-idempotency",
    `${tenantId}\n${input.formId}\n${idempotencyKey}`,
  );
  const canonicalPayload = stableJson(data);
  const payloadHash = hmac(
    secret,
    "website-form-payload",
    `${tenantId}\n${input.formId}\n${canonicalPayload}`,
  );

  const stored = await inTransaction(async (client) => {
    await consumeRateLimit(client, {
      tenantId,
      siteId,
      formId: input.formId,
      requestFingerprint,
      now,
    });
    const existingResult = await client.query<{
      id: string;
      payload_hash: string;
    }>(
      `SELECT id, payload_hash
       FROM public.website_form_submissions
       WHERE tenant_id = $1
         AND form_id = $2
         AND idempotency_hash = $3
       FOR UPDATE`,
      [tenantId, input.formId, idempotencyHash],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (!constantTimeEqual(existing.payload_hash, payloadHash)) {
        throw new PublicWebsiteFormError(
          409,
          "conflict",
          "De idempotentiesleutel hoort bij een andere inzending",
        );
      }
      return { id: existing.id, replayed: true };
    }

    const insertedResult = await client.query<{ id: string }>(
      `INSERT INTO public.website_form_submissions (
         tenant_id, site_id, form_id, payload, payload_hash,
         idempotency_hash, request_fingerprint, source_hostname,
         contact_name, contact_email, contact_phone
       ) VALUES (
         $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11
       )
       ON CONFLICT (tenant_id, form_id, idempotency_hash) DO NOTHING
       RETURNING id`,
      [
        tenantId,
        siteId,
        input.formId,
        canonicalPayload,
        payloadHash,
        idempotencyHash,
        requestFingerprint,
        requestHostname,
        data.name ?? null,
        data.email ?? null,
        data.phone ?? null,
      ],
    );
    const inserted = insertedResult.rows[0];
    if (!inserted) {
      const racedResult = await client.query<{
        id: string;
        payload_hash: string;
      }>(
        `SELECT id, payload_hash
         FROM public.website_form_submissions
         WHERE tenant_id = $1
           AND form_id = $2
           AND idempotency_hash = $3
         FOR UPDATE`,
        [tenantId, input.formId, idempotencyHash],
      );
      const raced = requireOne(
        racedResult.rows,
        "Inzending kon niet idempotent worden gelezen",
      );
      if (!constantTimeEqual(raced.payload_hash, payloadHash)) {
        throw new PublicWebsiteFormError(
          409,
          "conflict",
          "De idempotentiesleutel hoort bij een andere inzending",
        );
      }
      return { id: raced.id, replayed: true };
    }
    await client.query(
      `INSERT INTO public.website_form_submission_events (
         tenant_id, site_id, submission_id, event_type, metadata
       ) VALUES (
         $1, $2, $3, 'received',
         jsonb_build_object('formId', $4::text, 'hostname', $5::text)
       )`,
      [tenantId, siteId, inserted.id, input.formId, requestHostname],
    );
    return { id: inserted.id, replayed: false };
  });

  if (!stored.replayed) {
    await deliverWebsiteSubmissionNotification(stored.id).catch(
      () => undefined,
    );
  }
  return { accepted: true, reference: stored.id, replayed: stored.replayed };
}

type NotificationClaim = {
  id: string;
  tenant_id: string;
  site_id: string;
  form_name: string;
  notification_email: string | null;
  payload: WebsiteFormSubmissionData;
  source_hostname: string;
  received_at: Date | string;
};

async function claimNotification(
  submissionId: string,
): Promise<NotificationClaim | null> {
  return inTransaction(async (client) => {
    const result = await client.query<NotificationClaim>(
      `UPDATE public.website_form_submissions submission
       SET notification_status = 'sending',
           notification_attempted_at = now(),
           notification_error = NULL,
           updated_at = now()
       FROM public.website_forms form
       WHERE submission.id = $1
         AND form.tenant_id = submission.tenant_id
         AND form.site_id = submission.site_id
         AND form.id = submission.form_id
         AND (
           submission.notification_status IN ('pending', 'failed')
           OR (
             submission.notification_status = 'sending'
             AND submission.notification_attempted_at <
                 now() - interval '10 minutes'
           )
         )
       RETURNING submission.id, submission.tenant_id, submission.site_id,
                 form.name AS form_name,
                 form.notification_email,
                 submission.payload,
                 submission.source_hostname,
                 submission.received_at`,
      [submissionId],
    );
    return result.rows[0] ?? null;
  });
}

function notificationContent(claim: NotificationClaim): {
  subject: string;
  text: string;
  html: string;
} {
  const entries = Object.entries(claim.payload).filter(
    ([, value]) => typeof value === "string" && value.length > 0,
  ) as Array<[string, string]>;
  const labels: Record<string, string> = {
    name: "Naam",
    email: "E-mailadres",
    phone: "Telefoonnummer",
    company: "Bedrijf",
    postalCode: "Postcode",
    subject: "Onderwerp",
    preferredDate: "Voorkeursdatum",
    message: "Bericht",
  };
  const subject = `Nieuwe website-inzending: ${claim.form_name}`.slice(0, 500);
  const text = [
    `Er is een nieuwe inzending ontvangen via ${claim.source_hostname}.`,
    "",
    ...entries.map(([key, value]) => `${labels[key] ?? key}: ${value}`),
    "",
    `Referentie: ${claim.id}`,
  ].join("\n");
  const html = [
    `<p>Er is een nieuwe inzending ontvangen via <strong>${escapeHtml(
      claim.source_hostname,
    )}</strong>.</p>`,
    "<dl>",
    ...entries.map(
      ([key, value]) =>
        `<dt><strong>${escapeHtml(labels[key] ?? key)}</strong></dt><dd>${escapeHtml(
          value,
        ).replaceAll("\n", "<br>")}</dd>`,
    ),
    "</dl>",
    `<p>Referentie: <code>${escapeHtml(claim.id)}</code></p>`,
  ].join("");
  return { subject, text, html };
}

export async function deliverWebsiteSubmissionNotification(
  submissionId: string,
): Promise<"sent" | "failed" | "skipped" | "unchanged"> {
  uuidSchema.parse(submissionId);
  const claim = await claimNotification(submissionId);
  if (!claim) return "unchanged";
  if (!claim.notification_email) {
    await inTransaction(async (client) => {
      await client.query(
        `UPDATE public.website_form_submissions
         SET notification_status = 'skipped',
             notification_error = 'Geen notificatieontvanger ingesteld',
             updated_at = now()
         WHERE id = $1 AND notification_status = 'sending'`,
        [claim.id],
      );
      await client.query(
        `INSERT INTO public.website_form_submission_events (
           tenant_id, site_id, submission_id, event_type, metadata
         ) VALUES ($1, $2, $3, 'notification_skipped', '{}'::jsonb)`,
        [claim.tenant_id, claim.site_id, claim.id],
      );
    });
    return "skipped";
  }

  const content = notificationContent(claim);
  const { sendTransactionalEmail } = await import("./email-service");
  const delivery = await sendTransactionalEmail({
    to: claim.notification_email,
    ...content,
    tenantId: claim.tenant_id,
    purpose: "website_form_submission",
    triggeredBy: claim.id,
    triggeredByType: "system",
    metadata: {
      submissionId: claim.id,
      siteId: claim.site_id,
      sourceHostname: claim.source_hostname,
    },
  });
  const status = delivery.success ? "sent" : "failed";
  const eventType = delivery.success
    ? "notification_sent"
    : "notification_failed";
  await inTransaction(async (client) => {
    await client.query(
      `UPDATE public.website_form_submissions
       SET notification_status = $2,
           notification_error = $3,
           updated_at = now()
       WHERE id = $1 AND notification_status = 'sending'`,
      [claim.id, status, delivery.success ? null : cleanError(delivery.error)],
    );
    await client.query(
      `INSERT INTO public.website_form_submission_events (
         tenant_id, site_id, submission_id, event_type, metadata
       ) VALUES (
         $1, $2, $3, $4,
         jsonb_build_object('provider', $5::text)
       )`,
      [
        claim.tenant_id,
        claim.site_id,
        claim.id,
        eventType,
        delivery.providerType,
      ],
    );
  });
  return status;
}

export async function getWebsiteSubmissions(
  tenantId: string,
  input?: { status?: WebsiteFormSubmissionStatus; limit?: number },
): Promise<WebsiteSubmissionsView | null> {
  uuidSchema.parse(tenantId);
  const status = input?.status
    ? z.enum(WEBSITE_FORM_SUBMISSION_STATUSES).parse(input.status)
    : null;
  const limit = z
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(input?.limit ?? 100);
  const siteResult = await pool.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM public.website_sites
     WHERE tenant_id = $1 AND status <> 'disabled'
     ORDER BY is_primary DESC, created_at
     LIMIT 1`,
    [tenantId],
  );
  const site = siteResult.rows[0];
  if (!site) return null;
  const result = await pool.query<{
    id: string;
    form_id: string;
    form_name: string;
    form_kind: WebsiteFormSource["kind"];
    status: WebsiteFormSubmissionStatus;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    notification_status: string;
    customer_id: string | null;
    is_redacted: boolean;
    received_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT submission.id, submission.form_id, form.name AS form_name,
            form.kind AS form_kind, submission.status,
            submission.contact_name, submission.contact_email,
            submission.contact_phone, submission.notification_status,
            submission.customer_id, submission.is_redacted,
            submission.received_at, submission.updated_at
     FROM public.website_form_submissions submission
     JOIN public.website_forms form
       ON form.tenant_id = submission.tenant_id
      AND form.site_id = submission.site_id
      AND form.id = submission.form_id
     WHERE submission.tenant_id = $1
       AND submission.site_id = $2
       AND ($3::text IS NULL OR submission.status = $3)
     ORDER BY submission.received_at DESC, submission.id DESC
     LIMIT $4`,
    [tenantId, site.id, status, limit],
  );
  return {
    siteId: site.id,
    siteName: site.name,
    submissions: result.rows.map((row) => ({
      id: row.id,
      formId: row.form_id,
      formName: row.form_name,
      formKind: row.form_kind,
      status: row.status,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      notificationStatus: row.notification_status,
      customerId: row.customer_id,
      isRedacted: row.is_redacted,
      receivedAt: asIsoString(row.received_at),
      updatedAt: asIsoString(row.updated_at),
    })),
  };
}

export async function getWebsiteSubmission(
  tenantId: string,
  submissionId: string,
): Promise<WebsiteSubmissionDetail | null> {
  uuidSchema.parse(tenantId);
  uuidSchema.parse(submissionId);
  const result = await pool.query<{
    id: string;
    site_id: string;
    form_id: string;
    form_name: string;
    form_key: string;
    form_kind: WebsiteFormSource["kind"];
    status: WebsiteFormSubmissionStatus;
    payload: WebsiteFormSubmissionData;
    source_hostname: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    notification_status: string;
    customer_id: string | null;
    converted_at: Date | string | null;
    retention_until: Date | string;
    is_redacted: boolean;
    received_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT submission.id, submission.site_id, submission.form_id,
            form.name AS form_name, form.key AS form_key,
            form.kind AS form_kind, submission.status, submission.payload,
            submission.source_hostname, submission.contact_name,
            submission.contact_email, submission.contact_phone,
            submission.notification_status, submission.customer_id,
            submission.converted_at, submission.retention_until,
            submission.is_redacted, submission.received_at,
            submission.updated_at
     FROM public.website_form_submissions submission
     JOIN public.website_forms form
       ON form.tenant_id = submission.tenant_id
      AND form.site_id = submission.site_id
      AND form.id = submission.form_id
     WHERE submission.tenant_id = $1 AND submission.id = $2
     LIMIT 1`,
    [tenantId, submissionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const events = await pool.query<{
    id: string;
    event_type: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date | string;
  }>(
    `SELECT id, event_type, actor_user_id, metadata, created_at
     FROM public.website_form_submission_events
     WHERE tenant_id = $1 AND submission_id = $2
     ORDER BY created_at, id`,
    [tenantId, submissionId],
  );
  return {
    id: row.id,
    siteId: row.site_id,
    formId: row.form_id,
    formName: row.form_name,
    formKey: row.form_key,
    formKind: row.form_kind,
    status: row.status,
    payload: row.payload,
    sourceHostname: row.source_hostname,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notificationStatus: row.notification_status,
    customerId: row.customer_id,
    convertedAt: row.converted_at ? asIsoString(row.converted_at) : null,
    retentionUntil: asIsoString(row.retention_until),
    isRedacted: row.is_redacted,
    receivedAt: asIsoString(row.received_at),
    updatedAt: asIsoString(row.updated_at),
    events: events.rows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      actorUserId: event.actor_user_id,
      metadata: event.metadata,
      createdAt: asIsoString(event.created_at),
    })),
  };
}

export async function transitionWebsiteSubmission(
  rawInput: z.input<typeof transitionSubmissionSchema>,
): Promise<{ status: WebsiteFormSubmissionStatus }> {
  const input = transitionSubmissionSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const result = await client.query<{
      site_id: string;
      status: WebsiteFormSubmissionStatus;
    }>(
      `UPDATE public.website_form_submissions
       SET status = $4,
           read_at = CASE
             WHEN $4 = 'read' AND read_at IS NULL THEN now()
             ELSE read_at
           END,
           read_by = CASE
             WHEN $4 = 'read' AND read_by IS NULL THEN $2
             ELSE read_by
           END,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $3
       RETURNING site_id, status`,
      [input.tenantId, input.actorUserId, input.submissionId, input.status],
    );
    const updated = requireOne(result.rows, "Inzending niet gevonden");
    await client.query(
      `INSERT INTO public.website_form_submission_events (
         tenant_id, site_id, submission_id, event_type, actor_user_id, metadata
       ) VALUES (
         $1, $2, $3,
         CASE WHEN $5 = 'read' THEN 'marked_read' ELSE 'status_changed' END,
         $4, jsonb_build_object('status', $5::text)
       )`,
      [
        input.tenantId,
        updated.site_id,
        input.submissionId,
        input.actorUserId,
        updated.status,
      ],
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_submission_status_changed',
         'website_submissions', $3,
         jsonb_build_object('status', $4::text)
       )`,
      [input.tenantId, input.actorUserId, input.submissionId, updated.status],
    );
    return { status: updated.status };
  });
}

export async function convertWebsiteSubmissionToLead(
  rawInput: z.input<typeof submissionCommandSchema>,
): Promise<{ customerId: string; created: boolean }> {
  const input = submissionCommandSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      site_id: string;
      status: WebsiteFormSubmissionStatus;
      payload: WebsiteFormSubmissionData;
      customer_id: string | null;
      is_redacted: boolean;
    }>(
      `SELECT id, site_id, status, payload, customer_id, is_redacted
       FROM public.website_form_submissions
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [input.tenantId, input.submissionId],
    );
    const submission = requireOne(result.rows, "Inzending niet gevonden");
    if (submission.customer_id) {
      return { customerId: submission.customer_id, created: false };
    }
    if (
      submission.is_redacted ||
      ["archived", "spam"].includes(submission.status)
    ) {
      throw new Error(
        "Een gearchiveerde, spam- of gewiste inzending kan niet worden geconverteerd.",
      );
    }
    const data = submission.payload;
    const customerName = (data.company ?? data.name ?? "").trim();
    if (!customerName) {
      throw new Error(
        "Voor leadconversie is een naam of bedrijfsnaam vereist.",
      );
    }
    if (data.email) {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id
         FROM public.customers
         WHERE tenant_id = $1 AND lower(contact_email) = lower($2)
         LIMIT 1`,
        [input.tenantId, data.email],
      );
      if (duplicate.rowCount) {
        throw new Error(
          "Er bestaat al een klant met dit e-mailadres. Koppel deze inzending handmatig om onbedoelde samenvoeging te voorkomen.",
        );
      }
    }
    const customerResult = await client.query<{ id: string }>(
      `INSERT INTO public.customers (
         tenant_id, name, contact_name, contact_email, contact_phone,
         postal_code, country, country_code, status, is_active, notes,
         created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'NL', 'NL', 'lead', true,
         $7, $8
       )
       RETURNING id`,
      [
        input.tenantId,
        customerName,
        data.name ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.postalCode ?? null,
        `Aangemaakt uit website-inzending ${submission.id}.`,
        input.actorUserId,
      ],
    );
    const customer = requireOne(
      customerResult.rows,
      "Lead kon niet worden aangemaakt",
    );
    await client.query(
      `UPDATE public.website_form_submissions
       SET status = 'converted',
           customer_id = $4,
           converted_at = now(),
           converted_by = $3,
           read_at = COALESCE(read_at, now()),
           read_by = COALESCE(read_by, $3),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.submissionId, input.actorUserId, customer.id],
    );
    await client.query(
      `INSERT INTO public.website_form_submission_events (
         tenant_id, site_id, submission_id, event_type, actor_user_id, metadata
       ) VALUES (
         $1, $2, $3, 'converted_to_lead', $4,
         jsonb_build_object('customerId', $5::text)
       )`,
      [
        input.tenantId,
        submission.site_id,
        input.submissionId,
        input.actorUserId,
        customer.id,
      ],
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_submission_converted_to_lead',
         'website_submissions', $3,
         jsonb_build_object('customerId', $4::text)
       )`,
      [input.tenantId, input.actorUserId, input.submissionId, customer.id],
    );
    return { customerId: customer.id, created: true };
  });
}

export async function retryWebsiteSubmissionNotification(
  rawInput: z.input<typeof submissionCommandSchema>,
): Promise<"sent" | "failed" | "skipped" | "unchanged"> {
  const input = submissionCommandSchema.parse(rawInput);
  const owned = await pool.query(
    `SELECT 1
     FROM public.website_form_submissions
     WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, input.submissionId],
  );
  if (!owned.rowCount) throw new Error("Inzending niet gevonden");
  const result = await deliverWebsiteSubmissionNotification(input.submissionId);
  await pool.query(
    `INSERT INTO public.audit_log (
       tenant_id, user_id, action, resource, resource_id, metadata
     ) VALUES (
       $1, $2, 'website_submission_notification_retried',
       'website_submissions', $3,
       jsonb_build_object('result', $4::text)
     )`,
    [input.tenantId, input.actorUserId, input.submissionId, result],
  );
  return result;
}

export async function redactWebsiteSubmission(
  rawInput: z.input<typeof submissionCommandSchema>,
): Promise<{ redacted: boolean }> {
  const input = submissionCommandSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const current = await client.query<{
      site_id: string;
      status: WebsiteFormSubmissionStatus;
      is_redacted: boolean;
    }>(
      `SELECT site_id, status, is_redacted
       FROM public.website_form_submissions
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [input.tenantId, input.submissionId],
    );
    const submission = requireOne(current.rows, "Inzending niet gevonden");
    if (submission.is_redacted) return { redacted: false };
    await client.query(
      `UPDATE public.website_form_submissions
       SET status = CASE
             WHEN status = 'archived' THEN status
             ELSE 'archived'
           END,
           payload = '{}'::jsonb,
           contact_name = NULL,
           contact_email = NULL,
           contact_phone = NULL,
           is_redacted = true,
           redacted_at = now(),
           redacted_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.submissionId, input.actorUserId],
    );
    await client.query(
      `INSERT INTO public.website_form_submission_events (
         tenant_id, site_id, submission_id, event_type, actor_user_id, metadata
       ) VALUES ($1, $2, $3, 'redacted', $4, '{}'::jsonb)`,
      [
        input.tenantId,
        submission.site_id,
        input.submissionId,
        input.actorUserId,
      ],
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_submission_redacted',
         'website_submissions', $3, '{}'::jsonb
       )`,
      [input.tenantId, input.actorUserId, input.submissionId],
    );
    return { redacted: true };
  });
}

export function hashWebsiteSubmissionPayloadForTest(
  secret: string,
  tenantId: string,
  formId: string,
  data: WebsiteFormSubmissionData,
): string {
  return hmac(
    secret,
    "website-form-payload",
    `${tenantId}\n${formId}\n${stableJson(data)}`,
  );
}

export function websiteSubmissionPayloadDigest(data: unknown): string {
  return createHash("sha256").update(stableJson(data)).digest("hex");
}
