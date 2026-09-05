"use server";

import { db } from "@workspace/db";
import {
  customersTable,
  customerNotesTable,
  customerUsersTable,
  customerMessageEntriesTable,
  customerMessageThreadsTable,
  customerTypesTable,
  customerContactsTable,
  objectsTable,
  assignmentsTable,
  invoicesTable,
  sectorsTable,
  auditLogTable,
  insertCustomerSchema,
  updateCustomerSchema,
  personnelTable,
  dossierProfilesTable,
  PORTAL_ONBOARDING_VERSION,
  tenantsTable,
} from "@workspace/db";
import {
  eq,
  ilike,
  or,
  and,
  asc,
  desc,
  inArray,
  sql,
  gte,
  lt,
  isNull,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  findAuthUserByEmail,
  provisionPortalUserForActivation,
} from "@/lib/auth/portal-invites";
import {
  buildStyledNotificationEmail,
  klantPortalUrl,
  sendEmailWithResult,
} from "@/lib/email";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
import {
  toPlatformCustomerContactMaskedDto,
  toPlatformCustomerMaskedDto,
} from "@/lib/security/safe-dtos";
import {
  geocodeAddress,
  hasGeocodableAddress,
  type GeocodeAddressInput,
} from "@/lib/planning/geocoding";
import { tenantApplicationOrigin } from "@/lib/tenant-application-origin";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type SectorOption = { id: string; name: string };

export type CustomerTypeOption = { id: string; name: string; slug: string };

export type CustomerRow = {
  id: string;
  name: string;
  code: string;
  sectorId: string | null;
  sectorName: string | null;
  city: string | null;
  contactEmail: string | null;
  isActive: boolean;
  status: string;
  customerTypeName: string | null;
  customerTypeId: string | null;
  accountManagerId: string | null;
  accountManagerName: string | null;
  createdAt: string;
};

export type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  sectorId: string | null;
  sectorName: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  latitude: string | null;
  longitude: string | null;
  geocodedAt: string | null;
  geocodingProvider: string | null;
  geocodingStatus: string;
  geocodingConfidence: string | null;
  geocodingError: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  legalEntity: string | null;
  vatNumber: string | null;
  chamberOfCommerceNumber: string | null;
  website: string | null;
  mobile: string | null;
  customerTypeId: string | null;
  customerTypeName: string | null;
  status: string;
  accountManagerId: string | null;
  accountManagerName: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFormInput = {
  name: string;
  sectorId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  legalEntity?: string;
  vatNumber?: string;
  chamberOfCommerceNumber?: string;
  website?: string;
  mobile?: string;
  customerTypeId?: string;
  status?: string;
  accountManagerId?: string;
  notes?: string;
  invitePortal?: boolean;
  googlePlace?: {
    googlePlaceId: string;
    formattedAddress: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    stateOrRegion: string | null;
    countryCode: string;
    latitude: number | null;
    longitude: number | null;
  };
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export type CustomerCreateResult = {
  id: string;
  invite?: {
    sent: boolean;
    message?: string;
  };
};

export type CustomerNoteRow = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  authorEmail: string;
  authorName: string | null;
};

export type CustomerContactRow = {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  function: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  preferredComm: string | null;
  isEmergencyContact: boolean;
  isPrimary: boolean;
};

export type CustomerContactInput = {
  firstName: string;
  lastName: string;
  function?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  preferredComm?: string;
  isEmergencyContact?: boolean;
  isPrimary?: boolean;
};

export type CustomerKpis = {
  monthlyRevenue: string;
  activeObjects: number;
  openAssignments: number;
  openInvoices: number;
  outstandingBalance: string;
  lastActivityDate: string | null;
};

export type CustomerHistoryEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: unknown;
  actorName: string;
  actorEmail: string | null;
  createdAt: string;
};

export type CustomerPortalUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  inviteSentAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type CustomerTicketSummaryRow = {
  id: string;
  subject: string;
  department: string;
  status: string;
  priority: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

function pgConstraint(err: unknown): string | null {
  return (err as { constraint?: string })?.constraint ?? null;
}

function normalizeLocationPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function geocodingResetForAddress(input: GeocodeAddressInput) {
  return {
    latitude: null,
    longitude: null,
    geocodedAt: null,
    geocodingProvider: null,
    geocodingStatus: hasGeocodableAddress(input) ? "pending" : "not_required",
    geocodingConfidence: null,
    geocodingError: null,
  };
}

function coordinateString(value: number): string {
  return value.toFixed(6);
}

function googlePlaceGeocodingPatch(
  input: GeocodeAddressInput & {
    googlePlace?: CustomerFormInput["googlePlace"];
  },
) {
  if (!input.googlePlace?.googlePlaceId) return null;
  return {
    addressLine1: input.googlePlace.addressLine1 ?? input.address,
    addressLine2: input.googlePlace.addressLine2,
    stateOrRegion: input.googlePlace.stateOrRegion,
    countryCode: input.googlePlace.countryCode,
    formattedAddress: input.googlePlace.formattedAddress,
    googlePlaceId: input.googlePlace.googlePlaceId,
    locationSource: "google_places",
    locationVerifiedAt: new Date(),
    locationUpdatedAt: new Date(),
    latitude:
      input.googlePlace.latitude != null
        ? coordinateString(input.googlePlace.latitude)
        : null,
    longitude:
      input.googlePlace.longitude != null
        ? coordinateString(input.googlePlace.longitude)
        : null,
    geocodedAt:
      input.googlePlace.latitude != null && input.googlePlace.longitude != null
        ? new Date()
        : null,
    geocodingProvider: "google_places",
    geocodingStatus:
      input.googlePlace.latitude != null && input.googlePlace.longitude != null
        ? "geocoded"
        : "not_required",
    geocodingConfidence:
      input.googlePlace.latitude != null && input.googlePlace.longitude != null
        ? "1.00"
        : null,
    geocodingError: null,
  };
}

function googlePlaceMatchesAddress(
  input: GeocodeAddressInput,
  googlePlace: CustomerFormInput["googlePlace"],
): googlePlace is NonNullable<CustomerFormInput["googlePlace"]> {
  if (!googlePlace?.googlePlaceId) return false;
  return (
    normalizeLocationPart(googlePlace.addressLine1) ===
      normalizeLocationPart(input.address) &&
    normalizeLocationPart(googlePlace.postalCode) ===
      normalizeLocationPart(input.postalCode) &&
    normalizeLocationPart(googlePlace.city) ===
      normalizeLocationPart(input.city)
  );
}

function locationChanged(
  existing: GeocodeAddressInput,
  next: GeocodeAddressInput,
): boolean {
  return (
    normalizeLocationPart(existing.address) !==
      normalizeLocationPart(next.address) ||
    normalizeLocationPart(existing.postalCode) !==
      normalizeLocationPart(next.postalCode) ||
    normalizeLocationPart(existing.city) !== normalizeLocationPart(next.city) ||
    normalizeLocationPart(existing.country) !==
      normalizeLocationPart(next.country)
  );
}

function confidenceString(value: number): string {
  return value.toFixed(2);
}

function customerCreateError(err: unknown): ActionResult {
  if (isUniqueViolation(err)) {
    const constraint = pgConstraint(err);
    if (
      constraint === "customers_contact_email_unique" ||
      constraint === "customers_tenant_contact_email_unique_idx"
    ) {
      return {
        success: false,
        message:
          "Er bestaat al een klant met dit e-mailadres binnen deze tenant.",
        fieldErrors: { contactEmail: "E-mailadres is al in gebruik" },
      };
    }
    if (constraint === "customers_code_unique") {
      return {
        success: false,
        message:
          "De klantcode kon niet uniek worden aangemaakt. Probeer opnieuw.",
      };
    }
    return {
      success: false,
      message: "Er bestaat al een klant met dezelfde unieke gegevens.",
    };
  }

  const code = (err as { code?: string })?.code;
  if (code === "23503") {
    return {
      success: false,
      message:
        "Een gekozen sector, klanttype of accountmanager bestaat niet meer. Ververs de pagina en probeer opnieuw.",
    };
  }

  const message = err instanceof Error ? err.message : "";
  console.error("[customers] Create customer failed:", err);
  return {
    success: false,
    message: message
      ? `Klant aanmaken mislukt: ${message}`
      : "Klant aanmaken mislukt door een onbekende fout.",
  };
}

function splitCustomerPortalName(name: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

async function customerPortalLoginUrl(tenantId: string): Promise<string> {
  return `${await tenantApplicationOrigin(tenantId)}/klant/login`;
}

async function upsertCustomerPortalInviteLink(input: {
  tenantId: string;
  customerId: string;
  authUserId: string;
  email: string;
  fullName: string;
  status?: "invited" | "active";
}): Promise<string> {
  const name = splitCustomerPortalName(input.fullName);
  const status = input.status ?? "invited";
  const [existing] = await db
    .select({
      id: customerUsersTable.id,
      role: customerUsersTable.role,
    })
    .from(customerUsersTable)
    .where(
      and(
        eq(customerUsersTable.tenantId, input.tenantId),
        eq(customerUsersTable.customerId, input.customerId),
        eq(customerUsersTable.email, input.email),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(customerUsersTable)
      .set({
        userId: input.authUserId,
        firstName: name.firstName,
        lastName: name.lastName,
        role: existing.role ?? "primary",
        status,
        portalOnboardingStatus: sql`
          case
            when ${customerUsersTable.portalOnboardingStatus} in ('completed', 'waived_by_admin')
              then ${customerUsersTable.portalOnboardingStatus}
            else 'not_started'
          end
        `,
        portalOnboardingVersion: sql`
          case
            when ${customerUsersTable.portalOnboardingStatus} in ('completed', 'waived_by_admin')
              then ${customerUsersTable.portalOnboardingVersion}
            else ${PORTAL_ONBOARDING_VERSION}
          end
        `,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerUsersTable.id, existing.id),
          eq(customerUsersTable.tenantId, input.tenantId),
        ),
      );
    return existing.id;
  }

  try {
    const [created] = await db
      .insert(customerUsersTable)
      .values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        userId: input.authUserId,
        email: input.email,
        firstName: name.firstName,
        lastName: name.lastName,
        role: "primary",
        status,
        portalOnboardingStatus: "not_started",
        portalOnboardingVersion: PORTAL_ONBOARDING_VERSION,
      })
      .returning({ id: customerUsersTable.id });
    return created!.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raced] = await db
      .update(customerUsersTable)
      .set({
        userId: input.authUserId,
        firstName: name.firstName,
        lastName: name.lastName,
        status,
        portalOnboardingStatus: sql`
          case
            when ${customerUsersTable.portalOnboardingStatus} in ('completed', 'waived_by_admin')
              then ${customerUsersTable.portalOnboardingStatus}
            else 'not_started'
          end
        `,
        portalOnboardingVersion: sql`
          case
            when ${customerUsersTable.portalOnboardingStatus} in ('completed', 'waived_by_admin')
              then ${customerUsersTable.portalOnboardingVersion}
            else ${PORTAL_ONBOARDING_VERSION}
          end
        `,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerUsersTable.tenantId, input.tenantId),
          eq(customerUsersTable.customerId, input.customerId),
          eq(customerUsersTable.email, input.email),
        ),
      )
      .returning({ id: customerUsersTable.id });
    if (!raced) throw error;
    return raced.id;
  }
}

