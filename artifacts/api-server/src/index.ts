import app from "./app";
import { logger } from "./lib/logger";

// ── Startup env validation ────────────────────────────────────────────────────
// Fail fast so misconfigured deployments surface immediately in logs rather
// than producing cryptic runtime errors during the first payment attempt.
if (!process.env["MOLLIE_API_KEY"]) {
  logger.warn(
    "MOLLIE_API_KEY is not set — Mollie payment creation and webhook processing will be unavailable.",
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
