import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { addressFromFeature, lookupAddress, searchAddresses } from "./pdok";
afterEach(() => vi.unstubAllGlobals());
it("reads BAG detail in CRS84 longitude-latitude without losing suffixes", () => {
  const a = addressFromFeature({
    id: "be3280e2-1fc3-583e-9bb1-bb26d29256c4",
    geometry: { type: "Point", coordinates: [4.313, 52.079] },
    properties: {
      openbare_ruimte_naam: "Fictieve straat",
      huisnummer: 1,
      huisletter: "A",
      toevoeging: "bis",
      postcode: "1234AB",
      woonplaats_naam: "Testplaats",
      identificatie: "1234567890123456",
    },
  });
  expect(a).toMatchObject({
    house_number: "1",
    house_letter: "A",
    house_addition: "bis",
    longitude: 4.313,
    latitude: 52.079,
    bag_id: "1234567890123456",
    status: "confirmed",
  });
  expect(a.formatted).toContain("1A bis");
});
it("asks new Location API for address results and ignores non-address collections", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      features: [
        {
          id: "be3280e2-1fc3-583e-9bb1-bb26d29256c4",
          properties: { collection_id: "adres", display_name: "Fictief 1A" },
        },
        {
          id: "be3280e2-1fc3-583e-9bb1-bb26d29256c4",
          properties: { collection_id: "woonplaats", display_name: "City" },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await searchAddresses("1234 AB 1A")).toHaveLength(1);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe(
    "https://api.pdok.nl/kadaster/location-api/v1/search",
  );
  expect(url.searchParams.get("adres[version]")).toBe("1");
  expect(url.searchParams.get("crs")).toContain("CRS84");
});
it("rejects invalid coordinates, arbitrary URLs and missing details", async () => {
  expect(() =>
    addressFromFeature({
      geometry: { type: "Point", coordinates: [155000, 463000] },
    }),
  ).toThrow();
  await expect(lookupAddress("https://evil.test")).rejects.toThrow();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  await expect(
    lookupAddress("be3280e2-1fc3-583e-9bb1-bb26d29256c4"),
  ).rejects.toThrow();
});
