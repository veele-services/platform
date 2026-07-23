import { z } from "zod";

import { normalizeWebsiteRequestHost } from "./shared-host-routing";

const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/u;
const ROUTE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{1,239}$/u;
const HEALTH_PATH_PATTERN = /^\/(?:[A-Za-z0-9_-]+\/?)*$/u;
const BLOCKED_ORIGIN_SUFFIXES = [
  ".example",
  ".home.arpa",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
] as const;

export const CUSTOM_WEBSITE_HEALTH_SCHEMA_VERSION = 2 as const;
export const CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS = 5 * 60 * 1_000;

export type CustomWebsiteRouteIdentity = {
  providerKey: string;
  routeKey: string;
  releaseId: string;
  expectedHost: string;
  healthPath: string;
};

type CustomWebsiteRouteRegistrationBase = {
  providerKey: string;
  routeKey: string;
  releaseId: string;
  expectedHosts: readonly string[];
  healthPath: string;
};

export type NonLiveCustomWebsiteRouteRegistration =
  CustomWebsiteRouteRegistrationBase & {
    status: "non_live";
    blockers: readonly string[];
  };

export type RoutableCustomWebsiteRouteRegistration =
  CustomWebsiteRouteRegistrationBase & {
    status: "routable";
    upstreamOrigin: string;
  };

export type CustomWebsiteRouteRegistration =
  | NonLiveCustomWebsiteRouteRegistration
  | RoutableCustomWebsiteRouteRegistration;

export type CustomWebsiteRouteRegistry = {
  registrations: readonly CustomWebsiteRouteRegistration[];
  resolve(
    identity: CustomWebsiteRouteIdentity,
  ): CustomWebsiteRouteRegistration | null;
};

