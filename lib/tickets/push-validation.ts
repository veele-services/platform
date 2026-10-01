import { z } from "zod";
import { ticketWorkspaceSchema } from "./model";

// Deliberately not a general HTTP destination. Keep in sync with the RPC so a
// direct Data API call cannot turn notification delivery into a URL fetcher.
export const ticketPushEndpointPattern = /^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.notify\.windows\.com)(?::443)?\/[^\s#]*$/;
export function ticketPushEndpointAllowed(endpoint: string) {
  if (endpoint.length > 4096 || /[\s#\\]/.test(endpoint) || !ticketPushEndpointPattern.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443");
  } catch { return false; }
}
const endpoint = z.string().refine(ticketPushEndpointAllowed, "Pushprovider niet ondersteund");
export const ticketPushRequestSchema = z.discriminatedUnion("action", [
  z.object({ workspace: ticketWorkspaceSchema, action: z.literal("subscribe"), subscription: z.object({ endpoint, keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}(?:==)?$/) }).strict() }).strict() }).strict(),
  z.object({ workspace: ticketWorkspaceSchema, action: z.literal("unsubscribe"), subscription: z.object({ endpoint }).strict() }).strict(),
]);
