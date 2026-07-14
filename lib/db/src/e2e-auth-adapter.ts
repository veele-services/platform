import { and, eq } from "drizzle-orm";
import { db } from "./connection";
import { personnelTable } from "./schema";

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

type PersonnelFilterColumn = "id" | "tenant_id" | "user_id" | "is_active";

type PersonnelRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  region: string | null;
  is_active: boolean;
};

const PERSONNEL_FILTER_COLUMNS = {
  id: personnelTable.id,
  tenant_id: personnelTable.tenantId,
  user_id: personnelTable.userId,
  is_active: personnelTable.isActive,
} as const;

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

function isPersonnelFilterColumn(column: string): column is PersonnelFilterColumn {
  return column in PERSONNEL_FILTER_COLUMNS;
}

class E2ePersonnelQuery {
  private filters: Array<{ column: PersonnelFilterColumn; value: unknown }> = [];

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    if (!isPersonnelFilterColumn(column)) {
      throw new Error(`Unsupported E2E personnel filter column: ${column}`);
    }
    this.filters.push({ column, value });
    return this;
  }

  private async rows(): Promise<PersonnelRow[]> {
    const predicates = this.filters.map((filter) => eq(PERSONNEL_FILTER_COLUMNS[filter.column], filter.value as never));
    const query = db
      .select({
        id: personnelTable.id,
        tenant_id: personnelTable.tenantId,
        user_id: personnelTable.userId,
        region: personnelTable.region,
        is_active: personnelTable.isActive,
      })
      .from(personnelTable);

    const rows = predicates.length > 0 ? await query.where(and(...predicates)).limit(2) : await query.limit(2);
    return rows;
  }

  async maybeSingle(): Promise<{ data: PersonnelRow | null; error: null }> {
    const rows = await this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: PersonnelRow | null; error: { message: string } | null }> {
    const rows = await this.rows();
    if (rows.length !== 1) return { data: rows[0] ?? null, error: { message: `Expected one row, got ${rows.length}` } };
    return { data: rows[0]!, error: null };
  }
}

function e2eFrom(table: string) {
  if (table === "personnel") return new E2ePersonnelQuery();
  throw new Error(`Unsupported E2E Supabase table: ${table}`);
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
    from: e2eFrom,
    rpc: fallbackClient.rpc?.bind(fallbackClient) ?? (async () => ({ data: null, error: { message: "E2E RPC is not configured" } })),
    storage: e2eStorage(fallbackClient),
  };
}
