"use server";

import {
  db,
  plansTable,
  tenantDomainsTable,
  tenantSubscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth/platform";

export type PlatformDashboardDomainSignal = {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  type: string;
  verificationStatus: string;
  createdAt: string;
};

export type PlatformDashboardSubscriptionSignal = {
  id: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  status: string;
  currentPeriodEndsAt: string | null;
  updatedAt: string;
};

export type PlatformDashboardSignals = {
  pendingDomains: {
    total: number;
    rows: PlatformDashboardDomainSignal[];
  };
  pastDueSubscriptions: {
    total: number;
    rows: PlatformDashboardSubscriptionSignal[];
  };
};

export async function getPlatformDashboardSignals(): Promise<PlatformDashboardSignals> {
  await requirePlatformAdmin();

  const [pendingDomainRows, pastDueSubscriptionRows] = await Promise.all([
    db
      .select({
        id: tenantDomainsTable.id,
        tenantId: tenantDomainsTable.tenantId,
        tenantName: tenantsTable.name,
        domain: tenantDomainsTable.domain,
        type: tenantDomainsTable.type,
        verificationStatus: tenantDomainsTable.verificationStatus,
        createdAt: tenantDomainsTable.createdAt,
      })
      .from(tenantDomainsTable)
      .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
      .where(
        and(
          ne(tenantDomainsTable.type, "platform_reserved"),
          ne(tenantDomainsTable.verificationStatus, "verified"),
        ),
      )
      .orderBy(desc(tenantDomainsTable.createdAt)),
    db
      .select({
        id: tenantSubscriptionsTable.id,
        tenantId: tenantSubscriptionsTable.tenantId,
        tenantName: tenantsTable.name,
        planName: plansTable.name,
        status: tenantSubscriptionsTable.status,
        currentPeriodEndsAt: tenantSubscriptionsTable.currentPeriodEndsAt,
        updatedAt: tenantSubscriptionsTable.updatedAt,
      })
      .from(tenantSubscriptionsTable)
      .innerJoin(tenantsTable, eq(tenantSubscriptionsTable.tenantId, tenantsTable.id))
      .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
      .where(eq(tenantSubscriptionsTable.status, "past_due"))
      .orderBy(desc(tenantSubscriptionsTable.updatedAt)),
  ]);

  return {
    pendingDomains: {
      total: pendingDomainRows.length,
      rows: pendingDomainRows.slice(0, 8).map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        domain: row.domain,
        type: row.type,
        verificationStatus: row.verificationStatus,
        createdAt: row.createdAt.toISOString(),
      })),
    },
    pastDueSubscriptions: {
      total: pastDueSubscriptionRows.length,
      rows: pastDueSubscriptionRows.slice(0, 8).map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        planName: row.planName,
        status: row.status,
        currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    },
  };
}
