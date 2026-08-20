import "server-only";
import {
  consumeGoogleMapsRateLimit,
  type GoogleMapsRateLimitAction,
} from "@workspace/db/google-maps-rate-limit";

export function checkCustomerGoogleMapsRateLimit(input: {
  tenantId: string;
  userId: string;
  action: Extract<GoogleMapsRateLimitAction, "places_autocomplete" | "place_details">;
}) {
  return consumeGoogleMapsRateLimit({
    tenantId: input.tenantId,
    actorKey: input.userId,
    action: input.action,
  });
}
