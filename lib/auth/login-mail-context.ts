import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";

/** Only a proxy-validated hostname reaches this service-only preparation. */
export async function prepareLoginMailContext(slug: string | null, email: string) {
  return z.uuid().nullable().parse(await ticketRpc(createAdminClient(), "email_auth_login_prepare", { target_slug: slug, recipient: email }));
}
export async function releaseLoginMailContext(id: string) {
  await ticketRpc(createAdminClient(), "email_auth_login_release", { target_request: id });
}
