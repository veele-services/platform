import { z } from "zod";

const schema = z.object({
  DEPLOY_TARGET: z.literal("staging"),
  APP_ENV: z.literal("development"),
  APP_URL: z.string().url(),
  HOSTNAME: z.literal("127.0.0.1"),
  PORT: z.coerce.number().int().min(1024).max(65535),
  SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  EXPECTED_SUPABASE_PROJECT_REF: z.string().regex(/^[a-z0-9]{20}$/),
  FORBIDDEN_SUPABASE_PROJECT_REF: z.literal("ckdtiuemeygrnujjibnw"),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres")),
  MIGRATION_DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres")),
  BACKUP_DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres")),
  RELEASE_SHA: z.string().regex(/^[0-9a-f]{40}$/),
  DEPLOYMENT_VERSION: z.string().regex(/^[0-9a-f]{40}$/),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: z.string().min(24),
  DEPLOY_ROOT: z.string().startsWith("/").refine((path) => !["/", "/home", "/opt", "/var"].includes(path)),
  SERVICE_NAME: z.literal("fieldgrid@staging.service"),
  HEALTHCHECK_URL: z.string().url(),
  MOLLIE_API_KEY: z.string().min(8),
  MOLLIE_WEBHOOK_URL: z.string().url(),
  SENDGRID_API_KEY: z.string().startsWith("SG.").min(20),
  SENDGRID_FROM_EMAIL: z.string().email(),
  SENDGRID_FROM_NAME: z.literal("Fieldgrid"),
  SENDGRID_API_BASE: z.enum(["https://api.sendgrid.com/", "https://api.eu.sendgrid.com/"]).default("https://api.sendgrid.com/"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(20),
  VAPID_PUBLIC_KEY: z.string().min(20),
  VAPID_PRIVATE_KEY: z.string().min(20),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/),
  ADMIN_API_SECRET: z.string().min(32),
  GOOGLE_ROUTES_ENABLED: z.literal("false"),
  GOOGLE_MAPS_SERVER_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().min(8).optional()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
});

const env = schema.parse(process.env);
if (env.APP_URL !== "https://staging.fieldgrid.nl") throw new Error("Staging vereist de canonieke APP_URL");
if (env.PORT !== 3301) throw new Error("Staging moet op poort 3301 luisteren");
if (env.DEPLOYMENT_VERSION !== env.RELEASE_SHA) throw new Error("DEPLOYMENT_VERSION moet gelijk zijn aan de uit te rollen release-SHA");

const actionKey = Buffer.from(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, "base64");
if (![16, 24, 32].includes(actionKey.length) || actionKey.toString("base64").replace(/=+$/, "") !== env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY.replace(/=+$/, "")) {
  throw new Error("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY moet een geldige base64 AES-sleutel van 16, 24 of 32 bytes zijn");
}

if (env.SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Publieke en server-Supabase-URL wijzen niet naar hetzelfde project");
const projectRef = new URL(env.SUPABASE_URL).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
if (!projectRef || projectRef !== env.EXPECTED_SUPABASE_PROJECT_REF) throw new Error("Supabase-URL komt niet overeen met EXPECTED_SUPABASE_PROJECT_REF");
if (projectRef === env.FORBIDDEN_SUPABASE_PROJECT_REF || env.EXPECTED_SUPABASE_PROJECT_REF === env.FORBIDDEN_SUPABASE_PROJECT_REF) {
  throw new Error("Supabase-projectref is expliciet verboden voor deze omgeving");
}

function assertDatabaseProject(name: string, value: string) {
  const url = new URL(value);
  const direct = url.hostname === `db.${env.EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
  const pooled = decodeURIComponent(url.username).endsWith(`.${env.EXPECTED_SUPABASE_PROJECT_REF}`);
  if (!direct && !pooled) throw new Error(`${name} is niet aantoonbaar gekoppeld aan het verwachte Supabaseproject`);
}
assertDatabaseProject("MIGRATION_DATABASE_URL", env.MIGRATION_DATABASE_URL);
assertDatabaseProject("BACKUP_DATABASE_URL", env.BACKUP_DATABASE_URL);
assertDatabaseProject("DATABASE_URL", env.DATABASE_URL);

const appRoot = env.APP_URL.replace(/\/$/, "");
if (env.MOLLIE_WEBHOOK_URL !== `${appRoot}/api/mollie/webhook`) throw new Error("MOLLIE_WEBHOOK_URL moet naar de webhookroute van APP_URL wijzen");
if (env.HEALTHCHECK_URL !== `${appRoot}/api/healthz`) throw new Error("HEALTHCHECK_URL moet exact de healthcheckroute van APP_URL zijn");
if (!env.MOLLIE_API_KEY.startsWith("test_")) throw new Error("Staging vereist een Mollie test-key");
if (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY !== env.VAPID_PUBLIC_KEY) throw new Error("Publieke en server-VAPID-public key moeten gelijk zijn");
if (env.DEPLOY_ROOT !== "/opt/fieldgrid/staging") throw new Error("Staging vereist de canonieke DEPLOY_ROOT");

console.log(`Preflight geslaagd voor ${env.DEPLOY_TARGET}; release ${env.RELEASE_SHA.slice(0, 12)}.`);
