import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WorkOrderDossier, WorkOrderListData, WorkOrderOptions, WorkOrderQuery } from "./model";

export async function getWorkOrderList(tenantId: string, query: WorkOrderQuery): Promise<WorkOrderListData> {
  const db = await createClient();
  const { data, error } = await db.rpc("work_order_list", { target_tenant: tenantId, filters: query });
  if (error) throw new Error("De werkbonnen konden niet worden geladen. Probeer opnieuw.");
  return data as unknown as WorkOrderListData;
}
export async function getWorkOrderOptions(tenantId: string): Promise<WorkOrderOptions> {
  const db = await createClient();
  const { data, error } = await db.rpc("work_order_options", { target_tenant: tenantId });
  if (error) throw new Error("De gegevens voor de werkbon konden niet worden geladen.");
  return data as unknown as WorkOrderOptions;
}
export async function getWorkOrderDossier(tenantId: string, id: string): Promise<WorkOrderDossier | null> {
  const db = await createClient();
  const { data, error } = await db.rpc("work_order_dossier", { target_tenant: tenantId, target_order: id });
  if (error) throw new Error("Het werkbondossier kon niet worden geladen.");
  return data as unknown as WorkOrderDossier | null;
}
