export const PORTAL_ONBOARDING_VERSION = 1;
export const PORTAL_ONBOARDING_REQUIRED_METADATA = "portal_onboarding_required";
export const PORTAL_ONBOARDING_STATUS_METADATA = "portal_onboarding_status";
export const PORTAL_ONBOARDING_VERSION_METADATA = "portal_onboarding_version";

export const PORTAL_ONBOARDING_PORTALS = ["personnel", "customer"] as const;
export type PortalOnboardingPortal = (typeof PORTAL_ONBOARDING_PORTALS)[number];

export const PORTAL_ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "awaiting_push_permission",
  "awaiting_review",
  "completed",
  "reopened",
  "waived_by_admin",
] as const;
export type PortalOnboardingStatus =
  (typeof PORTAL_ONBOARDING_STATUSES)[number];

export const PORTAL_PUSH_STATUSES = [
  "not_asked",
  "allowed",
  "denied",
  "unsupported",
  "revoked",
  "expired",
] as const;
export type PortalPushStatus = (typeof PORTAL_PUSH_STATUSES)[number];

export type PortalOnboardingDraft = Record<string, Record<string, unknown>>;

export const PERSONNEL_ONBOARDING_STEPS = [
  "welcome",
  "profile",
  "transport",
  "work",
  "availability",
  "notifications",
  "review",
] as const;

export const CUSTOMER_ONBOARDING_STEPS = [
  "welcome",
  "organization",
  "contact",
  "notifications",
  "review",
] as const;

export type PersonnelOnboardingStep =
  (typeof PERSONNEL_ONBOARDING_STEPS)[number];
export type CustomerOnboardingStep = (typeof CUSTOMER_ONBOARDING_STEPS)[number];
export type PortalOnboardingStep =
  | PersonnelOnboardingStep
  | CustomerOnboardingStep;

export const ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES = [
  "new_planning",
  "changed_planning",
  "cancelled_assignment",
  "assignment_reminder",
  "open_assignments",
  "availability_decision",
  "messages",
  "work_order_updates",
  "announcements",
  "expiring_documents",
  "urgent_operations",
] as const;

export const ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES = [
  "quotes",
  "assignments",
  "planning_changes",
  "personnel_progress",
  "work_completed",
  "reports",
  "incidents",
  "extra_work",
  "invoices",
  "payment_reminders",
  "support",
  "announcements",
] as const;

export type PortalNotificationPreferenceInput = {
  category: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  critical: boolean;
};

export type PortalOnboardingAuthMetadata =
  | Record<string, unknown>
  | null
  | undefined;

export function portalOnboardingAccessState(
  metadata: PortalOnboardingAuthMetadata,
  portal: PortalOnboardingPortal,
): { passwordChangeRequired: boolean; onboardingRequired: boolean } {
  const passwordChangeRequired = metadata?.["force_password_change"] === true;
  const metadataPortal = metadata?.["portal"];
  const onboardingRequired =
    metadataPortal === portal &&
    metadata?.[PORTAL_ONBOARDING_REQUIRED_METADATA] === true &&
    metadata?.[PORTAL_ONBOARDING_STATUS_METADATA] !== "completed";
  return { passwordChangeRequired, onboardingRequired };
}
