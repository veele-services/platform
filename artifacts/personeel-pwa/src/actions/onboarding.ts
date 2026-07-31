"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import {
  assignmentRouteContextsTable,
  auditLogTable,
  availabilityWindowsTable,
  canonicalVehicleType,
  db,
  hasGeocodableAddress,
  mergeOnboardingDraft,
  nextOnboardingStep,
  onboardingCompleteness,
  ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES,
  PERSONNEL_ONBOARDING_STEPS,
  personnelAvailabilityOnboardingSchema,
  personnelProfileOnboardingSchema,
  personnelReviewOnboardingSchema,
  personnelTable,
  personnelTransportOnboardingSchema,
  personnelWorkOnboardingSchema,
  portalNotificationPreferencesTable,
  portalOnboardingSessionsTable,
  portalOnboardingStepCompletionsTable,
  PORTAL_ONBOARDING_REQUIRED_METADATA,
  PORTAL_ONBOARDING_STATUS_METADATA,
  PORTAL_ONBOARDING_VERSION,
  PORTAL_ONBOARDING_VERSION_METADATA,
  notificationOnboardingSchema,
  type PersonnelOnboardingStep,
  type PortalOnboardingDraft,
  type PortalPushStatus,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

export type PersonnelOnboardingWorkspace = {
  currentStep: PersonnelOnboardingStep;
  completedSteps: string[];
  draft: PortalOnboardingDraft;
  completeness: number;
  pushStatus: PortalPushStatus;
  organizationName: string;
};

export type PersonnelOnboardingActionResult =
  | {
      success: true;
      currentStep: PersonnelOnboardingStep;
      completed: boolean;
      completeness: number;
    }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

type PersonnelIdentity = {
  userId: string;
  tenantId: string;
  personnelId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string;
  preferredName: string | null;
  birthDate: string | null;
  secondaryPhone: string | null;
  personalEmail: string | null;
  emergencyContact: { name?: string; phone?: string; relation?: string };
  vehicleType: string;
  travelPreferences: Record<string, unknown>;
  workPreferences: Record<string, unknown>;
  notificationEmailEnabled: boolean;
  notificationPushEnabled: boolean;
  notificationPlanningEnabled: boolean;
  notificationNewsEnabled: boolean;
  notificationHoursEnabled: boolean;
  portalOnboardingStatus: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function zodFailure(error: {
  flatten(): { fieldErrors: Record<string, string[]>; formErrors: string[] };
}): PersonnelOnboardingActionResult {
  const flattened = error.flatten();
  return {
    success: false,
    error:
      flattened.formErrors[0] ??
      Object.values(flattened.fieldErrors)[0]?.[0] ??
      "Controleer de ingevulde gegevens.",
    fieldErrors: flattened.fieldErrors,
  };
}

async function requirePersonnelIdentity(): Promise<PersonnelIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd.");
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) throw new Error("Geen geldige organisatiecontext.");

  const [personnel] = await db
    .select({
      personnelId: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      email: personnelTable.email,
      phone: personnelTable.phone,
      addressStreet: personnelTable.addressStreet,
      addressPostalCode: personnelTable.addressPostalCode,
      addressCity: personnelTable.addressCity,
      addressCountry: personnelTable.addressCountry,
      preferredName: personnelTable.preferredName,
      birthDate: personnelTable.birthDate,
      secondaryPhone: personnelTable.secondaryPhone,
      personalEmail: personnelTable.personalEmail,
      emergencyContact: personnelTable.emergencyContact,
      vehicleType: personnelTable.vehicleType,
      travelPreferences: personnelTable.travelPreferences,
      workPreferences: personnelTable.workPreferences,
      notificationEmailEnabled: personnelTable.notificationEmailEnabled,
      notificationPushEnabled: personnelTable.notificationPushEnabled,
      notificationPlanningEnabled: personnelTable.notificationPlanningEnabled,
      notificationNewsEnabled: personnelTable.notificationNewsEnabled,
      notificationHoursEnabled: personnelTable.notificationHoursEnabled,
      portalOnboardingStatus: personnelTable.portalOnboardingStatus,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.userId, user.id),
        eq(personnelTable.isActive, true),
      ),
    )
    .limit(1);
  if (!personnel) throw new Error("Personeelsprofiel niet gevonden.");
  return { ...personnel, userId: user.id, tenantId };
}

function normalizedAddressPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("nl-NL");
}

function personnelAddressChanged(
  identity: PersonnelIdentity,
  profile: {
    addressStreet: string;
    addressPostalCode: string;
    addressCity: string;
    addressCountry: string;
  },
): boolean {
  return (
    normalizedAddressPart(identity.addressStreet) !==
      normalizedAddressPart(profile.addressStreet) ||
    normalizedAddressPart(identity.addressPostalCode) !==
      normalizedAddressPart(profile.addressPostalCode) ||
    normalizedAddressPart(identity.addressCity) !==
      normalizedAddressPart(profile.addressCity) ||
    normalizedAddressPart(identity.addressCountry) !==
      normalizedAddressPart(profile.addressCountry)
  );
}

function personnelGeocodingReset(profile: {
  addressStreet: string;
  addressPostalCode: string;
  addressCity: string;
  addressCountry: string;
}) {
  return {
    addressLine1: profile.addressStreet,
    addressLine2: null,
    stateOrRegion: null,
    countryCode: null,
    formattedAddress: null,
    googlePlaceId: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationUpdatedAt: new Date(),
    addressLatitude: null,
    addressLongitude: null,
    addressGeocodedAt: null,
    addressGeocodingProvider: null,
    addressGeocodingStatus: hasGeocodableAddress({
      address: profile.addressStreet,
      postalCode: profile.addressPostalCode,
      city: profile.addressCity,
      country: profile.addressCountry,
    })
      ? "pending"
      : "not_required",
    addressGeocodingConfidence: null,
    addressGeocodingError: null,
  };
}

