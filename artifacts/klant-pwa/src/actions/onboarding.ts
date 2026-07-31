"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import {
  auditLogTable,
  customerContactOnboardingSchema,
  customerContactsTable,
  customerOrganizationOnboardingSchema,
  customerPortalPreferencesTable,
  customerReviewOnboardingSchema,
  customersTable,
  customerUsersTable,
  CUSTOMER_ONBOARDING_STEPS,
  db,
  hasGeocodableAddress,
  mergeOnboardingDraft,
  nextOnboardingStep,
  notificationOnboardingSchema,
  onboardingCompleteness,
  ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES,
  portalNotificationPreferencesTable,
  portalOnboardingSessionsTable,
  portalOnboardingStepCompletionsTable,
  PORTAL_ONBOARDING_REQUIRED_METADATA,
  PORTAL_ONBOARDING_STATUS_METADATA,
  PORTAL_ONBOARDING_VERSION,
  PORTAL_ONBOARDING_VERSION_METADATA,
  type CustomerOnboardingStep,
  type CustomerUserRole,
  type PortalOnboardingDraft,
  type PortalPushStatus,
} from "@workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyCustomerIdentity } from "@/actions/customer";

export type CustomerOnboardingWorkspace = {
  currentStep: CustomerOnboardingStep;
  completedSteps: string[];
  draft: PortalOnboardingDraft;
  completeness: number;
  pushStatus: PortalPushStatus;
  organizationName: string;
  canManageOrganization: boolean;
};

export type CustomerOnboardingActionResult =
  | {
      success: true;
      currentStep: CustomerOnboardingStep;
      completed: boolean;
      completeness: number;
    }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