async function markCustomerPortalInviteSent(
  tenantId: string,
  customerUserId: string,
): Promise<void> {
  await db
    .update(customerUsersTable)
    .set({ inviteSentAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(customerUsersTable.id, customerUserId),
        eq(customerUsersTable.tenantId, tenantId),
      ),
    );
}

async function sendCustomerPortalInvite(input: {
  tenantId: string;
  customerId: string;
}): Promise<{
  userId: string;
  customerUserId: string;
  created: boolean;
  email: string;
  customerName: string;
  delivery: "activation_challenge" | "existing_access";
}> {
  const [customer] = await db
    .select({
      name: customersTable.name,
      contactName: customersTable.contactName,
      contactEmail: customersTable.contactEmail,
    })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, input.customerId),
        eq(customersTable.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!customer) throw new Error("Klant niet gevonden.");

  const email = customer.contactEmail?.trim().toLowerCase();
  if (!email) throw new Error("Deze klant heeft geen contact-e-mailadres.");

  const fullName = customer.contactName || customer.name;
  const loginUrl = await customerPortalLoginUrl(input.tenantId);
  const admin = createAdminClient();
  const existingAuthUser = await findAuthUserByEmail(admin, email);
  const existingAuthState = existingAuthUser as typeof existingAuthUser & {
    confirmed_at?: string | null;
    email_confirmed_at?: string | null;
    last_sign_in_at?: string | null;
  };
  const hasUsableExistingAccount =
    Boolean(existingAuthUser) &&
    existingAuthUser?.app_metadata?.credential_activation_pending !== true &&
    (Boolean(existingAuthState?.last_sign_in_at) ||
      Boolean(existingAuthState?.confirmed_at) ||
      Boolean(existingAuthState?.email_confirmed_at));

  if (existingAuthUser && hasUsableExistingAccount) {
    const customerUserId = await upsertCustomerPortalInviteLink({
      tenantId: input.tenantId,
      customerId: input.customerId,
      authUserId: existingAuthUser.id,
      email,
      fullName,
      status: "active",
    });

    const { subject, html, text } = await buildStyledNotificationEmail({
      tenantId: input.tenantId,
      subject: "Toegang tot het klantportaal toegevoegd",
      preheader:
        "Uw bestaande Fieldgrid-account heeft toegang gekregen tot een extra klantportaal.",
      bodyText: [
        `Beste ${fullName},`,
        "",
        `Uw bestaande Fieldgrid-account heeft nu toegang tot het klantportaal voor ${customer.name}.`,
        "Log in met uw bestaande e-mailadres en wachtwoord. Bent u uw wachtwoord kwijt, gebruik dan Wachtwoord vergeten op de inlogpagina.",
      ].join("\n"),
      ctaHref: loginUrl,
      ctaLabel: "Klantportaal openen",
    });

    const sent = await sendEmailWithResult({
      to: email,
      subject,
      html,
      text,
      tenantId: input.tenantId,
      purpose: "customer_portal_invite",
    });

    if (!sent.success) {
      throw new Error(sent.error ?? "Uitnodigingsmail versturen mislukt.");
    }

    await markCustomerPortalInviteSent(input.tenantId, customerUserId);

    return {
      userId: existingAuthUser.id,
      customerUserId,
      created: false,
      email,
      customerName: customer.name,
      delivery: "existing_access",
    };
  }

  const provisioned = await provisionPortalUserForActivation({
    email,
    fullName,
    portal: "customer",
    tenantId: input.tenantId,
    portalName: "Klantportaal",
    activationUrl: loginUrl.replace(
      /\/login(?:\?.*)?$/u,
      "/wachtwoord-vergeten?doel=activatie",
    ),
    allowExistingActive: true,
  });

  const customerUserId = await upsertCustomerPortalInviteLink({
    tenantId: input.tenantId,
    customerId: input.customerId,
    authUserId: provisioned.user.id,
    email,
    fullName,
    status: "invited",
  });

  await markCustomerPortalInviteSent(input.tenantId, customerUserId);

  return {
    userId: provisioned.user.id,
    customerUserId,
    created: provisioned.created,
    email,
    customerName: customer.name,
    delivery: "activation_challenge",
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function currentTenantCustomer(
  customerId: string,
): Promise<{ tenantId: string } | null> {
  const tenantId = await requireCurrentTenantId();
  const [customer] = await db
    .select({ tenantId: customersTable.tenantId })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .limit(1);
  return customer ? { tenantId } : null;
}

export async function listCustomers(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<{ rows: CustomerRow[]; total: number }> {
  await requirePermission("customers", "read");
  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_customers_contacts",
    accessLevel: "masked_read",
    resourceType: "customers",
    metadata: { operation: "listCustomers" },
  });

  const {
    search,
    sectorId,
    status = "all",
    customerTypeId,
    city,
    country,
    accountManagerId,
    dateFrom,
    dateTo,
    page = 1,
    sort = "name",
    dir = "asc",
  } = params;

  const conditions: ReturnType<typeof eq>[] = [
    eq(customersTable.tenantId, tenantId) as ReturnType<typeof eq>,
  ];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(customersTable.name, term),
      ilike(customersTable.code, term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId)
    conditions.push(
      eq(customersTable.sectorId, sectorId) as ReturnType<typeof eq>,
    );
  if (customerTypeId)
    conditions.push(
      eq(customersTable.customerTypeId, customerTypeId) as ReturnType<
        typeof eq
      >,
    );
  if (city?.trim())
    conditions.push(
      ilike(customersTable.city, `%${city.trim()}%`) as ReturnType<typeof eq>,
    );
  if (country?.trim())
    conditions.push(
      ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<
        typeof eq
      >,
    );
  if (accountManagerId)
    conditions.push(
      eq(customersTable.accountManagerId, accountManagerId) as ReturnType<
        typeof eq
      >,
    );
  if (dateFrom)
    conditions.push(
      gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<
        typeof eq
      >,
    );
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }

  // Status filter: backward compat ('active'/'inactive') + new statuses
  if (status === "active") {
    conditions.push(
      eq(customersTable.status, "active") as ReturnType<typeof eq>,
    );
  } else if (status === "inactive") {
    conditions.push(
      eq(customersTable.status, "inactive") as ReturnType<typeof eq>,
    );
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    name: customersTable.name,
    code: customersTable.code,
    city: customersTable.city,
    createdAt: customersTable.createdAt,
  };
  const sortCol = (sortMap[sort] ??
    customersTable.name) as typeof customersTable.name;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        code: customersTable.code,
        sectorId: customersTable.sectorId,
        sectorName: sectorsTable.name,
        city: customersTable.city,
        contactEmail: customersTable.contactEmail,
        isActive: customersTable.isActive,
        status: customersTable.status,
        customerTypeId: customersTable.customerTypeId,
        customerTypeName: customerTypesTable.name,
        accountManagerId: customersTable.accountManagerId,
        accountManagerFirstName: personnelTable.firstName,
        accountManagerLastName: personnelTable.lastName,
        createdAt: customersTable.createdAt,
      })
      .from(customersTable)
      .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
      .leftJoin(
        customerTypesTable,
        eq(customersTable.customerTypeId, customerTypesTable.id),
      )
      .leftJoin(
        personnelTable,
        and(
          eq(customersTable.accountManagerId, personnelTable.id),
          eq(customersTable.tenantId, personnelTable.tenantId),
        ),
      )
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(customersTable)
      .where(where),
  ]);

  return {
    rows: rows.map((r) => {
      const accountManagerName =
        r.accountManagerFirstName || r.accountManagerLastName
          ? `${r.accountManagerFirstName ?? ""} ${r.accountManagerLastName ?? ""}`.trim()
          : null;
      return toPlatformCustomerMaskedDto(
        {
          id: r.id,
          name: r.name,
          code: r.code,
          sectorId: r.sectorId,
          sectorName: r.sectorName,
          city: r.city,
          contactEmail: r.contactEmail,
          isActive: r.isActive,
          status: r.status,
          customerTypeId: r.customerTypeId,
          customerTypeName: r.customerTypeName,
          accountManagerId: r.accountManagerId,
          accountManagerName,
          createdAt: r.createdAt.toISOString(),
        },
        sensitiveDecision,
      );
    }),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  await requirePermission("customers", "read");
  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_customers_contacts",
    accessLevel: "masked_read",
    resourceType: "customers",
    resourceId: id,
  });
  const canSeeNotes = await hasPermission("customers", "write");

  const rows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      code: customersTable.code,
      sectorId: customersTable.sectorId,
      sectorName: sectorsTable.name,
      address: customersTable.address,
      city: customersTable.city,
      postalCode: customersTable.postalCode,
      country: customersTable.country,
      latitude: customersTable.latitude,
      longitude: customersTable.longitude,
      geocodedAt: customersTable.geocodedAt,
      geocodingProvider: customersTable.geocodingProvider,
      geocodingStatus: customersTable.geocodingStatus,
      geocodingConfidence: customersTable.geocodingConfidence,
      geocodingError: customersTable.geocodingError,
      contactName: customersTable.contactName,
      contactEmail: customersTable.contactEmail,
      contactPhone: customersTable.contactPhone,
      legalEntity: customersTable.legalEntity,
      vatNumber: customersTable.vatNumber,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      website: customersTable.website,
      mobile: customersTable.mobile,
      customerTypeId: customersTable.customerTypeId,
      customerTypeName: customerTypesTable.name,
      status: customersTable.status,
      accountManagerId: customersTable.accountManagerId,
      accountManagerFirstName: personnelTable.firstName,
      accountManagerLastName: personnelTable.lastName,
      isActive: customersTable.isActive,
      notes: customersTable.notes,
      createdAt: customersTable.createdAt,
      updatedAt: customersTable.updatedAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
    .leftJoin(
      customerTypesTable,
      eq(customersTable.customerTypeId, customerTypesTable.id),
    )
    .leftJoin(
      personnelTable,
      and(
        eq(customersTable.accountManagerId, personnelTable.id),
        eq(customersTable.tenantId, personnelTable.tenantId),
      ),
    )
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    )
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  const accountManagerName =
    r.accountManagerFirstName || r.accountManagerLastName
      ? `${r.accountManagerFirstName ?? ""} ${r.accountManagerLastName ?? ""}`.trim()
      : null;
  const detail: CustomerDetail = {
    id: r.id,
    name: r.name,
    code: r.code,
    sectorId: r.sectorId,
    sectorName: r.sectorName,
    address: r.address,
    city: r.city,
    postalCode: r.postalCode,
    country: r.country,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    geocodedAt: r.geocodedAt?.toISOString() ?? null,
    geocodingProvider: r.geocodingProvider,
    geocodingStatus: r.geocodingStatus ?? "pending",
    geocodingConfidence: r.geocodingConfidence ?? null,
    geocodingError: r.geocodingError,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    legalEntity: r.legalEntity,
    vatNumber: r.vatNumber,
    chamberOfCommerceNumber: r.chamberOfCommerceNumber,
    website: r.website,
    mobile: r.mobile,
    customerTypeId: r.customerTypeId,
    customerTypeName: r.customerTypeName,
    status: r.status,
    accountManagerId: r.accountManagerId,
    accountManagerName,
    isActive: r.isActive,
    notes: canSeeNotes ? r.notes : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
  return toPlatformCustomerMaskedDto(detail, sensitiveDecision);
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  await requirePermission("customers", "delete");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(objectsTable)
    .where(
      and(eq(objectsTable.customerId, id), eq(objectsTable.tenantId, tenantId)),
    );

  const linkedObjects = countRow?.count ?? 0;
  if (linkedObjects > 0) {
    return {
      success: false,
      message: `Kan niet verwijderen: deze klant heeft ${linkedObjects} object${linkedObjects > 1 ? "en" : ""}. Verwijder eerst alle objecten.`,
    };
  }

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    )
    .limit(1);

  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const [dossier] = await db
    .select({ id: dossierProfilesTable.id })
    .from(dossierProfilesTable)
    .where(
      and(
        eq(dossierProfilesTable.tenantId, tenantId),
        eq(dossierProfilesTable.customerId, id),
      ),
    )
    .limit(1);
  if (dossier) {
    await db.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "delete_blocked",
      resource: "customers",
      resourceId: id,
      metadata: { reason: "dossier360_retention_lifecycle" },
    });
    return {
      success: false,
      message:
        "Deze klant heeft een Dossier 360 en kan daarom niet definitief worden verwijderd. Zet de klant op inactief; definitieve verwijdering verloopt later via het bewaarbeleid.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(customerContactsTable)
      .where(eq(customerContactsTable.customerId, id));
    await tx
      .delete(customerNotesTable)
      .where(eq(customerNotesTable.customerId, id));
    await tx
      .delete(customersTable)
      .where(
        and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
      );

    await tx.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "delete",
      resource: "customers",
      resourceId: id,
      metadata: { lifecycle: "hard_delete" },
    });
  });

  revalidatePath("/customers");
  return { success: true };
}

