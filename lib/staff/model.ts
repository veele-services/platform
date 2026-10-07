import type { Address } from "@/lib/addresses/model";
import type { Json } from "@/lib/database.types";
import type { NotificationPreferences } from "@/lib/notifications/model";

export type StaffPersonnelProfile = {
  id: string;
  tenant_id: string;
  /** Deliberately omitted from the browser-safe staff workspace projection. */
  user_id?: string | null;
  employee_number: string;
  version?: number;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  preferred_name?: string | null;
  mobile_phone?: string | null;
  birth_date?: string | null;
  home_address?: Json;
  emergency_contact?: Json;
  standard_vehicle?: string | null;
  departure_kind?: string | null;
  departure_depot_id?: string | null;
  alternate_departure_address?: Json;
  return_to_departure?: boolean;
  own_transport?: boolean;
  travel_limitations?: string | null;
  driving_license?: boolean;
  driving_license_categories?: string[];
  carpool_allowed?: boolean;
  notification_preferences?: Json;
  availability_preferences?: Json;
  availability_self_service_enabled?: boolean;
  onboarding_draft?: Json;
  onboarding_step?: number;
  onboarding_completed_at?: string | null;
  onboarding_version?: number;
  status: string;
};

export type StaffLeaveRequest = {
  id: string;
  tenant_id: string;
  personnel_id: string;
  leave_type: "vacation" | "short" | "care" | "unpaid" | "other";
  starts_on: string;
  ends_on: string;
  requested_minutes: number | null;
  requested_minutes_by_year: Record<string, number>;
  approved_minutes: number | null;
  approved_minutes_by_year: Record<string, number>;
  note: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  /** Actor identifiers are deliberately omitted from the staff projection. */
  reviewed_by?: string | null;
  reviewed_at: string | null;
  withdrawn_at: string | null;
  review_note: string | null;
  withdrawal_note: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  version: number;
};

export type StaffLeaveEntitlement = {
  id: string;
  tenant_id: string;
  personnel_id: string;
  calendar_year: number;
  allowance_minutes: number;
  carryover_minutes: number;
  created_at: string;
  updated_at: string;
  version: number;
};

export type StaffDayReview = {
  id: string;
  tenant_id: string;
  personnel_id: string;
  day: string;
  state: "open" | "closed" | "confirmed" | "correction_requested";
  note: string;
  closed_at: string | null;
  confirmed_at: string | null;
  correction_requested_at: string | null;
  /** Actor identifiers are deliberately omitted from the staff projection. */
  created_by?: string;
  created_at: string;
  updated_at: string;
  version: number;
};

export type StaffTimeCorrectionRequest = {
  id: string;
  tenant_id: string;
  personnel_id: string;
  time_entry_id: string;
  correction_mode: "times" | "duration";
  source_version: number;
  source_kind: string;
  source_status: string;
  source_starts_at: string;
  source_ends_at: string;
  source_day_state: "open" | "closed" | "confirmed" | "correction_requested";
  requested_starts_at: string;
  requested_ends_at: string;
  requested_duration_minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type StaffStatusEvent = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  assignment_id: string | null;
  previous_status: string | null;
  new_status: string;
  reason_code: string | null;
  note: string | null;
  created_at: string;
};

export type StaffWorkOrderContact = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  roles: string[];
};

export type StaffDepot = {
  id: string;
  tenant_id: string;
  name: string;
};

export type StaffMaterial = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  task_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  customer_visible: boolean;
  created_by?: string;
  created_at: string;
  owned_by_current_user?: boolean;
};

export type StaffExpense = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  description: string;
  amount_cents: number;
  customer_visible: boolean;
  /** Ownership is exposed as a boolean instead of an account identifier. */
  created_by?: string;
  created_at: string;
  version: number;
  owned_by_current_user?: boolean;
};

export type AvailabilityDay = {
  enabled: boolean;
  start: string;
  end: string;
};

export type StaffAvailabilityPreferences = {
  week: Record<string, AvailabilityDay>;
  shifts: Array<"day" | "evening" | "night">;
  planningNote: string;
  weekends: boolean;
  holidays: boolean;
};

export type StaffOnboardingDraft = {
  profile: {
    fullName: string;
    preferredName: string;
    phone: string;
    mobilePhone: string;
    birthDate: string;
    homeAddress: { street: string; postalCode: string; city: string; country: string; address?: Address };
    emergencyContact: { name: string; phone: string; relation: string };
  };
  transport: {
    vehicle: "car" | "van" | "motorcycle" | "scooter" | "electric_bicycle" | "bicycle" | "public_transport" | "walking" | "other";
    departureKind: "home" | "depot" | "alternate";
    departureDepotId: string | null;
    alternateDepartureAddress: { street: string; postalCode: string; city: string; country: string; address?: Address } | null;
    returnToDeparture: boolean;
    ownTransport: boolean;
    drivingLicense: boolean;
    drivingLicenseCategories: string[];
    carpoolAllowed: boolean;
    limitations: string;
  };
  notifications: NotificationPreferences;
  availability: StaffAvailabilityPreferences;
  confirmations: {
    details: boolean;
    availability: boolean;
    notifications: boolean;
    privacy: boolean;
    terms: boolean;
  };
};
