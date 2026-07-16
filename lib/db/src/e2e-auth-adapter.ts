const COOKIE_NAME = "fieldgrid_e2e_auth_user";
const FIFTEEN_MINUTES_SECONDS = 15 * 60;
const LOCAL_GATEWAY_ORIGIN = "http://127.0.0.1:9324";

type FieldgridE2ESurface = "backoffice" | "customer" | "personnel" | "platform";

type FieldgridE2EFixtureIdentity = {
  email: string;
  surface: FieldgridE2ESurface;
  tenantId?: string;
};

/**
 * The E2E seam models the same identities that the local Runtime Safety
 * fixtures create. Keep tenant context in this map for fixture selection, but
 * never add it to a JWT claim: database RLS derives tenancy from memberships.
 */
export const FIELDGRID_E2E_FIXTURE_IDENTITIES: Record<string, FieldgridE2EFixtureIdentity> = {
  "20000000-0000-4000-8000-000000000001": { email: "platform-owner@runtime.fieldgrid.test", surface: "platform" },
  "20000000-0000-4000-8000-000000000002": { email: "platform-admin@runtime.fieldgrid.test", surface: "platform" },
  "20000000-0000-4000-8000-000000000101": { email: "owner@tenant-a.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000102": { email: "admin@tenant-a.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000103": { email: "planner@tenant-a.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000104": { email: "personnel@tenant-a.runtime.fieldgrid.test", surface: "personnel", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000105": { email: "customer@tenant-a.runtime.fieldgrid.test", surface: "customer", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000106": { email: "inactive-personnel@tenant-a.runtime.fieldgrid.test", surface: "personnel", tenantId: "10000000-0000-4000-8000-000000000001" },
  "20000000-0000-4000-8000-000000000201": { email: "owner@tenant-b.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000002" },
  "20000000-0000-4000-8000-000000000202": { email: "admin@tenant-b.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000002" },
  "20000000-0000-4000-8000-000000000204": { email: "personnel@tenant-b.runtime.fieldgrid.test", surface: "personnel", tenantId: "10000000-0000-4000-8000-000000000002" },
  "20000000-0000-4000-8000-000000000205": { email: "customer@tenant-b.runtime.fieldgrid.test", surface: "customer", tenantId: "10000000-0000-4000-8000-000000000002" },
  "20000000-0000-4000-8000-000000000401": { email: "owner@suspended.runtime.fieldgrid.test", surface: "backoffice", tenantId: "10000000-0000-4000-8000-000000000003" },
};

export const FIELDGRID_E2E_FIXTURE_USERS = new Set(Object.keys(FIELDGRID_E2E_FIXTURE_IDENTITIES));

type CookieLike = { get(name: string): { value?: string } | undefined };
type HeaderLike = { get(name: string): string | null };

type E2EContext = {
  cookies?: CookieLike;
  headers?: HeaderLike;
};

function assertE2EAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FIELDGRID_E2E_AUTH_ENABLED is forbidden in production.");
  }
  if (process.env.FIELDGRID_E2E_AUTH_ENABLED !== "true") {
    throw new Error("FIELDGRID_E2E_AUTH_ENABLED=true is required for the local E2E auth seam.");
  }
}

function jwtSecret(): string {
  const secret = process.env.FIELDGRID_E2E_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("FIELDGRID_E2E_JWT_SECRET must be a local test-only secret of at least 32 bytes.");
  }
  return secret;
}

function cookieFromHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function fixtureUserCookie(context: E2EContext): string | undefined {
  return context.cookies?.get(COOKIE_NAME)?.value ?? cookieFromHeader(context.headers?.get("cookie") ?? null);
}

export function fieldgridE2EFixtureUserId(context: E2EContext): string {
  assertE2EAllowed();
  const userId = fixtureUserCookie(context);
  if (!userId || !FIELDGRID_E2E_FIXTURE_USERS.has(userId)) {
    throw new Error("Fieldgrid E2E auth requires an explicit allowlisted fixture user cookie.");
  }
  return userId;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64url(value: string): string {
  return bytesToBase64url(new TextEncoder().encode(value));
}

export async function createFieldgridE2EJwt(userId: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const identity = FIELDGRID_E2E_FIXTURE_IDENTITIES[userId];
  if (!identity) {
    throw new Error("Cannot create a Fieldgrid E2E JWT for a non-allowlisted user.");
  }
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    email: identity.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + FIFTEEN_MINUTES_SECONDS,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${bytesToBase64url(new Uint8Array(signature))}`;
}

function fixtureUser(userId: string) {
  const identity = FIELDGRID_E2E_FIXTURE_IDENTITIES[userId];
  if (!identity) throw new Error("Cannot create a Fieldgrid E2E fixture user for a non-allowlisted user.");
  return {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: identity.email,
    app_metadata: { provider: "fieldgrid-e2e", providers: ["fieldgrid-e2e"] },
    user_metadata: { fieldgrid_e2e_fixture: true },
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

function boundGet(target: object, property: string | symbol, receiver: unknown) {
  const value = Reflect.get(target, property, receiver);
  return typeof value === "function" ? value.bind(target) : value;
}

export function createFieldgridE2EFetch(context: E2EContext): typeof fetch {
  return async (input, init = {}) => {
    const userId = fieldgridE2EFixtureUserId(context);
    const original = new Request(input, init);
    const url = new URL(original.url);
    if (url.origin !== LOCAL_GATEWAY_ORIGIN) {
      throw new Error(`Fieldgrid E2E Supabase requests must stay on ${LOCAL_GATEWAY_ORIGIN}; got ${url.origin}.`);
    }
    const headers = new Headers(original.headers);
    headers.set("Authorization", `Bearer ${await createFieldgridE2EJwt(userId)}`);
    if (!headers.has("apikey")) headers.set("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fieldgrid-e2e-anon-key");
    const requestInit = { method: original.method, headers, body: original.body, duplex: "half" } as unknown as RequestInit;
    return fetch(new Request(url, requestInit));
  };
}

export function createFieldgridE2EAuthClient<TClient extends { auth: object }>(
  client: TClient,
  context: E2EContext = {},
): TClient {
  assertE2EAllowed();
  const userId = fixtureUserCookie(context);
  if (userId && !FIELDGRID_E2E_FIXTURE_USERS.has(userId)) {
    throw new Error("Fieldgrid E2E auth requires an explicit allowlisted fixture user cookie.");
  }

  const authProxy = new Proxy(client.auth as object, {
    get(target, property, receiver) {
      if (property === "getUser") {
        return async () => ({ data: { user: userId ? fixtureUser(userId) : null }, error: null });
      }
      return boundGet(target, property, receiver);
    },
  });

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "auth") return authProxy;
      return boundGet(target as object, property, receiver);
    },
  });
}
