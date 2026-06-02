import { Router, type IRouter } from "express";
import { eq, asc, desc, and } from "drizzle-orm";
import {
  db,
  customerTypesTable,
  customerContactsTable,
  customersTable,
  sectorsTable,
  personnelTable,
} from "@workspace/db";
import {
  GetCustomerResponse,
  UpdateCustomerBody,
  UpdateCustomerResponse,
  ListCustomerTypesResponse,
  ListCustomerContactsResponse,
  ListCustomerContactsResponseItem,
  CreateCustomerContactBody,
  UpdateCustomerContactBody,
  UpdateCustomerContactResponse,
} from "@workspace/api-zod";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

// Every route in this router requires a valid Supabase JWT
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// ─── Customers ─────────────────────────────────────────────────────────────────

router.get("/customers/:id", requirePermission("customers", "read"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!id || !isUuid(id)) {
    res.status(400).json({ error: "id must be a valid UUID" });
    return;
  }

  const rows = await db
    .select({
      id:                      customersTable.id,
      name:                    customersTable.name,
      code:                    customersTable.code,
      sectorId:                customersTable.sectorId,
      sectorName:              sectorsTable.name,
      address:                 customersTable.address,
      city:                    customersTable.city,
      postalCode:              customersTable.postalCode,
      country:                 customersTable.country,
      contactName:             customersTable.contactName,
      contactEmail:            customersTable.contactEmail,
      contactPhone:            customersTable.contactPhone,
      legalEntity:             customersTable.legalEntity,
      vatNumber:               customersTable.vatNumber,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      website:                 customersTable.website,
      mobile:                  customersTable.mobile,
      customerTypeId:          customersTable.customerTypeId,
      customerTypeName:        customerTypesTable.name,
      status:                  customersTable.status,
      accountManagerId:        customersTable.accountManagerId,
      accountManagerFirstName: personnelTable.firstName,
      accountManagerLastName:  personnelTable.lastName,
      isActive:                customersTable.isActive,
      createdAt:               customersTable.createdAt,
      updatedAt:               customersTable.updatedAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable,       eq(customersTable.sectorId,          sectorsTable.id))
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId,    customerTypesTable.id))
    .leftJoin(personnelTable,     eq(customersTable.accountManagerId,  personnelTable.id))
    .where(eq(customersTable.id, id))
    .limit(1);

  if (!rows[0]) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const r = rows[0];
  const accountManagerName =
    r.accountManagerFirstName || r.accountManagerLastName
      ? `${r.accountManagerFirstName ?? ""} ${r.accountManagerLastName ?? ""}`.trim()
      : null;

  res.json(
    GetCustomerResponse.parse({
      id:                      r.id,
      name:                    r.name,
      code:                    r.code,
      sectorId:                r.sectorId,
      sectorName:              r.sectorName,
      address:                 r.address,
      city:                    r.city,
      postalCode:              r.postalCode,
      country:                 r.country,
      contactName:             r.contactName,
      contactEmail:            r.contactEmail,
      contactPhone:            r.contactPhone,
      legalEntity:             r.legalEntity,
      vatNumber:               r.vatNumber,
      chamberOfCommerceNumber: r.chamberOfCommerceNumber,
      website:                 r.website,
      mobile:                  r.mobile,
      customerTypeId:          r.customerTypeId,
      customerTypeName:        r.customerTypeName,
      status:                  r.status,
      accountManagerId:        r.accountManagerId,
      accountManagerName,
      isActive:                r.isActive,
      createdAt:               r.createdAt.toISOString(),
      updatedAt:               r.updatedAt.toISOString(),
    }),
  );
});

