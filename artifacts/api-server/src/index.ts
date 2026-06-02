import app from "./app";
import { logger } from "./lib/logger";

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

// RESEND_API_KEY is optional at startup but required for email delivery.
// Warn loudly so operators are alerted; email sending fails gracefully at runtime.
if (!process.env["RESEND_API_KEY"]) {
  logger.warn(
    "RESEND_API_KEY is not set — e-mail notificaties zijn uitgeschakeld. " +
    "Stel de variabele in en herstart de server om e-mails in te schakelen.",
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
