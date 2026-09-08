import app from "./app";
import { pool } from "@workspace/db";
import { createCustomWebsiteHealthRefresher } from "./lib/custom-website-health-refresher";
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

if (!process.env["MOLLIE_WEBHOOK_SECRET"]) {
  logger.error(
    "MOLLIE_WEBHOOK_SECRET is not set — payment callbacks are fail-closed. Set the ingress HMAC secret and restart.",
  );
  process.exit(1);
}

// Outgoing email is configured through platform_email_providers in the database.
// FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY is required when saving provider secrets.

if (
  !(
    process.env["VAPID_PUBLIC_KEY"] ??
    process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]
  ) ||
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

// Configuration is validated before the listener becomes healthy. When the
// staging-only refresher is enabled, an invalid actor or route registry is a
// startup error rather than a silently stale custom website.
const customWebsiteHealthRefresher = createCustomWebsiteHealthRefresher();
const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  customWebsiteHealthRefresher.start();
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

let shutdownStarted = false;
async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  logger.info({ signal }, "Server shutdown started");
  try {
    await customWebsiteHealthRefresher.stop();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise();
      });
    });
    await pool.end();
    logger.info({ signal }, "Server shutdown completed");
    process.exit(0);
  } catch (err) {
    logger.error({ err, signal }, "Server shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
