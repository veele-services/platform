"use server";

import { revalidatePath } from "next/cache";
import { db } from "@workspace/db";
import {
  auditLogTable,
  objectContactsTable,
  objectsTable,
  sectorsTable,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { getMyCustomerId } from "./customer";

export type CustomerObjectContact = {
  id:        string;
  firstName: string;
  lastName:  string;
  function:  string | null;
  phone:     string | null;
  email:     string | null;
  isPrimary: boolean;
};

export type CustomerObject = {
  id:                  string;
  customerId:          string;
  sectorId:            string | null;
  sectorName:          string | null;
  name:                string;
  code:                string;
  address:             string | null;
  city:                string | null;
  postalCode:          string | null;
  description:         string | null;
  isActive:            boolean;
  contactName:         string | null;
  contactFunction:     string | null;
  contactPhone:        string | null;
  contactEmail:        string | null;
  serviceType:         string | null;
  accessInfo:          string | null;
  keyInfo:             string | null;
  alarmInfo:           string | null;
  fixedInstructions:   string | null;
  specialNotes:        string | null;
};

export type CustomerObjectDetail = CustomerObject & {
  contacts: CustomerObjectContact[];
};

export type CustomerSectorOption = {
  id:   string;
  name: string;
};

export type ObjectMutationState =
  | { success: true; id: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is verplicht.`)
    .max(max, `${label} is te lang.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Deze waarde is te lang.")
    .transform((value) => (value.length > 0 ? value : null));

const optionalEmail = z
  .string()
  .trim()
  .max(255, "E-mailadres is te lang.")
  .refine(
    (value) => value.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "E-mailadres is ongeldig.",
  )
  .transform((value) => (value.length > 0 ? value.toLowerCase() : null));

const objectFormSchema = z.object({
  name:              requiredText("Objectnaam", 255),
  sectorId:          z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null),
  serviceType:       optionalText(100),
  address:           requiredText("Adres", 500),
  postalCode:        requiredText("Postcode", 20),
  city:              requiredText("Plaats", 100),
  contactName:       requiredText("Contactpersoon", 200),
  contactFunction:   optionalText(100),
  contactPhone:      requiredText("Telefoonnummer", 50),
  contactEmail:      optionalEmail,
  accessInfo:        optionalText(2500),
  keyInfo:           optionalText(2500),
  alarmInfo:         optionalText(2500),
  fixedInstructions: optionalText(3500),
  specialNotes:      optionalText(3500),
  description:       optionalText(3500),
});

type ObjectFormValues = z.infer<typeof objectFormSchema>;

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(
    Object.entries(flattened).map(([field, messages]) => [
      field,
      messages?.[0] ?? "Ongeldige invoer.",
    ]),
  );
}

function parseObjectForm(formData: FormData) {
  return objectFormSchema.safeParse({
    name:              formValue(formData, "name"),
    sectorId:          formValue(formData, "sectorId"),
    serviceType:       formValue(formData, "serviceType"),
    address:           formValue(formData, "address"),
    postalCode:        formValue(formData, "postalCode"),
    city:              formValue(formData, "city"),
    contactName:       formValue(formData, "contactName"),
    contactFunction:   formValue(formData, "contactFunction"),
    contactPhone:      formValue(formData, "contactPhone"),
    contactEmail:      formValue(formData, "contactEmail"),
    accessInfo:        formValue(formData, "accessInfo"),
    keyInfo:           formValue(formData, "keyInfo"),
    alarmInfo:         formValue(formData, "alarmInfo"),
    fixedInstructions: formValue(formData, "fixedInstructions"),
    specialNotes:      formValue(formData, "specialNotes"),
    description:       formValue(formData, "description"),
  });
}

function splitContactName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? name.trim();
  const lastName = parts.join(" ") || "-";
  return { firstName, lastName };
}

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const customerId = await getMyCustomerId();

  if (!user?.id || !customerId) {
    return null;
  }

  return { userId: user.id, customerId };
}