async function synchronizePersonnelOnboardingMetadata(
  identity: PersonnelIdentity,
  completedAt: Date,
): Promise<void> {
  const [pendingSession] = await db
    .select({ id: portalOnboardingSessionsTable.id })
    .from(portalOnboardingSessionsTable)
    .where(
      and(
        eq(portalOnboardingSessionsTable.userId, identity.userId),
        eq(portalOnboardingSessionsTable.portal, "personnel"),
        notInArray(portalOnboardingSessionsTable.status, [
          "completed",
          "waived_by_admin",
        ]),
      ),
    )
    .limit(1);

  const admin = createAdminClient();
  const { data: current, error: currentError } =
    await admin.auth.admin.getUserById(identity.userId);
  if (currentError || !current.user) {
    throw new Error(
      "Onboarding is opgeslagen, maar toegang kon niet worden vrijgegeven.",
    );
  }

  const appMetadata: Record<string, unknown> = {
    ...(current.user.app_metadata ?? {}),
  };
  appMetadata[PORTAL_ONBOARDING_REQUIRED_METADATA] = Boolean(pendingSession);
  appMetadata[PORTAL_ONBOARDING_STATUS_METADATA] = pendingSession
    ? "in_progress"
    : "completed";
  appMetadata[PORTAL_ONBOARDING_VERSION_METADATA] = PORTAL_ONBOARDING_VERSION;
  if (!pendingSession) {
    appMetadata["portal_onboarding_completed_at"] = completedAt.toISOString();
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(
    identity.userId,
    { app_metadata: appMetadata },
  );
  if (metadataError) {
    throw new Error(
      "Onboarding is opgeslagen, maar toegang kon niet worden vrijgegeven.",
    );
  }
}

function transportTypeFromCanonical(value: string): string {
  if (value === "BICYCLE") return "bicycle";
  if (value === "WALK") return "walking";
  if (value === "TRANSIT") return "public_transport";
  return "car";
}

async function buildInitialDraft(
  identity: PersonnelIdentity,
): Promise<PortalOnboardingDraft> {
  const windows = await db
    .select({
      dayOfWeek: availabilityWindowsTable.dayOfWeek,
      startTime: availabilityWindowsTable.startTime,
      endTime: availabilityWindowsTable.endTime,
    })
    .from(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, identity.personnelId));
  const windowByDay = new Map(
    windows.map((window) => [window.dayOfWeek, window]),
  );
  const travel = identity.travelPreferences ?? {};
  const work = identity.workPreferences ?? {};
  const notificationDefaults = ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES.map(
    (category) => ({
      category,
      emailEnabled: identity.notificationEmailEnabled,
      pushEnabled: identity.notificationPushEnabled,
      inAppEnabled: true,
      critical: category === "urgent_operations",
    }),
  );

  return {
    welcome: {},
    profile: {
      firstName: identity.firstName,
      lastName: identity.lastName,
      preferredName: identity.preferredName ?? "",
      phone: identity.phone ?? "",
      secondaryPhone: identity.secondaryPhone ?? "",
      personalEmail: identity.personalEmail ?? "",
      addressStreet: identity.addressStreet ?? "",
      addressPostalCode: identity.addressPostalCode ?? "",
      addressCity: identity.addressCity ?? "",
      addressCountry: identity.addressCountry || "Nederland",
      birthDate: identity.birthDate ?? "",
      emergencyContactName: identity.emergencyContact?.name ?? "",
      emergencyContactPhone: identity.emergencyContact?.phone ?? "",
      emergencyContactRelation: identity.emergencyContact?.relation ?? "",
    },
    transport: {
      primaryTransportType:
        travel["primaryTransportType"] ??
        transportTypeFromCanonical(identity.vehicleType),
      ownTransport: travel["ownTransport"] ?? true,
      validDrivingLicense: travel["validDrivingLicense"] ?? false,
      drivingLicenseCategories: travel["drivingLicenseCategories"] ?? [],
      willingToCarpool: travel["willingToCarpool"] ?? false,
      maxTravelDistanceKm: travel["maxTravelDistanceKm"] ?? 50,
      maxTravelTimeMinutes: travel["maxTravelTimeMinutes"] ?? 60,
      departureSameAsHome: travel["departureSameAsHome"] ?? true,
      departureLocation: travel["departureLocation"] ?? "",
      limitations: travel["limitations"] ?? "",
    },
    work: {
      languages: work["languages"] ?? ["Nederlands"],
      preferredShifts: work["preferredShifts"] ?? ["day"],
      weekendAvailable: work["weekendAvailable"] ?? false,
      holidayAvailable: work["holidayAvailable"] ?? false,
      maxHoursPerWeek: work["maxHoursPerWeek"] ?? 40,
      desiredMinHoursPerWeek: work["desiredMinHoursPerWeek"] ?? 0,
      planningNotes: work["planningNotes"] ?? "",
    },
    availability: {
      windows: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
        const existing = windowByDay.get(dayOfWeek);
        return {
          dayOfWeek,
          available: Boolean(existing),
          onRequest: false,
          startTime: existing?.startTime ?? "08:00",
          endTime: existing?.endTime ?? "17:00",
        };
      }),
      availabilityConfirmed: false,
    },
    notifications: {
      preferences: notificationDefaults,
      pushStatus: "not_asked",
      pushAttempted: false,
    },
    review: {},
  };
}

