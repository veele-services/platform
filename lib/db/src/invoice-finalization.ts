import type { PoolClient } from "pg";
import { pool } from "./connection";
import {
  claimOfficialInvoiceNumberInTransaction,
  type ClaimedInvoiceNumber,
} from "./invoice-numbering";

type Queryable = Pick<PoolClient, "query">;

export type FinalizeOfficialInvoiceInput = {
  invoiceId: string;
  tenantId: string;
  actorUserId?: string;
  invoiceDate?: Date | string;
};

export type FinalizedInvoiceResult = ClaimedInvoiceNumber & {
  alreadyFinalized: boolean;
  lineItemSnapshotCount: number;
};

function toIsoDate(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function readSnapshot(
  client: Queryable,
  sql: string,
  params: unknown[],
  fallback: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.query<{ snapshot: Record<string, unknown> | null }>(sql, params);
  return result.rows[0]?.snapshot ?? fallback;
}

async function countLineItemSnapshots(client: Queryable, invoiceId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM public.invoice_line_item_snapshots
      WHERE invoice_id = $1
    `,
    [invoiceId],
  );
  return result.rows[0]?.count ?? 0;
}

async function insertLineItemSnapshots(client: Queryable, input: {
  invoiceId: string;
  tenantId: string;
  assignmentId: string;
  vatPercentage: string;
  amount: string;
}): Promise<number> {
  const existingCount = await countLineItemSnapshots(client, input.invoiceId);
  if (existingCount > 0) return existingCount;

  await client.query(
    `
      WITH task_lines AS (
        SELECT
          at.id AS source_id,
          at.sort_order AS sort_order,
          COALESCE(at.task_code_name, ttc.name, tc.name, 'Taak zonder taakcode') AS description,
          COALESCE(at.task_code_code, ttc.code, tc.code) AS task_code_code,
          1::numeric AS quantity,
          COALESCE(at.task_code_price, ttcp.price, tc.price, 0)::numeric AS unit_price,
          COALESCE(at.task_code_invoiceable, ttc.invoiceable, tc.invoiceable, true) AS invoiceable,
          jsonb_build_object(
            'source', 'assignment_tasks',
            'notes', at.notes,
            'tenantTaskCodeId', at.tenant_task_code_id,
            'tenantTaskCodePriceId', at.tenant_task_code_price_id,
            'taskCodeId', at.task_code_id
          ) AS metadata
        FROM public.assignment_tasks at
        LEFT JOIN public.tenant_task_codes ttc ON ttc.id = at.tenant_task_code_id
        LEFT JOIN public.tenant_task_code_prices ttcp ON ttcp.id = at.tenant_task_code_price_id
        LEFT JOIN public.task_codes tc ON tc.id = at.task_code_id
        WHERE at.assignment_id = $1
      ),
      extra_lines AS (
        SELECT
          ew.id AS source_id,
          10000 + row_number() OVER (ORDER BY ew.created_at, ew.id)::int AS sort_order,
          COALESCE(ew.task_code_name, ew.description, 'Meerwerk') AS description,
          NULL::varchar AS task_code_code,
          COALESCE(ew.hours, 1)::numeric AS quantity,
          COALESCE(ew.price, 0)::numeric AS unit_price,
          true AS invoiceable,
          jsonb_build_object(
            'source', 'assignment_extra_work',
            'description', ew.description,
            'taskCodeId', ew.task_code_id
          ) AS metadata
        FROM public.assignment_extra_work ew
        WHERE ew.assignment_id = $1
      ),
      material_lines AS (
        SELECT
          amu.id AS source_id,
          20000 + row_number() OVER (ORDER BY amu.created_at, amu.id)::int AS sort_order,
          COALESCE(amu.approved_name, amu.registered_name, amu.name, 'Materiaal') AS description,
          amu.material_code_snapshot AS task_code_code,
          COALESCE(amu.approved_quantity, amu.registered_quantity, amu.quantity, 1)::numeric AS quantity,
          COALESCE(amu.approved_unit_price, amu.unit_price, 0)::numeric AS unit_price,
          amu.invoiceable AS invoiceable,
          jsonb_build_object(
            'source', 'assignment_material_usage',
            'unitLabel', COALESCE(amu.approved_unit_label, amu.registered_unit_label, amu.unit_label),
            'approvalStatus', amu.approval_status,
            'notes', amu.notes
          ) AS metadata
        FROM public.assignment_material_usage amu
        WHERE amu.assignment_id = $1
      ),
      candidate_lines AS (
        SELECT 'task'::varchar AS category, 'assignment_task'::varchar AS source_type, * FROM task_lines
        UNION ALL
        SELECT 'extra_work'::varchar AS category, 'assignment_extra_work'::varchar AS source_type, * FROM extra_lines
        UNION ALL
        SELECT 'material'::varchar AS category, 'assignment_material_usage'::varchar AS source_type, * FROM material_lines
      ),
      inserted AS (
        INSERT INTO public.invoice_line_item_snapshots (
          tenant_id,
          invoice_id,
          source_type,
          source_id,
          sort_order,
          category,
          description,
          task_code_code,
          quantity,
          unit_price,
          total_price,
          vat_percentage,
          invoiceable,
          metadata
        )
        SELECT
          $2::uuid,
          $3::uuid,
          source_type,
          source_id,
          sort_order,
          category,
          description,
          task_code_code,
          quantity,
          unit_price,
          CASE WHEN invoiceable THEN quantity * unit_price ELSE 0 END,
          $4::numeric,
          invoiceable,
          metadata
        FROM candidate_lines
        RETURNING 1
      )
      SELECT count(*)::int AS count FROM inserted
    `,
    [input.assignmentId, input.tenantId, input.invoiceId, input.vatPercentage],
  );

  const insertedCount = await countLineItemSnapshots(client, input.invoiceId);
  if (insertedCount > 0) return insertedCount;

  await client.query(
    `
      INSERT INTO public.invoice_line_item_snapshots (
        tenant_id,
        invoice_id,
        source_type,
        sort_order,
        category,
        description,
        quantity,
        unit_price,
        total_price,
        vat_percentage,
        invoiceable,
        metadata
      )
      VALUES (
        $1,
        $2,
        'invoice_total',
        0,
        'invoice_total',
        'Definitieve factuurregel',
        1,
        $3::numeric,
        $3::numeric,
        $4::numeric,
        true,
        '{"source":"invoice_finalization_fallback"}'::jsonb
      )
    `,
    [input.tenantId, input.invoiceId, input.amount, input.vatPercentage],
  );

  return countLineItemSnapshots(client, input.invoiceId);
}

export async function finalizeOfficialInvoice(input: FinalizeOfficialInvoiceInput): Promise<FinalizedInvoiceResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceResult = await client.query<{
      id: string;
      tenant_id: string;
      assignment_id: string;
      invoice_number: string | null;
      invoice_numbering_settings_id: string | null;
      invoice_number_period_key: string | null;
      invoice_number_sequence_value: number | null;
      invoice_date: string | null;
      status: string;
      amount: string;
      vat_percentage: string;
      finalized_at: Date | null;
      company_snapshot_json: Record<string, unknown> | null;
      invoice_settings_snapshot_json: Record<string, unknown> | null;
      payment_settings_snapshot_json: Record<string, unknown> | null;
      template_snapshot_json: Record<string, unknown> | null;
    }>(
      `
        SELECT
          id,
          tenant_id,
          assignment_id,
          invoice_number,
          invoice_numbering_settings_id,
          invoice_number_period_key,
          invoice_number_sequence_value,
          invoice_date,
          status,
          amount,
          vat_percentage,
          finalized_at,
          company_snapshot_json,
          invoice_settings_snapshot_json,
          payment_settings_snapshot_json,
          template_snapshot_json
        FROM public.invoices
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `,
      [input.invoiceId, input.tenantId],
    );

    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("Factuur niet gevonden voor deze tenant.");
    if (invoice.status === "cancelled") throw new Error("Geannuleerde facturen kunnen niet worden gefinaliseerd.");

    const lineItemSnapshotCount = await countLineItemSnapshots(client, input.invoiceId);
    const hasSnapshots = Boolean(
      invoice.company_snapshot_json &&
        invoice.invoice_settings_snapshot_json &&
        invoice.payment_settings_snapshot_json &&
        invoice.template_snapshot_json &&
        lineItemSnapshotCount > 0,
    );

    if (invoice.finalized_at && invoice.invoice_number?.trim() && hasSnapshots) {
      await client.query("COMMIT");
      return {
        invoiceId: invoice.id,
        tenantId: invoice.tenant_id,
        invoiceNumber: invoice.invoice_number,
        numberingSettingsId: invoice.invoice_numbering_settings_id ?? "",
        sequenceValue: invoice.invoice_number_sequence_value ?? 0,
        periodKey: invoice.invoice_number_period_key ?? "",
        alreadyClaimed: true,
        alreadyFinalized: true,
        lineItemSnapshotCount,
      };
    }

    const claimed = await claimOfficialInvoiceNumberInTransaction(client, {
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      invoiceDate: input.invoiceDate ?? invoice.invoice_date ?? new Date(),
    });

    const companySnapshot = await readSnapshot(
      client,
      `
        SELECT to_jsonb(tcs) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' AS snapshot
        FROM public.tenant_company_settings tcs
        WHERE tcs.tenant_id = $1
        LIMIT 1
      `,
      [input.tenantId],
      {},
    );
    const invoiceSettingsSnapshot = await readSnapshot(
      client,
      `
        SELECT to_jsonb(ins) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' AS snapshot
        FROM public.invoice_numbering_settings ins
        WHERE ins.id = $1 AND ins.tenant_id = $2
        LIMIT 1
      `,
      [claimed.numberingSettingsId, input.tenantId],
      {},
    );
    const paymentSettingsSnapshot = await readSnapshot(
      client,
      `
        SELECT to_jsonb(ips) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' AS snapshot
        FROM public.invoice_payment_settings ips
        WHERE ips.tenant_id = $1
        LIMIT 1
      `,
      [input.tenantId],
      { paymentProvider: "none" },
    );
    const templateSnapshot = await readSnapshot(
      client,
      `
        SELECT to_jsonb(its) - 'id' - 'tenant_id' - 'created_at' - 'updated_at' AS snapshot
        FROM public.invoice_template_settings its
        WHERE its.tenant_id = $1
        LIMIT 1
      `,
      [input.tenantId],
      {},
    );

    const snapshotCount = await insertLineItemSnapshots(client, {
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      assignmentId: invoice.assignment_id,
      vatPercentage: invoice.vat_percentage,
      amount: invoice.amount,
    });

    const invoiceDate = input.invoiceDate ?? invoice.invoice_date ?? new Date();
    await client.query(
      `
        UPDATE public.invoices
        SET company_snapshot_json = COALESCE(company_snapshot_json, $1::jsonb),
            invoice_settings_snapshot_json = COALESCE(invoice_settings_snapshot_json, $2::jsonb),
            payment_settings_snapshot_json = COALESCE(payment_settings_snapshot_json, $3::jsonb),
            template_snapshot_json = COALESCE(template_snapshot_json, $4::jsonb),
            invoice_date = COALESCE(invoice_date, $5::date),
            finalized_at = COALESCE(finalized_at, now()),
            updated_at = now()
        WHERE id = $6 AND tenant_id = $7
      `,
      [
        JSON.stringify(companySnapshot),
        JSON.stringify(invoiceSettingsSnapshot),
        JSON.stringify(paymentSettingsSnapshot),
        JSON.stringify(templateSnapshot),
        toIsoDate(invoiceDate),
        input.invoiceId,
        input.tenantId,
      ],
    );

    if (input.actorUserId) {
      await client.query(
        `
          INSERT INTO public.audit_log (
            tenant_id,
            user_id,
            action,
            resource,
            resource_id,
            metadata
          )
          VALUES ($1, $2, 'finalize_invoice', 'invoices', $3, $4::jsonb)
        `,
        [
          input.tenantId,
          input.actorUserId,
          input.invoiceId,
          JSON.stringify({
            invoiceNumber: claimed.invoiceNumber,
            lineItemSnapshotCount: snapshotCount,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    return {
      ...claimed,
      alreadyFinalized: false,
      lineItemSnapshotCount: snapshotCount,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
