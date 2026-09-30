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
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { renderPlainEmail, type TemplateValues } from "@/lib/communications/templates";
import type { Json } from "@/lib/database.types";

async function financeContext(): Promise<AuthContext & { tenant: TenantContext }> {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.enabledServices.includes("finance") || !hasAnyRole(context, ["tenant_admin", "management", "finance"])) throw new Error("De module Facturatie en een financiële rol zijn vereist");
  return context as AuthContext & { tenant: TenantContext };
}

export async function createInvoice(formData: FormData): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const context = await financeContext();
    const invoiceId = formData.get("invoiceId") ? z.uuid().parse(formData.get("invoiceId")) : null;
    const requestId = invoiceId ? null : z.uuid().parse(formData.get("requestId"));
    const supabase = await createClient();
    const lookup = supabase.from("invoices").select("*").eq("tenant_id", context.tenant.id);
    const existing = await (invoiceId ? lookup.eq("id", invoiceId) : lookup.eq("source_request_id", requestId!)).maybeSingle();
    if (existing.error) throw existing.error;
    let finalized = existing.data;
    if (invoiceId && (!finalized || !finalized.invoice_number || finalized.status === "draft")) throw new Error("Geen definitieve factuur gevonden");
    if (!finalized) {
      const ids = z.string().min(1).parse(formData.get("workOrderIds")).split(",").map(id => z.uuid().parse(id));
      const { data: tasks, error: tasksError } = await supabase.from("work_order_tasks").select("*").eq("tenant_id", context.tenant.id).in("work_order_id", ids);
      const { data: allocated, error: allocationError } = await supabase.from("invoice_lines").select("work_order_task_id,work_order_id,source_snapshot,quantity").eq("tenant_id", context.tenant.id).in("work_order_id", ids);
      if (tasksError || allocationError) throw new Error("Factureerbare bronnen konden niet worden geladen");
      const sources = tasks.filter(t => t.completed_at && t.unit_price_cents > 0 && (!t.is_extra_work || t.extra_work_status === "approved")).map(t => ({
        taskId: t.id,
        quantity: Number(t.executed_quantity ?? t.quantity) - (allocated ?? []).filter(l => l.work_order_id===t.work_order_id && (l.work_order_task_id || (l.source_snapshot as Record<string,unknown>).work_order_task_id)===t.id).reduce((n,l) => n + Number(l.quantity), 0),
      })).filter(t => t.quantity > 0);
      if (!sources.length) throw new Error("Er zijn geen gecontroleerde, nog factureerbare hoeveelheden");
      const { data, error } = await supabase.rpc("create_execution_invoice", { target_tenant: context.tenant.id, request_id: requestId!, sources });
      if (error) throw new Error("Factuur niet aangemaakt. Controleer de rapportcontrole, akkoorden en nog factureerbare hoeveelheden.");
      finalized = data;
    }
    const { data: lines, error: linesError } = await supabase.from("invoice_lines").select("*").eq("tenant_id", context.tenant.id).eq("invoice_id", finalized.id);
    if (linesError) throw new Error("Factuurregels konden niet worden geladen");
    if (finalized.pdf_storage_path) return { ok: true, invoiceId: finalized.id };
    const customer = finalized.customer_snapshot as Record<string, unknown>;
    const branding = finalized.branding_snapshot as Record<string, unknown>;
    const pdf = await renderInvoicePdf({
      invoiceNumber: finalized.invoice_number!, issuedOn: finalized.issued_on!, dueOn: finalized.due_on!,
      tenantName: String(branding.tenant_name ?? context.tenant.name), customerName: String(customer.name ?? "Klant"),
      billingAddress: (customer.billing_address ?? {}) as Record<string, unknown>,
      lines: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPriceCents: line.unit_price_cents, vatBasisPoints: line.vat_basis_points, totalCents: line.total_cents })),
      subtotalCents: finalized.subtotal_cents, vatCents: finalized.vat_cents, totalCents: finalized.total_cents,
      accentColor: String(branding.accent_color ?? "#41ac42"), footer: typeof branding.pdf_footer === "string" ? branding.pdf_footer : null,
    });

    const path = `${context.tenant.id}/${finalized.id}/${finalized.invoice_number}.pdf`;
    const bucket = supabase.storage.from("invoices");
    // A previous attempt may have uploaded before losing the response.
    const stored = await bucket.download(path);
    let bytes: Uint8Array = pdf;
    if (stored.data) bytes = new Uint8Array(await stored.data.arrayBuffer());
    else {
      const uploaded = await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: false });
      if (uploaded.error) {
        const raced = await bucket.download(path);
        if (!raced.data) throw new Error("De factuur is vastgelegd, maar de PDF kon niet worden opgeslagen. Probeer dezelfde actie opnieuw.");
        bytes = new Uint8Array(await raced.data.arrayBuffer());
      }
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const { error: attachError } = await supabase.rpc("attach_invoice_pdf", { target_invoice_id: finalized.id, storage_path: path, sha256: digest });
    if (attachError) throw attachError;
    revalidatePath("/app", "layout");
    return { ok: true, invoiceId: finalized.id };
  } catch { return { ok: false, error: "Controleer de rapportcontrole, akkoorden en hoeveelheden. Is de factuur al vastgelegd maar ontbreekt de PDF? Open de factuur en kies PDF herstellen." }; }
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
    const { data: storedTemplate, error: templateError } = await admin.from("tenant_message_templates").select("subject,body,revision").eq("tenant_id", context.tenant.id).eq("template_key", "invoice").single();
    if (templateError) throw templateError;
    const customerSnapshot = (invoice.customer_snapshot ?? {}) as Record<string, unknown>;
    const brandingSnapshot = (invoice.branding_snapshot ?? {}) as Record<string, unknown>;
    const values: TemplateValues = {
      bedrijfsnaam: String(brandingSnapshot.tenant_name ?? context.tenant.name),
      klantnaam: String(customerSnapshot.name ?? customer.name),
      factuurnummer: invoice.invoice_number,
      betaallink: paymentUrl,
    };
    const plain = renderPlainEmail({ subject: storedTemplate.subject, body: storedTemplate.body, values, targetUrl: paymentUrl, targetLabel: "Veilig betalen" });
    const html = renderTenantEmailHtml({
      brand: {
        company: values.bedrijfsnaam!,
        domain: new URL(tenantAppUrl(context.tenant.slug)).hostname,
        primary: String(brandingSnapshot.primary_color ?? context.tenant.primaryColor),
        accent: String(brandingSnapshot.accent_color ?? context.tenant.accentColor),
        senderEmail: fromEmail,
        emailLogoUrl: brandingSnapshot.logo_path ? `${env.APP_URL}/api/branding/${context.tenant.id}/email-logo` : null,
      },
      kind: "invoice",
      message: { subject: storedTemplate.subject, body: storedTemplate.body },
      values,
      targetUrl: paymentUrl,
      mode: "delivery",
    });
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
      subject: plain.subject,
      text: plain.text,
      html,
      attachment: { filename: `${invoice.invoice_number}.pdf`, bytes: new Uint8Array(await file.arrayBuffer()) },
      deliveryKey,
    }); } catch (error) { sendError = error instanceof Error ? error : new Error("E-mailverzending mislukt"); }
    await admin.from("mail_deliveries").update({
      provider_message_id: sent?.id ?? null,
      status: sendError ? "failed" : "sent",
      last_error: sendError?.message ?? null,
      sent_at: sendError ? null : new Date().toISOString(),
      locked_until: null,
      template_revision: storedTemplate.revision,
      render_snapshot: { subject: plain.subject, text: plain.text, html, target_url: paymentUrl },
      branding_snapshot: brandingSnapshot as Json,
    }).eq("id", claim.delivery_id);
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
