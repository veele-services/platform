import { createECDH, createPublicKey } from "node:crypto";
import { assertProductionProject } from "./production-database";

/** Validate the same fixed contract in preflight and the running application.
 * Diagnostics name settings only, never schema input or provider responses. */
export function assertProductionRuntime(env: Record<string, string | undefined>) {
  assertProductionProject(env);
  const fixed = {
    APP_URL: "https://fieldgrid.nl", HOSTNAME: "127.0.0.1", PORT: "3302",
    CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl",
    GOOGLE_ROUTES_ENABLED: "false", MAIL_MARKETING_ENABLED: "false",
    MOLLIE_WEBHOOK_URL: "https://fieldgrid.nl/api/mollie/webhook", SENDGRID_FROM_NAME: "Fieldgrid",
  };
  for (const [name, value] of Object.entries(fixed)) if (env[name] !== value) throw new Error(`Productie vereist de vaste instelling ${name}.`);
  if (env.SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Productie Supabase-URLs wijken af.");
  const required = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL", "SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY", "SUPABASE_SEND_EMAIL_HOOK_SECRET", "VAPID_PUBLIC_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "ADMIN_API_SECRET", "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", "OPENROUTESERVICE_API_KEY"];
  for (const name of required) if (!env[name]) throw new Error(`Productieconfiguratie ontbreekt: ${name}.`);
  if (!env.MOLLIE_API_KEY?.startsWith("live_") || env.MOLLIE_API_KEY.length < 8) throw new Error("Productie vereist een Mollie live-key.");
  if (!env.SENDGRID_API_KEY?.startsWith("SG.") || env.SENDGRID_API_KEY.length < 20 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SENDGRID_FROM_EMAIL!)) throw new Error("Productie SendGrid-configuratie ongeldig.");
  if (env.VAPID_PUBLIC_KEY !== env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT!)) throw new Error("Productie VAPID-configuratie ongeldig.");
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY!, "base64url"));
    if (curve.getPublicKey().toString("base64url") !== env.VAPID_PUBLIC_KEY) throw new Error();
  } catch { throw new Error("Productie VAPID-keypair ongeldig."); }
  if (env.ADMIN_API_SECRET!.length < 32 || env.OPENROUTESERVICE_API_KEY!.length < 10 || env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.length < 20 || env.SUPABASE_SERVICE_ROLE_KEY!.length < 20) throw new Error("Productiesleutels hebben een ongeldige lengte.");
  const action = env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY!;
  const decoded = Buffer.from(action, "base64");
  if (![16, 24, 32].includes(decoded.length) || decoded.toString("base64").replace(/=+$/, "") !== action.replace(/=+$/, "")) throw new Error("Productie Server Actions AES-sleutel ongeldig.");
  const hook = env.SUPABASE_SEND_EMAIL_HOOK_SECRET!;
  if (!/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/.test(hook) || Buffer.from(hook.slice("v1,whsec_".length), "base64").length < 32) throw new Error("Productie Auth-hooksecret ongeldig.");
  try {
    const key = env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY!;
    const parsed = key.includes("BEGIN PUBLIC KEY") ? createPublicKey(key) : createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" });
    if (parsed.asymmetricKeyType !== "ec") throw new Error();
  } catch { throw new Error("Productie SendGrid-webhookverificatiesleutel ongeldig."); }
}
