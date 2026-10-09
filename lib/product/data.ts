import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { getObjectActor } from "@/lib/objects/auth";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import {
  productWorkspaceSchema,
  productOptionsSchema,
  productListSchema,
  ideaSchema,
  roadmapSchema,
  releaseSchema,
  querySchema,
  type ProductWorkspace,
  type ProductSection,
  type ProductActorSnapshot,
} from "./model";
export async function productRpc(
  db: Awaited<ReturnType<typeof createClient>>,
  name: "product_query" | "product_command",
  args: Record<string, unknown>,
): Promise<unknown> {
  const rpc = db.rpc.bind(db) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: {
      code?: string;
      message: string;
    } | null;
  }>;
  const r = await rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
class ProductAccessError extends Error {
  readonly code = "42501";
}
export async function getProductActor(input: ProductWorkspace) {
  const workspace = productWorkspaceSchema.parse(input);
  if (workspace === "customer") {
    const a = await getObjectActor();
    return {
      workspace,
      db: a.db,
      tenantId: a.tenant.id,
      userId: a.user.id,
      context: null,
    };
  }
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new ProductAccessError("Geen actuele toegang.");
  const context = await getAuthContext();
  if (workspace === "platform") {
    if ((await headers()).get(TENANT_SLUG_HEADER) || !context.isPlatformAdmin)
      throw new ProductAccessError("Geen platformtoegang.");
    return { workspace, db, tenantId: null, userId: user.id, context };
  }
  if (!context.tenant)
    throw new ProductAccessError("Open je eigen organisatie.");
  return {
    workspace,
    db,
    tenantId: context.tenant.id,
    userId: user.id,
    context,
  };
}
export async function productQuery(
  workspace: ProductWorkspace,
  operation: string,
  payload: Record<string, unknown> = {},
) {
  const a = await getProductActor(workspace);
  return productRpc(a.db, "product_query", {
    target_tenant: a.tenantId,
    actor_context: a.workspace,
    operation,
    payload,
  });
}
export async function productList(
  workspace: ProductWorkspace,
  section: ProductSection,
  input: unknown = {},
) {
  return productListSchema.parse(
    await productQuery(workspace, section, querySchema.parse(input)),
  );
}
export async function productDetail(
  workspace: ProductWorkspace,
  kind: ProductSection,
  id: string,
) {
  const value = await productQuery(
    workspace,
    kind === "ideas" ? "idea" : kind === "roadmap" ? "roadmap_item" : "release",
    { id: z.uuid().parse(id) },
  );
  return (
    kind === "ideas"
      ? ideaSchema
      : kind === "roadmap"
        ? roadmapSchema
        : releaseSchema
  ).parse(value);
}
export async function productSnapshot(
  workspace: ProductWorkspace,
): Promise<ProductActorSnapshot> {
  const a = await getProductActor(workspace);
  const args = { target_tenant: a.tenantId, actor_context: workspace };
  const [access, overview, options] = await Promise.all([
    productRpc(a.db, "product_query", {
      ...args,
      operation: "access",
      payload: {},
    }),
    productRpc(a.db, "product_query", {
      ...args,
      operation: "overview",
      payload: {},
    }),
    workspace === "platform"
      ? productRpc(a.db, "product_query", {
          ...args,
          operation: "options",
          payload: {},
        })
      : Promise.resolve({ tenants: [], owners: [] }),
  ]);
  // Repeat the live boundary after parallel source reads.
  await productRpc(a.db, "product_query", {
    ...args,
    operation: "access",
    payload: {},
  });
  const initial = z
    .object({
      ideas: productListSchema.nullable(),
      roadmap: productListSchema,
      releases: productListSchema,
    })
    .parse(overview);
  const env = process.env.DEPLOY_TARGET;
  return {
    workspace,
    actorKey: `${a.tenantId ?? "platform"}:${a.userId}:${workspace}`,
    environment: env === "staging" || env === "production" ? env : "local",
    access: z
      .object({ canManage: z.boolean(), canSubmit: z.boolean() })
      .parse(access),
    options: productOptionsSchema.parse(options),
    initial,
  };
}
