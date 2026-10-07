import { assertProductionProject } from "../env/production-database";

type Environment = Record<string, string | undefined>;
type Database = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; end: () => Promise<unknown> };
type Dependencies = { fetcher: typeof fetch; connect: () => Promise<Database>; log: (value: string) => void };

/** Operator-only configuration: authenticated provider GET, never a payment.
 * The explicit expected profile prevents binding an unreviewed global payee. */
export async function configureProductionMerchant(env: Environment, dependencies: Dependencies) {
  assertProductionProject(env);
  const slug = env.TARGET_TENANT_SLUG, operation = env.MERCHANT_OPERATION, expected = env.CONFIRMED_MOLLIE_PROFILE_ID;
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REF !== "refs/heads/production" || env.APP_URL !== "https://fieldgrid.nl" || !/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? "") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? "") || !["inspect", "bind"].includes(operation ?? "") || !/^pfl_[A-Za-z0-9]+$/.test(expected ?? "") || !env.MOLLIE_API_KEY?.startsWith("live_")) throw new Error("Productie-merchantopdracht mist de expliciete tenant, liveprofielbevestiging of release-identiteit.");
  const health = await dependencies.fetcher(`https://fieldgrid.nl/api/healthz?release=${env.RELEASE_SHA}`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  const identity = await health.json();
  if (!health.ok || identity.status !== "ok" || identity.environment !== "production" || identity.release !== env.RELEASE_SHA || identity.database !== "ready" || identity.scanner !== "ready") throw new Error("Exacte gezonde productierelease ontbreekt.");
  const response = await dependencies.fetcher("https://api.mollie.com/v2/profiles/me", { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}` } });
  if (!response.ok) throw new Error("Geauthenticeerde liveprofielcontrole mislukt.");
  const profile = await response.json();
  if (profile.id !== expected) throw new Error("Het geauthenticeerde liveprofiel wijkt af van de operatorbevestiging.");
  const db = await dependencies.connect();
  try {
    await db.query(operation === "bind" ? "begin" : "begin read only");
    const tenant = (await db.query("select id from public.tenants where slug=$1 and status='active'", [slug])).rows[0];
    if (!tenant || typeof tenant.id !== "string") throw new Error("Actieve gekozen tenant ontbreekt.");
    if (operation === "bind") await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`production-merchant:${tenant.id}`]);
    const existing = (await db.query(`select mode,secret_reference,public_config->>'profile_id' profile,active,verified_at from public.tenant_provider_connections where tenant_id=$1 and provider='mollie'${operation === "bind" ? " for update" : ""}`, [tenant.id])).rows[0];
    if (existing && (existing.profile !== expected || existing.mode !== "live" || existing.secret_reference !== "MOLLIE_API_KEY")) throw new Error("Bestaande merchantkoppeling wijkt af; automatische vervanging geweigerd.");
    if (operation === "bind") {
      const written = await db.query("insert into public.tenant_provider_connections(tenant_id,provider,mode,secret_reference,public_config,active,verified_at) values($1,'mollie','live','MOLLIE_API_KEY',jsonb_build_object('profile_id',$2::text),true,clock_timestamp()) on conflict(tenant_id,provider) do update set active=true,verified_at=excluded.verified_at,updated_at=clock_timestamp() where tenant_provider_connections.mode='live' and tenant_provider_connections.secret_reference='MOLLIE_API_KEY' and tenant_provider_connections.public_config->>'profile_id'=$2 returning tenant_id", [tenant.id, expected]);
      if (written.rows.length !== 1 || written.rows[0].tenant_id !== tenant.id) throw new Error("Merchantkoppeling is tijdens controle gewijzigd; binding geweigerd.");
    }
    await db.query("commit");
    dependencies.log(JSON.stringify({ providerAuthenticated: true, profileConfirmed: true, tenantActive: true, connectionPresent: Boolean(existing) || operation === "bind", configured: operation === "bind" || Boolean(existing?.active && existing?.verified_at), operation }));
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}
