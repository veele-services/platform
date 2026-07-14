export type FieldgridE2eAuthUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export const FIELDGRID_E2E_AUTH_COOKIE = "fieldgrid_e2e_user_id";

export const FIELDGRID_E2E_AUTH_USERS: Record<string, string> = {
  "20000000-0000-4000-8000-000000000001": "platform-owner@runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000002": "platform-admin@runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000101": "owner@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000102": "admin@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000103": "planner@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000104": "personnel@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000105": "customer@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000106": "inactive-personnel@tenant-a.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000202": "admin@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000204": "personnel@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000205": "customer@tenant-b.runtime.fieldgrid.test",
  "20000000-0000-4000-8000-000000000401": "owner@suspended.runtime.fieldgrid.test",
};

export function isFieldgridE2eAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.FIELDGRID_E2E_AUTH_ENABLED === "true";
}

export function resolveFieldgridE2eAuthUser(userId: string | undefined): FieldgridE2eAuthUser | null {
  if (!isFieldgridE2eAuthEnabled() || !userId) return null;
  const email = FIELDGRID_E2E_AUTH_USERS[userId];
  if (!email) return null;
  return {
    id: userId,
    email,
    app_metadata: { provider: "fieldgrid-e2e" },
    user_metadata: { fixture: true },
  };
}

function e2eStorage(fallbackClient: any) {
  return fallbackClient.storage ?? {
    from() {
      return {
        createSignedUrl: async () => ({ data: { signedUrl: "about:blank" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "about:blank" } }),
        remove: async () => ({ data: null, error: null }),
      };
    },
  };
}

export function createFieldgridE2eSupabaseClient(userId: string | undefined, fallbackClient: any): any {
  const user = resolveFieldgridE2eAuthUser(userId);
  if (!user) return null;
  return {
    ...fallbackClient,
    auth: {
      ...fallbackClient.auth,
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    from: fallbackClient.from?.bind(fallbackClient),
    rpc: fallbackClient.rpc?.bind(fallbackClient) ?? (async () => ({ data: null, error: { message: "E2E RPC is not configured" } })),
    storage: e2eStorage(fallbackClient),
  };
}
