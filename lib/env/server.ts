import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  APP_ENV: z.enum(["development", "production"]),
  DEPLOY_TARGET: z.enum(["local", "staging", "production"]).default("local"),
  APP_URL: z.string().url(),
  HOSTNAME: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().min(1).optional(),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),
  EXPECTED_SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  FORBIDDEN_SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MOLLIE_API_KEY: z.string().min(8).optional(),
  MOLLIE_WEBHOOK_URL: z.string().url().optional(),
  SENDGRID_API_KEY: z.string().min(20).optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().min(2).default("Fieldgrid"),
  SENDGRID_API_BASE: z.enum(["https://api.sendgrid.com/", "https://api.eu.sendgrid.com/"]).default("https://api.sendgrid.com/"),
  GOOGLE_MAPS_SERVER_API_KEY: z.string().min(8).optional(),
  GOOGLE_ROUTES_ENABLED: z.enum(["true", "false"]).default("false"),
  VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().min(3).optional(),
  ADMIN_API_SECRET: z.string().min(32).optional(),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: z.string().min(24).optional(),
  NOTIFICATION_WORKER_LIMIT: z.coerce.number().int().min(1).max(100).default(25),
  NOTIFICATION_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  NOTIFICATION_WORKER_BASE_RETRY_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  NOTIFICATION_WORKER_MAX_RETRY_SECONDS: z.coerce.number().int().min(30).max(86400).default(3600),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

function projectRef(url: string): string | undefined {
  const hostname = new URL(url).hostname;
  return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : undefined;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.parse(process.env);
  const ref = projectRef(parsed.SUPABASE_URL);
  const publicRef = projectRef(parsed.NEXT_PUBLIC_SUPABASE_URL);
  if (parsed.EXPECTED_SUPABASE_PROJECT_REF && ref !== parsed.EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error("Supabase project does not match EXPECTED_SUPABASE_PROJECT_REF");
  }
  if (parsed.FORBIDDEN_SUPABASE_PROJECT_REF && ref === parsed.FORBIDDEN_SUPABASE_PROJECT_REF) {
    throw new Error("Refusing to use FORBIDDEN_SUPABASE_PROJECT_REF");
  }
  if (parsed.DEPLOY_TARGET === "staging") {
    if (parsed.APP_ENV !== "development") throw new Error("Staging requires APP_ENV=development");
    if (parsed.APP_URL !== "https://staging.fieldgrid.nl") throw new Error("Unexpected staging APP_URL");
    if (parsed.HOSTNAME !== "127.0.0.1" || parsed.PORT !== 3301) throw new Error("Unexpected staging bind address");
    if (!parsed.EXPECTED_SUPABASE_PROJECT_REF || !parsed.FORBIDDEN_SUPABASE_PROJECT_REF) {
      throw new Error("Staging requires both Supabase project-ref guards");
    }
    if (parsed.FORBIDDEN_SUPABASE_PROJECT_REF !== "ckdtiuemeygrnujjibnw") {
      throw new Error("Unexpected production Supabase project-ref guard");
    }
    if (parsed.EXPECTED_SUPABASE_PROJECT_REF === parsed.FORBIDDEN_SUPABASE_PROJECT_REF) {
      throw new Error("Staging and forbidden Supabase project refs must differ");
    }
    if (ref !== parsed.EXPECTED_SUPABASE_PROJECT_REF || publicRef !== parsed.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new Error("Staging Supabase URLs do not match EXPECTED_SUPABASE_PROJECT_REF");
    }
    if (!parsed.MOLLIE_API_KEY?.startsWith("test_") || parsed.MOLLIE_WEBHOOK_URL !== `${parsed.APP_URL}/api/mollie/webhook`) {
      throw new Error("Staging requires Mollie test configuration");
    }
    if (!parsed.SENDGRID_API_KEY || !parsed.SENDGRID_FROM_EMAIL) throw new Error("Staging requires SendGrid configuration");
    if (!parsed.VAPID_PUBLIC_KEY || parsed.VAPID_PUBLIC_KEY !== parsed.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !parsed.VAPID_PRIVATE_KEY || !parsed.VAPID_SUBJECT) {
      throw new Error("Staging requires one matching VAPID key pair");
    }
    if (!parsed.ADMIN_API_SECRET || !parsed.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) {
      throw new Error("Staging runtime secrets are incomplete");
    }
    const actionKey = Buffer.from(parsed.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, "base64");
    if (![16, 24, 32].includes(actionKey.length) || actionKey.toString("base64").replace(/=+$/, "") !== parsed.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY.replace(/=+$/, "")) {
      throw new Error("Staging Server Actions encryption key is invalid");
    }
    if (parsed.GOOGLE_ROUTES_ENABLED !== "false") throw new Error("Google Routes is disabled for staging V1");
  }
  cached = parsed;
  return parsed;
}

export function requireProvider<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (value === undefined || value === "") throw new Error(`Providerconfiguratie ontbreekt: ${String(key)}`);
  return value as NonNullable<ServerEnv[K]>;
}
