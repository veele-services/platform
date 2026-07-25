import { db, tenantDomainsTable, tenantsTable } from "@workspace/db";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { personeelPortalUrl } from "@/lib/email";

const PERSONNEL_BASE = "/personeel";

function normalizedNextPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/login";
  if (trimmed === PERSONNEL_BASE) return "/";
  if (trimmed.startsWith(`${PERSONNEL_BASE}/`)) {
    return trimmed.slice(PERSONNEL_BASE.length) || "/";
  }
  return trimmed;
}

function appendPersonnelPath(origin: string, nextPath: string): string {
  const next = new URL(
    normalizedNextPath(nextPath),
    "https://fieldgrid.invalid",
  );
  const target = new URL(origin);
  target.pathname = `${PERSONNEL_BASE}${next.pathname === "/" ? "" : next.pathname}`;
  target.search = next.search;
  target.hash = "";
  return target.toString();
}

export async function personnelTenantEntryUrl(
  tenantId: string,
  nextPath = "/login",
): Promise<string> {
  const [tenant] = await db
    .select({
      personnelLoginCode: tenantsTable.personnelLoginCode,
      planKey: tenantsTable.planKey,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error("Organisatie niet gevonden.");

  if (tenant.planKey === "enterprise") {
    const [domain] = await db
      .select({ domain: tenantDomainsTable.domain })
      .from(tenantDomainsTable)
      .where(
        and(
          eq(tenantDomainsTable.tenantId, tenantId),
          inArray(tenantDomainsTable.verificationStatus, [
            "verified",
            "active",
          ]),
          ne(tenantDomainsTable.type, "platform_reserved"),
        ),
      )
      .orderBy(
        desc(tenantDomainsTable.isPrimary),
        asc(tenantDomainsTable.createdAt),
      )
      .limit(1);

    if (domain?.domain) {
      return appendPersonnelPath(`https://${domain.domain}`, nextPath);
    }
  }

  const base = personeelPortalUrl().replace(/\/$/u, "");
  const target = new URL(`${base}/organisatie/${tenant.personnelLoginCode}`);
  target.searchParams.set("next", normalizedNextPath(nextPath));
  return target.toString();
}
