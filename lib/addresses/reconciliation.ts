import type { Address } from "./model";

const clean = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const canonicalCity = (value: string) => {
  const city = clean(value);
  // PDOK uses the official BAG woonplaatsnaam for this same municipality.
  return city === "den haag" ? "'s-gravenhage" : city;
};

/** Reconciliation accepts an explicit city alias, never a fuzzy street or house
 * match. Legacy free-form streets remain intact and must match the full street. */
export function matchesReconciliationAddress(current: Address, fresh: Address) {
  const housePartsMatch = !current.house_number ||
    (["street_name", "house_number", "house_letter", "house_addition"] as const)
      .every(part => clean(current[part]) === clean(fresh[part]));
  return housePartsMatch && clean(current.street) === clean(fresh.street) &&
    clean(current.postal_code).replaceAll(" ", "") === clean(fresh.postal_code).replaceAll(" ", "") &&
    canonicalCity(current.city) === canonicalCity(fresh.city) && current.country === fresh.country;
}
