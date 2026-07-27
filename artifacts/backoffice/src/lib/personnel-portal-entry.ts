import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { personeelPortalUrl } from "@/lib/email";
import { tenantApplicationOrigin } from "@/lib/tenant-application-origin";

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
    return appendPersonnelPath(
      await tenantApplicationOrigin(tenantId),
      nextPath,
    );
  }

  const base = personeelPortalUrl().replace(/\/$/u, "");
  const target = new URL(`${base}/organisatie/${tenant.personnelLoginCode}`);
  target.searchParams.set("next", normalizedNextPath(nextPath));
  return target.toString();
}
