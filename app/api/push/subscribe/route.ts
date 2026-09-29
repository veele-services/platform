import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({ p256dh: z.string().min(20).max(1024), auth: z.string().min(8).max(1024) }),
});

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.roles.includes("staff")) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ongeldig pushabonnement" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert({
    tenant_id: context.tenant.id, user_id: context.user.id, endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh, auth_secret: parsed.data.keys.auth,
    user_agent: request.headers.get("user-agent"), revoked_at: null,
  }, { onConflict: "tenant_id,user_id,endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await getAuthContext();
  if (!context.tenant) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const endpoint = z.object({ endpoint: z.string().url() }).safeParse(await request.json().catch(() => null));
  if (!endpoint.success) return NextResponse.json({ error: "Ongeldig endpoint" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("tenant_id", context.tenant.id).eq("user_id", context.user.id).eq("endpoint", endpoint.data.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
