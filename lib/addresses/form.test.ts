import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./pdok", () => ({ lookupAddress: mocks.lookup }));
import { verifiedAddress } from "./form";
import { addressSchema } from "./model";
const fresh = addressSchema.parse({ street_name: "Teststraat", house_number: "42", postal_code: "1234 AB", city: "Teststad", source: "pdok", source_id: "fictitious-provider-id", latitude: 52.1, longitude: 4.4, located_at: "2026-10-07T00:00:00.000Z", status: "confirmed" });
beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue(fresh); });
describe("server verified form locations", () => {
  it("replaces browser coordinates and lookup time with the fresh provider result", async () => {
    const address = await verifiedAddress({ ...fresh, latitude: 10, longitude: 20, located_at: "2020-01-01T00:00:00.000Z" });
    expect(address).toEqual(fresh); expect(mocks.lookup).toHaveBeenCalledWith(fresh.source_id);
  });
  it("rejects changed address parts combined with an old confirmed location", async () => {
    await expect(verifiedAddress({ ...fresh, house_number: "99" })).rejects.toThrow("Het adres is gewijzigd");
  });
  it("clears coordinates and source identifiers from manually edited addresses", async () => {
    const address = await verifiedAddress({ ...fresh, status: "needs_review" });
    expect(address).toMatchObject({ latitude: null, longitude: null, source_id: null, bag_id: null, located_at: null, source: "manual" });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("does not accept a browser-created confirmed manual location", async () => {
    await expect(verifiedAddress({ ...fresh, source: "manual" })).rejects.toThrow("Selecteer het adres opnieuw");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
