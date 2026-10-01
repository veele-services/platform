import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** Typed boundary while the new migration's generated database types settle. */
export async function notificationRpc(db: Awaited<ReturnType<typeof createClient>>, name: "notification_query" | "notification_command" | "notification_verification", args: Record<string, unknown>): Promise<unknown> {
  const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  const result = await rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
