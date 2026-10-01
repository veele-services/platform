import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** Single typed boundary until the migration's generated types are refreshed. */
export async function ticketRpc(db: Awaited<ReturnType<typeof createClient>>, name: string, args: Record<string, unknown>): Promise<unknown> {
  const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw error;
  return data;
}
