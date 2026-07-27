import {
  assertTenantDomainMatchesEnvironment,
  resolveFieldgridDeploymentEnvironment,
  type FieldgridDeploymentEnvironment,
} from "./tenant-environment";

export type TenantApplicationDomainCandidate = {
  domain: string;
  type: string;
  verificationStatus: string;
  tlsStatus: string;
};

export function selectTenantApplicationHost(
  candidates: readonly TenantApplicationDomainCandidate[],
  environment: FieldgridDeploymentEnvironment = resolveFieldgridDeploymentEnvironment(),
): string | null {
  for (const candidate of candidates) {
    if (
      candidate.type !== "fieldgrid_subdomain" ||
      (candidate.verificationStatus !== "verified" &&
        candidate.verificationStatus !== "active")
    ) {
      continue;
    }
    try {
      return assertTenantDomainMatchesEnvironment(
        candidate.domain,
        environment,
      );
    } catch {
      continue;
    }
  }

  for (const candidate of candidates) {
    if (
      candidate.type === "custom_domain" &&
      candidate.verificationStatus === "active" &&
      candidate.tlsStatus === "active"
    ) {
      return candidate.domain;
    }
  }
  return null;
}