async function getOrCreateSession(identity: PersonnelIdentity) {
  const initialDraft = await buildInitialDraft(identity);
  await db
    .insert(portalOnboardingSessionsTable)
    .values({
      tenantId: identity.tenantId,
      userId: identity.userId,
      portal: "personnel",
      subjectId: identity.personnelId,
      currentStep: "welcome",
      draftData: initialDraft,
      onboardingVersion: PORTAL_ONBOARDING_VERSION,
    })
    .onConflictDoNothing({
      target: [
        portalOnboardingSessionsTable.tenantId,
        portalOnboardingSessionsTable.userId,
        portalOnboardingSessionsTable.portal,
        portalOnboardingSessionsTable.subjectId,
      ],
    });

  const [session] = await db
    .select()
    .from(portalOnboardingSessionsTable)
    .where(
      and(
        eq(portalOnboardingSessionsTable.tenantId, identity.tenantId),
        eq(portalOnboardingSessionsTable.userId, identity.userId),
        eq(portalOnboardingSessionsTable.portal, "personnel"),
        eq(portalOnboardingSessionsTable.subjectId, identity.personnelId),
      ),
    )
    .limit(1);
  if (!session) throw new Error("Onboardingsessie kon niet worden gestart.");
  return session;
}

export async function personnelOnboardingRequiredForCurrentMembership(): Promise<boolean> {
  const identity = await requirePersonnelIdentity();
  return !["completed", "waived_by_admin"].includes(
    identity.portalOnboardingStatus,
  );
}

export async function getPersonnelOnboardingWorkspace(
  organizationName = "uw organisatie",
): Promise<PersonnelOnboardingWorkspace> {
  const identity = await requirePersonnelIdentity();
  const session = await getOrCreateSession(identity);
  const step = session.currentStep as PersonnelOnboardingStep;
  return {
    currentStep: step,
    completedSteps: session.completedSteps,
    draft: session.draftData,
    completeness: session.profileCompletenessPercentage,
    pushStatus: session.pushStatus,
    organizationName,
  };
}

function parseStep(
  step: PersonnelOnboardingStep,
  payload: Record<string, unknown>,
) {
  if (step === "welcome") return { success: true as const, data: {} };
  if (step === "profile")
    return personnelProfileOnboardingSchema.safeParse(payload);
  if (step === "transport")
    return personnelTransportOnboardingSchema.safeParse(payload);
  if (step === "work") return personnelWorkOnboardingSchema.safeParse(payload);
  if (step === "availability")
    return personnelAvailabilityOnboardingSchema.safeParse(payload);
  if (step === "notifications") {
    const parsed = notificationOnboardingSchema.safeParse(payload);
    if (!parsed.success) return parsed;
    const allowed = new Set<string>(
      ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES,
    );
    const submitted = new Set(
      parsed.data.preferences.map((preference) => preference.category),
    );
    if (!parsed.data.pushAttempted) {
      return notificationOnboardingSchema.safeParse({
        ...payload,
        pushAttempted: "required",
      });
    }
    if (
      parsed.data.preferences.length !== allowed.size ||
      submitted.size !== allowed.size ||
      parsed.data.preferences.some(
        (preference) => !allowed.has(preference.category),
      )
    ) {
      return {
        success: false as const,
        error: {
          flatten: () => ({
            fieldErrors: {},
            formErrors: ["Onbekende notificatiecategorie."],
          }),
        },
      };
    }
    if (parsed.data.pushStatus !== "allowed") {
      return {
        success: true as const,
        data: {
          ...parsed.data,
          preferences: parsed.data.preferences.map((preference) => {
            const critical = preference.category === "urgent_operations";
            return {
              ...preference,
              critical,
              pushEnabled: false,
              emailEnabled: critical || preference.emailEnabled,
              inAppEnabled: critical || preference.inAppEnabled,
            };
          }),
        },
      };
    }
    return parsed;
  }
  return personnelReviewOnboardingSchema.safeParse(payload);
}

