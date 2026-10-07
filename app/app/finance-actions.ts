"use server";

import { withTenantEmailBrand } from "@/lib/communications/tenant-email-brand";
import { readScannedFile, uploadScannedFile } from "@/lib/files/scanned-storage";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext, hasAnyRole, type AuthContext, type TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { invoiceSnapshotInput } from "@/lib/pdf/invoice-snapshot";
import { invoiceLogo } from "@/lib/pdf/invoice-brand";
import { invoiceConceptSchema } from "@/lib/finance/invoice-concepts";
import { sendEmail } from "@/lib/providers/sendgrid";
import type { ActionResult } from "@/lib/actions/result";
import { message } from "@/lib/actions/result";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { renderPlainEmail, type TemplateValues } from "@/lib/communications/templates";
import type { Json } from "@/lib/database.types";
import { freezeMailSnapshot, mailSnapshotSchema, mailFailureOutcome, mailFailureMessage, type MailSnapshot } from "@/lib/notifications/mail-snapshot";
import { resolveMailTemplate } from "@/lib/notifications/mail-template";
import { freezeEmailLogo } from "@/lib/notifications/brand-asset";
import { deferNotificationMail, retryDeferredDocumentMail } from "@/lib/notifications/deferred-mail";
import { readMailAttachment } from "@/lib/notifications/mail-attachment";

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
    if (!finalized && formData.get("quoteId")) {
      const result=await supabase.rpc("create_commercial_period_invoice",{target_tenant:context.tenant.id,target_quote:z.uuid().parse(formData.get("quoteId")),period_start:z.iso.date().parse(formData.get("periodStart")),request_id:requestId!,confirmed:formData.get("confirmed")==="on"});
      if(result.error)return{ok:false,error:result.error.code==="23514"?result.error.message:"De periodefactuur kon niet worden aangemaakt."};finalized=result.data;
    }
    if (!finalized) {
      const ids = z.string().min(1).parse(formData.get("workOrderIds")).split(",").map(id => z.uuid().parse(id));
      const candidates = await supabase.rpc("execution_invoice_concepts", { target_tenant: context.tenant.id });
      if (candidates.error) throw new Error("Factureerbare bronnen konden niet worden geladen");
      const concepts = invoiceConceptSchema.array().parse(candidates.data).filter(item => ids.includes(item.id));
      if (new Set(concepts.map(item => item.id)).size !== new Set(ids).size) throw new Error("Selecteer actuele goedgekeurde concepten");
      const sources = concepts.flatMap(item => item.lines.map(line => ({ taskId: line.taskId, quantity: line.quantity })));
      if (!sources.length) throw new Error("Er zijn geen gecontroleerde, nog factureerbare hoeveelheden");
      const { data, error } = await supabase.rpc("create_execution_invoice", { target_tenant: context.tenant.id, request_id: requestId!, sources });
      if (error) throw new Error("Factuur niet aangemaakt. Controleer de rapportcontrole, akkoorden en nog factureerbare hoeveelheden.");
      finalized = data;
    }
    const { error: linesError } = await supabase.from("invoice_lines").select("*").eq("tenant_id", context.tenant.id).eq("invoice_id", finalized.id);
    if (linesError) throw new Error("Factuurregels konden niet worden geladen");
    if (finalized.pdf_storage_path) return { ok: true, invoiceId: finalized.id };
    const branding = finalized.branding_snapshot as Record<string, unknown>;
    const pdf = await renderInvoicePdf({
      ...invoiceSnapshotInput(finalized), logo: await invoiceLogo(context.tenant.id, branding),
    });

    const path = `${context.tenant.id}/${finalized.id}/${finalized.invoice_number}.pdf`;
    // A previous attempt may have uploaded before losing the response.
    const stored = await readScannedFile("invoices", path);
    let bytes: Uint8Array = pdf;
    if (stored) bytes = stored.bytes;
    else {
      await uploadScannedFile(supabase, "invoices", path, pdf, "application/pdf");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const { error: attachError } = await supabase.rpc("attach_invoice_pdf", { target_invoice_id: finalized.id, storage_path: path, sha256: digest });
    if (attachError) throw attachError;
    revalidatePath("/app", "layout");
    return { ok: true, invoiceId: finalized.id };
  } catch { return { ok: false, error: "Controleer de rapportcontrole, akkoorden en hoeveelheden. Is de factuur al vastgelegd maar ontbreekt de PDF? Open de factuur en kies PDF herstellen." }; }
}