export async function inviteCustomerPortal(id: string): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  let invite: {
    userId: string;
    customerUserId: string;
    created: boolean;
    delivery: "activation_challenge" | "existing_access";
  };
  let customerName = "";
  let email = "";
  try {
    const sentInvite = await sendCustomerPortalInvite({
      tenantId,
      customerId: id,
    });
    email = sentInvite.email;
    customerName = sentInvite.customerName;
    invite = {
      userId: sentInvite.userId,
      customerUserId: sentInvite.customerUserId,
      created: sentInvite.created,
      delivery: sentInvite.delivery,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Klantuitnodiging versturen mislukt.",
    };
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "invite_customer_portal",
    resource: "customers",
    resourceId: id,
    metadata: {
      customerName,
      email,
      authUserId: invite.userId,
      customerUserId: invite.customerUserId,
      activationChallenge: invite.delivery === "activation_challenge",
      authUserCreated: invite.created,
      delivery: invite.delivery,
    },
  });

  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function listSectors(): Promise<SectorOption[]> {
  return db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

// ─── Customer Types ────────────────────────────────────────────────────────────

export async function listCustomerTypes(): Promise<CustomerTypeOption[]> {
  return db
    .select({
      id: customerTypesTable.id,
      name: customerTypesTable.name,
      slug: customerTypesTable.slug,
    })
    .from(customerTypesTable)
    .where(eq(customerTypesTable.isActive, true))
    .orderBy(asc(customerTypesTable.name));
}

export async function listAllCustomerTypes(): Promise<
  (CustomerTypeOption & { isActive: boolean; createdAt: string })[]
> {
  await requirePermission("settings", "read");
  const rows = await db
    .select({
      id: customerTypesTable.id,
      name: customerTypesTable.name,
      slug: customerTypesTable.slug,
      isActive: customerTypesTable.isActive,
      createdAt: customerTypesTable.createdAt,
    })
    .from(customerTypesTable)
    .orderBy(asc(customerTypesTable.name));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function createCustomerType(data: {
  name: string;
  slug: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("settings", "write");

  const name = data.name.trim();
  const slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name) return { success: false, message: "Naam is verplicht." };
  if (!slug) return { success: false, message: "Slug is verplicht." };

  try {
    const [created] = await db
      .insert(customerTypesTable)
      .values({ name, slug, isActive: true })
      .returning({ id: customerTypesTable.id });

    revalidatePath("/settings");
    revalidatePath("/instellingen/klanttypes");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een klanttype met deze slug.",
        fieldErrors: { slug: "Slug al in gebruik" },
      };
    }
    return { success: false, message: "Klanttype aanmaken mislukt." };
  }
}

