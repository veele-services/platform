"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { addressFromForm } from "@/lib/addresses/form";
import {
  canManageCustomers,
  customerFilters,
  type CustomerList,
} from "@/lib/customers/model";
import type { ActionResult } from "@/lib/actions/result";
import type { Json } from "@/lib/database.types";
import { reportRpc } from "@/lib/work-orders/report-rpc";

async function actor() {
  const ctx = await getAuthContext();
  if (
    !ctx.tenant ||
    !canManageCustomers(ctx.tenant.roles) ||
    !ctx.tenant.enabledServices.includes("planning")
  )
    throw new Error();
  return { tenant: ctx.tenant, db: await createClient() };
}
function failure(e: unknown) {
  const error = e as { code?: string; message?: string };
  return e instanceof z.ZodError
    ? "Controleer de verplichte velden en de ingevoerde waarden."
    : ["23514", "40001"].includes(error?.code ?? "")
      ? error.message || "De gegevens zijn gewijzigd."
      : error?.code === "23503"
        ? "Er zijn gekoppelde gegevens. Archiveer deze relatie zodat de historie bewaard blijft."
        : "Opslaan niet gelukt. Controleer je toegang en probeer opnieuw.";
}
export async function readCustomers(
  filters: unknown,
): Promise<ActionResult<{ data: CustomerList }>> {
  try {
    const { db, tenant } = await actor();
    const r = await db.rpc("customer_list", {
      target_tenant: tenant.id,
      filters: customerFilters.parse(filters),
    });
    if (r.error) throw r.error;
    return { ok: true, data: r.data as unknown as CustomerList };
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}
export async function customerCommand(
  command: string,
  input: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, tenant } = await actor();
    z.enum([
      "customer_save",
      "customer_archive",
      "customer_delete",
      "contact_save",
      "note_save",
      "note_complete",
      "document_metadata",
      "agreement_save",
    ]).parse(command);
    z.uuid().parse(requestId);
    z.uuid().parse(input.id);
    if (JSON.stringify(input).length > 150000) throw new Error();
    const r = await db.rpc("customer_command", {
      target_tenant: tenant.id,
      request_id: requestId,
      command,
      input: input as Json,
    });
    if (r.error) throw r.error;
    revalidatePath("/app", "layout");
    revalidatePath("/klant", "layout");
    return { ok: true, id: (r.data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}

export async function updateCustomerDocumentMetadata(
  input: unknown,
): Promise<ActionResult> {
  try {
    const { db, tenant } = await actor();
    const value = z.object({
      id: z.uuid(),
      version: z.number().int().positive(),
      category: z.enum(["agreement", "correspondence", "report", "photo", "other"]),
      visibility: z.enum(["internal", "customer"]),
      portalObjectId: z.uuid().nullable(),
      archived: z.boolean(),
    }).parse(input);
    if (value.visibility === "customer" && !value.portalObjectId)
      return { ok: false, error: "Kies het object waarvoor dit document zichtbaar mag zijn." };
    await reportRpc(db, "customer_document_metadata", {
      target_tenant: tenant.id,
      target_document: value.id,
      expected_version: value.version,
      input_category: value.category,
      input_visibility: value.visibility,
      portal_object: value.visibility === "customer" ? value.portalObjectId : null,
      input_archived: value.archived,
    });
    revalidatePath("/app", "layout");
    revalidatePath("/klant", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}
export async function saveCustomerProfile(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const str = (key: string) => String(form.get(key) ?? "");
    const input = z
      .object({
        id: z.uuid(),
        version: z.coerce.number().int().min(0),
        name: z.string().trim().min(2).max(160),
        type: z.enum([
          "business",
          "private",
          "association",
          "government",
          "other",
        ]),
        status: z.enum([
          "draft",
          "lead",
          "active",
          "paused",
          "inactive",
          "archived",
        ]),
        email: z.email().or(z.literal("")),
        billingEmail: z.email().or(z.literal("")),
        contactEmail: z.email().or(z.literal("")),
        paymentTerms: z.coerce.number().int().min(0).max(365),
        ownerId: z.uuid().or(z.literal("")),
      })
      .parse(Object.fromEntries(form));
    // A shared billing/visit address is one confirmation, not two provider
    // lookups with potentially different data or confirmation timestamps.
    const visitAddressResult = addressFromForm(form, "visitAddress");
    const [visitAddress, billingAddress] = await Promise.all([
      visitAddressResult,
      form.get("sameAddress") === "on"
        ? visitAddressResult
        : addressFromForm(form, "billingAddress"),
    ]);
    const extra = Object.fromEntries(
      [
        "legalName",
        "tradeName",
        "phone",
        "website",
        "companyNumber",
        "vatNumber",
        "invoiceChannel",
        "invoiceContact",
        "reference",
        "costCenter",
        "since",
        "preferences",
        "contactName",
        "contactPhone",
        "contactRole",
      ].map((key) => [key, str(key)]),
    );
    return customerCommand(
      "customer_save",
      {
        ...extra,
        ...input,
        visitAddress,
        billingAddress,
        remindersEnabled: form.get("remindersEnabled") === "on",
        referenceRequired: form.get("referenceRequired") === "on",
        services: str("services")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        contactLabels: form.getAll("contactLabels"),
      },
      str("requestId"),
    );
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}
export async function saveCustomerContact(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = z
      .object({
        id: z.uuid(),
        customerId: z.uuid(),
        version: z.coerce.number().int().min(0),
        fullName: z.string().trim().min(2).max(180),
        email: z.email().or(z.literal("")),
        phone: z.string().max(50),
        role: z.string().max(180),
        organization: z.string().max(180),
        availability: z.string().max(1000),
        activeFrom: z.iso.date().or(z.literal("")),
        activeUntil: z.iso.date().or(z.literal("")),
      })
      .parse(Object.fromEntries(form));
    return customerCommand(
      "contact_save",
      {
        ...input,
        labels: form.getAll("labels"),
        objectIds: form.getAll("objectIds"),
        primary: form.get("primary") === "on",
        active: form.get("active") === "on",
      },
      String(form.get("requestId")),
    );
  } catch (e) {
    return { ok: false, error: failure(e) };
  }
}
