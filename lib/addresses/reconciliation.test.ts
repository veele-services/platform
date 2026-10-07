import { describe, expect, it } from "vitest";
import { addressSchema, addressText, normalizeAddress, type Address } from "./model";
import { matchesReconciliationAddress } from "./reconciliation";

const address = (changes: Partial<Address> = {}): Address => {
  const value = addressSchema.parse({ street_name: "Fictieve Teststraat", house_number: "12", house_letter: "A", house_addition: "bis", postal_code: "1234 AB", city: "'s-Gravenhage", ...changes });
  return { ...value, ...addressText(value) };
};

describe("exact address reconciliation", () => {
  it("accepts Den Haag and the official BAG woonplaatsnaam in either direction", () => {
    const official = address();
    const familiar = address({ city: " Den Haag ", postal_code: "1234ab" });
    expect(matchesReconciliationAddress(familiar, official)).toBe(true);
    expect(matchesReconciliationAddress(official, familiar)).toBe(true);
  });

  it("keeps a complete legacy street exact when applying the explicit city alias", () => {
    const legacy = normalizeAddress({ street: "Fictieve Teststraat 12A bis", postal_code: "1234AB", city: "Den Haag" });
    expect(matchesReconciliationAddress(legacy, address())).toBe(true);
    expect(matchesReconciliationAddress(legacy, address({ house_letter: "B" }))).toBe(false);
  });

  it.each([
    { street_name: "Andere Teststraat" }, { house_number: "13" },
    { house_letter: "B" }, { house_addition: "ter" },
    { postal_code: "1234 AC" }, { city: "Utrecht" }, { country: "BE" },
  ])("rejects a different address despite the city alias: %j", changes => {
    expect(matchesReconciliationAddress(address({ city: "Den Haag" }), address(changes))).toBe(false);
  });

  it("does not collapse distinct structured house parts into an identical formatted street", () => {
    const first = address({ house_letter: "A B", house_addition: "C" });
    const second = address({ house_letter: "A", house_addition: "B C" });
    expect(first.street).toBe(second.street);
    expect(matchesReconciliationAddress(first, second)).toBe(false);
  });
});
