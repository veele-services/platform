import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { stagingDatabaseUrl } from "../env/staging-database";

const origin = "https://staging.fieldgrid.nl";
type Environment = Record<string, string | undefined>;
type Database = {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: unknown[] }>;
  end(): Promise<unknown>;
};
type Dependencies = {
  fetch: typeof fetch;
  database(connectionString: string): Database;
  log(line: string): void;
};
const count = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const windowMinutes = z.union([z.literal(60), z.literal(1440)]);
const hookState = z.enum(["processing", "done", "failed", "uncertain", "blocked"]);
const transportState = z.enum(["admitted", "accepted", "delivered", "deferred", "blocked", "bounced", "failed", "uncertain", "cancelled"]);
const reason = z.enum(["none", "email_emergency_stop", "email_rule_off", "recipient_suppressed_or_no_consent", "tenant_inactive", "interrupted_send", "other"]);
const providerEvent = z.enum(["processed", "delivered", "deferred", "bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe", "group_resubscribe", "other"]);

// Fixed SQL only. No recipient, hash, identifier, subject, body or provider ID
// crosses the diagnostic boundary. Unknown free-text labels become "other".
const aggregates = [
  {
    name: "hook_receipts",
    schema: z.object({ window_minutes: windowMinutes, state: hookState, count }).strict(),
    sql: `select w.minutes as window_minutes, r.state, count(*)::text as count
      from (values(60),(1440)) w(minutes) join private.email_hook_receipts r
       on r.created_at>=now()-make_interval(mins=>w.minutes)
      group by w.minutes,r.state order by w.minutes,r.state`,
  },
  {
    name: "auth_transports",
    schema: z.object({ window_minutes: windowMinutes, state: transportState, reason, count }).strict(),
    sql: `select w.minutes as window_minutes,t.state,
      case when t.reason is null then 'none'
       when t.reason in('email_emergency_stop','email_rule_off','recipient_suppressed_or_no_consent','tenant_inactive','interrupted_send') then t.reason
       else 'other' end as reason,count(*)::text as count
      from (values(60),(1440)) w(minutes) join private.email_transports t
       on t.created_at>=now()-make_interval(mins=>w.minutes)
      where t.purpose='security' and t.type_code='security.auth_hook'
      group by w.minutes,t.state,3 order by w.minutes,t.state,3`,
  },
  {
    name: "auth_provider_events",
    schema: z.object({ window_minutes: windowMinutes, event: providerEvent, count }).strict(),
    sql: `select w.minutes as window_minutes,
      case when e.event in('processed','delivered','deferred','bounce','dropped','spamreport','unsubscribe','group_unsubscribe','group_resubscribe') then e.event else 'other' end as event,
      count(*)::text as count
      from (values(60),(1440)) w(minutes) join private.email_provider_events e
       on e.received_at>=now()-make_interval(mins=>w.minutes)
      join private.email_transports t on t.id=e.transport_id
      where t.purpose='security' and t.type_code='security.auth_hook'
      group by w.minutes,2 order by w.minutes,2`,
  },
  {
    name: "mail_policy",
    schema: z.object({ scope: z.enum(["platform", "tenants"]), total: count, stopped: count, security_disabled: count, auth_hook_disabled: count }).strict(),
    sql: `select case when scope_key='platform' then 'platform' else 'tenants' end as scope,
      count(*)::text as total,count(*) filter(where stopped)::text as stopped,
      count(*) filter(where 'security'=any(disabled_categories))::text as security_disabled,
      count(*) filter(where 'security.auth_hook'=any(disabled_types))::text as auth_hook_disabled
      from private.email_settings group by 1 order by 1`,
  },
] as const;

export function authMailDiagnosticConfiguration(env: Environment) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REF !== "refs/heads/main" ||
      env.APP_URL !== origin || !/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? "")) {
    throw new Error("Diagnose geweigerd: reviewed main, vaste stagingorigin en volledige release-SHA zijn vereist.");
  }
  const databaseUrl = stagingDatabaseUrl("MIGRATION_DATABASE_URL", env);
  // pg URI sslmode can overwrite the explicit CA object in the runner.
  databaseUrl.searchParams.delete("sslmode");
  const encoded = env.SUPABASE_SEND_EMAIL_HOOK_SECRET?.replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || Buffer.from(encoded, "base64").length < 32) {
    throw new Error("Diagnose geweigerd: ondertekenconfiguratie ontbreekt of is ongeldig.");
  }
  return { connectionString: databaseUrl.href, signingKey: Buffer.from(encoded, "base64"), release: env.RELEASE_SHA! };
}

export async function diagnoseAuthMail(env: Environment, dependencies: Dependencies): Promise<boolean> {
  let phase = "configuration";
  try {
    const configuration = authMailDiagnosticConfiguration(env);
    phase = "health";
    const health = new URL("/api/healthz", origin);
    health.searchParams.set("release", configuration.release);
    const response = await dependencies.fetch(health, {
      redirect: "manual", credentials: "omit", cache: "no-store",
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error();
    }
    const healthBody = await response.json();
    if (healthBody?.status !== "ok" || healthBody.environment !== "staging" || healthBody.database !== "ready" ||
        healthBody.scanner !== "ready" || healthBody.release !== configuration.release) throw new Error();
    dependencies.log("health: exact_staging_release_ready");

    phase = "probe";
    let probesPassed = true;
    for (const signed of [false, true]) {
      const body = "{}"; // Deliberately fails schema before context/receipt/transport.
      const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
      if (signed) {
        const id = `fieldgrid-diagnostic-${randomUUID()}`, timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = createHmac("sha256", configuration.signingKey).update(`${id}.${timestamp}.${body}`).digest("base64");
        headers.set("webhook-id", id); headers.set("webhook-timestamp", timestamp); headers.set("webhook-signature", `v1,${signature}`);
      }
      try {
        const result = await dependencies.fetch(`${origin}/api/email/auth`, {
          method: "POST", body, headers, redirect: "manual", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000),
        });
        await result.body?.cancel().catch(() => undefined);
        const expected = signed ? 400 : 401;
        probesPassed = probesPassed && result.status === expected;
        dependencies.log(`probe_${signed ? "signed" : "unsigned"}: ${[400,401,403,404,409,413,429,500,502,503,504].includes(result.status) ? result.status : "unexpected_status"}`);
      } catch {
        probesPassed = false;
        dependencies.log(`probe_${signed ? "signed" : "unsigned"}: transport_failure`);
      }
    }

    phase = "database";
    const db = dependencies.database(configuration.connectionString);
    try {
      await db.connect();
      await db.query("begin transaction isolation level repeatable read read only");
      for (const aggregate of aggregates) {
        const result = await db.query(aggregate.sql);
        if (result.rows.length > 200) throw new Error();
        const rows = result.rows.map(row => aggregate.schema.parse(row));
        dependencies.log(`${aggregate.name}: ${JSON.stringify(rows)}`);
      }
    } finally {
      await db.query("rollback").catch(() => undefined);
      await db.end().catch(() => undefined);
    }
    dependencies.log("interpretation: signed_400_checks_runtime_secret_only; no_receipts_can_also_mean_context_rejection; accepted_is_not_delivery");
    return probesPassed;
  } catch {
    // Do not relay URL, TLS, SQL, Zod or provider errors: all can hold secrets.
    throw new Error(`Auth-maildiagnose gestopt tijdens ${phase}; ruwe gegevens worden niet gelogd.`);
  }
}
