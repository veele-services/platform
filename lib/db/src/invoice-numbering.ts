import type { PoolClient } from "pg";
import { pool } from "./connection";
import {
  formatInvoiceNumber,
  getInvoiceNumberPeriodKey,
  previewInvoiceNumber,
  validateInvoiceNumberingConfig,
  type InvoiceNumberResetPeriod,
  type InvoiceNumberingConfig,
  type InvoiceNumberPreview,
} from "./invoice-number-formatting";
import type { InvoiceNumberDocumentType } from "./schema/invoices";

type Queryable = Pick<PoolClient, "query">;

type DbInvoiceNumberingSettings = InvoiceNumberingConfig & {
  id: string;
  tenantId: string;
  documentType: InvoiceNumberDocumentType;
  defaultStartNumber: number;
  resetPeriod: InvoiceNumberResetPeriod;
};

export type ClaimedInvoiceNumber = InvoiceNumberPreview & {
  invoiceId: string;
  tenantId: string;
  numberingSettingsId: string;
  alreadyClaimed: boolean;
};

export type ClaimOfficialInvoiceNumberInput = {
  invoiceId: string;
  tenantId: string;
  invoiceDate?: Date | string;
  documentType?: Extract<InvoiceNumberDocumentType, "invoice" | "credit_note">;
};

const DEFAULT_NUMBERING_BY_DOCUMENT_TYPE: Record<InvoiceNumberDocumentType, {
  prefix: string;
  format: string;
  resetPeriod: InvoiceNumberResetPeriod;
}> = {
  invoice: { prefix: "FAK", format: "{PREFIX}-{YYYY}-{NUMBER}", resetPeriod: "yearly" },
  credit_note: { prefix: "CRD", format: "{PREFIX}-{YYYY}-{NUMBER}", resetPeriod: "yearly" },
  invoice_collection: { prefix: "VZF", format: "{PREFIX}-{YYYY}-{NUMBER}", resetPeriod: "yearly" },
};

function rowToSettings(row: {
  id: string;
  tenant_id: string;
  document_type?: string | null;
  prefix: string;
  format: string;
  number_padding: number;
  reset_period: string;
  default_start_number: number;
}): DbInvoiceNumberingSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    documentType: (row.document_type ?? "invoice") as InvoiceNumberDocumentType,
    prefix: row.prefix,
    format: row.format,
    numberPadding: row.number_padding,
    resetPeriod: row.reset_period as InvoiceNumberResetPeriod,
    defaultStartNumber: row.default_start_number,
  };
}

