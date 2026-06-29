"use server";

import { db, personnelTable } from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

export type PersonnelProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  region: string | null;
  roleName: string | null;
  sectorName: string | null;
  certificates: string[];
  diplomas: string[];
  knowledge: string[];
  notificationEmailEnabled: boolean;
  notificationPushEnabled: boolean;
  notificationPlanningEnabled: boolean;
  notificationNewsEnabled: boolean;
  notificationHoursEnabled: boolean;
};

const PERSONNEL_SELECT =
  [
    "id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "address_street",
    "address_postal_code",
    "address_city",
    "address_country",
    "avatar_url",
    "avatar_path",
    "region",
    "certificates",
    "diplomas",
    "knowledge",
    "notification_email_enabled",
    "notification_push_enabled",
    "notification_planning_enabled",
    "notification_news_enabled",
    "notification_hours_enabled",
    "roles(name)",
    "sectors(name)",
  ].join(", ");

type ActionResult = { success: boolean; error?: string };
export type NotificationSettingsValues = {
  email: boolean;
  push: boolean;
  planning: boolean;
  news: boolean;
  hours: boolean;
};

function normalizeText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeNullableText(
  value: FormDataEntryValue | null,
  maxLength: number,
) {
  const text = normalizeText(value, maxLength);
  return text.length > 0 ? text : null;
}