export async function sendInvoice(formData: FormData): Promise<ActionResult<{ paymentUrl: string }>> {
  let activeDelivery: { tenantId: string; id: string } | null = null;
  let providerStarted = false;
  try {
    const context = await financeContext();
    const invoiceId = z.string().uuid().parse(formData.get("invoiceId"));
    const supabase = await createClient();
    const { data: invoice, error } = await supabase.from("invoices").select("*").eq("tenant_id", context.tenant.id).eq("id", invoiceId).single();
    if (error || !invoice.pdf_storage_path || !invoice.invoice_number) throw error ?? new Error("Factuur of PDF ontbreekt");
    const invoicePreferences = ((invoice.customer_snapshot as Record<string, unknown>)?.billing_preferences ?? {}) as Record<string, unknown>;
    if (invoicePreferences.channel && invoicePreferences.channel !== "email") return {ok:false,error:"Voor deze factuur is verzending via het klantportaal of per post afgesproken. Download de PDF en verwerk de afgesproken verzending; er is geen e-mail verstuurd."};
    const { data: customer, error: customerError } = await supabase.from("customers").select("*").eq("id", invoice.customer_id).single();
    if (customerError || !customer.billing_email) throw customerError ?? new Error("Klant heeft geen factuur-e-mailadres");
    const env = getServerEnv();
    if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) throw new Error("E-mailverzending is niet geconfigureerd. De factuur blijft beschikbaar; er is niets verzonden.");
    const admin = createAdminClient();
    // A payment or status update increments invoice.version without creating a
    // new invoice document. Keep one send identity for the definitive invoice,
    // including records created by the earlier version-based implementation.
    const stableKey = `invoice-${invoice.id}`;
    const prior = await admin.from("mail_deliveries").select("id,status,render_snapshot,idempotency_key").eq("tenant_id",context.tenant.id).eq("template","invoice").or(`idempotency_key.eq.${stableKey},idempotency_key.like.${stableKey}-%`).order("created_at",{ascending:true}).limit(1).maybeSingle();
    if (prior.error) throw new Error("De verzendstatus kon niet worden gecontroleerd.");
    if(prior.data?.status==="failed" && await retryDeferredDocumentMail(context.tenant.id,prior.data.id)) return {ok:false,error:"De eerdere factuurmail is opnieuw ingepland. De worker controleert de ontvanger en verzendt dezelfde vastgelegde versie; er is nu nog niets verzonden."};
    const deliveryKey = prior.data?.idempotency_key ?? stableKey;
    const savedSnapshot = mailSnapshotSchema.safeParse((prior.data?.render_snapshot as Record<string, unknown> | null)?.delivery);
    if (prior.data?.status === "sent") {
      if (!savedSnapshot.success) throw new Error("Deze factuurmail is al door de provider aangenomen. Open de bestaande verzendregistratie.");
      return { ok: true, paymentUrl: savedSnapshot.data.targetUrl };
    }
    const { data: claim, error: claimError } = await admin.rpc("claim_mail_delivery", { target_tenant_id: context.tenant.id, target_recipient: savedSnapshot.success ? savedSnapshot.data.to : customer.billing_email, target_template: "invoice", target_idempotency_key: deliveryKey }).maybeSingle();
    if (claimError || !claim) throw new Error("E-mailclaim mislukt. Er is niets verstuurd.");
    if (!claim.should_send) throw new Error(claim.current_status === "suppressed" ? mailFailureMessage("suppressed") : "Deze factuurmail is bezig, afgehandeld of onzeker. Controleer de bestaande verzending; er wordt niet opnieuw verstuurd.");
    activeDelivery = {tenantId:context.tenant.id,id:claim.delivery_id};
    let paymentUrl = savedSnapshot.success ? savedSnapshot.data.targetUrl : "";
    if (!paymentUrl) {
    const { data: group, error: groupError } = await supabase.from("invoice_groups").insert({ tenant_id: context.tenant.id, customer_id: customer.id, purpose: "payment_bundle", created_by: context.user.id, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }).select().single();
    if (groupError) throw groupError;
    const { error: itemError } = await supabase.from("invoice_group_items").insert({ tenant_id: context.tenant.id, invoice_group_id: group.id, invoice_id: invoice.id });
    if (itemError) throw itemError;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error: tokenError } = await admin.from("external_action_tokens").insert({ tenant_id: context.tenant.id, purpose: "payment", subject_id: group.id, token_hash: tokenHash, expires_at: group.expires_at! });
    if (tokenError) throw tokenError;
    paymentUrl = tenantAppUrl(context.tenant.slug, `/pay/${token}`);
    }
    let frozen:MailSnapshot;
    if (savedSnapshot.success) frozen=savedSnapshot.data;
    else {
    const [{ data: branding }, { data: verifiedDomains }] = await Promise.all([
      supabase.from("tenant_branding").select("sender_name,sender_email").eq("tenant_id", context.tenant.id).maybeSingle(),
      supabase.from("tenant_domains").select("host").eq("tenant_id", context.tenant.id).not("verified_at", "is", null),
    ]);
    const senderDomain = branding?.sender_email?.split("@")[1]?.toLowerCase();
    const tenantSenderVerified = Boolean(senderDomain && (verifiedDomains ?? []).some((item) => item.host.toLowerCase() === senderDomain));
    const fromEmail = tenantSenderVerified && branding?.sender_email ? branding.sender_email : env.SENDGRID_FROM_EMAIL;
    const fromName = tenantSenderVerified ? branding?.sender_name ?? context.tenant.name : env.SENDGRID_FROM_NAME;
    const effectiveTemplate = await resolveMailTemplate(admin,context.tenant.id,"invoice.available","customer");
    const storedTemplate = {subject:effectiveTemplate.title,body:effectiveTemplate.body,revision:effectiveTemplate.revision};
    const customerSnapshot = (invoice.customer_snapshot ?? {}) as Record<string, unknown>;
    const brandingSnapshot = (invoice.branding_snapshot ?? {}) as Record<string, unknown>;
    const values: TemplateValues = {
      bedrijfsnaam: String(brandingSnapshot.tenant_name ?? context.tenant.name),
      klantnaam: String(customerSnapshot.name ?? customer.name),
      factuurnummer: invoice.invoice_number,
      betaallink: paymentUrl,
    };
    const plain = renderPlainEmail({ subject: storedTemplate.subject, body: storedTemplate.body, values, targetUrl: paymentUrl, targetLabel: "Veilig betalen" });
    const logoUrl = savedSnapshot.success ? null : await freezeEmailLogo(admin,context.tenant.id,context.tenant.slug,typeof brandingSnapshot.logo_path === "string" ? brandingSnapshot.logo_path : null);
    const html = renderTenantEmailHtml({
      brand: await withTenantEmailBrand(context.tenant.id, {
        company: values.bedrijfsnaam!,
        domain: new URL(tenantAppUrl(context.tenant.slug)).hostname,
        primary: String(brandingSnapshot.primary_color ?? context.tenant.primaryColor),
        accent: String(brandingSnapshot.accent_color ?? context.tenant.accentColor),
        senderEmail: fromEmail,
        emailLogoUrl: logoUrl,
      }),
      kind: "invoice",
      message: { subject: storedTemplate.subject, body: storedTemplate.body },
      values,
      targetUrl: paymentUrl,
      targetLabel: effectiveTemplate.cta_label,
      mode: "delivery",
    });
    const oldRender = (prior.data?.render_snapshot ?? {}) as Record<string, Json>;
    const linked = await admin.from("mail_deliveries").update({render_snapshot:{...oldRender,invoice_id:invoice.id},branding_snapshot:brandingSnapshot as Json}).eq("tenant_id",context.tenant.id).eq("id",claim.delivery_id);
    if (linked.error) throw new Error("De factuur kon niet aan de verzendregistratie worden gekoppeld.");
    frozen = await freezeMailSnapshot(admin,context.tenant.id,claim.delivery_id,{fromEmail,fromName,to:customer.billing_email,subject:plain.subject,text:plain.text,html,targetUrl:paymentUrl,templateRevision:storedTemplate.revision,templateVersionId:effectiveTemplate.version_id,templateBaseVersionId:effectiveTemplate.base_version_id,attachmentPath:invoice.pdf_storage_path,attachmentFilename:`${invoice.invoice_number}.pdf`});
    }
    if (!frozen.attachmentPath) throw new Error("Het vaste factuurdocument is niet beschikbaar.");
    const attachment = await readMailAttachment(context.tenant.id, claim.delivery_id, frozen.attachmentPath);
    // Provider submission is irreversible. Re-evaluate the initiating actor
    // after all document/token I/O, rather than relying on the entry check.
    const currentContext = await financeContext();
    if (currentContext.user.id !== context.user.id || currentContext.tenant.id !== context.tenant.id) {
      throw new Error("Je financiële toegang is gewijzigd. De factuur is niet verzonden.");
    }
    let sent: { id: string } | null = null; let sendError: Error | null = null;
    providerStarted = true;
    try { sent = await sendEmail({
      ...frozen,
      attachment,
      deliveryKey,
      disableTracking: true,
      policy: {kind:"notification",tenantId:context.tenant.id,type:"invoice.available",context:"customer",sourceId:claim.delivery_id},
    }); } catch (error) { sendError = error instanceof Error ? error : new Error("E-mailverzending mislukt"); }
    if (sendError && await deferNotificationMail(sendError,context.tenant.id,claim.delivery_id,"invoice.available","customer")) {
      activeDelivery=null;
      return {ok:false,error:"De factuurmail is klaargezet na de persoonlijke rusttijden. De factuur is vastgelegd, maar de e-mail is nog niet verzonden."};
    }
    const outcome = sendError ? mailFailureOutcome(sendError) : "sent";
    const result = await admin.from("mail_deliveries").update({
      provider_message_id: sent?.id ?? null,
      status: outcome,
      last_error: sendError ? mailFailureMessage(mailFailureOutcome(sendError)) : null,
      sent_at: sendError ? null : new Date().toISOString(),
      locked_until: null,
    }).eq("tenant_id",context.tenant.id).eq("id", claim.delivery_id).eq("status","processing");
    if (result.error) throw new Error("De provideruitkomst kon niet worden vastgelegd. Niet opnieuw verzenden zonder controle.");
    activeDelivery = null;
    if (sendError) throw new Error(mailFailureMessage(mailFailureOutcome(sendError)));
    await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoice.id);
    await supabase.from("invoices").update({ status: "sent" }).eq("id", invoice.id).eq("status","final");
    revalidatePath("/app");
    return { ok: true, paymentUrl: frozen.targetUrl };
  } catch (error) {
    if (activeDelivery) {
      // Pre-provider preparation is safe to retry. After a possible external
      // side effect, retain uncertainty instead of offering a duplicate send.
      const status = providerStarted ? "uncertain" : "failed";
      await createAdminClient().from("mail_deliveries").update({status,last_error:providerStarted?mailFailureMessage("uncertain"):"Voorbereiding niet voltooid; er is nog geen verzending gestart.",locked_until:null}).eq("tenant_id",activeDelivery.tenantId).eq("id",activeDelivery.id).eq("status","processing");
    }
    return { ok: false, error: message(error) };
  }
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