function buildObjectPayload(data: ObjectFormValues, customerId: string, userId?: string) {
  return {
    customerId,
    sectorId:          data.sectorId,
    name:              data.name,
    address:           data.address,
    city:              data.city,
    postalCode:        data.postalCode,
    description:       data.description,
    contactName:       data.contactName,
    contactFunction:   data.contactFunction,
    contactPhone:      data.contactPhone,
    contactEmail:      data.contactEmail,
    serviceType:       data.serviceType,
    accessInfo:        data.accessInfo,
    keyInfo:           data.keyInfo,
    alarmInfo:         data.alarmInfo,
    fixedInstructions: data.fixedInstructions,
    specialNotes:      data.specialNotes,
    ...(userId ? { createdBy: userId } : {}),
  };
}

async function upsertPrimaryContact(objectId: string, data: ObjectFormValues) {
  const { firstName, lastName } = splitContactName(data.contactName);
  const contactPayload = {
    firstName,
    lastName,
    function:  data.contactFunction,
    phone:     data.contactPhone,
    email:     data.contactEmail,
    isPrimary: true,
  };

  const [primaryContact] = await db
    .select({ id: objectContactsTable.id })
    .from(objectContactsTable)
    .where(and(eq(objectContactsTable.objectId, objectId), eq(objectContactsTable.isPrimary, true)))
    .limit(1);

  if (primaryContact) {
    await db
      .update(objectContactsTable)
      .set(contactPayload)
      .where(eq(objectContactsTable.id, primaryContact.id));
    return;
  }

  await db.insert(objectContactsTable).values({
    objectId,
    ...contactPayload,
  });
}

export async function getMyObjects(): Promise<CustomerObject[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  return db
    .select({
      id:                objectsTable.id,
      customerId:        objectsTable.customerId,
      sectorId:          objectsTable.sectorId,
      sectorName:        sectorsTable.name,
      name:              objectsTable.name,
      code:              objectsTable.code,
      address:           objectsTable.address,
      city:              objectsTable.city,
      postalCode:        objectsTable.postalCode,
      description:       objectsTable.description,
      isActive:          objectsTable.isActive,
      contactName:       objectsTable.contactName,
      contactFunction:   objectsTable.contactFunction,
      contactPhone:      objectsTable.contactPhone,
      contactEmail:      objectsTable.contactEmail,
      serviceType:       objectsTable.serviceType,
      accessInfo:        objectsTable.accessInfo,
      keyInfo:           objectsTable.keyInfo,
      alarmInfo:         objectsTable.alarmInfo,
      fixedInstructions: objectsTable.fixedInstructions,
      specialNotes:      objectsTable.specialNotes,
    })
    .from(objectsTable)
    .leftJoin(sectorsTable, eq(objectsTable.sectorId, sectorsTable.id))
    .where(eq(objectsTable.customerId, customerId))
    .orderBy(desc(objectsTable.isActive), asc(objectsTable.name));
}

export async function getMyObject(objectId: string): Promise<CustomerObjectDetail | null> {
  const customerId = await getMyCustomerId();
  if (!customerId) return null;

  const [object] = await db
    .select({
      id:                objectsTable.id,
      customerId:        objectsTable.customerId,
      sectorId:          objectsTable.sectorId,
      sectorName:        sectorsTable.name,
      name:              objectsTable.name,
      code:              objectsTable.code,
      address:           objectsTable.address,
      city:              objectsTable.city,
      postalCode:        objectsTable.postalCode,
      description:       objectsTable.description,
      isActive:          objectsTable.isActive,
      contactName:       objectsTable.contactName,
      contactFunction:   objectsTable.contactFunction,
      contactPhone:      objectsTable.contactPhone,
      contactEmail:      objectsTable.contactEmail,
      serviceType:       objectsTable.serviceType,
      accessInfo:        objectsTable.accessInfo,
      keyInfo:           objectsTable.keyInfo,
      alarmInfo:         objectsTable.alarmInfo,
      fixedInstructions: objectsTable.fixedInstructions,
      specialNotes:      objectsTable.specialNotes,
    })
    .from(objectsTable)
    .leftJoin(sectorsTable, eq(objectsTable.sectorId, sectorsTable.id))
    .where(and(eq(objectsTable.id, objectId), eq(objectsTable.customerId, customerId)))
    .limit(1);

  if (!object) return null;

  const contacts = await db
    .select({
      id:        objectContactsTable.id,
      firstName: objectContactsTable.firstName,
      lastName:  objectContactsTable.lastName,
      function:  objectContactsTable.function,
      phone:     objectContactsTable.phone,
      email:     objectContactsTable.email,
      isPrimary: objectContactsTable.isPrimary,
    })
    .from(objectContactsTable)
    .where(eq(objectContactsTable.objectId, objectId))
    .orderBy(desc(objectContactsTable.isPrimary), asc(objectContactsTable.lastName));

  return { ...object, contacts };
}