export async function updateCustomerType(
  id: string,
  data: { name?: string; slug?: string; isActive?: boolean },
): Promise<ActionResult> {
  await requirePermission("settings", "write");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.slug !== undefined)
    patch.slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  try {
    await db
      .update(customerTypesTable)
      .set(patch)
      .where(eq(customerTypesTable.id, id));
    revalidatePath("/instellingen/klanttypes");
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een klanttype met deze slug.",
      };
    }
    return { success: false, message: "Klanttype bijwerken mislukt." };
  }
}

// ─── Customer Contacts ────────────────────────────────────────────────────────

export async function listCustomerPortalUsers(
  customerId: string,
): Promise<CustomerPortalUserRow[]> {
  const canRead = await hasPermission("customers", "read");
  if (!canRead) return [];

  const customer = await currentTenantCustomer(customerId);
  if (!customer) return [];

  const rows = await db
    .select({
      id: customerUsersTable.id,
      email: customerUsersTable.email,
      firstName: customerUsersTable.firstName,
      lastName: customerUsersTable.lastName,
      role: customerUsersTable.role,
      status: customerUsersTable.status,
      inviteSentAt: customerUsersTable.inviteSentAt,
      lastLoginAt: customerUsersTable.lastLoginAt,
      createdAt: customerUsersTable.createdAt,
    })
    .from(customerUsersTable)
    .where(
      and(
        eq(customerUsersTable.customerId, customerId),
        eq(customerUsersTable.tenantId, customer.tenantId),
      ),
    )
    .orderBy(asc(customerUsersTable.status), asc(customerUsersTable.email));

  return rows.map((r) => {
    const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
    return {
      id: r.id,
      email: r.email,
      name,
      role: r.role,
      status: r.status,
      inviteSentAt: r.inviteSentAt ? r.inviteSentAt.toISOString() : null,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function listCustomerTicketsForCustomer(
  customerId: string,
  limit = 10,
): Promise<CustomerTicketSummaryRow[]> {
  const canRead = await hasPermission("tickets", "read");
  if (!canRead) return [];

  const customer = await currentTenantCustomer(customerId);
  if (!customer) return [];

  const rows = await db
    .select({
      id: customerMessageThreadsTable.id,
      subject: customerMessageThreadsTable.subject,
      department: customerMessageThreadsTable.department,
      status: customerMessageThreadsTable.status,
      priority: customerMessageThreadsTable.priority,
      lastMessagePreview: customerMessageThreadsTable.lastMessagePreview,
      lastMessageAt: customerMessageThreadsTable.lastMessageAt,
      createdAt: customerMessageThreadsTable.createdAt,
    })
    .from(customerMessageThreadsTable)
    .where(
      and(
        eq(customerMessageThreadsTable.customerId, customerId),
        eq(customerMessageThreadsTable.tenantId, customer.tenantId),
      ),
    )
    .orderBy(desc(customerMessageThreadsTable.lastMessageAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const unreadRows = await db
    .select({ threadId: customerMessageEntriesTable.threadId })
    .from(customerMessageEntriesTable)
    .where(
      and(
        inArray(
          customerMessageEntriesTable.threadId,
          rows.map((r) => r.id),
        ),
        eq(customerMessageEntriesTable.authorType, "customer"),
        isNull(customerMessageEntriesTable.readByBackofficeAt),
      ),
    );

  const unreadCounts = new Map<string, number>();
  for (const row of unreadRows) {
    unreadCounts.set(row.threadId, (unreadCounts.get(row.threadId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    department: r.department,
    status: r.status,
    priority: r.priority,
    lastMessagePreview: r.lastMessagePreview ?? null,
    lastMessageAt: r.lastMessageAt.toISOString(),
    unreadCount: unreadCounts.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listCustomerContacts(
  customerId: string,
): Promise<CustomerContactRow[]> {
  await requirePermission("customers", "read");
  const tenantId = await requireCurrentTenantId();

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!customer) return [];

  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_customers_contacts",
    accessLevel: "masked_read",
    resourceType: "customer_contacts",
    resourceId: customerId,
  });

  const rows = await db
    .select()
    .from(customerContactsTable)
    .where(eq(customerContactsTable.customerId, customerId))
    .orderBy(
      desc(customerContactsTable.isPrimary),
      asc(customerContactsTable.firstName),
    );

  return rows.map((r) =>
    toPlatformCustomerContactMaskedDto(
      {
        id: r.id,
        customerId: r.customerId,
        firstName: r.firstName,
        lastName: r.lastName,
        function: r.function ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        mobile: r.mobile ?? null,
        preferredComm: r.preferredComm ?? null,
        isEmergencyContact: r.isEmergencyContact,
        isPrimary: r.isPrimary,
      },
      sensitiveDecision,
    ),
  );
}

export async function addCustomerContact(
  customerId: string,
  data: CustomerContactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (!data.firstName?.trim())
    return {
      success: false,
      message: "Voornaam is verplicht.",
      fieldErrors: { firstName: "Verplicht" },
    };
  if (!data.lastName?.trim())
    return {
      success: false,
      message: "Achternaam is verplicht.",
      fieldErrors: { lastName: "Verplicht" },
    };

  // If isPrimary, demote existing primary contacts
  if (data.isPrimary) {
    await db
      .update(customerContactsTable)
      .set({ isPrimary: false })
      .where(
        and(
          eq(customerContactsTable.customerId, customerId),
          eq(customerContactsTable.isPrimary, true),
        ),
      );
  }

  const [created] = await db
    .insert(customerContactsTable)
    .values({
      customerId,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      function: data.function?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      mobile: data.mobile?.trim() || null,
      preferredComm: data.preferredComm || null,
      isEmergencyContact: data.isEmergencyContact ?? false,
      isPrimary: data.isPrimary ?? false,
    })
    .returning({ id: customerContactsTable.id });

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "create",
    resource: "customer_contacts",
    resourceId: created!.id,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true, data: { id: created!.id } };
}

export async function updateCustomerContact(
  contactId: string,
  customerId: string,
  data: CustomerContactInput,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [existing] = await db
    .select({ id: customerContactsTable.id })
    .from(customerContactsTable)
    .where(
      and(
        eq(customerContactsTable.id, contactId),
        eq(customerContactsTable.customerId, customerId),
      ),
    )
    .limit(1);

  if (!existing) return { success: false, message: "Contact niet gevonden." };

  // If setting as primary, demote others
  if (data.isPrimary) {
    await db
      .update(customerContactsTable)
      .set({ isPrimary: false })
      .where(
        and(
          eq(customerContactsTable.customerId, customerId),
          eq(customerContactsTable.isPrimary, true),
        ),
      );
  }

  await db
    .update(customerContactsTable)
    .set({
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      function: data.function?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      mobile: data.mobile?.trim() || null,
      preferredComm: data.preferredComm || null,
      isEmergencyContact: data.isEmergencyContact ?? false,
      isPrimary: data.isPrimary ?? false,
      updatedAt: new Date(),
    })
    .where(eq(customerContactsTable.id, contactId));

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "update",
    resource: "customer_contacts",
    resourceId: contactId,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function deleteCustomerContact(
  contactId: string,
  customerId: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(customerContactsTable)
    .where(
      and(
        eq(customerContactsTable.id, contactId),
        eq(customerContactsTable.customerId, customerId),
      ),
    );

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "delete",
    resource: "customer_contacts",
    resourceId: contactId,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getCustomerKpis(
  customerId: string,
): Promise<CustomerKpis> {
  await requirePermission("customers", "read");
  const [canReadObjects, canReadAssignments, canReadInvoices] =
    await Promise.all([
      hasPermission("objects", "read"),
      hasPermission("assignments", "read"),
      hasPermission("invoices", "read"),
    ]);
  const customer = await currentTenantCustomer(customerId);
  if (!customer) {
    return {
      monthlyRevenue: "0",
      activeObjects: 0,
      openAssignments: 0,
      openInvoices: 0,
      outstandingBalance: "0",
      lastActivityDate: null,
    };
  }
  const tenantId = customer.tenantId;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    objectsResult,
    openAssignmentsResult,
    openInvoicesResult,
    monthlyRevenueResult,
    lastActivityResult,
  ] = await Promise.all([
    // Active objects count
    canReadObjects
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(objectsTable)
          .where(
            and(
              eq(objectsTable.customerId, customerId),
              eq(objectsTable.tenantId, tenantId),
              eq(objectsTable.isActive, true),
            ),
          )
      : Promise.resolve([]),

    // Open assignments (not closed/archived)
    canReadAssignments
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.customerId, customerId),
              eq(assignmentsTable.tenantId, tenantId),
              sql`${assignmentsTable.status} NOT IN ('paid', 'closed', 'cancelled')`,
            ),
          )
      : Promise.resolve([]),

    // Open invoices (status = 'sent')
    canReadInvoices
      ? db
          .select({
            count: sql<number>`count(*)::int`,
            balance: sql<string>`coalesce(sum(total_amount), 0)::text`,
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.customerId, customerId),
              eq(invoicesTable.tenantId, tenantId),
              eq(invoicesTable.status, "sent"),
            ),
          )
      : Promise.resolve([]),

    // Monthly revenue (paid invoices this month)
    canReadInvoices
      ? db
          .select({
            revenue: sql<string>`coalesce(sum(total_amount), 0)::text`,
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.customerId, customerId),
              eq(invoicesTable.tenantId, tenantId),
              eq(invoicesTable.status, "paid"),
              gte(invoicesTable.createdAt, startOfMonth),
            ),
          )
      : Promise.resolve([]),

    // Last activity (most recent assignment scheduled date)
    canReadAssignments
      ? db
          .select({ scheduledDate: assignmentsTable.scheduledDate })
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.customerId, customerId),
              eq(assignmentsTable.tenantId, tenantId),
            ),
          )
          .orderBy(desc(assignmentsTable.scheduledDate))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const lastDate = lastActivityResult[0]?.scheduledDate;

  return {
    monthlyRevenue: monthlyRevenueResult[0]?.revenue ?? "0",
    activeObjects: objectsResult[0]?.count ?? 0,
    openAssignments: openAssignmentsResult[0]?.count ?? 0,
    openInvoices: openInvoicesResult[0]?.count ?? 0,
    outstandingBalance: openInvoicesResult[0]?.balance ?? "0",
    lastActivityDate: lastDate ?? null,
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createCustomer(
  data: CustomerFormInput,
): Promise<ActionResult<CustomerCreateResult>> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    name: data.name.trim(),
    sectorId: data.sectorId || null,
    contactName: data.contactName?.trim() || null,
    contactEmail: data.contactEmail?.trim().toLowerCase() || null,
    contactPhone: data.contactPhone?.trim() || null,
    address: data.address?.trim() || null,
    city: data.city?.trim() || null,
    postalCode: data.postalCode?.trim() || null,
    country: data.country?.trim() || "NL",
    legalEntity: data.legalEntity?.trim() || null,
    vatNumber: data.vatNumber?.trim() || null,
    chamberOfCommerceNumber: data.chamberOfCommerceNumber?.trim() || null,
    website: data.website?.trim() || null,
    mobile: data.mobile?.trim() || null,
    customerTypeId: data.customerTypeId || null,
    status: data.status || "active",
    accountManagerId: data.accountManagerId || null,
    notes: data.notes?.trim() || null,
    tenantId,
    createdBy: user.id,
  };

  const parsed = insertCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  if (data.invitePortal && !parsed.data.contactEmail) {
    return {
      success: false,
      message:
        "Vul een e-mailadres in om direct een klantportaaluitnodiging te versturen.",
      fieldErrors: {
        contactEmail: "E-mailadres is verplicht voor direct uitnodigen",
      },
    };
  }

  try {
    const googlePlace = googlePlaceMatchesAddress(payload, data.googlePlace)
      ? data.googlePlace
      : undefined;
    const geocodingState =
      googlePlaceGeocodingPatch({ ...payload, googlePlace }) ??
      geocodingResetForAddress(payload);
    const [created] = await db
      .insert(customersTable)
      .values({ ...parsed.data, ...geocodingState, tenantId })
      .returning({ id: customersTable.id });

    // Sync isActive with status
    await db
      .update(customersTable)
      .set({
        isActive:
          payload.status === "active" ||
          payload.status === "lead" ||
          payload.status === "prospect",
      })
      .where(
        and(
          eq(customersTable.id, created!.id),
          eq(customersTable.tenantId, tenantId),
        ),
      );

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "create",
      resource: "customers",
      resourceId: created!.id,
      metadata: {
        name: payload.name,
        geocodingStatus: geocodingState.geocodingStatus,
      },
    });

    let inviteResult: CustomerCreateResult["invite"];
    if (data.invitePortal) {
      try {
        const invite = await sendCustomerPortalInvite({
          tenantId,
          customerId: created!.id,
        });

        await db.insert(auditLogTable).values({
          userId: user.id,
          action: "auto_invite_customer_portal",
          resource: "customers",
          resourceId: created!.id,
          metadata: {
            customerName: payload.name,
            email: invite.email,
            authUserId: invite.userId,
            customerUserId: invite.customerUserId,
            activationChallenge: invite.delivery === "activation_challenge",
            authUserCreated: invite.created,
            delivery: invite.delivery,
          },
        });

        inviteResult = { sent: true };
      } catch (inviteError) {
        const message =
          inviteError instanceof Error
            ? inviteError.message
            : "Klantportaaluitnodiging versturen mislukt.";
        console.error(
          "[customers] Auto customer portal invite failed:",
          inviteError,
        );
        await db.insert(auditLogTable).values({
          userId: user.id,
          action: "auto_invite_customer_portal_failed",
          resource: "customers",
          resourceId: created!.id,
          metadata: {
            customerName: payload.name,
            email: parsed.data.contactEmail,
            error: message,
          },
        });
        inviteResult = { sent: false, message };
      }
    }

    revalidatePath("/customers");
    return { success: true, data: { id: created!.id, invite: inviteResult } };
  } catch (err) {
    return customerCreateError(err);
  }
}

