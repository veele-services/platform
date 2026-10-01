import { notificationPushPost } from "@/lib/notifications/push-device";
import { ticketPushRequestSchema } from "@/lib/tickets/push-validation";
// Tickets share the account/origin lifecycle, not another registration.
export async function POST(request: Request) {
  return notificationPushPost(request, raw => { const value = ticketPushRequestSchema.parse(raw); return { ...value, workspace: value.workspace === "tenant" || value.workspace === "support" ? "backoffice" : value.workspace }; });
}