type CustomerIdentity = {
  userId: string;
  tenantId: string;
  customerId: string;
  customerUserId: string;
  role: CustomerUserRole;
  portalOnboardingStatus: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  function: string | null;
  phone: string | null;
  mobile: string | null;
  officialName: string;
  tradeName: string | null;
  legalForm: string | null;
  registrationCountry: string | null;
  chamberOfCommerceNumber: string | null;
  vatNumber: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  addressStreet: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  website: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function zodFailure(error: {
  flatten(): { fieldErrors: Record<string, string[]>; formErrors: string[] };
}): CustomerOnboardingActionResult {
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

async function requireCustomerIdentity(): Promise<CustomerIdentity> {
  const selectedIdentity = await getMyCustomerIdentity();
  if (!selectedIdentity) {
    throw new Error(
      "Kies eerst voor welke klantorganisatie u het portaal wilt openen.",
    );
  }

  const [identity] = await db
    .select({
      customerId: customersTable.id,
      customerUserId: customerUsersTable.id,
      role: customerUsersTable.role,
      portalOnboardingStatus: customerUsersTable.portalOnboardingStatus,
      email: customerUsersTable.email,
      firstName: customerUsersTable.firstName,
      lastName: customerUsersTable.lastName,
      function: customerUsersTable.function,
      phone: customerUsersTable.phone,
      mobile: customerUsersTable.mobile,
      officialName: customersTable.name,
      tradeName: customersTable.tradeName,
      legalForm: customersTable.legalEntity,
      registrationCountry: customersTable.registrationCountry,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      vatNumber: customersTable.vatNumber,
      businessPhone: customersTable.contactPhone,
      businessEmail: customersTable.contactEmail,
      addressStreet: customersTable.address,
      postalCode: customersTable.postalCode,
      city: customersTable.city,
      country: customersTable.country,
      website: customersTable.website,
    })
    .from(customerUsersTable)
    .innerJoin(
      customersTable,
      and(
        eq(customersTable.id, customerUsersTable.customerId),
        eq(customersTable.tenantId, customerUsersTable.tenantId),
      ),
    )
    .where(
      and(
        eq(customerUsersTable.id, selectedIdentity.customerUserId),
        eq(customerUsersTable.tenantId, selectedIdentity.tenantId),
        eq(customerUsersTable.userId, selectedIdentity.userId),
        eq(customerUsersTable.status, "active"),
        eq(customersTable.isActive, true),
      ),
    )
    .limit(1);
  if (!identity) throw new Error("Klantprofiel niet gevonden.");
  return {
    ...identity,
    userId: selectedIdentity.userId,
    tenantId: selectedIdentity.tenantId,
  };
}

function canManageCustomerOrganization(identity: CustomerIdentity): boolean {
  return identity.role === "primary" || identity.role === "admin";
}

function normalizedAddressPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("nl-NL");
}

function customerAddressChanged(
  identity: CustomerIdentity,
  organization: {
    addressStreet: string;
    postalCode: string;
    city: string;
    country: string;
  },
): boolean {
  return (
    normalizedAddressPart(identity.addressStreet) !==
      normalizedAddressPart(organization.addressStreet) ||
    normalizedAddressPart(identity.postalCode) !==
      normalizedAddressPart(organization.postalCode) ||
    normalizedAddressPart(identity.city) !==
      normalizedAddressPart(organization.city) ||
    normalizedAddressPart(identity.country) !==
      normalizedAddressPart(organization.country)
  );
}

function customerGeocodingReset(organization: {
  addressStreet: string;
  postalCode: string;
  city: string;
  country: string;
}) {
  return {
    addressLine2: null,
    stateOrRegion: null,
    countryCode: null,
    formattedAddress: null,
    googlePlaceId: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationUpdatedAt: new Date(),
    latitude: null,
    longitude: null,
    geocodedAt: null,
    geocodingProvider: null,
    geocodingStatus: hasGeocodableAddress({
      address: organization.addressStreet,
      postalCode: organization.postalCode,
      city: organization.city,
      country: organization.country,
    })
      ? "pending"
      : "not_required",
    geocodingConfidence: null,
    geocodingError: null,
  };
}

async function synchronizeCustomerOnboardingMetadata(
  identity: CustomerIdentity,
  completedAt: Date,
): Promise<void> {
  const [pendingSession] = await db
    .select({ id: portalOnboardingSessionsTable.id })
    .from(portalOnboardingSessionsTable)
    .where(
      and(
        eq(portalOnboardingSessionsTable.userId, identity.userId),
        eq(portalOnboardingSessionsTable.portal, "customer"),
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

async function buildInitialDraft(
  identity: CustomerIdentity,
): Promise<PortalOnboardingDraft> {
  const [preferences] = await db
    .select()
    .from(customerPortalPreferencesTable)
    .where(eq(customerPortalPreferencesTable.customerId, identity.customerId))
    .limit(1);
  const notificationDefaults = ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES.map(
    (category) => ({
      category,
      emailEnabled: preferences?.emailNotifications ?? true,
      pushEnabled: preferences?.pushNotifications ?? false,
      inAppEnabled: true,
      critical: category === "incidents" || category === "announcements",
    }),
  );

  return {
    welcome: {},
    organization: {
      officialName: identity.officialName,
      tradeName: identity.tradeName ?? identity.officialName,
      legalForm: identity.legalForm ?? "",
      chamberOfCommerceNumber: identity.chamberOfCommerceNumber ?? "",
      vatNumber: identity.vatNumber ?? "",
      registrationCountry:
        identity.registrationCountry ?? identity.country ?? "Nederland",
      businessPhone: identity.businessPhone ?? "",
      businessEmail: identity.businessEmail ?? identity.email,
      addressStreet: identity.addressStreet ?? "",
      postalCode: identity.postalCode ?? "",
      city: identity.city ?? "",
      country: identity.country || "Nederland",
      website: identity.website ?? "",
    },
    contact: {
      firstName: identity.firstName ?? "",
      lastName: identity.lastName ?? "",
      function: identity.function ?? "",
      businessPhone: identity.phone ?? identity.businessPhone ?? "",
      mobile: identity.mobile ?? "",
      email: identity.email,
    },
    notifications: {
      preferences: notificationDefaults,
      pushStatus: "not_asked",
      pushAttempted: false,
    },
    review: {},
  };
}

async function getOrCreateSession(identity: CustomerIdentity) {
  const initialDraft = await buildInitialDraft(identity);
  await db
    .insert(portalOnboardingSessionsTable)
    .values({
      tenantId: identity.tenantId,
      userId: identity.userId,
      portal: "customer",
      subjectId: identity.customerUserId,
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
        eq(portalOnboardingSessionsTable.portal, "customer"),
        eq(portalOnboardingSessionsTable.subjectId, identity.customerUserId),
      ),
    )
    .limit(1);
  if (!session) throw new Error("Onboardingsessie kon niet worden gestart.");
  return session;
}

export async function getCustomerOnboardingWorkspace(
  organizationName?: string,
): Promise<CustomerOnboardingWorkspace> {
  const identity = await requireCustomerIdentity();
  const session = await getOrCreateSession(identity);
  return {
    currentStep: session.currentStep as CustomerOnboardingStep,
    completedSteps: session.completedSteps,
    draft: session.draftData,
    completeness: session.profileCompletenessPercentage,
    pushStatus: session.pushStatus,
    organizationName: organizationName ?? identity.officialName,
    canManageOrganization: canManageCustomerOrganization(identity),
  };
}

export async function customerOnboardingRequiredForCurrentMembership(): Promise<boolean> {
  const identity = await requireCustomerIdentity();
  return !["completed", "waived_by_admin"].includes(
    identity.portalOnboardingStatus,
  );
}

function parseStep(
  step: CustomerOnboardingStep,
  payload: Record<string, unknown>,
) {
  if (step === "welcome") return { success: true as const, data: {} };
  if (step === "organization")
    return customerOrganizationOnboardingSchema.safeParse(payload);
  if (step === "contact")
    return customerContactOnboardingSchema.safeParse(payload);
  if (step === "notifications") {
    const parsed = notificationOnboardingSchema.safeParse(payload);
    if (!parsed.success) return parsed;
    const allowed = new Set<string>(
      ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES,
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
            const critical =
              preference.category === "incidents" ||
              preference.category === "announcements";
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
  return customerReviewOnboardingSchema.safeParse(payload);
}

export async function saveCustomerOnboardingStep(input: {
  step: CustomerOnboardingStep;
  payload: Record<string, unknown>;
  continueToNext: boolean;
}): Promise<CustomerOnboardingActionResult> {
  try {
    const identity = await requireCustomerIdentity();
    const session = await getOrCreateSession(identity);
    if (session.status === "completed") {
      await synchronizeCustomerOnboardingMetadata(
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
    const requestedStepIndex = CUSTOMER_ONBOARDING_STEPS.indexOf(input.step);
    const currentStepIndex = CUSTOMER_ONBOARDING_STEPS.indexOf(
      session.currentStep as CustomerOnboardingStep,
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
    let parsedData = parsed.data as Record<string, unknown>;
    if (
      input.step === "organization" &&
      !canManageCustomerOrganization(identity)
    ) {
      const canonicalOrganization =
        customerOrganizationOnboardingSchema.safeParse(
          (await buildInitialDraft(identity)).organization,
        );
      if (!canonicalOrganization.success) {
        return {
          success: false,
          error:
            "De organisatiegegevens zijn onvolledig. Laat een beheerder deze eerst bijwerken.",
        };
      }
      parsedData = canonicalOrganization.data;
    }
    const completedSteps = Array.from(
      new Set([...session.completedSteps, input.step]),
    );
    const nextStep = input.continueToNext
      ? (nextOnboardingStep("customer", input.step) as CustomerOnboardingStep)
      : input.step;
    const draft = mergeOnboardingDraft(
      session.draftData,
      input.step,
      parsedData,
    );
    const completeness = onboardingCompleteness("customer", completedSteps);
    const now = new Date();
    const pushStatus =
      input.step === "notifications"
        ? (parsedData as { pushStatus: PortalPushStatus }).pushStatus
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
            eq(
              portalOnboardingSessionsTable.subjectId,
              identity.customerUserId,
            ),
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
        .update(customerUsersTable)
        .set({
          portalOnboardingStatus:
            nextStep === "review" ? "awaiting_review" : "in_progress",
          portalOnboardingVersion: PORTAL_ONBOARDING_VERSION,
          updatedAt: now,
        })
        .where(
          and(
            eq(customerUsersTable.id, identity.customerUserId),
            eq(customerUsersTable.tenantId, identity.tenantId),
            eq(customerUsersTable.userId, identity.userId),
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
            fields: Object.keys(parsedData),
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
              fields: Object.keys(parsedData),
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
          portal: "customer",
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

function draftPart(
  draft: PortalOnboardingDraft,
  key: string,
): Record<string, unknown> {
  return asRecord(draft[key]);
}

export async function completeCustomerOnboarding(): Promise<CustomerOnboardingActionResult> {
  try {
    const identity = await requireCustomerIdentity();
    const session = await getOrCreateSession(identity);
    if (session.status === "completed") {
      await synchronizeCustomerOnboardingMetadata(
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
    const required = ["organization", "contact", "notifications", "review"];
    if (required.some((step) => !session.completedSteps.includes(step))) {
      return {
        success: false,
        error: "Doorloop en bevestig eerst alle verplichte stappen.",
      };
    }
    const organization = customerOrganizationOnboardingSchema.safeParse(
      draftPart(session.draftData, "organization"),
    );
    const contact = customerContactOnboardingSchema.safeParse(
      draftPart(session.draftData, "contact"),
    );
    const notifications = notificationOnboardingSchema.safeParse(
      draftPart(session.draftData, "notifications"),
    );
    const review = customerReviewOnboardingSchema.safeParse(
      draftPart(session.draftData, "review"),
    );
    if (!organization.success) return zodFailure(organization.error);
    if (!contact.success) return zodFailure(contact.error);
    if (!notifications.success) return zodFailure(notifications.error);
    if (!review.success) return zodFailure(review.error);
    if (contact.data.email.toLowerCase() !== identity.email.toLowerCase()) {
      return {
        success: false,
        error:
          "Het account-e-mailadres kan alleen door een beheerder worden gewijzigd.",
      };
    }

    const now = new Date();
    const canManageOrganization = canManageCustomerOrganization(identity);
    const resetGeocoding =
      canManageOrganization &&
      customerAddressChanged(identity, organization.data);

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
            eq(
              portalOnboardingSessionsTable.subjectId,
              identity.customerUserId,
            ),
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

      if (canManageOrganization) {
        await tx
          .update(customersTable)
          .set({
            name: organization.data.officialName,
            tradeName: organization.data.tradeName,
            legalEntity: organization.data.legalForm,
            registrationCountry: organization.data.registrationCountry,
            chamberOfCommerceNumber: organization.data.chamberOfCommerceNumber,
            vatNumber: organization.data.vatNumber || null,
            ...(identity.role === "primary"
              ? {
                  contactName:
                    `${contact.data.firstName} ${contact.data.lastName}`.trim(),
                  mobile: contact.data.mobile || null,
                }
              : {}),
            contactEmail: organization.data.businessEmail,
            contactPhone: organization.data.businessPhone,
            address: organization.data.addressStreet,
            addressLine1: organization.data.addressStreet,
            postalCode: organization.data.postalCode,
            city: organization.data.city,
            country: organization.data.country,
            website: organization.data.website || null,
            ...(resetGeocoding
              ? customerGeocodingReset(organization.data)
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(customersTable.id, identity.customerId),
              eq(customersTable.tenantId, identity.tenantId),
            ),
          );
      }
      await tx
        .update(customerUsersTable)
        .set({
          firstName: contact.data.firstName,
          lastName: contact.data.lastName,
          function: contact.data.function,
          phone: contact.data.businessPhone,
          mobile: contact.data.mobile || null,
          portalOnboardingStatus: "completed",
          portalOnboardingVersion: PORTAL_ONBOARDING_VERSION,
          updatedAt: now,
        })
        .where(
          and(
            eq(customerUsersTable.id, identity.customerUserId),
            eq(customerUsersTable.customerId, identity.customerId),
            eq(customerUsersTable.tenantId, identity.tenantId),
            eq(customerUsersTable.userId, identity.userId),
          ),
        );

      const [existingContact] = await tx
        .select({
          id: customerContactsTable.id,
          isPrimary: customerContactsTable.isPrimary,
        })
        .from(customerContactsTable)
        .where(
          and(
            eq(customerContactsTable.customerId, identity.customerId),
            eq(customerContactsTable.email, identity.email),
          ),
        )
        .limit(1);
      if (identity.role === "primary") {
        await tx
          .update(customerContactsTable)
          .set({ isPrimary: false, updatedAt: now })
          .where(
            and(
              eq(customerContactsTable.customerId, identity.customerId),
              ne(customerContactsTable.email, identity.email),
            ),
          );
      }
      if (existingContact) {
        await tx
          .update(customerContactsTable)
          .set({
            firstName: contact.data.firstName,
            lastName: contact.data.lastName,
            function: contact.data.function,
            email: identity.email,
            phone: contact.data.businessPhone,
            mobile: contact.data.mobile || null,
            isPrimary:
              identity.role === "primary" ? true : existingContact.isPrimary,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerContactsTable.id, existingContact.id),
              eq(customerContactsTable.customerId, identity.customerId),
            ),
          );
      } else {
        await tx.insert(customerContactsTable).values({
          customerId: identity.customerId,
          firstName: contact.data.firstName,
          lastName: contact.data.lastName,
          function: contact.data.function,
          email: identity.email,
          phone: contact.data.businessPhone,
          mobile: contact.data.mobile || null,
          isPrimary: identity.role === "primary",
        });
      }

      for (const preference of notifications.data.preferences) {
        const critical =
          preference.category === "incidents" ||
          preference.category === "announcements";
        await tx
          .insert(portalNotificationPreferencesTable)
          .values({
            tenantId: identity.tenantId,
            userId: identity.userId,
            portal: "customer",
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
      if (identity.role === "primary") {
        await tx
          .insert(customerPortalPreferencesTable)
          .values({
            customerId: identity.customerId,
            emailNotifications: notifications.data.preferences.some(
              (item) => item.emailEnabled,
            ),
            pushNotifications: notifications.data.preferences.some(
              (item) => item.pushEnabled,
            ),
          })
          .onConflictDoUpdate({
            target: customerPortalPreferencesTable.customerId,
            set: {
              emailNotifications: notifications.data.preferences.some(
                (item) => item.emailEnabled,
              ),
              pushNotifications: notifications.data.preferences.some(
                (item) => item.pushEnabled,
              ),
              updatedAt: now,
            },
          });
      }
      await tx.insert(auditLogTable).values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        action: "complete_onboarding",
        resource: "portal_onboarding",
        resourceId: session.id,
        metadata: {
          portal: "customer",
          onboardingVersion: PORTAL_ONBOARDING_VERSION,
          completeness: 100,
        },
      });
    });

    await synchronizeCustomerOnboardingMetadata(identity, now);

    revalidatePath("/");
    revalidatePath("/profiel");
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
