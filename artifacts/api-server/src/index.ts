import app from "./app";
import { logger } from "./lib/logger";
import { isFcmConfigured } from "./lib/native-push";

// ── Startup env validation ────────────────────────────────────────────────────
// MOLLIE_API_KEY is required for payment creation and webhook processing.
// We hard-fail at startup so misconfigured deployments surface immediately
// rather than producing cryptic runtime errors during the first payment.
if (!process.env["MOLLIE_API_KEY"]) {
  logger.error(
    "MOLLIE_API_KEY is not set — cannot process Mollie payments. Set the secret and restart.",
  );
  process.exit(1);
}

// Outgoing email is configured through platform_email_providers in the database.
// FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY is required when saving provider secrets.

if (
  !(process.env["VAPID_PUBLIC_KEY"] ?? process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]) ||
  !process.env["VAPID_PRIVATE_KEY"] ||
  !process.env["VAPID_SUBJECT"]
) {
  logger.warn(
    "VAPID keys are not fully configured - Web Push delivery is disabled until " +
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set.",
  );
}

if (process.env["FCM_ENABLED"] === "true" && !isFcmConfigured()) {
  logger.warn(
    "FCM_ENABLED=true maar FCM service-account configuratie ontbreekt. " +
      "Native Capacitor push delivery blijft uitgeschakeld totdat FCM_SERVICE_ACCOUNT_JSON_BASE64 " +
      "of FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY is gezet.",
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
