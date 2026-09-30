"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext, type AppRole } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { addressFromForm } from "@/lib/addresses/form";
import { mobilityFromForm } from "@/lib/travel/forms";
import type { Mobility } from "@/lib/travel/model";
import type { ActionResult } from "@/lib/actions/result";
import type { Database } from "@/lib/database.types";
const fail = (): ActionResult<never> => ({
  ok: false,
  error:
    "Niet opgeslagen. Controleer de gegevens en toegang of vernieuw bij een gelijktijdige wijziging.",
});
async function authorize(roles: AppRole[]) {
  const c = await getAuthContext();
  if (!c.tenant || !c.tenant.roles.some((r) => roles.includes(r)))
    throw new Error("Geen toegang");
  const db = await createClient();
  const s = await db.rpc("travel_session_active");
  if (!s.data) throw new Error("Log opnieuw in");
  return { db, tenant: c.tenant, user: c.user };
}
function refresh() {
  revalidatePath("/app", "layout");
  revalidatePath("/staff");
}
export async function loadMobility(personnelId: string) {
  try {
    z.string().uuid().parse(personnelId);
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "hr",
      "staff",
    ]);
    const [r, d] = await Promise.all([
      db.rpc("personnel_mobility", {
        target_tenant: tenant.id,
        target_personnel: personnelId,
      }),
      db
        .from("travel_depots")
        .select("id,name,active")
        .eq("tenant_id", tenant.id),
    ]);
    if (r.error || d.error || !r.data) return fail();
    return {
      ok: true as const,
      record: r.data as unknown as Mobility & { id: string; version: number },
      depots: d.data,
    };
  } catch {
    return fail();
  }
}
export async function saveMobility(form: FormData): Promise<ActionResult> {
  try {
    const id = z.string().uuid().parse(form.get("personnelId")),
      version = z.coerce.number().int().positive().parse(form.get("version"));
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "hr",
    ]);
    const values = await mobilityFromForm(form);
    const r = await db
      .from("personnel")
      .update({ ...values, version: version + 1 })
      .eq("tenant_id", tenant.id)
      .eq("id", id)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    if (r.error || !r.data) return fail();
    refresh();
    return { ok: true };
  } catch {
    return fail();
  }
}
export async function loadTravelSettings() {
  try {
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "planner",
      "hr",
    ]);
    const [settings, depots, objects, people] = await Promise.all([
      db
        .from("tenant_settings")
        .select("travel_margin_minutes,travel_vehicle_margins,updated_at")
        .eq("tenant_id", tenant.id)
        .single(),
      db
        .from("travel_depots")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("name"),
      db
        .from("objects")
        .select("id,name,address,arrival_location")
        .eq("tenant_id", tenant.id)
        .eq("active", true),
      db
        .from("personnel")
        .select("id,full_name,standard_vehicle,departure_kind")
        .eq("tenant_id", tenant.id)
        .eq("status", "active"),
    ]);
    if (settings.error || depots.error || objects.error || people.error)
      return fail();
    return {
      ok: true as const,
      settings: settings.data,
      depots: depots.data,
      objects: objects.data,
      people: people.data,
    };
  } catch {
    return fail();
  }
}
export async function saveTravelSettings(
  form: FormData,
): Promise<ActionResult> {
  try {
    const { db, tenant } = await authorize(["tenant_admin", "management"]);
    const margin = z.coerce
      .number()
      .int()
      .min(0)
      .max(180)
      .parse(form.get("margin"));
    const updated = z.string().parse(form.get("updatedAt"));
    const overrides: Record<string, number> = {};
    for (const k of ["car", "van", "bicycle", "ebike", "walking", "other"]) {
      const raw = form.get(`margin-${k}`);
      if (raw !== null && raw !== "")
        overrides[k] = z.coerce.number().int().min(0).max(180).parse(raw);
    }
    const r = await db
      .from("tenant_settings")
      .update({
        travel_margin_minutes: margin,
        travel_vehicle_margins: overrides,
      })
      .eq("tenant_id", tenant.id)
      .eq("updated_at", updated)
      .select("tenant_id")
      .maybeSingle();
    if (r.error || !r.data) return fail();
    refresh();
    return { ok: true };
  } catch {
    return fail();
  }
}
export async function saveDepot(form: FormData): Promise<ActionResult> {
  try {
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "planner",
    ]);
    const input = z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(160),
        version: z.coerce.number().int().min(0),
      })
      .parse(Object.fromEntries(form));
    const values = {
      name: input.name,
      address: await addressFromForm(form, "addressPayload", true),
      active: form.get("active") === "on",
      version: input.version + 1,
      updated_at: new Date().toISOString(),
    };
    const r = input.version
      ? await db
          .from("travel_depots")
          .update(values)
          .eq("tenant_id", tenant.id)
          .eq("id", input.id)
          .eq("version", input.version)
          .select("id")
          .maybeSingle()
      : await db
          .from("travel_depots")
          .insert({ ...values, id: input.id, tenant_id: tenant.id })
          .select("id")
          .single();
    if (r.error || !r.data) return fail();
    refresh();
    return { ok: true };
  } catch {
    return fail();
  }
}
export async function saveArrival(
  form: FormData,
): Promise<ActionResult<{ version: number }>> {
  try {
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "planner",
    ]);
    const v = z
      .object({
        objectId: z.string().uuid(),
        version: z.coerce.number().int().positive(),
        instruction: z.string().trim().max(1000),
        latitude: z.string(),
        longitude: z.string(),
        margin: z.string(),
      })
      .parse(Object.fromEntries(form));
    const point =
      form.get("useAddress") === "on"
        ? null
        : [
            z.coerce.number().min(-180).max(180).parse(v.longitude),
            z.coerce.number().min(-90).max(90).parse(v.latitude),
          ];
    if (point && (!v.latitude || !v.longitude)) return fail();
    const margin =
      v.margin === ""
        ? null
        : z.coerce.number().int().min(0).max(180).parse(v.margin);
    const r = await db
      .from("objects")
      .update({
        arrival_location: point,
        arrival_instruction: v.instruction,
        travel_margin_minutes: margin,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", v.objectId)
      .eq("version", v.version)
      .select("id,version")
      .maybeSingle();
    if (r.error || !r.data) return fail();
    refresh();
    return { ok: true, version: r.data.version };
  } catch {
    return fail();
  }
}
export async function loadTravelDaySettings(personnelId: string, day: string) {
  try {
    z.string().uuid().parse(personnelId);
    z.string().date().parse(day);
    const { db, tenant } = await authorize([
      "tenant_admin",
      "management",
      "planner",
      "hr",
    ]);
    const [person, override, depots] = await Promise.all([
      db
        .from("personnel")
        .select(
          "id,full_name,standard_vehicle,departure_kind,departure_depot_id,return_to_departure",
        )
        .eq("tenant_id", tenant.id)
        .eq("id", personnelId)
        .single(),
      db
        .from("personnel_travel_days")
        .select(
          "tenant_id,personnel_id,day,standard_vehicle,departure_kind,departure_depot_id,return_to_departure,version,updated_at,updated_by",
        )
        .eq("tenant_id", tenant.id)
        .eq("personnel_id", personnelId)
        .eq("day", day)
        .maybeSingle(),
      db
        .from("travel_depots")
        .select("id,name,active")
        .eq("tenant_id", tenant.id),
    ]);
    if (person.error || override.error || depots.error) return fail();
    const privateAccess = tenant.roles.some((r) =>
      ["tenant_admin", "management", "hr"].includes(r),
    );
    const departure = privateAccess
      ? await db.rpc("travel_day_departure", {
          t: tenant.id,
          p: personnelId,
          d: day,
        })
      : null;
    if (departure?.error) return fail();
    return {
      ok: true as const,
      privateAccess,
      departureAddress: departure?.data ?? null,
      person: person.data,
      override: override.data,
      depots: depots.data,
    };
  } catch {
    return fail();
  }
}
export async function saveTravelDaySettings(
  form: FormData,
): Promise<ActionResult> {
  try {
    const { db, tenant, user } = await authorize([
      "tenant_admin",
      "management",
      "planner",
      "hr",
    ]);
    const v = z
      .object({
        personnelId: z.string().uuid(),
        day: z.string().date(),
        version: z.coerce.number().int().min(0),
        vehicle: z.enum([
          "",
          "car",
          "van",
          "bicycle",
          "ebike",
          "walking",
          "other",
        ]),
        departure: z.enum(["", "home", "depot", "custom"]),
        depot: z.string().uuid().or(z.literal("")),
        returnTrip: z.enum(["", "yes", "no"]),
      })
      .parse(Object.fromEntries(form));
    const privateAccess = tenant.roles.some((r) =>
      ["tenant_admin", "management", "hr"].includes(r),
    );
    const privateFields =
      privateAccess && form.has("dayDepartureAddress")
        ? {
            departure_address:
              form.get("useDefaultDepartureAddress") === "on"
                ? null
                : await addressFromForm(form, "dayDepartureAddress"),
          }
        : {};
    const values: Database["public"]["Tables"]["personnel_travel_days"]["Insert"] = {
      ...privateFields,
      tenant_id: tenant.id,
      personnel_id: v.personnelId,
      day: v.day,
      standard_vehicle: v.vehicle || null,
      departure_kind: v.departure || null,
      departure_depot_id: v.depot || null,
      return_to_departure: v.returnTrip === "" ? null : v.returnTrip === "yes",
      version: v.version + 1,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const query = db.from("personnel_travel_days");
    const r =
      form.get("reset") === "yes"
        ? v.version
          ? await query
              .delete()
              .eq("tenant_id", tenant.id)
              .eq("personnel_id", v.personnelId)
              .eq("day", v.day)
              .eq("version", v.version)
              .select("personnel_id")
              .maybeSingle()
          : { data: true, error: null }
        : v.version
          ? await query
              .update(values)
              .eq("tenant_id", tenant.id)
              .eq("personnel_id", v.personnelId)
              .eq("day", v.day)
              .eq("version", v.version)
              .select("personnel_id")
              .maybeSingle()
          : await query.insert(values).select("personnel_id").single();
    if (r.error || !r.data) return fail();
    refresh();
    return { ok: true };
  } catch {
    return fail();
  }
}
