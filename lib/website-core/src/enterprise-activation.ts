import { z } from "zod/v4";

export const WEBSITE_ACTIVATION_PREFLIGHT_SCHEMA_VERSION = 1 as const;
export const WEBSITE_ACTIVATION_ENVIRONMENT = "staging" as const;

export const websiteActivationCommandSchema = z
  .object({
    tenantId: z.string().uuid(),
    siteId: z.string().uuid(),
    deploymentId: z.string().uuid(),
    expectedDeliveryRevision: z.number().int().positive(),
    expectedMode: z.enum(["managed_cms", "custom_nextjs"]),
    expectedTargetId: z.string().uuid().nullable(),
    changeReference: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/# -]*$/u),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export type WebsiteActivationCommand = z.infer<
  typeof websiteActivationCommandSchema
>;

export type WebsiteActivationPreflightInput = {
  tenantActive: boolean;
  enterprisePlan: boolean;
  websiteEntitled: boolean;
  siteActive: boolean;
  primaryDomainActive: boolean;
  stagingHostname: boolean;
  exactCurrentState: boolean;
  candidateIdentityMatches: boolean;
  candidateApproved: boolean;
  routeRoutable: boolean;
  healthFresh: boolean;
  tlsValid: boolean;
  publicAddressesOnly: boolean;
  seoHealthy: boolean;
  assetsHealthy: boolean;
  platformFormsConnected: boolean;
};

export type WebsiteActivationPreflightCheck = {
  key: keyof WebsiteActivationPreflightInput;
  status: "pass" | "fail";
  detail: string;
};

export type WebsiteActivationPreflightEvidence = {
  schemaVersion: typeof WEBSITE_ACTIVATION_PREFLIGHT_SCHEMA_VERSION;
  status: "ready" | "blocked";
  environment: typeof WEBSITE_ACTIVATION_ENVIRONMENT;
  productionEnabled: false;
  checks: WebsiteActivationPreflightCheck[];
};

const PREFLIGHT_DETAILS: Record<
  keyof WebsiteActivationPreflightInput,
  [string, string]
> = {
  tenantActive: ["tenant active", "tenant inactive"],
  enterprisePlan: ["enterprise plan", "enterprise plan required"],
  websiteEntitled: [
    "website entitlement active",
    "website entitlement missing",
  ],
  siteActive: ["website site active", "website site inactive"],
  primaryDomainActive: [
    "primary website domain active",
    "primary website domain inactive",
  ],
  stagingHostname: ["staging hostname", "non-staging hostname rejected"],
  exactCurrentState: [
    "current mode, target and revision exact",
    "current delivery state changed",
  ],
  candidateIdentityMatches: [
    "candidate belongs to tenant, site and host",
    "candidate identity mismatch",
  ],
  candidateApproved: ["candidate approved", "candidate not approved"],
  routeRoutable: [
    "operator route is routable",
    "operator route is not routable",
  ],
  healthFresh: ["health evidence fresh", "health evidence stale or missing"],
  tlsValid: ["TLS valid", "TLS validation failed"],
  publicAddressesOnly: [
    "origin resolves to public addresses",
    "origin address policy failed",
  ],
  seoHealthy: ["SEO contract healthy", "SEO contract failed"],
  assetsHealthy: ["asset smoke healthy", "asset smoke failed"],
  platformFormsConnected: [
    "platform form endpoint connected",
    "platform form endpoint not proven",
  ],
};

export function evaluateWebsiteActivationPreflight(
  input: WebsiteActivationPreflightInput,
): WebsiteActivationPreflightEvidence {
  const checks = (
    Object.keys(PREFLIGHT_DETAILS) as Array<
      keyof WebsiteActivationPreflightInput
    >
  ).map((key) => ({
    key,
    status: input[key] ? ("pass" as const) : ("fail" as const),
    detail: PREFLIGHT_DETAILS[key][input[key] ? 0 : 1],
  }));
  return {
    schemaVersion: WEBSITE_ACTIVATION_PREFLIGHT_SCHEMA_VERSION,
    status: checks.every((check) => check.status === "pass")
      ? "ready"
      : "blocked",
    environment: WEBSITE_ACTIVATION_ENVIRONMENT,
    productionEnabled: false,
    checks,
  };
}

export function websiteActivationErrorCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : "unknown error";
  if (message.includes("revision")) return "delivery_revision_conflict";
  if (message.includes("current") || message.includes("no-op"))
    return "current_state_conflict";
  if (message.includes("health")) return "health_preflight_failed";
  if (message.includes("route")) return "route_preflight_failed";
  if (message.includes("domain") || message.includes("host"))
    return "domain_preflight_failed";
  if (message.includes("enterprise") || message.includes("entitlement"))
    return "entitlement_preflight_failed";
  if (message.includes("production") || message.includes("staging"))
    return "environment_rejected";
  return "activation_failed";
}