export async function savePersonnelOnboardingStep(input: {
  step: PersonnelOnboardingStep;
  payload: Record<string, unknown>;
  continueToNext: boolean;
}): Promise<PersonnelOnboardingActionResult> {
  try {
    const identity = await requirePersonnelIdentity();
    const session = await getOrCreateSession(identity);
    if (session.status === "completed") {
      await synchronizePersonnelOnboardingMetadata(
        identity,
        session.completedAt ?? new Date(),
      );
      return {
        success: true,
        currentStep: "review",
        completed: true,
        completeness: 100,
      };
    }
    const requestedStepIndex = PERSONNEL_ONBOARDING_STEPS.indexOf(input.step);
    const currentStepIndex = PERSONNEL_ONBOARDING_STEPS.indexOf(
      session.currentStep as PersonnelOnboardingStep,
    );
    if (
      requestedStepIndex < 0 ||
      typeof input.continueToNext !== "boolean" ||
      (requestedStepIndex > currentStepIndex &&
        !session.completedSteps.includes(input.step))
    ) {
      return {
        success: false,
        error: "Deze onboardingstap is nog niet beschikbaar.",
      };
    }
    const parsed = parseStep(input.step, input.payload);
    if (!parsed.success) return zodFailure(parsed.error);

    const completedSteps = Array.from(
      new Set([...session.completedSteps, input.step]),
    );
    const nextStep = input.continueToNext
      ? (nextOnboardingStep("personnel", input.step) as PersonnelOnboardingStep)
      : input.step;
    const draft = mergeOnboardingDraft(
      session.draftData,
      input.step,
      parsed.data as Record<string, unknown>,
    );
    const completeness = onboardingCompleteness("personnel", completedSteps);
    const now = new Date();
    const pushStatus =
      input.step === "notifications"
        ? (parsed.data as { pushStatus: PortalPushStatus }).pushStatus
        : session.pushStatus;

    await db.transaction(async (tx) => {
      const [updatedSession] = await tx
        .update(portalOnboardingSessionsTable)
        .set({
          status: nextStep === "review" ? "awaiting_review" : "in_progress",
          currentStep: nextStep,
          completedSteps,
          draftData: draft,
          profileCompletenessPercentage: completeness,
          pushStatus,
          pushAttemptedAt:
            input.step === "notifications" ? now : session.pushAttemptedAt,
          startedAt: session.startedAt ?? now,
          lastActivityAt: now,
          revision: sql`${portalOnboardingSessionsTable.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalOnboardingSessionsTable.id, session.id),
            eq(portalOnboardingSessionsTable.tenantId, identity.tenantId),
            eq(portalOnboardingSessionsTable.userId, identity.userId),
            eq(portalOnboardingSessionsTable.subjectId, identity.personnelId),
            eq(portalOnboardingSessionsTable.revision, session.revision),
            ne(portalOnboardingSessionsTable.status, "completed"),
          ),
        )
        .returning({ id: portalOnboardingSessionsTable.id });
      if (!updatedSession) {
        throw new Error(
          "De onboarding is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.",
        );
      }
      await tx
        .update(personnelTable)
        .set({
          portalOnboardingStatus:
            nextStep === "review" ? "awaiting_review" : "in_progress",
          portalOnboardingVersion: PORTAL_ONBOARDING_VERSION,
          updatedAt: now,
        })
        .where(
          and(
            eq(personnelTable.id, identity.personnelId),
            eq(personnelTable.tenantId, identity.tenantId),
            eq(personnelTable.userId, identity.userId),
          ),
        );
      await tx
        .insert(portalOnboardingStepCompletionsTable)
        .values({
          sessionId: session.id,
          tenantId: identity.tenantId,
          stepKey: input.step,
          onboardingVersion: PORTAL_ONBOARDING_VERSION,
          metadata: {
            fields: Object.keys(parsed.data as Record<string, unknown>),
          },
        })
        .onConflictDoUpdate({
          target: [
            portalOnboardingStepCompletionsTable.sessionId,
            portalOnboardingStepCompletionsTable.stepKey,
          ],
          set: {
            onboardingVersion: PORTAL_ONBOARDING_VERSION,
            metadata: {
              fields: Object.keys(parsed.data as Record<string, unknown>),
            },
            completedAt: now,
            updatedAt: now,
          },
        });
      await tx.insert(auditLogTable).values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        action: "save_onboarding_step",
        resource: "portal_onboarding",
        resourceId: session.id,
        metadata: {
          portal: "personnel",
          step: input.step,
          onboardingVersion: PORTAL_ONBOARDING_VERSION,
        },
      });
    });

    revalidatePath("/onboarding");
    return {
      success: true,
      currentStep: nextStep,
      completed: false,
      completeness,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Onboarding opslaan mislukt.",
    };
  }
}

function draftPart<T extends Record<string, unknown>>(
  draft: PortalOnboardingDraft,
  key: string,
): T {
  return asRecord(draft[key]) as T;
}

export async function completePersonnelOnboarding(): Promise<PersonnelOnboardingActionResult> {
  try {
    const identity = await requirePersonnelIdentity();
    const session = await getOrCreateSession(identity);
    if (session.status === "completed") {
      await synchronizePersonnelOnboardingMetadata(
        identity,
        session.completedAt ?? new Date(),
      );
      return {
        success: true,
        currentStep: "review",
        completed: true,
        completeness: 100,
      };
    }
    const required = [
      "profile",
      "transport",
      "work",
      "availability",
      "notifications",
      "review",
    ];
    if (required.some((step) => !session.completedSteps.includes(step))) {
      return {
        success: false,
        error: "Doorloop en bevestig eerst alle verplichte stappen.",
      };
    }

    const profile = personnelProfileOnboardingSchema.safeParse(
      draftPart(session.draftData, "profile"),
    );
    const transport = personnelTransportOnboardingSchema.safeParse(
      draftPart(session.draftData, "transport"),
    );
    const work = personnelWorkOnboardingSchema.safeParse(
      draftPart(session.draftData, "work"),
    );
    const availability = personnelAvailabilityOnboardingSchema.safeParse(
      draftPart(session.draftData, "availability"),
    );
    const notifications = notificationOnboardingSchema.safeParse(
      draftPart(session.draftData, "notifications"),
    );
    const review = personnelReviewOnboardingSchema.safeParse(
      draftPart(session.draftData, "review"),
    );
    if (!profile.success) return zodFailure(profile.error);
    if (!transport.success) return zodFailure(transport.error);
    if (!work.success) return zodFailure(work.error);
    if (!availability.success) return zodFailure(availability.error);
    if (!notifications.success) return zodFailure(notifications.error);
    if (!review.success) return zodFailure(review.error);

    const now = new Date();
    const resetGeocoding = personnelAddressChanged(identity, profile.data);
    await db.transaction(async (tx) => {
      const [completedSession] = await tx
        .update(portalOnboardingSessionsTable)
        .set({
          status: "completed",
          currentStep: "review",
          profileCompletenessPercentage: 100,
          completedAt: now,
          completedBy: identity.userId,
          lastActivityAt: now,
          revision: sql`${portalOnboardingSessionsTable.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalOnboardingSessionsTable.id, session.id),
            eq(portalOnboardingSessionsTable.tenantId, identity.tenantId),
            eq(portalOnboardingSessionsTable.userId, identity.userId),
            eq(portalOnboardingSessionsTable.subjectId, identity.personnelId),
            eq(portalOnboardingSessionsTable.revision, session.revision),
            ne(portalOnboardingSessionsTable.status, "completed"),
          ),
        )
        .returning({ id: portalOnboardingSessionsTable.id });
      if (!completedSession) {
        throw new Error(
          "De onboarding is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.",
        );
      }

      await tx
        .update(personnelTable)
        .set({
          firstName: profile.data.firstName,
          lastName: profile.data.lastName,
          preferredName: profile.data.preferredName || null,
          phone: profile.data.phone,
          secondaryPhone: profile.data.secondaryPhone || null,
          personalEmail: profile.data.personalEmail || null,
          addressStreet: profile.data.addressStreet,
          addressPostalCode: profile.data.addressPostalCode,
          addressCity: profile.data.addressCity,
          addressCountry: profile.data.addressCountry,
          ...(resetGeocoding ? personnelGeocodingReset(profile.data) : {}),
          birthDate: profile.data.birthDate || null,
          emergencyContact: {
            name: profile.data.emergencyContactName || undefined,
            phone: profile.data.emergencyContactPhone || undefined,
            relation: profile.data.emergencyContactRelation || undefined,
          },
          vehicleType: canonicalVehicleType(
            transport.data.primaryTransportType,
          ),
          travelPreferences: transport.data,
          workPreferences: work.data,
          notificationEmailEnabled: notifications.data.preferences.some(
            (item) => item.emailEnabled,
          ),
          notificationPushEnabled: notifications.data.preferences.some(
            (item) => item.pushEnabled,
          ),
          notificationPlanningEnabled: notifications.data.preferences.some(
            (item) =>
              item.category.includes("planning") &&
              (item.pushEnabled || item.emailEnabled || item.inAppEnabled),
          ),
          notificationNewsEnabled: notifications.data.preferences.some(
            (item) =>
              item.category === "announcements" &&
              (item.pushEnabled || item.emailEnabled || item.inAppEnabled),
          ),
          notificationHoursEnabled: true,
          portalOnboardingStatus: "completed",
          portalOnboardingVersion: PORTAL_ONBOARDING_VERSION,
          profileUpdatedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(personnelTable.id, identity.personnelId),
            eq(personnelTable.tenantId, identity.tenantId),
            eq(personnelTable.userId, identity.userId),
          ),
        );

      await tx
        .delete(availabilityWindowsTable)
        .where(eq(availabilityWindowsTable.personnelId, identity.personnelId));
      const availableWindows = availability.data.windows.filter(
        (window) => window.available,
      );
      if (availableWindows.length > 0) {
        await tx.insert(availabilityWindowsTable).values(
          availableWindows.map((window) => ({
            personnelId: identity.personnelId,
            dayOfWeek: window.dayOfWeek,
            startTime: window.startTime,
            endTime: window.endTime,
            updatedAt: now,
          })),
        );
      }

      for (const preference of notifications.data.preferences) {
        const critical = preference.category === "urgent_operations";
        await tx
          .insert(portalNotificationPreferencesTable)
          .values({
            tenantId: identity.tenantId,
            userId: identity.userId,
            portal: "personnel",
            category: preference.category,
            emailEnabled: critical ? true : preference.emailEnabled,
            pushEnabled: preference.pushEnabled,
            inAppEnabled: critical ? true : preference.inAppEnabled,
            critical,
          })
          .onConflictDoUpdate({
            target: [
              portalNotificationPreferencesTable.tenantId,
              portalNotificationPreferencesTable.userId,
              portalNotificationPreferencesTable.portal,
              portalNotificationPreferencesTable.category,
            ],
            set: {
              emailEnabled: critical ? true : preference.emailEnabled,
              pushEnabled: preference.pushEnabled,
              inAppEnabled: critical ? true : preference.inAppEnabled,
              critical,
              updatedAt: now,
            },
          });
      }

      await tx
        .delete(assignmentRouteContextsTable)
        .where(
          and(
            eq(assignmentRouteContextsTable.tenantId, identity.tenantId),
            eq(assignmentRouteContextsTable.personnelId, identity.personnelId),
          ),
        );
      await tx.insert(auditLogTable).values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        action: "complete_onboarding",
        resource: "portal_onboarding",
        resourceId: session.id,
        metadata: {
          portal: "personnel",
          onboardingVersion: PORTAL_ONBOARDING_VERSION,
          completeness: 100,
        },
      });
    });

    await synchronizePersonnelOnboardingMetadata(identity, now);

    revalidatePath("/");
    revalidatePath("/profiel");
    revalidatePath("/beschikbaarheid");
    return {
      success: true,
      currentStep: "review",
      completed: true,
      completeness: 100,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Onboarding afronden mislukt.",
    };
  }
}
