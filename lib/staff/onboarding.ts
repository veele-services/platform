import { normalizeAddress } from "@/lib/addresses/model";
import type { Json } from "@/lib/database.types";
import type { NotificationPreferences } from "@/lib/notifications/model";
import type { StaffAvailabilityPreferences, StaffOnboardingDraft } from "@/lib/staff/model";
import type { StaffPersonnel } from "@/lib/staff/workspace";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const shiftOptions = ["day", "evening", "night"] as const;
const vehicleOptions = ["car", "van", "motorcycle", "scooter", "electric_bicycle", "bicycle", "public_transport", "walking", "other"] as const;
const departureOptions = ["home", "depot", "alternate"] as const;

const jsonObject = (value: Json | undefined | null) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
const asText = (value: Json | undefined) => typeof value === "string" ? value : "";

export function defaultAvailability(value: Json | undefined): StaffAvailabilityPreferences {
  const input = jsonObject(value);
  const sourceWeek = jsonObject(input.week);
  return {
    week: Object.fromEntries(dayKeys.map((key) => {
      const day = jsonObject(sourceWeek[key]);
      return [key, { enabled: day.enabled === true, start: asText(day.start) || "08:00", end: asText(day.end) || "17:00" }];
    })),
    shifts: Array.isArray(input.shifts) ? input.shifts.filter((item): item is (typeof shiftOptions)[number] => typeof item === "string" && shiftOptions.includes(item as (typeof shiftOptions)[number])) : [],
    planningNote: asText(input.planningNote),
    weekends: input.weekends === true,
    holidays: input.holidays === true,
  };
}

export function defaultTransport(profile: StaffPersonnel): StaffOnboardingDraft["transport"] {
  const alternate = jsonObject(profile.alternate_departure_address);
  return {
    vehicle: profile.standard_vehicle === "ebike" ? "electric_bicycle" : vehicleOptions.includes(profile.standard_vehicle as (typeof vehicleOptions)[number]) ? profile.standard_vehicle as (typeof vehicleOptions)[number] : "other",
    departureKind: profile.departure_kind === "custom" ? "alternate" : departureOptions.includes(profile.departure_kind as (typeof departureOptions)[number]) ? profile.departure_kind as (typeof departureOptions)[number] : "home",
    departureDepotId: profile.departure_depot_id ?? null,
    alternateDepartureAddress: ["custom", "alternate"].includes(profile.departure_kind ?? "") && Object.keys(alternate).length ? { street: asText(alternate.street), postalCode: asText(alternate.postal_code), city: asText(alternate.city), country: asText(alternate.country) || "NL", ...(typeof alternate.street_name === "string" ? {address:normalizeAddress(alternate)} : {}) } : null,
    returnToDeparture: Boolean(profile.return_to_departure),
    ownTransport: Boolean(profile.own_transport),
    drivingLicense: Boolean(profile.driving_license),
    drivingLicenseCategories: profile.driving_license_categories ?? [],
    carpoolAllowed: Boolean(profile.carpool_allowed),
    limitations: profile.travel_limitations ?? "",
  };
}

export function defaultOnboarding(profile: StaffPersonnel, notificationPreferences: NotificationPreferences): StaffOnboardingDraft {
  const saved = jsonObject(profile.onboarding_draft);
  const home = jsonObject(profile.home_address);
  const emergency = jsonObject(profile.emergency_contact);
  const base: StaffOnboardingDraft = {
    profile: {
      fullName: profile.full_name ?? "", preferredName: profile.preferred_name ?? "", phone: profile.phone ?? "",
      mobilePhone: profile.mobile_phone ?? "", birthDate: profile.birth_date ?? "",
      homeAddress: { street: asText(home.street), postalCode: asText(home.postal_code), city: asText(home.city), country: asText(home.country) || "NL", ...(typeof home.street_name === "string" ? {address:normalizeAddress(home)} : {}) },
      emergencyContact: { name: asText(emergency.name), phone: asText(emergency.phone), relation: asText(emergency.relation) },
    },
    transport: defaultTransport(profile),
    notifications: notificationPreferences,
    availability: defaultAvailability(profile.availability_preferences),
    confirmations: { details: false, availability: false, notifications: false, privacy: false, terms: false },
  };
  if (!Object.keys(saved).length) return base;
  const candidate = saved as unknown as Partial<StaffOnboardingDraft>;
  const savedNotifications = candidate.notifications;
  return {
    ...base,
    ...candidate,
    profile: { ...base.profile, ...candidate.profile },
    transport: { ...base.transport, ...candidate.transport },
    availability: candidate.availability ?? base.availability,
    notifications: {
      ...notificationPreferences,
      ...savedNotifications,
      version: notificationPreferences.version,
      timezone: notificationPreferences.timezone,
      types: notificationPreferences.types.map((type) => {
        const previous = savedNotifications?.types?.find((item) => item.code === type.code);
        return previous ? { ...type, email: previous.email, push: previous.push } : type;
      }),
    },
    confirmations: { ...base.confirmations, ...candidate.confirmations },
  };
}
