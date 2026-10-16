import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { privateFileHeaders } from "@/lib/files/private-download";
import { invoiceConceptSchema } from "@/lib/finance/invoice-concepts";
import { invoiceLogo } from "@/lib/pdf/invoice-brand";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { invoicePdfHeaders } from "@/lib/pdf/invoice-headers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id), db = await createClient();
    const resolve = async () => {
      const { tenant } = await getAuthContext();
      if (!tenant?.enabledServices.includes("finance") || !tenant.roles.some(role => ["tenant_admin", "management", "finance"].includes(role))) throw new Error();
      // The RPC repeats session, tenant membership, service and source checks.
      const result = await db.rpc("execution_invoice_concepts", { target_tenant: tenant.id, target_order: id });
      if (result.error) throw new Error();
      const concept = invoiceConceptSchema.array().parse(result.data)[0];
      if (!concept || concept.id !== id) throw new Error();
      return { tenantId: tenant.id, concept };
    };
    const source = await resolve(), item = source.concept, brand = item.branding, prefs = item.customer.billingPreferences;
    const bytes = await renderInvoicePdf({
      invoiceNumber: item.number, concept: true, issuedOn: item.issuedOn, dueOn: item.dueOn,
      tenantName: String(brand.tenant_name), customerName: item.customer.name, billingAddress: item.customer.billingAddress,
      sender: { email: typeof brand.sender_email === "string" ? brand.sender_email : undefined },
      recipient: { legalName:item.customer.legalName, companyNumber:item.customer.companyNumber, vatNumber:item.customer.vatNumber, email:item.customer.email, phone:item.customer.phone ?? undefined },
      reference: String(prefs.reference ?? ""), costCenter: String(prefs.costCenter ?? ""), lines: item.lines,
      subtotalCents: item.subtotalCents, vatCents: item.vatCents, totalCents: item.totalCents,
      primaryColor: typeof brand.primary_color === "string" ? brand.primary_color : undefined,
      accentColor: typeof brand.accent_color === "string" ? brand.accent_color : undefined,
      logo: await invoiceLogo(source.tenantId, brand), senderEmail: typeof brand.sender_email === "string" ? brand.sender_email : undefined,
      footer: typeof brand.pdf_footer === "string" ? brand.pdf_footer : null,
    });
    if (JSON.stringify(source) !== JSON.stringify(await resolve())) throw new Error();
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(new Uint8Array(bytes), { headers: { ...invoicePdfHeaders, "Content-Type": "application/pdf", "Content-Length": String(bytes.length), "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(`Concept-${item.number}.pdf`)}` } });
  } catch { return Response.json({ error: "Factuurconcept niet beschikbaar" }, { status: 404, headers: privateFileHeaders }); }
}