router.patch("/customers/:id", requirePermission("customers", "write"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!id || !isUuid(id)) {
    res.status(400).json({ error: "id must be a valid UUID" });
    return;
  }

  const [existing] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(eq(customersTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name                   !== undefined) patch.name                   = data.name.trim();
  if (data.sectorId               !== undefined) patch.sectorId               = data.sectorId     || null;
  if (data.contactName            !== undefined) patch.contactName            = data.contactName?.trim() || null;
  if (data.contactEmail           !== undefined) patch.contactEmail           = data.contactEmail?.trim() || null;
  if (data.contactPhone           !== undefined) patch.contactPhone           = data.contactPhone?.trim() || null;
  if (data.address                !== undefined) patch.address                = data.address?.trim() || null;
  if (data.city                   !== undefined) patch.city                   = data.city?.trim() || null;
  if (data.postalCode             !== undefined) patch.postalCode             = data.postalCode?.trim() || null;
  if (data.country                !== undefined) patch.country                = data.country?.trim() || "NL";
  if (data.legalEntity            !== undefined) patch.legalEntity            = data.legalEntity?.trim() || null;
  if (data.vatNumber              !== undefined) patch.vatNumber              = data.vatNumber?.trim() || null;
  if (data.chamberOfCommerceNumber !== undefined) patch.chamberOfCommerceNumber = data.chamberOfCommerceNumber?.trim() || null;
  if (data.website                !== undefined) patch.website                = data.website?.trim() || null;
  if (data.mobile                 !== undefined) patch.mobile                 = data.mobile?.trim() || null;
  if (data.customerTypeId         !== undefined) patch.customerTypeId         = data.customerTypeId || null;
  if (data.accountManagerId       !== undefined) patch.accountManagerId       = data.accountManagerId || null;
  if (data.status                 !== undefined) {
    patch.status   = data.status;
    patch.isActive = data.status === "active" || data.status === "lead" || data.status === "prospect";
  }

  await db.update(customersTable).set(patch).where(eq(customersTable.id, id));

  const rows = await db
    .select({
      id:                      customersTable.id,
      name:                    customersTable.name,
      code:                    customersTable.code,
      sectorId:                customersTable.sectorId,
      sectorName:              sectorsTable.name,
      address:                 customersTable.address,
      city:                    customersTable.city,
      postalCode:              customersTable.postalCode,
      country:                 customersTable.country,
      contactName:             customersTable.contactName,
      contactEmail:            customersTable.contactEmail,
      contactPhone:            customersTable.contactPhone,
      legalEntity:             customersTable.legalEntity,
      vatNumber:               customersTable.vatNumber,
      chamberOfCommerceNumber: customersTable.chamberOfCommerceNumber,
      website:                 customersTable.website,
      mobile:                  customersTable.mobile,
      customerTypeId:          customersTable.customerTypeId,
      customerTypeName:        customerTypesTable.name,
      status:                  customersTable.status,
      accountManagerId:        customersTable.accountManagerId,
      accountManagerFirstName: personnelTable.firstName,
      accountManagerLastName:  personnelTable.lastName,
      isActive:                customersTable.isActive,
      createdAt:               customersTable.createdAt,
      updatedAt:               customersTable.updatedAt,
    })
    .from(customersTable)
    .leftJoin(sectorsTable,       eq(customersTable.sectorId,          sectorsTable.id))
    .leftJoin(customerTypesTable, eq(customersTable.customerTypeId,    customerTypesTable.id))
    .leftJoin(personnelTable,     eq(customersTable.accountManagerId,  personnelTable.id))
    .where(eq(customersTable.id, id))
    .limit(1);

  const r = rows[0]!;
  const accountManagerName =
    r.accountManagerFirstName || r.accountManagerLastName
      ? `${r.accountManagerFirstName ?? ""} ${r.accountManagerLastName ?? ""}`.trim()
      : null;

  res.json(
    UpdateCustomerResponse.parse({
      id:                      r.id,
      name:                    r.name,
      code:                    r.code,
      sectorId:                r.sectorId,
      sectorName:              r.sectorName,
      address:                 r.address,
      city:                    r.city,
      postalCode:              r.postalCode,
      country:                 r.country,
      contactName:             r.contactName,
      contactEmail:            r.contactEmail,
      contactPhone:            r.contactPhone,
      legalEntity:             r.legalEntity,
      vatNumber:               r.vatNumber,
      chamberOfCommerceNumber: r.chamberOfCommerceNumber,
      website:                 r.website,
      mobile:                  r.mobile,
      customerTypeId:          r.customerTypeId,
      customerTypeName:        r.customerTypeName,
      status:                  r.status,
      accountManagerId:        r.accountManagerId,
      accountManagerName,
      isActive:                r.isActive,
      createdAt:               r.createdAt.toISOString(),
      updatedAt:               r.updatedAt.toISOString(),
    }),
  );
});

// ─── Customer Types ────────────────────────────────────────────────────────────

router.get("/customer-types", requirePermission("customers", "read"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id:       customerTypesTable.id,
      name:     customerTypesTable.name,
      slug:     customerTypesTable.slug,
      isActive: customerTypesTable.isActive,
    })
    .from(customerTypesTable)
    .where(eq(customerTypesTable.isActive, true))
    .orderBy(asc(customerTypesTable.name));

  res.json(ListCustomerTypesResponse.parse(rows));
});

// ─── Customer Contacts ─────────────────────────────────────────────────────────

router.get("/customers/:customerId/contacts", requirePermission("customers", "read"), async (req, res): Promise<void> => {
  const customerId = Array.isArray(req.params.customerId)
    ? req.params.customerId[0]
    : req.params.customerId;

  if (!customerId || !isUuid(customerId)) {
    res.status(400).json({ error: "customerId must be a valid UUID" });
    return;
  }

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .limit(1);

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const contacts = await db
    .select({
      id:                 customerContactsTable.id,
      customerId:         customerContactsTable.customerId,
      firstName:          customerContactsTable.firstName,
      lastName:           customerContactsTable.lastName,
      function:           customerContactsTable.function,
      email:              customerContactsTable.email,
      phone:              customerContactsTable.phone,
      mobile:             customerContactsTable.mobile,
      preferredComm:      customerContactsTable.preferredComm,
      isEmergencyContact: customerContactsTable.isEmergencyContact,
      isPrimary:          customerContactsTable.isPrimary,
    })
    .from(customerContactsTable)
    .where(eq(customerContactsTable.customerId, customerId))
    .orderBy(desc(customerContactsTable.isPrimary), asc(customerContactsTable.firstName));

  res.json(ListCustomerContactsResponse.parse(contacts));
});

