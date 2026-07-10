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

type Queryable = Pick<PoolClient, "query">;

type DbInvoiceNumberingSettings = InvoiceNumberingConfig & {
  id: string;
  tenantId: string;
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
};

function rowToSettings(row: {
  id: string;
  tenant_id: string;
  prefix: string;
  format: string;
  number_padding: number;
  reset_period: string;
  default_start_number: number;
}): DbInvoiceNumberingSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    prefix: row.prefix,
    format: row.format,
    numberPadding: row.number_padding,
    resetPeriod: row.reset_period as InvoiceNumberResetPeriod,
    defaultStartNumber: row.default_start_number,
  };
}

async function ensureActiveNumberingSettings(client: Queryable, tenantId: string): Promise<DbInvoiceNumberingSettings> {
  const existing = await client.query<{
    id: string;
    tenant_id: string;
    prefix: string;
    format: string;
    number_padding: number;
    reset_period: string;
    default_start_number: number;
  }>(
    `
      SELECT id, tenant_id, prefix, format, number_padding, reset_period, default_start_number
      FROM public.invoice_numbering_settings
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [tenantId],
  );

  if (existing.rows[0]) return rowToSettings(existing.rows[0]);

  const created = await client.query<{
    id: string;
    tenant_id: string;
    prefix: string;
    format: string;
    number_padding: number;
    reset_period: string;
    default_start_number: number;
  }>(
    `
      INSERT INTO public.invoice_numbering_settings (
        tenant_id, prefix, format, separator, number_padding, reset_period, default_start_number, is_active
      )
      VALUES ($1, 'FAK', '{PREFIX}-{YYYY}-{NUMBER}', '-', 4, 'yearly', 1, true)
      RETURNING id, tenant_id, prefix, format, number_padding, reset_period, default_start_number
    `,
    [tenantId],
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
): Promise<InvoiceNumberPreview> {
  const settings = await ensureActiveNumberingSettings(queryable, tenantId);
  const validation = validateInvoiceNumberingConfig(settings);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const periodKey = getInvoiceNumberPeriodKey(settings.resetPeriod, invoiceDate);
  const sequence = await queryable.query<{ next_number: number }>(
    `
      SELECT next_number
      FROM public.invoice_number_sequences
      WHERE tenant_id = $1
        AND numbering_settings_id = $2
        AND period_key = $3
      LIMIT 1
    `,
    [tenantId, settings.id, periodKey],
  );

  return previewInvoiceNumber(settings, sequence.rows[0]?.next_number ?? settings.defaultStartNumber, invoiceDate);
}

export async function claimOfficialInvoiceNumber(
  input: ClaimOfficialInvoiceNumberInput,
): Promise<ClaimedInvoiceNumber> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 710201)", [input.tenantId]);

    const invoiceResult = await client.query<{
      id: string;
      tenant_id: string;
      invoice_number: string | null;
      invoice_date: string | null;
      status: string;
    }>(
      `
        SELECT id, tenant_id, invoice_number, invoice_date, status
        FROM public.invoices
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `,
      [input.invoiceId, input.tenantId],
    );

    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Factuur niet gevonden voor deze tenant.");
    if (invoice.status === "cancelled") throw new Error("Geannuleerde facturen krijgen geen factuurnummer.");

    const settings = await ensureActiveNumberingSettings(client, input.tenantId);
    const validation = validateInvoiceNumberingConfig(settings);
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const invoiceDate = input.invoiceDate ?? invoice.invoice_date ?? new Date();
    const periodKey = getInvoiceNumberPeriodKey(settings.resetPeriod, invoiceDate);

    if (invoice.invoice_number?.trim()) {
      await client.query("COMMIT");
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
          tenant_id, numbering_settings_id, period_key, next_number
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, numbering_settings_id, period_key) DO NOTHING
      `,
      [input.tenantId, settings.id, periodKey, settings.defaultStartNumber],
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
          AND period_key = $3
        FOR UPDATE
      `,
      [input.tenantId, settings.id, periodKey],
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
            finalized_at = COALESCE(finalized_at, now()),
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

    await client.query("COMMIT");
    return {
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      numberingSettingsId: settings.id,
      invoiceNumber,
      sequenceValue,
      periodKey,
      alreadyClaimed: false,
    };
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
