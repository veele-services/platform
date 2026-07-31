import { z } from "zod/v4";
import {
  PORTAL_ONBOARDING_PORTALS,
  PORTAL_PUSH_STATUSES,
  type PortalOnboardingDraft,
  type PortalOnboardingPortal,
  CUSTOMER_ONBOARDING_STEPS,
  PERSONNEL_ONBOARDING_STEPS,
  type CustomerOnboardingStep,
  type PersonnelOnboardingStep,
  type PortalOnboardingStep,
} from "./portal-onboarding-client";

export * from "./portal-onboarding-client";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is verplicht.`).max(max);

function normalizePhoneNumber(value: string): string {
  const compact = value.replace(/[^\d+]/gu, "");
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("0")) return `+31${compact.slice(1)}`;
  return compact;
}

function isDutchCountry(value: string): boolean {
  const country = value.trim().toLowerCase();
  return (
    country === "nl" || country === "nederland" || country === "netherlands"
  );
}

function isDutchPostalCode(value: string): boolean {
  return /^[1-9]\d{3}\s?[A-Z]{2}$/u.test(value.trim().toUpperCase());
}

const phone = requiredText("Telefoonnummer", 50)
  .regex(/^\+?[\d\s().-]{7,24}$/u, "Vul een geldig telefoonnummer in.")
  .transform(normalizePhoneNumber);
const optionalPhone = z
  .string()
  .trim()
  .max(50)
  .refine(
    (value) => !value || /^\+?[\d\s().-]{7,24}$/u.test(value),
    "Vul een geldig telefoonnummer in.",
  )
  .transform((value) => (value ? normalizePhoneNumber(value) : ""))
  .optional()
  .default("");
const optionalEmail = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => !value || z.email().safeParse(value).success,
    "Vul een geldig e-mailadres in.",
  )
  .transform((value) => value.toLowerCase())
  .optional()
  .default("");
const optionalUrl = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => !value || z.url().safeParse(value).success,
    "Vul een geldige URL inclusief https:// in.",
  )
  .optional()
  .default("");

export const personnelProfileOnboardingSchema = z
  .object({
    firstName: requiredText("Voornaam", 100),
    lastName: requiredText("Achternaam", 100),
    preferredName: optionalText(100),
    phone,
    secondaryPhone: optionalPhone,
    personalEmail: optionalEmail,
    addressStreet: requiredText("Straat en huisnummer", 200),
    addressPostalCode: requiredText("Postcode", 20),
    addressCity: requiredText("Woonplaats", 120),
    addressCountry: requiredText("Land", 80),
    birthDate: z
      .string()
      .trim()
      .refine(
        (value) => !value || /^\d{4}-\d{2}-\d{2}$/u.test(value),
        "Geboortedatum is ongeldig.",
      )
      .optional()
      .default(""),
    emergencyContactName: optionalText(160),
    emergencyContactPhone: optionalPhone,
    emergencyContactRelation: optionalText(100),
  })
  .superRefine((value, context) => {
    if (
      isDutchCountry(value.addressCountry) &&
      !isDutchPostalCode(value.addressPostalCode)
    ) {
      context.addIssue({
        code: "custom",
        path: ["addressPostalCode"],
        message: "Vul een geldige Nederlandse postcode in.",
      });
    }
  });

export const PERSONNEL_PRIMARY_TRANSPORT_TYPES = [
  "car",
  "van",
  "motorcycle",
  "scooter",
  "electric_bicycle",
  "bicycle",
  "public_transport",
  "walking",
  "other",
] as const;

export const personnelTransportOnboardingSchema = z
  .object({
    primaryTransportType: z.enum(PERSONNEL_PRIMARY_TRANSPORT_TYPES),
    ownTransport: z.boolean(),
    validDrivingLicense: z.boolean(),
    drivingLicenseCategories: z.array(z.string().trim().max(10)).max(12),
    willingToCarpool: z.boolean(),
    maxTravelDistanceKm: z.number().int().min(0).max(500),
    maxTravelTimeMinutes: z.number().int().min(0).max(600),
    departureSameAsHome: z.boolean(),
    departureLocation: optionalText(240),
    limitations: optionalText(1000),
  })
  .superRefine((value, context) => {
    if (!value.departureSameAsHome && !value.departureLocation.trim()) {
      context.addIssue({
        code: "custom",
        path: ["departureLocation"],
        message: "Vul de afwijkende vertreklocatie in.",
      });
    }
  });

export const personnelWorkOnboardingSchema = z
  .object({
    languages: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Vul minimaal één werktaal in.")
      .max(20),
    preferredShifts: z
      .array(z.enum(["day", "evening", "night"]))
      .min(1, "Kies minimaal één dienstvoorkeur."),
    weekendAvailable: z.boolean(),
    holidayAvailable: z.boolean(),
    maxHoursPerWeek: z.number().int().min(1).max(80),
    desiredMinHoursPerWeek: z.number().int().min(0).max(80),
    planningNotes: optionalText(1500),
  })
  .refine((value) => value.desiredMinHoursPerWeek <= value.maxHoursPerWeek, {
    path: ["desiredMinHoursPerWeek"],
    message: "Gewenste minimumuren mogen niet hoger zijn dan het maximum.",
  });

export const personnelAvailabilityOnboardingSchema = z
  .object({
    windows: z
      .array(
        z
          .object({
            dayOfWeek: z.number().int().min(0).max(6),
            available: z.boolean(),
            onRequest: z.boolean(),
            startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
            endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
          })
          .refine(
            (window) => !window.available || window.startTime < window.endTime,
            {
              message: "De eindtijd moet na de begintijd liggen.",
            },
          ),
      )
      .length(7),
    availabilityConfirmed: z.literal(true, {
      error: "Bevestig dat je beschikbaarheid klopt.",
    }),
  })
  .refine((value) => value.windows.some((window) => window.available), {
    path: ["windows"],
    message: "Vul voor minimaal één dag beschikbaarheid in.",
  })
  .superRefine((value, context) => {
    if (new Set(value.windows.map((window) => window.dayOfWeek)).size !== 7) {
      context.addIssue({
        code: "custom",
        path: ["windows"],
        message:
          "Beschikbaarheid moet iedere weekdag precies één keer bevatten.",
      });
    }
  });

export const notificationOnboardingSchema = z.object({
  preferences: z.array(
    z.object({
      category: z.string().trim().min(1).max(80),
      emailEnabled: z.boolean(),
      pushEnabled: z.boolean(),
      inAppEnabled: z.boolean(),
      critical: z.boolean(),
    }),
  ),
  pushStatus: z.enum(PORTAL_PUSH_STATUSES),
  pushAttempted: z.boolean(),
});

export const personnelReviewOnboardingSchema = z.object({
  profileConfirmed: z.literal(true, {
    error: "Bevestig dat je gegevens correct zijn.",
  }),
  availabilityConfirmed: z.literal(true, {
    error: "Bevestig dat je beschikbaarheid correct is.",
  }),
  notificationsConfirmed: z.literal(true, {
    error: "Bevestig dat je notificaties zijn gecontroleerd.",
  }),
  privacyViewed: z.literal(true, {
    error: "Bevestig dat je de privacyverklaring hebt bekeken.",
  }),
  termsAccepted: z.literal(true, {
    error: "Accepteer de toepasselijke voorwaarden.",
  }),
});

export const customerOrganizationOnboardingSchema = z
  .object({
    officialName: requiredText("Officiële bedrijfsnaam", 255),
    tradeName: requiredText("Handelsnaam", 255),
    legalForm: requiredText("Rechtsvorm", 120),
    chamberOfCommerceNumber: requiredText("KvK-nummer", 20).regex(
      /^\d{8}$/u,
      "Een KvK-nummer bestaat uit 8 cijfers.",
    ),
    vatNumber: z
      .string()
      .trim()
      .max(50)
      .refine(
        (value) =>
          !value || /^[A-Z]{2}[A-Z0-9. -]{6,20}$/u.test(value.toUpperCase()),
        "Btw-nummer is ongeldig.",
      )
      .transform((value) => value.toUpperCase().replace(/[ .-]/gu, ""))
      .optional()
      .default(""),
    registrationCountry: requiredText("Land van registratie", 80),
    businessPhone: phone,
    businessEmail: z
      .email("Vul een geldig zakelijk e-mailadres in.")
      .max(255)
      .transform((value) => value.toLowerCase()),
    addressStreet: requiredText("Bezoekadres", 240),
    postalCode: requiredText("Postcode", 20),
    city: requiredText("Plaats", 120),
    country: requiredText("Land", 80),
    website: optionalUrl,
  })
  .superRefine((value, context) => {
    if (isDutchCountry(value.country) && !isDutchPostalCode(value.postalCode)) {
      context.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: "Vul een geldige Nederlandse postcode in.",
      });
    }
  });

export const customerContactOnboardingSchema = z.object({
  firstName: requiredText("Voornaam", 100),
  lastName: requiredText("Achternaam", 100),
  function: requiredText("Functie", 120),
  businessPhone: phone,
  mobile: optionalPhone,
  email: z
    .email("Vul een geldig zakelijk e-mailadres in.")
    .max(255)
    .transform((value) => value.toLowerCase()),
});

export const customerReviewOnboardingSchema = z.object({
  authorized: z.literal(true, { error: "Bevestig dat je bevoegd bent." }),
  organizationConfirmed: z.literal(true, {
    error: "Bevestig dat de bedrijfsgegevens correct zijn.",
  }),
  contactConfirmed: z.literal(true, {
    error: "Bevestig dat de contactgegevens correct zijn.",
  }),
  privacyViewed: z.literal(true, {
    error: "Bevestig dat je de privacyverklaring hebt bekeken.",
  }),
  termsAccepted: z.literal(true, {
    error: "Accepteer de toepasselijke voorwaarden.",
  }),
});

export function onboardingStepsForPortal(
  portal: PortalOnboardingPortal,
): readonly PortalOnboardingStep[] {
  return portal === "personnel"
    ? PERSONNEL_ONBOARDING_STEPS
    : CUSTOMER_ONBOARDING_STEPS;
}

export function isPortalOnboardingPortal(
  value: unknown,
): value is PortalOnboardingPortal {
  return (
    typeof value === "string" &&
    (PORTAL_ONBOARDING_PORTALS as readonly string[]).includes(value)
  );
}

export function nextOnboardingStep(
  portal: PortalOnboardingPortal,
  currentStep: string,
): PortalOnboardingStep {
  const steps = onboardingStepsForPortal(portal);
  const index = steps.indexOf(currentStep as PortalOnboardingStep);
  return steps[Math.min(index < 0 ? 0 : index + 1, steps.length - 1)]!;
}

export function onboardingCompleteness(
  portal: PortalOnboardingPortal,
  completedSteps: readonly string[],
): number {
  const steps = onboardingStepsForPortal(portal).filter(
    (step) => step !== "welcome",
  );
  const completed = steps.filter((step) =>
    completedSteps.includes(step),
  ).length;
  return Math.round((completed / steps.length) * 100);
}

export function mergeOnboardingDraft(
  current: PortalOnboardingDraft,
  step: string,
  value: Record<string, unknown>,
): PortalOnboardingDraft {
  return { ...current, [step]: value };
}

export function canonicalVehicleType(
  primaryTransportType: string,
): "DRIVE" | "BICYCLE" | "WALK" | "TRANSIT" {
  if (
    primaryTransportType === "bicycle" ||
    primaryTransportType === "electric_bicycle"
  )
    return "BICYCLE";
  if (primaryTransportType === "walking") return "WALK";
  if (primaryTransportType === "public_transport") return "TRANSIT";
  return "DRIVE";
}
