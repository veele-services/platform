import { createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { commercialModuleEnabled } from "@/lib/commercial/access";
import { flushCommercialMail } from "@/lib/commercial/mail";
import { VEELE_WEBSITE_SLUG } from "@/lib/marketing/veele/routes";
import { mapWebsiteSubmission, websiteSubmissionSchema } from "@/lib/marketing/veele/submission";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
function fieldError(issue: z.core.$ZodIssue) {
  const path = issue.path.map(String).join(".");
  const field = path.includes("contact.organization") ? "organization" : path.includes("contact.name") ? "contact_name" : path.includes("contact.phone") ? "phone" : path.includes("contact") ? "email" : path.includes("location.otherType") ? "other_location" : path.includes("location.postalCode") ? "postal_code" : path.includes("location.houseNumber") ? "house_number" : path.includes("location.street") ? "address" : path.includes("location.city") ? "city" : path.includes("location") ? "location_type" : path.includes("endDate") || path.includes("windows") ? "end_date" : path.includes("startDate") ? "start_date" : path.includes("planningFlexible") ? "flexible" : path.includes("planning") || path.includes("frequencyLabel") ? "frequency" : path.includes("areaM2") ? "area_m2" : path.includes("expectedVisitors") ? "visitors" : path.includes("tasks") ? "details" : path.includes("message") ? "notes" : "services";
  const step = ["contact_name", "organization", "email", "phone", "notes"].includes(field) ? 4 : ["location_type", "other_location", "postal_code", "house_number", "address", "city"].includes(field) ? 1 : ["end_date", "start_date", "frequency", "flexible"].includes(field) ? 3 : ["details", "area_m2", "visitors"].includes(field) ? 2 : 0;
  return { field, step, message: "Controleer dit veld. " + (issue.code === "custom" ? issue.message : "De ingevulde waarde ontbreekt of voldoet niet aan de toegestane vorm of lengte.") };
}
export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const host = resolveHostContext(request.headers.get("host"), env.APP_URL, env.DEPLOY_TARGET);
    if (host.kind !== "tenant" || host.slug !== VEELE_WEBSITE_SLUG || request.headers.get(TENANT_SLUG_HEADER) !== host.slug) return reply({ ok: false, error: "Aanvraagformulier niet beschikbaar." }, 404);
    const origin = new URL(env.APP_URL); origin.hostname = host.hostname;
    if (request.headers.get("origin") !== origin.origin || !request.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false, error: "Deze aanvraag is niet toegestaan." }, 403);
    const parsed = websiteSubmissionSchema.safeParse(await readBoundedJson(request, 65536));
    if (!parsed.success) return reply({ ok: false, error: "Controleer uw aanvraag.", fields: parsed.error.issues.map(fieldError) }, 422);
    const admin = createAdminClient();
    const { data: tenant, error: lookupError } = await admin.from("tenants").select("id").eq("slug", host.slug).eq("status", "active").maybeSingle();
    if (lookupError) return reply({ ok: false, error: "Aanvragen zijn tijdelijk niet beschikbaar. Uw invoer blijft behouden." }, 503);
    if (!tenant || !await commercialModuleEnabled(admin, tenant.id) || !env.ADMIN_API_SECRET) return reply({ ok: false, error: "Aanvragen zijn tijdelijk niet beschikbaar. Neem contact op met Veele Services." }, 503);
    const mapped = mapWebsiteSubmission(parsed.data, tenant.id, env.ADMIN_API_SECRET);
    const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const clientHash = createHmac("sha256", env.ADMIN_API_SECRET).update(`${tenant.id}:${ip}`).digest("hex");
    const result = await admin.rpc("commercial_website_intake", { target_tenant: tenant.id, request_id: mapped.id, input: mapped.input, additional_notes: mapped.extraNotes, submission_metadata: { ...mapped.metadata, content_hash: mapped.hash, planning_type: parsed.data.inquiry.planning.type }, client_hash: clientHash });
    if (result.error) return reply({ ok: false, error: result.error.code === "23514" ? "Uw aanvraag kon niet worden verwerkt. Probeer dezelfde aanvraag later opnieuw of neem contact op." : "Aanvragen zijn tijdelijk niet beschikbaar. Uw invoer blijft behouden." }, result.error.code === "23514" ? 429 : 503);
    const receipt = z.object({ ok: z.literal(true), reference: z.string().regex(/^AAN-\d{4}-[A-F0-9]{8}$/) }).safeParse(result.data);
    if (!receipt.success) return reply({ ok: false, error: "De ontvangst kon nog niet worden bevestigd. Probeer dezelfde aanvraag opnieuw." }, 503);
    await flushCommercialMail(tenant.id, mapped.id).catch(() => {});
    return reply(receipt.data);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return reply({ ok: false, error: "De aanvraag is te groot. Er is niets afgekapt." }, 413);
    if (error instanceof SyntaxError) return reply({ ok: false, error: "Controleer de aanvraaggegevens." }, 400);
    return reply({ ok: false, error: "De ontvangst kon nog niet worden bevestigd. Probeer dezelfde aanvraag opnieuw; uw invoer blijft behouden." }, 503);
  }
}
