"use server";

import {
  db,
  objectsTable,
  customersTable,
  sectorsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ObjectDetail } from "./objects";

const FALLBACK_ISO = new Date(0).toISOString();

function toIso(value: unknown): string {
  if (!value) return FALLBACK_ISO;

  const date = value instanceof Date
    ? value
    : new Date(
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? `${value}T00:00:00`
          : String(value),
      );

  return Number.isNaN(date.getTime()) ? FALLBACK_ISO : date.toISOString();
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (
          item &&
          typeof item === "object" &&
          "name" in item &&
          typeof item.name === "string"
        ) {
          return item.name.trim();
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

export async function getObjectForDetailPage(id: string): Promise<ObjectDetail | null> {
  await requirePermission("objects", "read");
  const tenantId = await requireCurrentTenantId();

  const [row] = await db
    .select({
      id:                   objectsTable.id,
      customerId:           objectsTable.customerId,
      customerName:         customersTable.name,
      customerCode:         customersTable.code,
      sectorId:             objectsTable.sectorId,
      sectorName:           sectorsTable.name,
      name:                 objectsTable.name,
      code:                 objectsTable.code,
      address:              objectsTable.address,
      city:                 objectsTable.city,
      postalCode:           objectsTable.postalCode,
      latitude:             objectsTable.latitude,
      longitude:            objectsTable.longitude,
      geocodedAt:           objectsTable.geocodedAt,
      geocodingProvider:    objectsTable.geocodingProvider,
      geocodingStatus:      objectsTable.geocodingStatus,
      geocodingConfidence:  objectsTable.geocodingConfidence,
      geocodingError:       objectsTable.geocodingError,
      description:          objectsTable.description,
      contactName:          objectsTable.contactName,
      contactFunction:      objectsTable.contactFunction,
      contactPhone:         objectsTable.contactPhone,
      contactEmail:         objectsTable.contactEmail,
      serviceType:          objectsTable.serviceType,
      accessInfo:           objectsTable.accessInfo,
      keyInfo:              objectsTable.keyInfo,
      alarmInfo:            objectsTable.alarmInfo,
      fixedInstructions:    objectsTable.fixedInstructions,
      specialNotes:         objectsTable.specialNotes,
      requiredRoles:        objectsTable.requiredRoles,
      requiredCertificates: objectsTable.requiredCertificates,
      isActive:             objectsTable.isActive,
      createdAt:            objectsTable.createdAt,
      updatedAt:            objectsTable.updatedAt,
    })
    .from(objectsTable)
    .leftJoin(customersTable, eq(objectsTable.customerId, customersTable.id))
    .leftJoin(sectorsTable, eq(objectsTable.sectorId, sectorsTable.id))
    .where(and(eq(objectsTable.id, id), eq(objectsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  return {
    id:                   row.id,
    customerId:           row.customerId,
    customerName:         asNullableString(row.customerName),
    customerCode:         asNullableString(row.customerCode),
    sectorId:             row.sectorId ?? null,
    sectorName:           asNullableString(row.sectorName),
    name:                 asString(row.name, "Object"),
    code:                 asString(row.code, ""),
    address:              asNullableString(row.address),
    city:                 asNullableString(row.city),
    postalCode:           asNullableString(row.postalCode),
    latitude:             asNullableString(row.latitude),
    longitude:            asNullableString(row.longitude),
    geocodedAt:           row.geocodedAt ? toIso(row.geocodedAt) : null,
    geocodingProvider:    asNullableString(row.geocodingProvider),
    geocodingStatus:      asString(row.geocodingStatus, "pending"),
    geocodingConfidence:  asNullableString(row.geocodingConfidence),
    geocodingError:       asNullableString(row.geocodingError),
    description:          asNullableString(row.description),
    contactName:          asNullableString(row.contactName),
    contactFunction:      asNullableString(row.contactFunction),
    contactPhone:         asNullableString(row.contactPhone),
    contactEmail:         asNullableString(row.contactEmail),
    serviceType:          asNullableString(row.serviceType),
    accessInfo:           asNullableString(row.accessInfo),
    keyInfo:              asNullableString(row.keyInfo),
    alarmInfo:            asNullableString(row.alarmInfo),
    fixedInstructions:    asNullableString(row.fixedInstructions),
    specialNotes:         asNullableString(row.specialNotes),
    requiredRoles:        asStringArray(row.requiredRoles),
    requiredCertificates: asStringArray(row.requiredCertificates),
    isActive:             row.isActive !== false,
    createdAt:            toIso(row.createdAt),
    updatedAt:            toIso(row.updatedAt ?? row.createdAt),
  };
}