router.post("/customers/:customerId/contacts", requirePermission("customers", "write"), async (req, res): Promise<void> => {
  const customerId = Array.isArray(req.params.customerId)
    ? req.params.customerId[0]
    : req.params.customerId;

  if (!customerId || !isUuid(customerId)) {
    res.status(400).json({ error: "customerId must be a valid UUID" });
    return;
  }

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .limit(1);

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const parsed = CreateCustomerContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

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
      firstName:          data.firstName,
      lastName:           data.lastName,
      function:           data.function      ?? null,
      email:              data.email         ?? null,
      phone:              data.phone         ?? null,
      mobile:             data.mobile        ?? null,
      preferredComm:      data.preferredComm ?? null,
      isEmergencyContact: data.isEmergencyContact ?? false,
      isPrimary:          data.isPrimary          ?? false,
    })
    .returning({
      id:                 customerContactsTable.id,
      customerId:         customerContactsTable.customerId,
      firstName:          customerContactsTable.firstName,
      lastName:           customerContactsTable.lastName,
      function:           customerContactsTable.function,
      email:              customerContactsTable.email,
      phone:              customerContactsTable.phone,
      mobile:             customerContactsTable.mobile,
      preferredComm:      customerContactsTable.preferredComm,
      isEmergencyContact: customerContactsTable.isEmergencyContact,
      isPrimary:          customerContactsTable.isPrimary,
    });

  res.status(201).json(ListCustomerContactsResponseItem.parse(created));
});

router.patch("/customers/:customerId/contacts/:id", requirePermission("customers", "write"), async (req, res): Promise<void> => {
  const customerId = Array.isArray(req.params.customerId)
    ? req.params.customerId[0]
    : req.params.customerId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!customerId || !isUuid(customerId) || !id || !isUuid(id)) {
    res.status(400).json({ error: "customerId and id must be valid UUIDs" });
    return;
  }

  const [existing] = await db
    .select({ id: customerContactsTable.id })
    .from(customerContactsTable)
    .where(
      and(
        eq(customerContactsTable.id, id),
        eq(customerContactsTable.customerId, customerId),
      ),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const parsed = UpdateCustomerContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

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

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName           !== undefined) patch.firstName           = data.firstName;
  if (data.lastName            !== undefined) patch.lastName            = data.lastName;
  if (data.function            !== undefined) patch.function            = data.function ?? null;
  if (data.email               !== undefined) patch.email               = data.email    ?? null;
  if (data.phone               !== undefined) patch.phone               = data.phone    ?? null;
  if (data.mobile              !== undefined) patch.mobile              = data.mobile   ?? null;
  if (data.preferredComm       !== undefined) patch.preferredComm       = data.preferredComm ?? null;
  if (data.isEmergencyContact  !== undefined) patch.isEmergencyContact  = data.isEmergencyContact;
  if (data.isPrimary           !== undefined) patch.isPrimary           = data.isPrimary;

  const [updated] = await db
    .update(customerContactsTable)
    .set(patch)
    .where(eq(customerContactsTable.id, id))
    .returning({
      id:                 customerContactsTable.id,
      customerId:         customerContactsTable.customerId,
      firstName:          customerContactsTable.firstName,
      lastName:           customerContactsTable.lastName,
      function:           customerContactsTable.function,
      email:              customerContactsTable.email,
      phone:              customerContactsTable.phone,
      mobile:             customerContactsTable.mobile,
      preferredComm:      customerContactsTable.preferredComm,
      isEmergencyContact: customerContactsTable.isEmergencyContact,
      isPrimary:          customerContactsTable.isPrimary,
    });

  res.json(UpdateCustomerContactResponse.parse(updated));
});

router.delete("/customers/:customerId/contacts/:id", requirePermission("customers", "write"), async (req, res): Promise<void> => {
  const customerId = Array.isArray(req.params.customerId)
    ? req.params.customerId[0]
    : req.params.customerId;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!customerId || !isUuid(customerId) || !id || !isUuid(id)) {
    res.status(400).json({ error: "customerId and id must be valid UUIDs" });
    return;
  }

  const [deleted] = await db
    .delete(customerContactsTable)
    .where(
      and(
        eq(customerContactsTable.id, id),
        eq(customerContactsTable.customerId, customerId),
      ),
    )
    .returning({ id: customerContactsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
