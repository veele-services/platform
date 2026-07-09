import {
  maskAddress,
  maskEmail,
  maskName,
  maskPaymentProviderId,
  maskPhone,
  maskReference,
} from "@workspace/db";
import type { SensitiveRuntimeDecision } from "@/lib/security/sensitive-runtime";

type AnyRecord = Record<string, unknown>;

function hasSensitivePlatformMask(decision: SensitiveRuntimeDecision | null | undefined): boolean {
  return Boolean(decision?.role?.startsWith("platform_") && decision.masked);
}

export function toPlatformCustomerMaskedDto<T extends AnyRecord>(
  row: T,
  decision?: SensitiveRuntimeDecision | null,
): T {
  if (!hasSensitivePlatformMask(decision)) return row;
  return {
    ...row,
    name: typeof row.name === "string" ? maskName(row.name) : row.name,
    contactName: typeof row.contactName === "string" ? maskName(row.contactName) : row.contactName,
    contactEmail: typeof row.contactEmail === "string" ? maskEmail(row.contactEmail) : row.contactEmail,
    contactPhone: typeof row.contactPhone === "string" ? maskPhone(row.contactPhone) : row.contactPhone,
    mobile: typeof row.mobile === "string" ? maskPhone(row.mobile) : row.mobile,
    addressStreet: typeof row.addressStreet === "string" ? "Adres verborgen" : row.addressStreet,
    addressPostalCode: row.addressPostalCode ? maskReference(String(row.addressPostalCode)) : row.addressPostalCode,
    addressCity: typeof row.addressCity === "string" ? row.addressCity : row.addressCity,
    addressLatitude: row.addressLatitude ? null : row.addressLatitude,
    addressLongitude: row.addressLongitude ? null : row.addressLongitude,
    address: maskAddress({
      street: typeof row.address === "string" ? row.address : null,
      city: typeof row.city === "string" ? row.city : null,
      postalCode: typeof row.postalCode === "string" ? row.postalCode : null,
    }),
    postalCode: row.postalCode ? maskReference(String(row.postalCode)) : row.postalCode,
    legalEntity: row.legalEntity ? maskName(String(row.legalEntity)) : row.legalEntity,
    vatNumber: row.vatNumber ? maskReference(String(row.vatNumber)) : row.vatNumber,
    chamberOfCommerceNumber: row.chamberOfCommerceNumber ? maskReference(String(row.chamberOfCommerceNumber)) : row.chamberOfCommerceNumber,
    notes: row.notes ? "[REDACTED]" : row.notes,
  } as T;
}

export function toPlatformCustomerContactMaskedDto<T extends AnyRecord>(
  row: T,
  decision?: SensitiveRuntimeDecision | null,
): T {
  if (!hasSensitivePlatformMask(decision)) return row;
  return {
    ...row,
    firstName: typeof row.firstName === "string" ? maskName(row.firstName) : row.firstName,
    lastName: typeof row.lastName === "string" ? maskName(row.lastName) : row.lastName,
    email: typeof row.email === "string" ? maskEmail(row.email) : row.email,
    phone: typeof row.phone === "string" ? maskPhone(row.phone) : row.phone,
    mobile: typeof row.mobile === "string" ? maskPhone(row.mobile) : row.mobile,
  } as T;
}

export function toPlatformPersonnelMaskedDto<T extends AnyRecord>(
  row: T,
  decision?: SensitiveRuntimeDecision | null,
): T {
  if (!hasSensitivePlatformMask(decision)) return row;
  const fullName = typeof row.name === "string"
    ? row.name
    : [row.firstName, row.lastName].filter((value) => typeof value === "string").join(" ");
  return {
    ...row,
    name: fullName ? maskName(fullName) : row.name,
    firstName: typeof row.firstName === "string" ? maskName(row.firstName) : row.firstName,
    lastName: typeof row.lastName === "string" ? maskName(row.lastName) : row.lastName,
    email: typeof row.email === "string" ? maskEmail(row.email) : row.email,
    phone: typeof row.phone === "string" ? maskPhone(row.phone) : row.phone,
    mobile: typeof row.mobile === "string" ? maskPhone(row.mobile) : row.mobile,
    address: maskAddress({
      street: typeof row.address === "string" ? row.address : null,
      city: typeof row.city === "string" ? row.city : null,
      postalCode: typeof row.postalCode === "string" ? row.postalCode : null,
    }),
    postalCode: row.postalCode ? maskReference(String(row.postalCode)) : row.postalCode,
    dateOfBirth: row.dateOfBirth ? "[REDACTED]" : row.dateOfBirth,
    emergencyContact: row.emergencyContact ? "[REDACTED]" : row.emergencyContact,
    contractInfo: row.contractInfo ? "[REDACTED]" : row.contractInfo,
    notes: row.notes ? "[REDACTED]" : row.notes,
  } as T;
}

export function toPlatformInvoiceMetadataDto<T extends AnyRecord>(
  row: T,
  decision?: SensitiveRuntimeDecision | null,
): T {
  if (!hasSensitivePlatformMask(decision)) return row;
  return {
    ...row,
    customerName: row.customerName ? maskName(String(row.customerName)) : row.customerName,
    customerEmail: row.customerEmail ? maskEmail(String(row.customerEmail)) : row.customerEmail,
    customerAddress: row.customerAddress ? "[REDACTED]" : row.customerAddress,
    customerPostalCode: row.customerPostalCode ? maskReference(String(row.customerPostalCode)) : row.customerPostalCode,
    customerCity: row.customerCity ? String(row.customerCity) : row.customerCity,
    notes: row.notes ? "[REDACTED]" : row.notes,
    molliePaymentId: row.molliePaymentId ? maskPaymentProviderId(String(row.molliePaymentId)) : row.molliePaymentId,
    checkoutUrl: row.checkoutUrl ? null : row.checkoutUrl,
  } as T;
}

export function toPlatformPaymentDiagnosticDto<T extends AnyRecord>(
  row: T,
  decision?: SensitiveRuntimeDecision | null,
): T {
  if (!hasSensitivePlatformMask(decision)) return row;
  return {
    ...row,
    molliePaymentId: row.molliePaymentId ? maskPaymentProviderId(String(row.molliePaymentId)) : row.molliePaymentId,
    checkoutUrl: row.checkoutUrl ? null : row.checkoutUrl,
    providerPayload: row.providerPayload ? "[REDACTED]" : row.providerPayload,
    customerEmail: row.customerEmail ? maskEmail(String(row.customerEmail)) : row.customerEmail,
    customerName: row.customerName ? maskName(String(row.customerName)) : row.customerName,
  } as T;
}

export function toTenantFinanceInvoiceDto<T extends AnyRecord>(row: T): T {
  return {
    ...row,
    checkoutUrl: row.checkoutUrl ? null : row.checkoutUrl,
  } as T;
}
