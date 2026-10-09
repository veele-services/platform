import "server-only";
import { headers } from "next/headers";
import { requirePlatformAdmin } from "./data";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { ticketRpc } from "@/lib/tickets/rpc";
import { supportSnapshotSchema } from "./team-model";

export async function getPlatformTeamActor() {
  if ((await headers()).get(TENANT_SLUG_HEADER)) throw new Error("Open de Fieldgrid-platformomgeving.");
  await requirePlatformAdmin();
  return { db: await createClient() };
}
export async function getPlatformTeam() {
  const actor = await getPlatformTeamActor();
  return supportSnapshotSchema.parse(await ticketRpc(actor.db, "platform_team_query", {}));
}