export async function getCustomerObjectSectors(): Promise<CustomerSectorOption[]> {
  return db
    .select({
      id:   sectorsTable.id,
      name: sectorsTable.name,
    })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

export async function createCustomerObject(
  _prev: ObjectMutationState,
  formData: FormData,
): Promise<ObjectMutationState> {
  const context = await getAuthenticatedContext();
  if (!context) {
    return { success: false, error: "Geen klantprofiel gevonden voor dit account." };
  }

  const parsed = parseObjectForm(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Controleer de gemarkeerde velden.",
      fieldErrors: firstFieldErrors(parsed.error),
    };
  }

  try {
    const [created] = await db
      .insert(objectsTable)
      .values(buildObjectPayload(parsed.data, context.customerId, context.userId))
      .returning({ id: objectsTable.id });

    if (!created) {
      return { success: false, error: "Object kon niet worden aangemaakt." };
    }

    await upsertPrimaryContact(created.id, parsed.data);

    await db.insert(auditLogTable).values({
      userId:     context.userId,
      action:     "customer_create_object",
      resource:   "objects",
      resourceId: created.id,
      metadata:   { customerId: context.customerId, name: parsed.data.name },
    });

    revalidatePath("/");
    revalidatePath("/objecten");
    revalidatePath(`/objecten/${created.id}`);

    return { success: true, id: created.id };
  } catch (error) {
    console.error("createCustomerObject failed", error);
    return { success: false, error: "Object kon niet worden opgeslagen." };
  }
}

export async function updateCustomerObject(
  objectId: string,
  _prev: ObjectMutationState,
  formData: FormData,
): Promise<ObjectMutationState> {
  const context = await getAuthenticatedContext();
  if (!context) {
    return { success: false, error: "Geen klantprofiel gevonden voor dit account." };
  }

  const parsed = parseObjectForm(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Controleer de gemarkeerde velden.",
      fieldErrors: firstFieldErrors(parsed.error),
    };
  }

  const [existing] = await db
    .select({ id: objectsTable.id })
    .from(objectsTable)
    .where(and(eq(objectsTable.id, objectId), eq(objectsTable.customerId, context.customerId)))
    .limit(1);

  if (!existing) {
    return { success: false, error: "Object niet gevonden of geen toegang." };
  }

  try {
    const [updated] = await db
      .update(objectsTable)
      .set(buildObjectPayload(parsed.data, context.customerId))
      .where(and(eq(objectsTable.id, objectId), eq(objectsTable.customerId, context.customerId)))
      .returning({ id: objectsTable.id });

    if (!updated) {
      return { success: false, error: "Object kon niet worden bijgewerkt." };
    }

    await upsertPrimaryContact(objectId, parsed.data);

    await db.insert(auditLogTable).values({
      userId:     context.userId,
      action:     "customer_update_object",
      resource:   "objects",
      resourceId: objectId,
      metadata:   { customerId: context.customerId, name: parsed.data.name },
    });

    revalidatePath("/");
    revalidatePath("/objecten");
    revalidatePath(`/objecten/${objectId}`);

    return { success: true, id: objectId };
  } catch (error) {
    console.error("updateCustomerObject failed", error);
    return { success: false, error: "Object kon niet worden opgeslagen." };
  }
}