const customWebsiteHealthEvidenceSchema = z
  .object({
    schemaVersion: z.literal(CUSTOM_WEBSITE_HEALTH_SCHEMA_VERSION),
    status: z.literal("healthy"),
    providerKey: z.string().regex(PROVIDER_KEY_PATTERN),
    routeKey: z.string().regex(ROUTE_KEY_PATTERN),
    releaseId: z.string().regex(RELEASE_ID_PATTERN),
    expectedHost: z.string().min(1).max(253),
    tls: z
      .object({
        valid: z.literal(true),
      })
      .strict(),
    network: z
      .object({
        publicAddressesOnly: z.literal(true),
      })
      .strict(),
    seo: z
      .object({
        canonical: z.literal(true),
        robots: z.literal(true),
        sitemap: z.literal(true),
        structuredData: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type CustomWebsiteHealthEvidence = z.infer<
  typeof customWebsiteHealthEvidenceSchema
>;

function identityKey(identity: CustomWebsiteRouteIdentity): string {
  return [
    identity.providerKey,
    identity.routeKey,
    identity.releaseId,
    identity.expectedHost,
    identity.healthPath,
  ].join("\u0000");
}

function normalizedExpectedHost(value: string): string {
  const normalized = normalizeWebsiteRequestHost(value);
  if (!normalized || normalized !== value) {
    throw new Error(`Invalid custom website expected host: ${value}`);
  }
  return normalized;
}

function normalizedHealthPath(value: string): string {
  if (
    !HEALTH_PATH_PATTERN.test(value) ||
    value.startsWith("//") ||
    value.includes("..")
  ) {
    throw new Error(`Invalid custom website health path: ${value}`);
  }
  return value;
}

function normalizedIdentity(
  value: CustomWebsiteRouteIdentity,
): CustomWebsiteRouteIdentity {
  if (!PROVIDER_KEY_PATTERN.test(value.providerKey)) {
    throw new Error(
      `Invalid custom website provider key: ${value.providerKey}`,
    );
  }
  if (
    !ROUTE_KEY_PATTERN.test(value.routeKey) ||
    value.routeKey.includes("://")
  ) {
    throw new Error(`Invalid custom website route key: ${value.routeKey}`);
  }
  if (!RELEASE_ID_PATTERN.test(value.releaseId)) {
    throw new Error(`Invalid custom website release ID: ${value.releaseId}`);
  }
  return {
    ...value,
    expectedHost: normalizedExpectedHost(value.expectedHost),
    healthPath: normalizedHealthPath(value.healthPath),
  };
}

function normalizedPublicHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Custom website upstream origin must be an absolute URL");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isIpv4Literal = /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
  const isIpv6Literal = hostname.includes(":");
  const isBlockedName =
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    BLOCKED_ORIGIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !hostname.includes(".") ||
    isIpv4Literal ||
    isIpv6Literal ||
    isBlockedName
  ) {
    throw new Error(
      "Custom website upstream must be a public, origin-only HTTPS hostname",
    );
  }

  return parsed.origin;
}

export function createCustomWebsiteRouteRegistry(
  input: readonly CustomWebsiteRouteRegistration[],
): CustomWebsiteRouteRegistry {
  const byIdentity = new Map<string, CustomWebsiteRouteRegistration>();
  const registrations = input.map((registration) => {
    const expectedHosts = Object.freeze(
      [
        ...new Set(registration.expectedHosts.map(normalizedExpectedHost)),
      ].sort(),
    );
    if (expectedHosts.length === 0) {
      throw new Error("Custom website route requires an expected host");
    }

    const identity = normalizedIdentity({
      providerKey: registration.providerKey,
      routeKey: registration.routeKey,
      releaseId: registration.releaseId,
      expectedHost: expectedHosts[0]!,
      healthPath: registration.healthPath,
    });
    const common = {
      providerKey: identity.providerKey,
      routeKey: identity.routeKey,
      releaseId: identity.releaseId,
      expectedHosts,
      healthPath: identity.healthPath,
    };
    const normalized = Object.freeze(
      registration.status === "routable"
        ? {
            ...common,
            status: "routable" as const,
            upstreamOrigin: normalizedPublicHttpsOrigin(
              registration.upstreamOrigin,
            ),
          }
        : {
            ...common,
            status: "non_live" as const,
            blockers: Object.freeze([...registration.blockers]),
          },
    );

    for (const expectedHost of expectedHosts) {
      const key = identityKey({ ...normalized, expectedHost });
      if (byIdentity.has(key)) {
        throw new Error(`Duplicate custom website route identity: ${key}`);
      }
      byIdentity.set(key, normalized);
    }
    return normalized;
  });

  return Object.freeze({
    registrations: Object.freeze(registrations),
    resolve(identity: CustomWebsiteRouteIdentity) {
      try {
        return (
          byIdentity.get(identityKey(normalizedIdentity(identity))) ?? null
        );
      } catch {
        return null;
      }
    },
  });
}

export function customWebsiteHealthEvidenceMatches(
  value: unknown,
  identity: CustomWebsiteRouteIdentity,
): value is CustomWebsiteHealthEvidence {
  const parsed = customWebsiteHealthEvidenceSchema.safeParse(value);
  if (!parsed.success) return false;
  return (
    parsed.data.providerKey === identity.providerKey &&
    parsed.data.routeKey === identity.routeKey &&
    parsed.data.releaseId === identity.releaseId &&
    parsed.data.expectedHost === identity.expectedHost
  );
}

function parseIpv4Address(
  value: string,
): [number, number, number, number] | null {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !/^\d{1,3}$/u.test(part) || Number(part) < 0 || Number(part) > 255,
    )
  ) {
    return null;
  }
  return parts.map(Number) as [number, number, number, number];
}

function isPublicIpv4Address(value: string): boolean {
  const parsed = parseIpv4Address(value);
  if (!parsed) return false;
  const [first, second, third] = parsed;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }
  return true;
}

function parseIpv6Address(value: string): number[] | null {
  const normalized = value
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "");
  if (
    !normalized.includes(":") ||
    !/^[0-9a-f:.]+$/u.test(normalized) ||
    normalized.split("::").length > 2
  ) {
    return null;
  }
  const parsePart = (part: string): number[] | null => {
    if (!part) return [];
    const segments = part.split(":");
    const words: number[] = [];
    for (const [index, segment] of segments.entries()) {
      if (segment.includes(".")) {
        if (index !== segments.length - 1) return null;
        const ipv4 = parseIpv4Address(segment);
        if (!ipv4) return null;
        words.push(ipv4[0] * 256 + ipv4[1], ipv4[2] * 256 + ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/u.test(segment)) return null;
        words.push(Number.parseInt(segment, 16));
      }
    }
    return words;
  };

  const [headValue = "", tailValue = ""] = normalized.split("::");
  const head = parsePart(headValue);
  const tail = parsePart(tailValue);
  if (!head || !tail) return null;
  const hasCompression = normalized.includes("::");
  const explicitWords = head.length + tail.length;
  if (
    (hasCompression && explicitWords >= 8) ||
    (!hasCompression && explicitWords !== 8)
  ) {
    return null;
  }
  return [
    ...head,
    ...Array(hasCompression ? 8 - explicitWords : 0).fill(0),
    ...tail,
  ];
}

