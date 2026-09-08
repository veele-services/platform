import type {
  CustomWebsiteHealthEvidence,
  CustomWebsiteRouteIdentity,
} from "@workspace/website-core";
import { pool } from "./connection";

const CUSTOM_WEBSITE_HEALTH_REFRESH_LOCK =
  "fieldgrid:custom-website-health-refresher:staging";

export type CustomWebsiteHealthRefreshCandidate = {
  tenantId: string;
  siteId: string;
  deploymentId: string;
  identity: CustomWebsiteRouteIdentity;
  attemptStartedAt: string;
};

export type CustomWebsiteHealthRefreshRecord = {
  candidate: CustomWebsiteHealthRefreshCandidate;
  evidence: CustomWebsiteHealthEvidence | null;
  failureCode: string | null;
  actorUserId: string;
};

export type CustomWebsiteHealthRefreshRecordResult = {
  applied: boolean;
  healthState: "healthy" | "failed" | "unchanged";
  checkedAt: string | null;
};

export type CustomWebsiteHealthRefreshSession = {
  claim(limit: number): Promise<CustomWebsiteHealthRefreshCandidate[]>;
  record(
    input: CustomWebsiteHealthRefreshRecord,
  ): Promise<CustomWebsiteHealthRefreshRecordResult>;
};

export type CustomWebsiteHealthRefreshLockResult<T> =
  | { acquired: false; result: null }
  | { acquired: true; result: T };

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Holds one database-session advisory lock for the complete refresh cycle.
 * Row locks used by claim are deliberately released before outbound HTTPS.
 */
export async function withCustomWebsiteHealthRefreshSession<T>(
  callback: (session: CustomWebsiteHealthRefreshSession) => Promise<T>,
): Promise<CustomWebsiteHealthRefreshLockResult<T>> {
  const client = await pool.connect();
  let acquired = false;
  let destroyClient = false;
  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      `SELECT pg_catalog.pg_try_advisory_lock(
         pg_catalog.hashtextextended($1::text, 0)
       ) AS acquired`,
      [CUSTOM_WEBSITE_HEALTH_REFRESH_LOCK],
    );
    acquired = lockResult.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false, result: null };

    const session: CustomWebsiteHealthRefreshSession = {
      async claim(limit) {
        const result = await client.query<{
          tenant_id: string;
          site_id: string;
          deployment_id: string;
          provider_key: string;
          route_key: string;
          release_id: string;
          expected_host: string;
          health_path: string;
          attempt_started_at: Date | string;
        }>(
          `SELECT *
           FROM app_private.fieldgrid_claim_custom_website_health_refresh($1)`,
          [limit],
        );
        return result.rows.map((row) => ({
          tenantId: row.tenant_id,
          siteId: row.site_id,
          deploymentId: row.deployment_id,
          identity: {
            providerKey: row.provider_key,
            routeKey: row.route_key,
            releaseId: row.release_id,
            expectedHost: row.expected_host,
            healthPath: row.health_path,
          },
          attemptStartedAt: iso(row.attempt_started_at)!,
        }));
      },
      async record(input) {
        const { candidate } = input;
        const result = await client.query<{
          applied: boolean;
          health_state: "healthy" | "failed" | "unchanged";
          checked_at: Date | string | null;
        }>(
          `SELECT *
           FROM app_private.fieldgrid_record_custom_website_health_refresh(
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12
           )`,
          [
            candidate.tenantId,
            candidate.siteId,
            candidate.deploymentId,
            candidate.identity.providerKey,
            candidate.identity.routeKey,
            candidate.identity.releaseId,
            candidate.identity.expectedHost,
            candidate.identity.healthPath,
            candidate.attemptStartedAt,
            input.evidence === null ? null : JSON.stringify(input.evidence),
            input.failureCode,
            input.actorUserId,
          ],
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error("Custom website health refresh returned no result");
        }
        return {
          applied: row.applied,
          healthState: row.health_state,
          checkedAt: iso(row.checked_at),
        };
      },
    };

    return { acquired: true, result: await callback(session) };
  } finally {
    if (acquired) {
      try {
        const unlockResult = await client.query<{ unlocked: boolean }>(
          `SELECT pg_catalog.pg_advisory_unlock(
             pg_catalog.hashtextextended($1::text, 0)
           ) AS unlocked`,
          [CUSTOM_WEBSITE_HEALTH_REFRESH_LOCK],
        );
        destroyClient = unlockResult.rows[0]?.unlocked !== true;
      } catch {
        destroyClient = true;
      }
    }
    client.release(destroyClient);
  }
}
