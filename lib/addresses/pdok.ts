import "server-only";
import { addressSchema, addressText, type Address } from "./model";

export const PDOK_BASE = "https://api.pdok.nl/kadaster/location-api/v1";
const BAG_BASE =
  "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items/";
type Feature = {
  id?: string;
  geometry?: { type: string; coordinates: number[] };
  properties?: Record<string, unknown>;
};
export async function searchAddresses(query: string) {
  const params = new URLSearchParams({
    q: query,
    "adres[version]": "1",
    limit: "8",
    f: "json",
    crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
  });
  const response = await fetch(`${PDOK_BASE}/search?${params}`, {
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Adres zoeken tijdelijk niet beschikbaar. Je kunt handmatig invoeren.",
    );
  const body = (await response.json()) as { features?: Feature[] };
  return (body.features || [])
    .filter(
      (f) =>
        f.properties?.collection_id === "adres" &&
        /^[a-f0-9-]{36}$/.test(f.id || ""),
    )
    .map((f) => ({
      id: f.id!,
      label: String(f.properties?.display_name || ""),
    }));
}
export function addressFromFeature(feature: Feature): Address {
  const p = feature.properties || {},
    c = feature.geometry?.coordinates;
  if (
    feature.geometry?.type !== "Point" ||
    !c ||
    c.length < 2 ||
    !c.every(Number.isFinite)
  )
    throw new Error("Dit adres heeft geen bruikbare locatie.");
  const value = addressSchema.parse({
    street_name: p.openbare_ruimte_naam,
    house_number: String(p.huisnummer || ""),
    house_letter: p.huisletter || "",
    house_addition: p.toevoeging || "",
    postal_code: p.postcode || "",
    city: p.woonplaats_naam || "",
    country: "NL",
    source: "pdok",
    source_id: feature.id,
    bag_id: p.identificatie,
    longitude: c[0],
    latitude: c[1],
    located_at: new Date().toISOString(),
    status: "confirmed",
  });
  return { ...value, ...addressText(value) };
}
export async function lookupAddress(id: string) {
  // Never follow a browser-supplied URL. PDOK search IDs resolve only here.
  if (!/^[a-f0-9-]{36}$/i.test(id))
    throw new Error("Selecteer opnieuw een adres.");
  const response = await fetch(
    `${BAG_BASE}${id}?f=json&crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FOGC%2F1.3%2FCRS84`,
    { signal: AbortSignal.timeout(7000), cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      "Adresgegevens tijdelijk niet bereikbaar. Probeer opnieuw of voer handmatig in.",
    );
  return addressFromFeature(await response.json());
}