export async function updateCustomer(
  id: string,
  data: CustomerFormInput,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    name: data.name.trim(),
    sectorId: data.sectorId || null,
    contactName: data.contactName?.trim() || null,
    contactEmail: data.contactEmail?.trim() || null,
    contactPhone: data.contactPhone?.trim() || null,
    address: data.address?.trim() || null,
    city: data.city?.trim() || null,
    postalCode: data.postalCode?.trim() || null,
    country: data.country?.trim() || "NL",
    legalEntity: data.legalEntity?.trim() || null,
    vatNumber: data.vatNumber?.trim() || null,
    chamberOfCommerceNumber: data.chamberOfCommerceNumber?.trim() || null,
    website: data.website?.trim() || null,
    mobile: data.mobile?.trim() || null,
    customerTypeId: data.customerTypeId || null,
    status: data.status || "active",
    accountManagerId: data.accountManagerId || null,
    notes: data.notes?.trim() || null,
    isActive:
      data.status === "active" ||
      data.status === "lead" ||
      data.status === "prospect",
  };

  const parsed = updateCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const [existing] = await db
      .select({
        address: customersTable.address,
        postalCode: customersTable.postalCode,
        city: customersTable.city,
        country: customersTable.country,
      })
      .from(customersTable)
      .where(
        and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
      )
      .limit(1);

    if (!existing) return { success: false, message: "Klant niet gevonden." };

    const shouldResetGeocoding = locationChanged(existing, payload);
    const googlePlace = googlePlaceMatchesAddress(payload, data.googlePlace)
      ? data.googlePlace
      : undefined;
    const geocodingState = shouldResetGeocoding
      ? (googlePlaceGeocodingPatch({ ...payload, googlePlace }) ??
        geocodingResetForAddress(payload))
      : {};

    await db
      .update(customersTable)
      .set({ ...parsed.data, ...geocodingState, updatedAt: new Date() })
      .where(
        and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
      );

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "update",
      resource: "customers",
      resourceId: id,
      metadata: { name: payload.name, geocodingReset: shouldResetGeocoding },
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een klant met dit e-mailadres.",
        fieldErrors: { contactEmail: "E-mailadres is al in gebruik" },
      };
    }
    return { success: false, message: "Klant bijwerken mislukt." };
  }
}

