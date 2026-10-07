import { createECDH, generateKeyPairSync } from "node:crypto";

export const productionPromotionFixture = { GITHUB_REPOSITORY: "veele-services/platform", GITHUB_REF: "refs/heads/production", RELEASE_SHA: "a".repeat(40), ACCEPTED_RELEASE_SHA: "a".repeat(40), GH_TOKEN: "FICTITIOUS-ephemeral-actions-token" };

export function productionRuntimeFixture() {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const vapid = createECDH("prime256v1"); vapid.generateKeys();
  return {
    DEPLOY_TARGET: "production", APP_ENV: "production", EXPECTED_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", STAGING_SUPABASE_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb", FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw",
    APP_URL: "https://fieldgrid.nl", HOSTNAME: "127.0.0.1", PORT: "3302", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "FICTITIOUS-production-public-key", SUPABASE_SERVICE_ROLE_KEY: "FICTITIOUS-production-service-key",
    CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl", GOOGLE_ROUTES_ENABLED: "false", MAIL_MARKETING_ENABLED: "false",
    MOLLIE_API_KEY: "live_FICTITIOUS-production-only", MOLLIE_WEBHOOK_URL: "https://fieldgrid.nl/api/mollie/webhook",
    SENDGRID_API_KEY: "SG.FICTITIOUS-production-only", SENDGRID_FROM_NAME: "Fieldgrid", SENDGRID_FROM_EMAIL: "sender@example.invalid",
    SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).toString("base64"), SUPABASE_SEND_EMAIL_HOOK_SECRET: `v1,whsec_${Buffer.alloc(32, 1).toString("base64")}`,
    VAPID_PUBLIC_KEY: vapid.getPublicKey().toString("base64url"), NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.getPublicKey().toString("base64url"), VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString("base64url"), VAPID_SUBJECT: "mailto:operator@example.invalid",
    ADMIN_API_SECRET: "FICTITIOUS-production-worker-secret", NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"), OPENROUTESERVICE_API_KEY: "FICTITIOUS-production-routing",
  };
}
