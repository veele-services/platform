import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { allowedSearchCategories, literalSearchFilter, searchInput, type SearchGroup } from "@/lib/search/model";
import type { WorkOrderListData } from "@/lib/work-orders/model";

const responseHeaders = { "cache-control": "private, no-store" };
const forbidden = () => Response.json({ error: "Geen toegang tot zoeken." }, { status: 403, headers: responseHeaders });

/** Session-bound, hostname-resolved search. Uses RLS and the existing guarded
 * operational RPC, with a minimal response and no administrative client. */
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host") ||
      (process.env.DEPLOY_TARGET !== "local" && new URL(origin).protocol !== "https:") ||
      !request.headers.get("content-type")?.startsWith("application/json")) return forbidden();
    const context = await getAuthContext().catch(() => null);
    const tenant = context?.tenant;
    if (!tenant || !tenant.roles.some(role => role !== "staff")) return forbidden();
    const parsed = searchInput.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Gebruik 3 tot 100 tekens." }, { status: 400, headers: responseHeaders });
    const db = await createClient();
    const active = await db.rpc("travel_session_active");
    if (active.error || !active.data) return forbidden();
    const categories = allowedSearchCategories(tenant);
    const groups = await Promise.all(categories.map(async category => {
      if (category.id === "orders") {
        // Planners cannot read the financial base row. Reuse the operational
        // projection and its literal query escaping, then return only labels.
        const { data, error } = await db.rpc("work_order_list", { target_tenant: tenant.id, filters: { q: parsed.data.query, page: 1, pageSize: 10, sort: "number" } }).abortSignal(request.signal);
        if (error) throw new Error("Search unavailable");
        const result = data as unknown as WorkOrderListData;
        return { id: category.id, title: category.title, results: result.rows.slice(0, 5).map(row => ({ id: row.id, title: row.number, detail: [row.title, row.customer, row.object].filter(Boolean).join(" · "), href: category.path + encodeURIComponent(row.id) })) } satisfies SearchGroup;
      }
      const { data, error } = await db.from(category.table)
        .select(["id", ...category.fields].join(","))
        .eq("tenant_id", tenant.id)
        .or(literalSearchFilter(category.fields, parsed.data.query))
        .order(category.label).order("id").limit(5).abortSignal(request.signal);
      if (error) throw new Error("Search unavailable");
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const results = rows.filter(row => typeof row.id === "string" && typeof row[category.label] === "string").map(row => ({
        id: row.id as string,
        title: row[category.label] as string,
        detail: category.detail !== category.label && typeof row[category.detail] === "string" ? row[category.detail] as string : "",
        href: category.path + encodeURIComponent(row.id as string),
      }));
      return { id: category.id, title: category.title, results } satisfies SearchGroup;
    }));
    // Do not deliver a result from a membership or module revoked during I/O.
    const current = await getAuthContext().catch(() => null);
    const session = await db.rpc("travel_session_active");
    if (!current?.tenant || current.user.id !== context.user.id || current.tenant.id !== tenant.id || session.error || !session.data) return forbidden();
    const currentCategories = new Set(allowedSearchCategories(current.tenant).map(item => item.id));
    return Response.json({ groups: groups.filter(group => currentCategories.has(group.id as typeof categories[number]["id"]) && group.results.length) }, { headers: responseHeaders });
  } catch {
    return Response.json({ error: "Zoeken is tijdelijk niet beschikbaar. Probeer opnieuw." }, { status: 503, headers: responseHeaders });
  }
}
