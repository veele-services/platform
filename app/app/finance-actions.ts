"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext, hasAnyRole, type AuthContext, type TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { sendEmail } from "@/lib/providers/sendgrid";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { tenantAppUrl } from "@/lib/tenancy/hostname";

async function financeContext(): Promise<AuthContext & { tenant: TenantContext }> {
  const context = await getAuthContext();
  if (!context.tenant || !hasAnyRole(context, ["tenant_admin", "management", "finance"])) throw new Error("Financiële rol vereist");
  return context as AuthContext & { tenant: TenantContext };
}

export async function createInvoice(formData: FormData): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const context = await financeContext();
    const ids = z.string().min(1).parse(formData.get("workOrderIds")).split(",").map((id) => z.string().uuid().parse(id));
    const supabase = await createClient();
    const { data: orders, error: orderError } = await supabase.from("work_orders").select("*").in("id", ids).eq("status", "invoice_ready");
    if (orderError || orders.length !== ids.length) throw orderError ?? new Error("Niet alle werkbonnen zijn factureerbaar");
    if (new Set(orders.map((order) => order.customer_id)).size !== 1) throw new Error("Een verzamelfactuur kan alleen bonnen van één klant bevatten");
    const customerId = orders[0].customer_id;
    const { data: tasks, error: tasksError } = await supabase.from("work_order_tasks").select("*").in("work_order_id", ids);
    if (tasksError) throw tasksError;
    const billable = tasks.filter((task) => !task.is_extra_work || task.extra_work_status === "approved");
    if (!billable.length) throw new Error("Er zijn geen factureerbare regels");
    const { data: invoice, error } = await supabase.from("invoices").insert({ tenant_id: context.tenant.id, customer_id: customerId, created_by: context.user.id }).select().single();
    if (error) throw error;
    const lines = billable.map((task) => {
      const quantity = Number(task.quantity);
      const subtotal = Math.round(quantity * task.unit_price_cents);
      const vat = Math.round(subtotal * task.vat_basis_points / 10000);
      return { tenant_id: context.tenant!.id, invoice_id: invoice.id, work_order_id: task.work_order_id, description: `${task.task_code} · ${task.task_name}`, quantity, unit: task.unit, unit_price_cents: task.unit_price_cents, subtotal_cents: subtotal, vat_basis_points: task.vat_basis_points, vat_cents: vat, total_cents: subtotal + vat, source_snapshot: { work_order_task_id: task.id, duration_minutes: task.duration_minutes } };
    });
    const { error: linesError } = await supabase.from("invoice_lines").insert(lines);
    if (linesError) { await supabase.from("invoices").delete().eq("id", invoice.id); throw linesError; }
    const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_invoice", { target_invoice_id: invoice.id });
    if (finalizeError) throw finalizeError;
    const customer = finalized.customer_snapshot as Record<string, unknown>;
    const branding = finalized.branding_snapshot as Record<string, unknown>;
    const pdf = await renderInvoicePdf({
      invoiceNumber: finalized.invoice_number!, issuedOn: finalized.issued_on!, dueOn: finalized.due_on!,
      tenantName: String(branding.tenant_name ?? context.tenant.name), customerName: String(customer.name ?? "Klant"),
      billingAddress: (customer.billing_address ?? {}) as Record<string, unknown>,
      lines: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPriceCents: line.unit_price_cents, vatBasisPoints: line.vat_basis_points, totalCents: line.total_cents })),
      subtotalCents: finalized.subtotal_cents, vatCents: finalized.vat_cents, totalCents: finalized.total_cents,
      accentColor: String(branding.accent_color ?? "#00B7B3"), footer: typeof branding.pdf_footer === "string" ? branding.pdf_footer : null,
    });
    const digest = createHash("sha256").update(pdf).digest("hex");
    const path = `${context.tenant.id}/${invoice.id}/${finalized.invoice_number}.pdf`;
    const { error: uploadError } = await supabase.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error: attachError } = await supabase.rpc("attach_invoice_pdf", { target_invoice_id: invoice.id, storage_path: path, sha256: digest });
    if (attachError) throw attachError;
    revalidatePath("/app");
    return { ok: true, invoiceId: invoice.id };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function sendInvoice(formData: FormData): Promise<ActionResult<{ paymentUrl: string }>> {
  try {
    const context = await financeContext();
    const invoiceId = z.string().uuid().parse(formData.get("invoiceId"));
    const supabase = await createClient();
    const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error || !invoice.pdf_storage_path || !invoice.invoice_number) throw error ?? new Error("Factuur of PDF ontbreekt");
    const { data: customer, error: customerError } = await supabase.from("customers").select("*").eq("id", invoice.customer_id).single();
    if (customerError || !customer.billing_email) throw customerError ?? new Error("Klant heeft geen factuur-e-mailadres");
    const { data: group, error: groupError } = await supabase.from("invoice_groups").insert({ tenant_id: context.tenant.id, customer_id: customer.id, purpose: "payment_bundle", created_by: context.user.id, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }).select().single();
    if (groupError) throw groupError;
    const { error: itemError } = await supabase.from("invoice_group_items").insert({ tenant_id: context.tenant.id, invoice_group_id: group.id, invoice_id: invoice.id });
    if (itemError) throw itemError;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();
    const { error: tokenError } = await admin.from("external_action_tokens").insert({ tenant_id: context.tenant.id, purpose: "payment", subject_id: group.id, token_hash: tokenHash, expires_at: group.expires_at! });
    if (tokenError) throw tokenError;
    const paymentUrl = tenantAppUrl(context.tenant.slug, `/pay/${token}`);
    const env = getServerEnv();
    if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) return { ok: true, paymentUrl };
    const [{ data: branding }, { data: verifiedDomains }] = await Promise.all([
      supabase.from("tenant_branding").select("sender_name,sender_email").eq("tenant_id", context.tenant.id).maybeSingle(),
      supabase.from("tenant_domains").select("host").eq("tenant_id", context.tenant.id).not("verified_at", "is", null),
    ]);
    const senderDomain = branding?.sender_email?.split("@")[1]?.toLowerCase();
    const tenantSenderVerified = Boolean(senderDomain && (verifiedDomains ?? []).some((item) => item.host.toLowerCase() === senderDomain));
    const fromEmail = tenantSenderVerified && branding?.sender_email ? branding.sender_email : env.SENDGRID_FROM_EMAIL;
    const fromName = tenantSenderVerified ? branding?.sender_name ?? context.tenant.name : env.SENDGRID_FROM_NAME;
    const { data: file, error: downloadError } = await supabase.storage.from("invoices").download(invoice.pdf_storage_path);
    if (downloadError) throw downloadError;
    const deliveryKey = `invoice-${invoice.id}-${invoice.version}`;
    const { data: claim, error: claimError } = await admin.rpc("claim_mail_delivery", { target_tenant_id: context.tenant.id, target_recipient: customer.billing_email, target_template: "invoice", target_idempotency_key: deliveryKey }).maybeSingle();
    if (claimError || !claim) throw claimError ?? new Error("E-mailclaim mislukt");
    if (!claim.should_send) {
      if (claim.current_status === "sent") {
        await supabase.from("invoices").update({ status: "sent", sent_at: invoice.sent_at ?? new Date().toISOString() }).eq("id", invoice.id);
        return { ok: true, paymentUrl };
      }
      throw new Error("Deze factuurmail wordt al verzonden");
    }
    let sent: { id: string } | null = null; let sendError: Error | null = null;
    try { sent = await sendEmail({
      fromEmail, fromName, to: customer.billing_email,
      subject: `Factuur ${invoice.invoice_number}`,
      text: `Bijgevoegd staat factuur ${invoice.invoice_number}. Veilig betalen: ${paymentUrl}`,
      attachment: { filename: `${invoice.invoice_number}.pdf`, bytes: new Uint8Array(await file.arrayBuffer()) },
      deliveryKey,
    }); } catch (error) { sendError = error instanceof Error ? error : new Error("E-mailverzending mislukt"); }
    await admin.from("mail_deliveries").update({ provider_message_id: sent?.id ?? null, status: sendError ? "failed" : "sent", last_error: sendError?.message ?? null, sent_at: sendError ? null : new Date().toISOString(), locked_until: null }).eq("id", claim.delivery_id);
    if (sendError) throw sendError;
    await supabase.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoice.id);
    revalidatePath("/app");
    return { ok: true, paymentUrl };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function registerManualPayment(formData: FormData): Promise<ActionResult> {
  try {
    const context = await financeContext();
    const input = z.object({ invoiceId: z.string().uuid(), amount: z.coerce.number().positive(), reference: z.string().trim().min(2), date: z.string().min(8) }).parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { error } = await supabase.rpc("register_manual_payment", { target_tenant_id: context.tenant.id, payment_date: new Date(input.date).toISOString(), reference: input.reference, allocations: [{ invoice_id: input.invoiceId, amount_cents: Math.round(input.amount * 100) }], idempotency_key: `manual-${input.invoiceId}-${input.reference}` });
    if (error) throw error;
    revalidatePath("/app");
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createPaymentBundle(formData: FormData): Promise<ActionResult<{ paymentUrl: string }>> {
  try {
    const context = await financeContext();
    const ids = z.string().min(1).parse(formData.get("invoiceIds")).split(",").map((id) => z.string().uuid().parse(id));
    const supabase = await createClient();
    const { data: invoices, error: invoiceError } = await supabase.from("invoices").select("id,customer_id,total_cents,paid_cents,status").in("id", ids);
    if (invoiceError || invoices.length !== ids.length) throw invoiceError ?? new Error("Niet alle facturen zijn gevonden");
    if (new Set(invoices.map((item) => item.customer_id)).size !== 1) throw new Error("Een betaallink kan alleen facturen van één klant combineren");
    if (invoices.some((item) => item.status === "draft" || item.paid_cents >= item.total_cents)) throw new Error("Selecteer alleen definitieve openstaande facturen");
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data: group, error: groupError } = await supabase.from("invoice_groups").insert({ tenant_id: context.tenant.id, customer_id: invoices[0].customer_id, purpose: "payment_bundle", created_by: context.user.id, expires_at: expiresAt }).select().single();
    if (groupError) throw groupError;
    const { error: itemError } = await supabase.from("invoice_group_items").insert(invoices.map((invoice) => ({ tenant_id: context.tenant.id, invoice_group_id: group.id, invoice_id: invoice.id })));
    if (itemError) throw itemError;
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const admin = createAdminClient();
    const { error } = await admin.from("external_action_tokens").insert({ tenant_id: context.tenant.id, purpose: "payment", subject_id: group.id, token_hash: tokenHash, expires_at: expiresAt });
    if (error) throw error;
    return { ok: true, paymentUrl: tenantAppUrl(context.tenant.slug, `/pay/${rawToken}`) };
  } catch (error) { return { ok: false, error: message(error) }; }
}
