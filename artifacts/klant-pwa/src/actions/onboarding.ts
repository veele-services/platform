"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
  type PortalOnboardingDraft,
  type PortalPushStatus,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";

export type CustomerOnboardingWorkspace = {
  currentStep: CustomerOnboardingStep;
  completedSteps: string[];
  draft: PortalOnboardingDraft;
  completeness: number;
  pushStatus: PortalPushStatus;
  organizationName: string;
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd.");
  const tenantId = await requireCurrentCustomerPortalTenantId();
  if (!tenantId) throw new Error("Geen geldige organisatiecontext.");

  const [identity] = await db
    .select({
      customerId: customersTable.id,
      customerUserId: customerUsersTable.id,
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
        eq(customerUsersTable.tenantId, tenantId),
        eq(customerUsersTable.userId, user.id),
        eq(customerUsersTable.status, "active"),
        eq(customersTable.isActive, true),
      ),
    )
    .limit(1);
  if (!identity) throw new Error("Klantprofiel niet gevonden.");
  return { ...identity, userId: user.id, tenantId };
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
  };
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
          preferences: parsed.data.preferences.map((preference) => ({
            ...preference,
            emailEnabled: true,
            inAppEnabled: true,
          })),
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
    const completedSteps = Array.from(
      new Set([...session.completedSteps, input.step]),
    );
    const nextStep = input.continueToNext
      ? (nextOnboardingStep("customer", input.step) as CustomerOnboardingStep)
      : input.step;
    const draft = mergeOnboardingDraft(
      session.draftData,
      input.step,
      parsed.data as Record<string, unknown>,
    );
    const completeness = onboardingCompleteness("customer", completedSteps);
    const now = new Date();
    const pushStatus =
      input.step === "notifications"
        ? (parsed.data as { pushStatus: PortalPushStatus }).pushStatus
        : session.pushStatus;

    await db.transaction(async (tx) => {
      await tx
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
          updatedAt: now,
        })
        .where(
          and(
            eq(portalOnboardingSessionsTable.id, session.id),
            eq(portalOnboardingSessionsTable.tenantId, identity.tenantId),
            eq(portalOnboardingSessionsTable.userId, identity.userId),
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
    await db.transaction(async (tx) => {
      await tx
        .update(customersTable)
        .set({
          name: organization.data.officialName,
          tradeName: organization.data.tradeName,
          legalEntity: organization.data.legalForm,
          registrationCountry: organization.data.registrationCountry,
          chamberOfCommerceNumber: organization.data.chamberOfCommerceNumber,
          vatNumber: organization.data.vatNumber || null,
          contactName:
            `${contact.data.firstName} ${contact.data.lastName}`.trim(),
          contactEmail: organization.data.businessEmail,
          contactPhone: organization.data.businessPhone,
          mobile: contact.data.mobile || null,
          address: organization.data.addressStreet,
          addressLine1: organization.data.addressStreet,
          postalCode: organization.data.postalCode,
          city: organization.data.city,
          country: organization.data.country,
          website: organization.data.website || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(customersTable.id, identity.customerId),
            eq(customersTable.tenantId, identity.tenantId),
          ),
        );
      await tx
        .update(customerUsersTable)
        .set({
          firstName: contact.data.firstName,
          lastName: contact.data.lastName,
          function: contact.data.function,
          phone: contact.data.businessPhone,
          mobile: contact.data.mobile || null,
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
        .select({ id: customerContactsTable.id })
        .from(customerContactsTable)
        .where(
          and(
            eq(customerContactsTable.customerId, identity.customerId),
            eq(customerContactsTable.email, identity.email),
          ),
        )
        .limit(1);
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
            isPrimary: true,
            updatedAt: now,
          })
          .where(eq(customerContactsTable.id, existingContact.id));
      } else {
        await tx.insert(customerContactsTable).values({
          customerId: identity.customerId,
          firstName: contact.data.firstName,
          lastName: contact.data.lastName,
          function: contact.data.function,
          email: identity.email,
          phone: contact.data.businessPhone,
          mobile: contact.data.mobile || null,
          isPrimary: true,
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
      await tx
        .update(portalOnboardingSessionsTable)
        .set({
          status: "completed",
          currentStep: "review",
          profileCompletenessPercentage: 100,
          completedAt: now,
          completedBy: identity.userId,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(portalOnboardingSessionsTable.id, session.id),
            eq(portalOnboardingSessionsTable.tenantId, identity.tenantId),
            eq(portalOnboardingSessionsTable.userId, identity.userId),
          ),
        );
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

    const admin = createAdminClient();
    const { data: current, error: currentError } =
      await admin.auth.admin.getUserById(identity.userId);
    if (currentError || !current.user)
      throw new Error(
        "Onboarding is opgeslagen, maar toegang kon niet worden vrijgegeven.",
      );
    const appMetadata: Record<string, unknown> = {
      ...(current.user.app_metadata ?? {}),
    };
    appMetadata[PORTAL_ONBOARDING_REQUIRED_METADATA] = false;
    appMetadata[PORTAL_ONBOARDING_STATUS_METADATA] = "completed";
    appMetadata[PORTAL_ONBOARDING_VERSION_METADATA] = PORTAL_ONBOARDING_VERSION;
    appMetadata["portal_onboarding_completed_at"] = now.toISOString();
    const { error: metadataError } = await admin.auth.admin.updateUserById(
      identity.userId,
      { app_metadata: appMetadata },
    );
    if (metadataError)
      throw new Error(
        "Onboarding is opgeslagen, maar toegang kon niet worden vrijgegeven.",
      );

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