export async function geocodeCustomerLocation(id: string): Promise<
  ActionResult<{
    status: string;
    latitude: string | null;
    longitude: string | null;
    message: string;
  }>
> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [customer] = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      address: customersTable.address,
      postalCode: customersTable.postalCode,
      city: customersTable.city,
      country: customersTable.country,
    })
    .from(customersTable)
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    )
    .limit(1);

  if (!customer) return { success: false, message: "Klant niet gevonden." };

  if (!hasGeocodableAddress(customer)) {
    await db
      .update(customersTable)
      .set({
        ...geocodingResetForAddress(customer),
        updatedAt: new Date(),
      })
      .where(
        and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
      );

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return {
      success: false,
      message: "Adresgegevens ontbreken. Vul straat, postcode of plaats in.",
    };
  }

  const result = await geocodeAddress(customer);
  if (!result.success) {
    await db
      .update(customersTable)
      .set({
        geocodingProvider: result.provider,
        geocodingStatus: "failed",
        geocodingConfidence: null,
        geocodingError: result.error,
        updatedAt: new Date(),
      })
      .where(
        and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
      );

    await db.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "geocode_customer_location_failed",
      resource: "customers",
      resourceId: id,
      metadata: {
        name: customer.name,
        error: result.error,
        retryable: result.retryable,
      },
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: false, message: result.error };
  }

  const latitude = coordinateString(result.latitude);
  const longitude = coordinateString(result.longitude);

  await db
    .update(customersTable)
    .set({
      latitude,
      longitude,
      geocodedAt: new Date(),
      geocodingProvider: result.provider,
      geocodingStatus: "geocoded",
      geocodingConfidence: confidenceString(result.confidence),
      geocodingError: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    );

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "geocode_customer_location",
    resource: "customers",
    resourceId: id,
    metadata: {
      name: customer.name,
      provider: result.provider,
      label: result.label,
      confidence: result.confidence,
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return {
    success: true,
    data: {
      status: "geocoded",
      latitude,
      longitude,
      message: "Klantlocatie is bijgewerkt.",
    },
  };
}

export async function setCustomerStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(customersTable)
    .set({
      isActive,
      status: isActive ? "active" : "inactive",
      updatedAt: new Date(),
    })
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    );

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: isActive ? "activate" : "deactivate",
    resource: "customers",
    resourceId: id,
    metadata: {},
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function setCustomerLifecycleStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const isActive =
    status === "active" || status === "lead" || status === "prospect";

  await db
    .update(customersTable)
    .set({ status, isActive, updatedAt: new Date() })
    .where(
      and(eq(customersTable.id, id), eq(customersTable.tenantId, tenantId)),
    );

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update_status",
    resource: "customers",
    resourceId: id,
    metadata: { status },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function bulkSetCustomerStatus(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (!ids.length) return { success: true };
  await requirePermission("customers", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .update(customersTable)
    .set({
      isActive,
      status: isActive ? "active" : "inactive",
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(customersTable.id, ids),
        eq(customersTable.tenantId, tenantId),
      ),
    );

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: isActive ? "bulk_activate" : "bulk_deactivate",
    resource: "customers",
    resourceId: null,
    metadata: { ids, count: ids.length },
  });

  revalidatePath("/customers");
  return { success: true };
}