function isPublicIpv6Address(value: string): boolean {
  const words = parseIpv6Address(value);
  if (!words || words.length !== 8) return false;
  const firstHextet = words[0]!;
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback =
    words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const hasEmbeddedIpv4 = value.includes(".");
  if (hasEmbeddedIpv4) {
    const ipv4 = `${words[6]! >> 8}.${words[6]! & 255}.${words[7]! >> 8}.${words[7]! & 255}`;
    if (!isPublicIpv4Address(ipv4)) return false;
  }
  if (
    isUnspecified ||
    isLoopback ||
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    firstHextet >= 0xff00 ||
    (words[0] === 0x2001 && words[1] === 0x0db8)
  ) {
    return false;
  }
  return true;
}

/**
 * The health/TLS checker calls this with every A and AAAA result before it
 * connects. An empty, malformed or special-use result fails closed.
 */
export function customWebsiteOriginAddressesArePublic(
  addresses: readonly string[],
): boolean {
  return (
    addresses.length > 0 &&
    addresses.every((address) =>
      address.includes(":")
        ? isPublicIpv6Address(address)
        : isPublicIpv4Address(address),
    )
  );
}

export const VEELE_MARKETING_ROUTE_CONTRACT = Object.freeze([
  "/",
  "/diensten",
  "/schoonmaak",
  "/schoonmaak/kantoorschoonmaak",
  "/schoonmaak/vve-vastgoed",
  "/schoonmaak/winkels",
  "/schoonmaak/horeca",
  "/schoonmaak/glasbewassing",
  "/schoonmaak/specialistisch-oplevering",
  "/beveiliging",
  "/beveiliging/objectbeveiliging",
  "/beveiliging/mobiele-surveillance",
  "/beveiliging/winkelbeveiliging",
  "/beveiliging/evenementen",
  "/beveiliging/horeca",
  "/beveiliging/receptie-toegangscontrole",
  "/beveiliging/persoonsbeveiliging",
  "/beveiliging/chauffeursdiensten",
  "/facilitair",
  "/facilitair/receptie-gastvrijheid",
  "/facilitair/evenementenpersoneel",
  "/facilitair/horeca-bar",
  "/facilitair/sanitaire-service",
  "/oplossingen",
  "/oplossingen/kantoren",
  "/oplossingen/vve-vastgoed",
  "/oplossingen/retail",
  "/oplossingen/horeca-hotels",
  "/oplossingen/evenementen",
  "/oplossingen/zorg-onderwijs",
  "/over-ons",
  "/cases",
  "/kennis",
  "/werken-bij",
  "/contact",
  "/offerte",
  "/portaal",
  "/den-haag",
  "/scheveningen",
  "/rijswijk",
  "/voorburg-leidschendam",
  "/wassenaar",
  "/delft",
  "/zoetermeer",
] as const);

export const VEELE_MARKETING_ROUTE_CONTRACT_SHA256 =
  "6fe45e341f4f0776b512e9ca0f9546b08e2a1e1723383101d7b57c60bfd91e4b";

export const VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE = Object.freeze({
  status: "non_live" as const,
  providerKey: "fieldgrid_vps",
  routeKey: "veele_marketing_primary",
  releaseId: "git-tree:4bbc345fd18393f2de32bb29a25fb5e909e2792b",
  expectedHosts: Object.freeze([
    "veeleservices.fieldgrid.nl",
    "veeleservices.staging.fieldgrid.nl",
  ]),
  healthPath: "/api/health",
  blockers: Object.freeze([
    "No reviewed immutable deployment origin is registered.",
    "The marketing application does not yet expose the release-bound health contract.",
    "No staging edge route has been applied.",
  ]),
  source: Object.freeze({
    repository: "veele-services/platform",
    branch: "marketing/website",
    commit: "37bbe5d6999b0d11505454d1ab3759e8caa6b6e3",
    packagePath: "artifacts/marketing-website",
    tree: "4bbc345fd18393f2de32bb29a25fb5e909e2792b",
    routeCount: 44,
    routeContractSha256: VEELE_MARKETING_ROUTE_CONTRACT_SHA256,
  }),
});

export const FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY =
  createCustomWebsiteRouteRegistry([
    VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE,
  ]);
