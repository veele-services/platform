import "server-only";
import {
  consumeGoogleMapsRateLimit,
} from "@workspace/db/google-maps-rate-limit";

export function checkGoogleMapsRateLimit(input: {
  tenantId: string;
  userId: string | null;
  action: "places_autocomplete" | "place_details" | "route_request" | "usage_event";
}) {
  return consumeGoogleMapsRateLimit({
    tenantId: input.tenantId,
    actorKey: input.userId,
    action: input.action,
  });
}
