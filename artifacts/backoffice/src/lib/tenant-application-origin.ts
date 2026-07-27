import {
  db,
  selectTenantApplicationHost,
  tenantDomainsTable,
  tenantsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

export async function tenantApplicationOrigin(
  tenantId: string,
): Promise<string> {
  const [tenant, domains] = await Promise.all([
    db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db
      .select({
        domain: tenantDomainsTable.domain,
        type: tenantDomainsTable.type,
        verificationStatus: tenantDomainsTable.verificationStatus,
        tlsStatus: tenantDomainsTable.tlsStatus,
      })
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
      ),
  ]);
  if (!tenant[0]) throw new Error("Organisatie niet gevonden.");

  const host = selectTenantApplicationHost(domains);
  if (!host) {
    throw new Error(
      "Geen actief tenantdomein voor de huidige omgeving gevonden.",
    );
  }
  return `https://${host}`;
}
