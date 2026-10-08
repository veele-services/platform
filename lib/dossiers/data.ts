import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ChainScope, DossierChain } from "./model";

const scopeSchema = z.object({ customerId: z.uuid().optional(), objectId: z.uuid().optional(), personnelId: z.uuid().optional(), orderId: z.uuid().optional() });

/** The caller resolves the tenant from its authenticated request; the invoker RPC enforces all dossier and row access. */
export async function loadDossierChain(tenantId: string, scope: ChainScope): Promise<DossierChain> {
  const parsed = scopeSchema.parse(scope);
  const db = await createClient();
  const { data, error } = await db.rpc("dossier_chain", {
    target_tenant: tenantId,
    target_customer: parsed.customerId,
    target_object: parsed.objectId,
    target_personnel: parsed.personnelId,
    target_order: parsed.orderId,
  });
  if (error || !data) throw new Error("De gekoppelde dossiers zijn niet beschikbaar.");
  return data as unknown as DossierChain;
}