function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        typeof item.name === "string"
      ) {
        return item.name;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfile(d: any): PersonnelProfile {
  return {
    id:           d.id,
    firstName:    d.first_name,
    lastName:     d.last_name,
    email:        d.email,
    phone:        d.phone ?? null,
    addressStreet: d.address_street ?? null,
    addressPostalCode: d.address_postal_code ?? null,
    addressCity: d.address_city ?? null,
    addressCountry: d.address_country ?? "Nederland",
    avatarUrl: d.avatar_url ?? null,
    avatarPath: d.avatar_path ?? null,
    region:       d.region ?? null,
    roleName:     d.roles?.name ?? null,
    sectorName:   d.sectors?.name ?? null,
    certificates: normalizeNameList(d.certificates),
    diplomas:     normalizeNameList(d.diplomas),
    knowledge:    normalizeNameList(d.knowledge),
    notificationEmailEnabled: d.notification_email_enabled ?? true,
    notificationPushEnabled: d.notification_push_enabled ?? true,
    notificationPlanningEnabled: d.notification_planning_enabled ?? true,
    notificationNewsEnabled: d.notification_news_enabled ?? true,
    notificationHoursEnabled: d.notification_hours_enabled ?? true,
  };
}

export async function getMyPersonnel(): Promise<PersonnelProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // ── Primary lookup: by user_id (RLS-filtered) ─────────────────────────────
  const { data: byId } = await supabase
    .from("personnel")
    .select(PERSONNEL_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (byId) return mapProfile(byId);

  // ── First-login account-linking ───────────────────────────────────────────
  // The employee was invited (invite_sent_at NOT NULL) but user_id is still null
  // because we don't set it at invite time — we set it here on first PWA login.
  // Requires invite_sent_at IS NOT NULL to ensure only genuinely invited personnel
  // can self-link; anonymous sign-ups or unrelated accounts cannot claim records.
  const admin = createAdminClient();
  const { data: byEmail } = await admin
    .from("personnel")
    .select("id, user_id, invite_sent_at")
    .eq("email", user.email!)
    .eq("is_active", true)
    .is("user_id", null)
    .not("invite_sent_at", "is", null)
    .single();

  if (!byEmail) return null;

  // Link the Supabase user to the personnel record.
  const { error: linkError } = await admin
    .from("personnel")
    .update({ user_id: user.id })
    .eq("id", byEmail.id);

  if (linkError) return null;

  // Fetch via RLS-filtered client now that user_id is set.
  const { data: linked } = await supabase
    .from("personnel")
    .select(PERSONNEL_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  return linked ? mapProfile(linked) : null;
}

export async function updateMyPhone(
  phone: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const cleaned = phone.trim();
  if (cleaned.length > 0 && !/^\+?[\d\s\-().]{7,20}$/.test(cleaned)) {
    return { success: false, error: "Ongeldig telefoonnummer" };
  }

  const [updated] = await db
    .update(personnelTable)
    .set({
      phone: cleaned || null,
      profileUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .returning({ id: personnelTable.id });

  if (!updated) {
    return { success: false, error: "Personeelsprofiel niet gevonden" };
  }

  revalidatePath("/profiel");
  return { success: true };
}

export async function updateMyProfile(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const firstName = normalizeText(formData.get("firstName"), 100);
  const lastName = normalizeText(formData.get("lastName"), 100);
  const phone = normalizeNullableText(formData.get("phone"), 50);
  const addressStreet = normalizeNullableText(formData.get("addressStreet"), 200);
  const addressPostalCode = normalizeNullableText(formData.get("addressPostalCode"), 20);
  const addressCity = normalizeNullableText(formData.get("addressCity"), 120);
  const addressCountry =
    normalizeNullableText(formData.get("addressCountry"), 80) ?? "Nederland";

  if (!firstName || !lastName) {
    return { success: false, error: "Voornaam en achternaam zijn verplicht" };
  }
  if (phone && !/^\+?[\d\s\-().]{7,20}$/.test(phone)) {
    return { success: false, error: "Ongeldig telefoonnummer" };
  }

  const [updated] = await db
    .update(personnelTable)
    .set({
      firstName,
      lastName,
      phone,
      addressStreet,
      addressPostalCode,
      addressCity,
      addressCountry,
      profileUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .returning({ id: personnelTable.id });

  if (!updated) {
    return { success: false, error: "Personeelsprofiel niet gevonden" };
  }

  revalidatePath("/profiel");
  return { success: true };
}

export async function uploadMyAvatar(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Kies eerst een foto" };
  }
  if (file.size > 3 * 1024 * 1024) {
    return { success: false, error: "Foto mag maximaal 3 MB zijn" };
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[file.type];
  if (!extension) {
    return { success: false, error: "Gebruik JPG, PNG of WebP" };
  }

  const [personnel] = await db
    .select({
      id: personnelTable.id,
      avatarPath: personnelTable.avatarPath,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  if (!personnel) {
    return { success: false, error: "Personeelsprofiel niet gevonden" };
  }

  const admin = createAdminClient();
  const path = `${personnel.id}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("personnel-avatars")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: "Profielfoto uploaden mislukt" };
  }

  const { data } = admin.storage.from("personnel-avatars").getPublicUrl(path);

  await db
    .update(personnelTable)
    .set({
      avatarPath: path,
      avatarUrl: data.publicUrl,
      profileUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(personnelTable.id, personnel.id), eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)));

  if (personnel.avatarPath && personnel.avatarPath !== path) {
    await admin.storage.from("personnel-avatars").remove([personnel.avatarPath]);
  }

  revalidatePath("/profiel");
  return { success: true };
}

async function persistMyNotificationSettings(
  userId: string,
  values: NotificationSettingsValues,
): Promise<ActionResult> {
  const [updated] = await db
    .update(personnelTable)
    .set({
      notificationEmailEnabled: values.email,
      notificationPushEnabled: values.push,
      notificationPlanningEnabled: values.planning,
      notificationNewsEnabled: values.news,
      notificationHoursEnabled: values.hours,
      profileUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(personnelTable.userId, userId), eq(personnelTable.isActive, true)))
    .returning({ id: personnelTable.id });

  if (!updated) {
    return { success: false, error: "Personeelsprofiel niet gevonden" };
  }

  revalidatePath("/meldingen");
  revalidatePath("/instellingen/meldingen");
  revalidatePath("/profiel");
  return { success: true };
}

export async function updateMyNotificationSettingsDirect(
  values: NotificationSettingsValues,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  return persistMyNotificationSettings(user.id, values);
}

export async function updateMyNotificationSettings(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  return persistMyNotificationSettings(user.id, {
    email: formData.has("email"),
    push: formData.has("push"),
    planning: formData.has("planning"),
    news: formData.has("news"),
    hours: formData.has("hours"),
  });
}
