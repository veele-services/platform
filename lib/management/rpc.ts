import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type ManagementRpc = "management_context" | "management_query" | "management_pending_transfer" | "management_command" | "management_invitation_access";
/** Fixed allowlist; every RPC verifies the live session, tenant membership and
 * capability inside PostgreSQL. No service-role client is used for commands. */
export async function managementRpc(db: SupabaseClient<Database>, name: ManagementRpc, args: Record<string, Json>) {
  const { data, error } = await db.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as Json;
}