// ─── Customer Notes ────────────────────────────────────────────────────────────

export async function listCustomerHistory(
  customerId: string,
  limit = 25,
): Promise<CustomerHistoryEntry[]> {
  const canReadHistory = await hasPermission("customers", "write");
  if (!canReadHistory) return [];
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return [];

  const rows = await db
    .select({
      id: auditLogTable.id,
      action: auditLogTable.action,
      resource: auditLogTable.resource,
      resourceId: auditLogTable.resourceId,
      metadata: auditLogTable.metadata,
      createdAt: auditLogTable.createdAt,
      userId: auditLogTable.userId,
      actorFirst: personnelTable.firstName,
      actorLast: personnelTable.lastName,
      actorEmail: personnelTable.email,
    })
    .from(auditLogTable)
    .leftJoin(personnelTable, eq(personnelTable.userId, auditLogTable.userId))
    .where(
      and(
        eq(auditLogTable.resource, "customers"),
        eq(auditLogTable.resourceId, customerId),
        eq(auditLogTable.tenantId, customer.tenantId),
      ),
    )
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    resource: r.resource,
    resourceId: r.resourceId ?? null,
    metadata: r.metadata,
    actorName:
      r.actorFirst && r.actorLast
        ? `${r.actorFirst} ${r.actorLast}`.trim()
        : r.userId.slice(0, 8) + "...",
    actorEmail: r.actorEmail ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listCustomerNotes(
  customerId: string,
): Promise<CustomerNoteRow[]> {
  const canRead = await hasPermission("customers", "write");
  if (!canRead) return [];
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return [];

  const rows = await db
    .select({
      id: customerNotesTable.id,
      notes: customerNotesTable.notes,
      createdAt: customerNotesTable.createdAt,
      updatedAt: customerNotesTable.updatedAt,
      updatedBy: customerNotesTable.updatedBy,
    })
    .from(customerNotesTable)
    .where(eq(customerNotesTable.customerId, customerId))
    .orderBy(desc(customerNotesTable.createdAt));

  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, { email: string; name: string | null }>();
  for (const u of data?.users ?? []) {
    const meta = u.user_metadata as
      | { full_name?: string; name?: string }
      | undefined;
    userMap.set(u.id, {
      email: u.email ?? u.id,
      name: meta?.full_name ?? meta?.name ?? null,
    });
  }

  return rows.map((r) => {
    const author = r.updatedBy ? userMap.get(r.updatedBy) : undefined;
    return {
      id: r.id,
      content: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      authorEmail: author?.email ?? r.updatedBy ?? "—",
      authorName: author?.name ?? null,
    };
  });
}

export async function addCustomerNote(
  customerId: string,
  content: string,
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmed = content.trim();
  if (!trimmed)
    return { success: false, message: "Notitie mag niet leeg zijn." };
  if (trimmed.length > 4000)
    return { success: false, message: "Maximaal 4000 tekens toegestaan." };

  const [inserted] = await db
    .insert(customerNotesTable)
    .values({ customerId, notes: trimmed, updatedBy: user.id })
    .returning({
      id: customerNotesTable.id,
      createdAt: customerNotesTable.createdAt,
    });

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "create",
    resource: "customer_notes",
    resourceId: inserted.id,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return {
    success: true,
    data: { id: inserted.id, createdAt: inserted.createdAt.toISOString() },
  };
}

export async function updateCustomerNote(
  noteId: string,
  customerId: string,
  content: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmed = content.trim();
  if (!trimmed)
    return { success: false, message: "Notitie mag niet leeg zijn." };
  if (trimmed.length > 4000)
    return { success: false, message: "Maximaal 4000 tekens toegestaan." };

  const [existing] = await db
    .select({ id: customerNotesTable.id })
    .from(customerNotesTable)
    .where(
      and(
        eq(customerNotesTable.id, noteId),
        eq(customerNotesTable.customerId, customerId),
      ),
    )
    .limit(1);

  if (!existing) return { success: false, message: "Notitie niet gevonden." };

  await db
    .update(customerNotesTable)
    .set({ notes: trimmed, updatedBy: user.id })
    .where(eq(customerNotesTable.id, noteId));

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "update",
    resource: "customer_notes",
    resourceId: noteId,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function deleteCustomerNote(
  noteId: string,
  customerId: string,
): Promise<ActionResult> {
  await requirePermission("customers", "write");
  const customer = await currentTenantCustomer(customerId);
  if (!customer) return { success: false, message: "Klant niet gevonden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(customerNotesTable)
    .where(
      and(
        eq(customerNotesTable.id, noteId),
        eq(customerNotesTable.customerId, customerId),
      ),
    );

  await db.insert(auditLogTable).values({
    tenantId: customer.tenantId,
    userId: user.id,
    action: "delete",
    resource: "customer_notes",
    resourceId: noteId,
    metadata: { customerId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

// ─── Account manager lookup ────────────────────────────────────────────────────

export type AccountManagerOption = {
  id: string;
  fullName: string;
};

export async function listAccountManagers(): Promise<AccountManagerOption[]> {
  const canRead = await hasPermission("customers", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(eq(personnelTable.tenantId, tenantId))
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  return rows.map((r) => ({
    id: r.id,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
  }));
}

// ─── Export ────────────────────────────────────────────────────────────────────

export async function exportCustomers(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<{ csv: string; filename: string }>> {
  await requirePermission("customers", "read");
  const tenantId = await requireCurrentTenantId();

  const {
    search,
    sectorId,
    status = "all",
    customerTypeId,
    city,
    country,
    accountManagerId,
    dateFrom,
    dateTo,
  } = params;

  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_customers_contacts",
    accessLevel: "export",
    resourceType: "customers",
    exportDownload: true,
    metadata: { format: "csv", search, status },
  });

  const conditions: ReturnType<typeof eq>[] = [
    eq(customersTable.tenantId, tenantId) as ReturnType<typeof eq>,
  ];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(customersTable.name, term),
      ilike(customersTable.code, term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId)
    conditions.push(
      eq(customersTable.sectorId, sectorId) as ReturnType<typeof eq>,
    );
  if (customerTypeId)
    conditions.push(
      eq(customersTable.customerTypeId, customerTypeId) as ReturnType<
        typeof eq
      >,
    );
  if (city?.trim())
    conditions.push(
      ilike(customersTable.city, `%${city.trim()}%`) as ReturnType<typeof eq>,
    );
  if (country?.trim())
    conditions.push(
      ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<
        typeof eq
      >,
    );
  if (accountManagerId)
    conditions.push(
      eq(customersTable.accountManagerId, accountManagerId) as ReturnType<
        typeof eq
      >,
    );
  if (dateFrom)
    conditions.push(
      gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<
        typeof eq
      >,
    );
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }
  if (status === "active") {
    conditions.push(
      eq(customersTable.status, "active") as ReturnType<typeof eq>,
    );
  } else if (status === "inactive") {
    conditions.push(
      eq(customersTable.status, "inactive") as ReturnType<typeof eq>,
    );
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      code: customersTable.code,
      name: customersTable.name,
      sectorName: sectorsTable.name,
      customerTypeName: customerTypesTable.name,
      city: customersTable.city,
      country: customersTable.country,
      contactEmail: customersTable.contactEmail,
      contactPhone: customersTable.contactPhone,
      status: customersTable.status,
      createdAt: customersTable.createdAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
    .leftJoin(
      customerTypesTable,
      eq(customersTable.customerTypeId, customerTypesTable.id),
    )
    .where(where)
    .orderBy(asc(customersTable.name));

  function esc(v: string | null | undefined): string {
    const s = v ?? "";
    if (
      s.includes(",") ||
      s.includes('"') ||
      s.includes("\n") ||
      s.includes("\r")
    ) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const headers = [
    "Code",
    "Naam",
    "Sector",
    "Type",
    "Stad",
    "Land",
    "E-mail",
    "Telefoon",
    "Status",
    "Aangemaakt op",
  ];
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        esc(r.code),
        esc(r.name),
        esc(r.sectorName),
        esc(r.customerTypeName),
        esc(r.city),
        esc(r.country),
        esc(r.contactEmail),
        esc(r.contactPhone),
        esc(r.status),
        esc(r.createdAt.toISOString().split("T")[0] ?? ""),
      ].join(","),
    ),
  ];

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  return {
    success: true,
    data: { csv: csvLines.join("\n"), filename: `klanten_${stamp}.csv` },
  };
}

export async function exportCustomersPdf(params: {
  search?: string;
  sectorId?: string;
  status?: string;
  customerTypeId?: string;
  city?: string;
  country?: string;
  accountManagerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<{ html: string; filename: string }>> {
  await requirePermission("customers", "read");
  const tenantId = await requireCurrentTenantId();

  const {
    search,
    sectorId,
    status = "all",
    customerTypeId,
    city,
    country,
    accountManagerId,
    dateFrom,
    dateTo,
  } = params;

  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_customers_contacts",
    accessLevel: "export",
    resourceType: "customers",
    exportDownload: true,
    metadata: { format: "pdf", search, status },
  });

  const conditions: ReturnType<typeof eq>[] = [
    eq(customersTable.tenantId, tenantId) as ReturnType<typeof eq>,
  ];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(customersTable.name, term),
      ilike(customersTable.code, term),
    );
    if (clause) conditions.push(clause as ReturnType<typeof eq>);
  }
  if (sectorId)
    conditions.push(
      eq(customersTable.sectorId, sectorId) as ReturnType<typeof eq>,
    );
  if (customerTypeId)
    conditions.push(
      eq(customersTable.customerTypeId, customerTypeId) as ReturnType<
        typeof eq
      >,
    );
  if (city?.trim())
    conditions.push(
      ilike(customersTable.city, `%${city.trim()}%`) as ReturnType<typeof eq>,
    );
  if (country?.trim())
    conditions.push(
      ilike(customersTable.country, `%${country.trim()}%`) as ReturnType<
        typeof eq
      >,
    );
  if (accountManagerId)
    conditions.push(
      eq(customersTable.accountManagerId, accountManagerId) as ReturnType<
        typeof eq
      >,
    );
  if (dateFrom)
    conditions.push(
      gte(customersTable.createdAt, new Date(dateFrom)) as ReturnType<
        typeof eq
      >,
    );
  if (dateTo) {
    const end = new Date(dateTo);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(customersTable.createdAt, end) as ReturnType<typeof eq>);
  }
  if (status === "active") {
    conditions.push(
      eq(customersTable.status, "active") as ReturnType<typeof eq>,
    );
  } else if (status === "inactive") {
    conditions.push(
      eq(customersTable.status, "inactive") as ReturnType<typeof eq>,
    );
  } else if (status && status !== "all") {
    conditions.push(eq(customersTable.status, status) as ReturnType<typeof eq>);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      code: customersTable.code,
      name: customersTable.name,
      sectorName: sectorsTable.name,
      customerTypeName: customerTypesTable.name,
      city: customersTable.city,
      country: customersTable.country,
      contactEmail: customersTable.contactEmail,
      contactPhone: customersTable.contactPhone,
      status: customersTable.status,
      createdAt: customersTable.createdAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable, eq(customersTable.sectorId, sectorsTable.id))
    .leftJoin(
      customerTypesTable,
      eq(customersTable.customerTypeId, customerTypesTable.id),
    )
    .where(where)
    .orderBy(asc(customersTable.name));

  function escHtml(v: string | null | undefined): string {
    return (v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const generated = now.toISOString().replace("T", " ").slice(0, 16);

  const activeFilters: string[] = [];
  if (search) activeFilters.push(`Zoekopdracht: ${search}`);
  if (status && status !== "all") activeFilters.push(`Status: ${status}`);
  if (city) activeFilters.push(`Stad: ${city}`);
  if (country) activeFilters.push(`Land: ${country}`);
  if (dateFrom) activeFilters.push(`Vanaf: ${dateFrom}`);
  if (dateTo) activeFilters.push(`Tot: ${dateTo}`);

  const filterLine = activeFilters.length
    ? `<p style="margin:0 0 8px;font-size:11px;color:#64748B;">Filters: ${escHtml(activeFilters.join(" · "))}</p>`
    : "";

  const tbody = rows
    .map(
      (r) => `
    <tr>
      <td>${escHtml(r.code)}</td>
      <td>${escHtml(r.name)}</td>
      <td>${escHtml(r.sectorName)}</td>
      <td>${escHtml(r.customerTypeName)}</td>
      <td>${escHtml(r.city)}</td>
      <td>${escHtml(r.country)}</td>
      <td>${escHtml(r.contactEmail)}</td>
      <td>${escHtml(r.contactPhone)}</td>
      <td>${escHtml(r.status)}</td>
      <td>${escHtml(r.createdAt.toISOString().split("T")[0] ?? "")}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <title>Klantenlijst - Fieldgrid</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #081D3A; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #081D3A; }
    .brand span { color: #00B7B3; }
    .meta { text-align: right; font-size: 10px; color: #64748B; }
    h1 { font-size: 14px; font-weight: 700; margin-bottom: 6px; color: #081D3A; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    thead tr { background: #081D3A; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; font-size: 8px; }
    tbody tr:nth-child(even) { background: #F8FAFC; }
    tbody tr { border-bottom: 1px solid #E2E8F0; }
    tbody td { padding: 5px 8px; vertical-align: top; }
    .count { font-size: 10px; color: #64748B; margin-bottom: 4px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="brand">FIELDGRID<span>.</span></div>
    </div>
    <div class="meta">
      <div>Gegenereerd op: ${generated}</div>
    </div>
  </header>
  <h1>Klantenlijst</h1>
  ${filterLine}
  <p class="count">${rows.length} klant${rows.length !== 1 ? "en" : ""}</p>
  <table>
    <thead>
      <tr>
        <th>Code</th><th>Naam</th><th>Sector</th><th>Type</th>
        <th>Stad</th><th>Land</th><th>E-mail</th><th>Telefoon</th>
        <th>Status</th><th>Aangemaakt op</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>
  <script>window.addEventListener("load",()=>{ window.print(); });<\/script>
</body>
</html>`;

  return {
    success: true,
    data: { html, filename: `klanten_${stamp}.pdf` },
  };
}