async function ensureActiveNumberingSettings(
  client: Queryable,
  tenantId: string,
  documentType: InvoiceNumberDocumentType = "invoice",
): Promise<DbInvoiceNumberingSettings> {
  const existing = await client.query<{
    id: string;
    tenant_id: string;
    document_type: string;
    prefix: string;
    format: string;
    number_padding: number;
    reset_period: string;
    default_start_number: number;
  }>(
    `
      SELECT id, tenant_id, document_type, prefix, format, number_padding, reset_period, default_start_number
      FROM public.invoice_numbering_settings
      WHERE tenant_id = $1 AND document_type = $2 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [tenantId, documentType],
  );

  if (existing.rows[0]) return rowToSettings(existing.rows[0]);

  const defaults = DEFAULT_NUMBERING_BY_DOCUMENT_TYPE[documentType];
  const created = await client.query<{
    id: string;
    tenant_id: string;
    document_type: string;
    prefix: string;
    format: string;
    number_padding: number;
    reset_period: string;
    default_start_number: number;
  }>(
    `
      INSERT INTO public.invoice_numbering_settings (
        tenant_id, document_type, prefix, format, separator, number_padding, reset_period, default_start_number, is_active
      )
      VALUES ($1, $2, $3, $4, '-', 4, $5, 1, true)
      RETURNING id, tenant_id, document_type, prefix, format, number_padding, reset_period, default_start_number
    `,
    [tenantId, documentType, defaults.prefix, defaults.format, defaults.resetPeriod],
  );

  if (!created.rows[0]) {
    throw new Error("Factuurnummerinstellingen konden niet worden aangemaakt.");
  }
  return rowToSettings(created.rows[0]);
}

export async function previewNextOfficialInvoiceNumber(
  tenantId: string,
  invoiceDate: Date | string = new Date(),
  queryable: Queryable = pool,
  documentType: InvoiceNumberDocumentType = "invoice",
): Promise<InvoiceNumberPreview> {
  const settings = await ensureActiveNumberingSettings(queryable, tenantId, documentType);
  const validation = validateInvoiceNumberingConfig(settings);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const periodKey = getInvoiceNumberPeriodKey(settings.resetPeriod, invoiceDate);
  const sequence = await queryable.query<{ next_number: number }>(
    `
      SELECT next_number
      FROM public.invoice_number_sequences
      WHERE tenant_id = $1
        AND numbering_settings_id = $2
        AND document_type = $3
        AND period_key = $4
      LIMIT 1
    `,
    [tenantId, settings.id, documentType, periodKey],
  );

  return previewInvoiceNumber(settings, sequence.rows[0]?.next_number ?? settings.defaultStartNumber, invoiceDate);
}

export async function claimOfficialInvoiceNumberInTransaction(
  client: Queryable,
  input: ClaimOfficialInvoiceNumberInput,
): Promise<ClaimedInvoiceNumber> {
  const requestedDocumentType = input.documentType ?? "invoice";
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 710201)", [
    `${input.tenantId}:${requestedDocumentType}`,
  ]);

  const invoiceResult = await client.query<{
    id: string;
    tenant_id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    status: string;
    type: string | null;
  }>(
    `
      SELECT id, tenant_id, invoice_number, invoice_date, status, type
      FROM public.invoices
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE
    `,
    [input.invoiceId, input.tenantId],
  );

  const invoice = invoiceResult.rows[0];
  if (!invoice) throw new Error("Factuur niet gevonden voor deze tenant.");
  if (invoice.status === "cancelled") throw new Error("Geannuleerde facturen krijgen geen factuurnummer.");
  const documentType = requestedDocumentType === "credit_note" || invoice.type === "credit_note" ? "credit_note" : "invoice";

  const settings = await ensureActiveNumberingSettings(client, input.tenantId, documentType);
  const validation = validateInvoiceNumberingConfig(settings);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const invoiceDate = input.invoiceDate ?? invoice.invoice_date ?? new Date();
  const periodKey = getInvoiceNumberPeriodKey(settings.resetPeriod, invoiceDate);

  if (invoice.invoice_number?.trim()) {
    return {
      invoiceId: invoice.id,
      tenantId: invoice.tenant_id,
      numberingSettingsId: settings.id,
      invoiceNumber: invoice.invoice_number,
      sequenceValue: 0,
      periodKey,
      alreadyClaimed: true,
    };
  }

  await client.query(
    `
      INSERT INTO public.invoice_number_sequences (
        tenant_id, numbering_settings_id, document_type, period_key, next_number
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, numbering_settings_id, document_type, period_key) DO NOTHING
    `,
    [input.tenantId, settings.id, documentType, periodKey, settings.defaultStartNumber],
  );

  const sequenceResult = await client.query<{
    id: string;
    next_number: number;
  }>(
    `
      SELECT id, next_number
      FROM public.invoice_number_sequences
      WHERE tenant_id = $1
        AND numbering_settings_id = $2
        AND document_type = $3
        AND period_key = $4
      FOR UPDATE
    `,
    [input.tenantId, settings.id, documentType, periodKey],
  );

  const sequence = sequenceResult.rows[0];
  if (!sequence) throw new Error("Factuurnummersequence kon niet worden geladen.");

  const sequenceValue = sequence.next_number;
  const invoiceNumber = formatInvoiceNumber(settings, sequenceValue, invoiceDate);

  await client.query(
    `
      UPDATE public.invoice_number_sequences
      SET next_number = next_number + 1,
          updated_at = now()
      WHERE id = $1
    `,
    [sequence.id],
  );

  await client.query(
    `
      UPDATE public.invoices
      SET invoice_number = $1,
          invoice_numbering_settings_id = $2,
          invoice_number_period_key = $3,
          invoice_number_sequence_value = $4,
          invoice_date = COALESCE(invoice_date, $5::date),
          updated_at = now()
      WHERE id = $6 AND tenant_id = $7
    `,
    [
      invoiceNumber,
      settings.id,
      periodKey,
      sequenceValue,
      typeof invoiceDate === "string" ? invoiceDate.slice(0, 10) : invoiceDate.toISOString().slice(0, 10),
      input.invoiceId,
      input.tenantId,
    ],
  );

  return {
    invoiceId: input.invoiceId,
    tenantId: input.tenantId,
    numberingSettingsId: settings.id,
    invoiceNumber,
    sequenceValue,
    periodKey,
    alreadyClaimed: false,
  };
}

export type ClaimOfficialInvoiceCollectionNumberInput = {
  batchId: string;
  tenantId: string;
  collectionDate?: Date | string;
};

export type ClaimedInvoiceCollectionNumber = InvoiceNumberPreview & {
  batchId: string;
  tenantId: string;
  numberingSettingsId: string;
  alreadyClaimed: boolean;
};

export async function claimOfficialInvoiceCollectionNumberInTransaction(
  client: Queryable,
  input: ClaimOfficialInvoiceCollectionNumberInput,
): Promise<ClaimedInvoiceCollectionNumber> {
  const documentType: InvoiceNumberDocumentType = "invoice_collection";
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 710202)", [
    `${input.tenantId}:${documentType}`,
  ]);

  const batchResult = await client.query<{
    id: string;
    tenant_id: string;
    collection_number: string | null;
    created_at: string | Date;
  }>(
    `
      SELECT id, tenant_id, collection_number, created_at
      FROM public.customer_payment_batches
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE
    `,
    [input.batchId, input.tenantId],
  );

  const batch = batchResult.rows[0];
  if (!batch) throw new Error("Verzamelfactuur niet gevonden voor deze tenant.");

  const settings = await ensureActiveNumberingSettings(client, input.tenantId, documentType);
  const validation = validateInvoiceNumberingConfig(settings);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const collectionDate = input.collectionDate ?? batch.created_at ?? new Date();
  const periodKey = getInvoiceNumberPeriodKey(settings.resetPeriod, collectionDate);

  if (batch.collection_number?.trim()) {
    return {
      batchId: batch.id,
      tenantId: batch.tenant_id,
      numberingSettingsId: settings.id,
      invoiceNumber: batch.collection_number,
      sequenceValue: 0,
      periodKey,
      alreadyClaimed: true,
    };
  }

  await client.query(
    `
      INSERT INTO public.invoice_number_sequences (
        tenant_id, numbering_settings_id, document_type, period_key, next_number
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, numbering_settings_id, document_type, period_key) DO NOTHING
    `,
    [input.tenantId, settings.id, documentType, periodKey, settings.defaultStartNumber],
  );

  const sequenceResult = await client.query<{ id: string; next_number: number }>(
    `
      SELECT id, next_number
      FROM public.invoice_number_sequences
      WHERE tenant_id = $1
        AND numbering_settings_id = $2
        AND document_type = $3
        AND period_key = $4
      FOR UPDATE
    `,
    [input.tenantId, settings.id, documentType, periodKey],
  );

  const sequence = sequenceResult.rows[0];
  if (!sequence) throw new Error("Verzamelfactuurnummersequence kon niet worden geladen.");

  const sequenceValue = sequence.next_number;
  const collectionNumber = formatInvoiceNumber(settings, sequenceValue, collectionDate);

  await client.query(
    `
      UPDATE public.invoice_number_sequences
      SET next_number = next_number + 1,
          updated_at = now()
      WHERE id = $1
    `,
    [sequence.id],
  );

  await client.query(
    `
      UPDATE public.customer_payment_batches
      SET collection_number = $1,
          numbering_settings_id = $2,
          number_period_key = $3,
          number_sequence_value = $4,
          finalized_at = COALESCE(finalized_at, now()),
          updated_at = now()
      WHERE id = $5 AND tenant_id = $6
    `,
    [collectionNumber, settings.id, periodKey, sequenceValue, input.batchId, input.tenantId],
  );

  return {
    batchId: input.batchId,
    tenantId: input.tenantId,
    numberingSettingsId: settings.id,
    invoiceNumber: collectionNumber,
    sequenceValue,
    periodKey,
    alreadyClaimed: false,
  };
}

export async function claimOfficialInvoiceNumber(
  input: ClaimOfficialInvoiceNumberInput,
): Promise<ClaimedInvoiceNumber> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await claimOfficialInvoiceNumberInTransaction(client, input);
    await client.query("COMMIT");
    return claimed;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new Error("Factuurnummer bestaat al binnen deze tenant. Controleer de nummerreeks.");
    }
    throw error;
  } finally {
    client.release();
  }
}
