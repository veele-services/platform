"use server";

import { db } from "@workspace/db";
import { objectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMyCustomerId } from "./customer";

export type CustomerObject = {
  id:          string;
  name:        string;
  address:     string | null;
  city:        string | null;
  postalCode:  string | null;
  description: string | null;
};

export async function getMyObjects(): Promise<CustomerObject[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  const rows = await db
    .select({
      id:          objectsTable.id,
      name:        objectsTable.name,
      address:     objectsTable.address,
      city:        objectsTable.city,
      postalCode:  objectsTable.postalCode,
      description: objectsTable.description,
    })
    .from(objectsTable)
    .where(eq(objectsTable.customerId, customerId));

  return rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    address:     r.address,
    city:        r.city,
    postalCode:  r.postalCode,
    description: r.description,
  }));
}
