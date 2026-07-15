const COOKIE_NAME = "fieldgrid_e2e_auth_user";

export const FIELDGRID_E2E_FIXTURE_USERS = new Set([
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000101",
  "20000000-0000-4000-8000-000000000102",
  "20000000-0000-4000-8000-000000000103",
  "20000000-0000-4000-8000-000000000104",
  "20000000-0000-4000-8000-000000000105",
  "20000000-0000-4000-8000-000000000106",
  "20000000-0000-4000-8000-000000000202",
  "20000000-0000-4000-8000-000000000204",
  "20000000-0000-4000-8000-000000000205",
  "20000000-0000-4000-8000-000000000401",
]);

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

function cookieFromHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function fixtureUserId(context: E2EContext): string | undefined {
  return context.cookies?.get(COOKIE_NAME)?.value ?? cookieFromHeader(context.headers?.get("cookie") ?? null);
}

function fixtureUser(userId: string) {
  return {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: `${userId}@e2e.fieldgrid.test`,
    app_metadata: { provider: "fieldgrid-e2e", providers: ["fieldgrid-e2e"] },
    user_metadata: { fieldgrid_e2e_fixture: true },
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

export function createFieldgridE2EAuthClient<TClient extends { auth: object }>(
  client: TClient,
  context: E2EContext = {},
): TClient {
  assertE2EAllowed();
  const userId = fixtureUserId(context);
  if (!userId || !FIELDGRID_E2E_FIXTURE_USERS.has(userId)) {
    throw new Error("Fieldgrid E2E auth requires an explicit allowlisted fixture user cookie.");
  }

  const authProxy = new Proxy(client.auth as object, {
    get(target, prop, receiver) {
      if (prop === "getUser") {
        return async () => ({ data: { user: fixtureUser(userId) }, error: null });
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "auth") return authProxy;
      return Reflect.get(target, prop, receiver);
    },
  });
}
