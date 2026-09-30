import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CustomerData, CustomerDocument } from "./model";
import type { DossierChain } from "@/lib/dossiers/model";
import { operationalOrderRows } from "@/lib/work-orders/operational-data";

async function all<T>(
  fetch: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const r = await fetch(from, from + 499);
    if (r.error)
      throw new Error(
        "Het klantdossier kon niet volledig worden geladen. Probeer opnieuw.",
      );
    out.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 500) return out;
  }
}
export async function getCustomerData(
  tenant: string,
  id: string,
  finance: boolean,
): Promise<CustomerData | null> {
  const db = await createClient();
  const c = await db
    .from("customers")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("id", id)
    .maybeSingle();
  if (c.error) throw new Error("Klant niet beschikbaar.");
  if (!c.data) return null;
  const settings = await db
    .from("tenant_settings")
    .select("payment_terms_days")
    .eq("tenant_id", tenant)
    .single();
  if (settings.error)
    throw new Error("De betaalafspraken konden niet worden geladen.");
  const [contacts, objects, notes, documents, orders, owners, chain, invoices] =
    await Promise.all([
      all((a, b) =>
        db
          .from("customer_contacts")
          .select("*")
          .eq("tenant_id", tenant)
          .eq("customer_id", id)
          .order("is_primary", { ascending: false })
          .order("id")
          .range(a, b),
      ),
      all((a, b) =>
        db
          .from("objects")
          .select(
            "id,customer_id,object_number,name,address,object_type,dossier_status,version",
          )
          .eq("tenant_id", tenant)
          .eq("customer_id", id)
          .order("name")
          .order("id")
          .range(a, b),
      ),
      all((a, b) =>
        db
          .from("customer_notes")
          .select("*")
          .eq("tenant_id", tenant)
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      ),
      all((a, b) =>
        db
          .from("customer_documents")
          .select(
            "id,tenant_id,customer_id,title,file_name,mime_type,size_bytes,created_at,created_by,previous_id,version,document_on,valid_until,category,visibility,archived,metadata_version",
          )
          .eq("tenant_id", tenant)
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      ),
      operationalOrderRows(db,tenant,{customerId:id,all:true}).then(result=>result.data),
      db.rpc("customer_owners", { target_tenant: tenant }),
      db.rpc("dossier_chain", { target_tenant: tenant, target_customer: id }),
      finance
        ? all((a, b) =>
            db
              .from("invoices")
              .select("*")
              .eq("tenant_id", tenant)
              .eq("customer_id", id)
              .order("created_at", { ascending: false })
              .order("id")
              .range(a, b),
          )
        : [],
    ]);
  if (owners.error || chain.error)
    throw new Error("Gekoppelde klantgegevens zijn niet beschikbaar.");
  const objectIds = objects.map((o) => o.id),
    orderIds = orders.map((o) => o.id);
  const [records, assignments, tasks, revisions, invoiceLines, history] =
    await Promise.all([
      objectIds.length
        ? all((a, b) =>
            db
              .from("object_records")
              .select("*")
              .eq("tenant_id", tenant)
              .in("object_id", objectIds)
              .in("kind", ["quality", "programme", "task"])
              .order("id")
              .range(a, b),
          )
        : [],
      orderIds.length
        ? all((a, b) =>
            db
              .from("work_order_assignments")
              .select("id,work_order_id,personnel_id")
              .eq("tenant_id", tenant)
              .in("work_order_id", orderIds)
              .order("id")
              .range(a, b),
          )
        : [],
      finance
        ? all((a, b) =>
            db
              .from("task_catalog")
              .select("*")
              .eq("tenant_id", tenant)
              .eq("active", true)
              .order("id")
              .range(a, b),
          )
        : [],
      finance
        ? all((a, b) =>
            db
              .from("task_revisions")
              .select("*")
              .eq("tenant_id", tenant)
              .order("id")
              .range(a, b),
          )
        : [],
      invoices.length
        ? all((a, b) =>
            db
              .from("invoice_lines")
              .select("*")
              .eq("tenant_id", tenant)
              .in(
                "invoice_id",
                invoices.map((i) => i.id),
              )
              .order("id")
              .range(a, b),
          )
        : [],
      db.rpc("customer_history", {
        target_tenant: tenant,
        target_customer: id,
      }),
    ]);
  if (history.error)
    throw new Error("De tijdlijn is tijdelijk niet beschikbaar.");
  const followup = await db.rpc("customer_commercial_followup", {
    target_tenant: tenant,
    target_customer: id,
  });
  if (followup.error)
    throw new Error("Commerciële opvolging kon niet worden geladen.");
  const personnelIds = [...new Set(assignments.map((a) => a.personnel_id))];
  const personnel = personnelIds.length
    ? await all((a, b) =>
        db
          .from("personnel")
          .select("id,full_name")
          .eq("tenant_id", tenant)
          .in("id", personnelIds)
          .order("id")
          .range(a, b),
      )
    : [];
  const chainData = chain.data as unknown as DossierChain;
  return {
    commercialFollowup: followup.data as CustomerData["commercialFollowup"],
    defaultPaymentTermsDays: settings.data.payment_terms_days,
    customer: c.data,
    contacts,
    objects,
    notes,
    documents: documents as CustomerDocument[],
    orders,
    owners: owners.data ?? [],
    chain: chainData,
    agreements: chainData.agreements,
    invoices,
    records,
    assignments,
    tasks,
    revisions,
    invoiceLines,
    personnel,
    history: history.data as CustomerData["history"],
  };
}
