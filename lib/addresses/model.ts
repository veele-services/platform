import { z } from "zod";

export const addressSchema = z.object({
  street_name: z.string().trim().max(200).default(""),
  house_number: z
    .string()
    .trim()
    .regex(/^\d{0,8}$/)
    .default(""),
  house_letter: z.string().trim().max(4).default(""),
  house_addition: z.string().trim().max(20).default(""),
  postal_code: z.string().trim().max(16).default(""),
  city: z.string().trim().max(120).default(""),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("NL"),
  street: z.string().max(240).default(""),
  formatted: z.string().max(500).default(""),
  source: z.enum(["pdok", "manual", "legacy"]).default("manual"),
  source_id: z.string().max(100).nullable().default(null),
  bag_id: z.string().max(40).nullable().default(null),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  located_at: z.string().datetime().nullable().default(null),
  status: z
    .enum(["confirmed", "needs_review", "missing", "unusable"])
    .default("missing"),
});
export type Address = z.infer<typeof addressSchema>;
export type Point = [number, number]; // WGS84: longitude, latitude.
export const emptyAddress = (): Address => addressSchema.parse({});
export function addressText(a: Partial<Address>) {
  const street = [
    a.street_name,
    [a.house_number, a.house_letter].filter(Boolean).join(""),
    a.house_addition,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    street,
    formatted: [
      street,
      [a.postal_code, a.city].filter(Boolean).join(" "),
      a.country && a.country !== "NL" ? a.country : "",
    ]
      .filter(Boolean)
      .join(", "),
  };
}
export function normalizeAddress(value: unknown): Address {
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (typeof v.street_name === "string") {
    const parsed = addressSchema.safeParse(v);
    if (parsed.success) return { ...parsed.data, ...addressText(parsed.data) };
  }
  // Keep old free-form text intact. Never guess a house suffix or location.
  const a = {
    ...emptyAddress(),
    street_name: typeof v.street === "string" ? v.street : "",
    postal_code: String(v.postal_code || v.postalCode || ""),
    city: String(v.city || ""),
    source: "legacy" as const,
  };
  return {
    ...a,
    ...addressText(a),
    status:
      a.street_name || a.postal_code || a.city ? "needs_review" : "missing",
  };
}
export function location(a: Address): Point | null {
  return a.status === "confirmed" &&
    a.located_at &&
    a.latitude !== null &&
    a.longitude !== null
    ? [a.longitude, a.latitude]
    : null;
}
export function changeAddress(a: Address, fields: Partial<Address>): Address {
  const next = {
    ...a,
    ...fields,
    source: "manual" as const,
    source_id: null,
    bag_id: null,
    latitude: null,
    longitude: null,
    located_at: null,
    status: "needs_review" as const,
  };
  return { ...next, ...addressText(next) };
}
export const addressStatus = {
  confirmed: "Locatie beschikbaar voor routeberekening",
  needs_review: "Adres controleren: selecteer het juiste zoekresultaat",
  missing: "Adres ontbreekt",
  unusable: "Geen bruikbare locatie beschikbaar",
};
