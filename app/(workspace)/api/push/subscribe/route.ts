import { notificationPushPost } from "@/lib/notifications/push-device";
import { z } from "zod";
// Keep existing clients on the one device-binding implementation.
export async function POST(request: Request) {
  return notificationPushPost(request, value => ({ workspace: "staff", action: "subscribe", subscription: z.object({ endpoint: z.string(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(value) }));
}
export async function DELETE(request: Request) {
  return notificationPushPost(request, value => ({ workspace: "staff", action: "unsubscribe", subscription: z.object({ endpoint: z.string() }).parse(value) }));
}
