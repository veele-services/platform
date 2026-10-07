import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { searchAddresses, lookupAddress } from "@/lib/addresses/pdok";
import { getObjectActor } from "@/lib/objects/auth";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  try {
    const origin = request.headers.get("origin");
    if (
      !origin ||
      new URL(origin).host !== request.headers.get("host") ||
      ((process.env.DEPLOY_TARGET ?? "local") !== "local" &&
        new URL(origin).protocol !== "https:") ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return Response.json(
        { error: "Deze aanvraag is niet toegestaan." },
        { status: 403, headers },
      );
    const c = await getAuthContext().catch(() => null);
    const staffAccess = Boolean(
      c?.tenant &&
      c.tenant.roles.some((r) =>
        [
          "tenant_admin",
          "management",
          "planner",
          "hr",
          "finance",
          "staff",
        ].includes(r),
      )
    );
    const actor = staffAccess ? null : await getObjectActor().catch(() => null);
    const customerAccess = async () => {
      if (!actor) return false;
      const accounts = await actor.db.rpc("customer_portal_accounts", { target_tenant: actor.tenant.id });
      return !accounts.error && Array.isArray(accounts.data) && accounts.data.length > 0;
    };
    if (!staffAccess && !await customerAccess())
      return Response.json({ error: "Geen toegang" }, { status: 403, headers });
    const db = await createClient();
    const session = await db.rpc("travel_session_active");
    if (session.error || !session.data)
      return Response.json(
        { error: "Log opnieuw in." },
        { status: 403, headers },
      );
    const input = z
      .object({
        query: z.string().trim().min(2).max(200).optional(),
        id: z.string().uuid().optional(),
      })
      .refine((v) => Boolean(v.query) !== Boolean(v.id))
      .parse(await request.json());
    const result = input.id
        ? { address: await lookupAddress(input.id) }
        : { suggestions: await searchAddresses(input.query!) };
    // Provider I/O must not revive an account or session revoked meanwhile.
    const currentSession = await db.rpc("travel_session_active");
    if (currentSession.error || !currentSession.data || !staffAccess && !await customerAccess())
      return Response.json({ error: "Geen toegang" }, { status: 403, headers });
    return Response.json(
      result,
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Adres zoeken is tijdelijk niet beschikbaar. Je kunt handmatig invoeren.",
      },
      { status: 503, headers },
    );
  }
}
