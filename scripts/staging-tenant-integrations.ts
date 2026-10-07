import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { stagingDatabaseUrl } from "../lib/env/staging-database";
import { normalizeAddress, type Address } from "../lib/addresses/model";
import { searchAddresses, lookupAddress } from "../lib/addresses/pdok";

const slug = process.env.TARGET_TENANT_SLUG;
const operation = process.env.INTEGRATION_OPERATION;
const origin = "https://staging.fieldgrid.nl";
async function main() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/staging" || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !["inspect", "repair"].includes(operation ?? "") || process.env.APP_URL !== origin)
    throw new Error("Ongeldige stagingopdracht");
  const health = await fetch(`${origin}/api/healthz`, { signal: AbortSignal.timeout(10000) });
  const identity = await health.json();
  if (!health.ok || identity.environment !== "staging" || identity.release !== process.env.RELEASE_SHA) throw new Error("Onjuiste release");
  const key = process.env.MOLLIE_API_KEY;
  if (!key?.startsWith("test_")) throw new Error("Alleen Mollie-testmodus toegestaan");
  const profileResponse = await fetch("https://api.mollie.com/v2/profiles/me", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  if (!profileResponse.ok) throw new Error(`Mollie-profielcontrole HTTP ${profileResponse.status}`);
  const profile = await profileResponse.json();
  if (!/^pfl_[A-Za-z0-9]+$/.test(profile.id ?? "")) throw new Error("Ongeldig Mollie-profiel");
  const database = stagingDatabaseUrl("MIGRATION_DATABASE_URL", process.env); database.searchParams.delete("sslmode");
  const db = new Client({ connectionString: database.href, options: "-c statement_timeout=15000", connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, readFileSync(new URL("./certs/supabase-root-2021.crt", import.meta.url), "utf8")] } });
  db.on("error", () => undefined); await db.connect();
  try {
    const tenant = (await db.query("select id from public.tenants where slug=$1 and status='active'", [slug])).rows[0];
    if (!tenant) throw new Error("Actieve tenant ontbreekt");
    const connection = (await db.query("select mode,active,verified_at,public_config->>'profile_id' profile from public.tenant_provider_connections where tenant_id=$1 and provider='mollie'", [tenant.id])).rows[0];
    console.log(JSON.stringify({ check: "mollie", providerReachable: true, connectionPresent: Boolean(connection), active: Boolean(connection?.active), verified: Boolean(connection?.verified_at), profileMatches: connection?.profile === profile.id }));
    if (operation === "repair") {
      // Deliberate operator binding to this explicit tenant, never auto-binding
      // from a migration, a browser request, or a global key fallback.
      if (connection?.profile && connection.profile !== profile.id) throw new Error("Bestaande ontvanger verschilt; geen automatische vervanging");
      await db.query("insert into public.tenant_provider_connections(tenant_id,provider,mode,secret_reference,public_config,active,verified_at) values($1,'mollie','test','MOLLIE_API_KEY',jsonb_build_object('profile_id',$2::text),true,clock_timestamp()) on conflict(tenant_id,provider) do update set mode='test',secret_reference='MOLLIE_API_KEY',public_config=excluded.public_config,active=true,verified_at=excluded.verified_at,updated_at=clock_timestamp()", [tenant.id, profile.id]);
      console.log("Expliciete tenantverbinding met het geverifieerde Mollie-testprofiel opgeslagen.");
    }
    const logo = await fetch(`${origin}/api/branding/${tenant.id}/email-logo`, { signal: AbortSignal.timeout(10000) });
    console.log(JSON.stringify({ check: "public_email_logo", available: logo.ok, supportedMime: /image\/(png|jpeg)/.test(logo.headers.get("content-type") ?? "") }));
    const specs = [["objects","address"],["customers","billing_address"],["customers","visit_address"],["personnel","home_address"],["personnel","alternate_departure_address"],["travel_depots","address"]] as const;
    const clean = (v: string) => v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
    const matches = (a: Address, b: Address) => clean(a.street) === clean(b.street) && clean(a.postal_code).replaceAll(" ","") === clean(b.postal_code).replaceAll(" ","") && clean(a.city) === clean(b.city) && a.country === b.country;
    for (const [table,column] of specs) {
      const rows = (await db.query(`select id,${column} address from public.${table} where tenant_id=$1 and coalesce(${column},'{}')<>'{}'`, [tenant.id])).rows;
      let missing = 0, stale = 0, repaired = 0, review = 0;
      for (const row of rows) {
        const current = normalizeAddress(row.address);
        if (!current.street || !current.postal_code || !current.city || current.country !== "NL") { review++; continue; }
        if (current.status !== "confirmed" || current.latitude === null || current.longitude === null || !current.located_at) missing++;
        if (operation !== "repair") continue;
        try {
          let fresh: Address | null = null;
          if (current.source === "pdok" && current.source_id) {
            const found = await lookupAddress(current.source_id); if (matches(current,found)) fresh = found;
          } else {
            const options = await searchAddresses(`${current.street} ${current.postal_code} ${current.city}`);
            const exact: Address[] = [];
            for (const option of options) { const found = await lookupAddress(option.id); if (matches(current,found)) exact.push(found); }
            if (exact.length === 1) fresh = exact[0];
          }
          if (!fresh) { review++; continue; }
          if (current.status === "confirmed" && (current.latitude !== fresh.latitude || current.longitude !== fresh.longitude)) stale++;
          if (current.status !== "confirmed" || !current.located_at || current.latitude !== fresh.latitude || current.longitude !== fresh.longitude || current.source_id !== fresh.source_id) {
            const changed = await db.query(`update public.${table} set ${column}=$1 where tenant_id=$2 and id=$3 and ${column}=$4`, [fresh,tenant.id,row.id,row.address]);
            repaired += changed.rowCount ?? 0;
          }
        } catch { review++; }
      }
      console.log(JSON.stringify({ check: "addresses", table, column, count: rows.length, missing, stale, repaired, needsReview: review }));
    }
  } finally { await db.end(); }
}
main().catch(error => { console.error(error instanceof Error && /^(Mollie-profielcontrole HTTP|Bestaande ontvanger)/.test(error.message) ? error.message : "Stagingintegratiecontrole geweigerd of mislukt; geen credentials of persoonsgegevens gelogd."); process.exitCode = 1; });
