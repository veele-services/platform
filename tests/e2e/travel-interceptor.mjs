// FICTITIOUS provider responses, ONLY imported by the isolated Playwright server.
// Normal dev/build/deploy never imports this module.
import "./sendgrid-interceptor.mjs";
const replay=/^\/tmp\/fieldgrid-release-migrations\.[A-Za-z0-9]+$/.test(process.env.FIELDGRID_LOCAL_REPLAY_DIR??"");
const expectedSupabase=replay?"http://127.0.0.1:60321":"http://127.0.0.1:59321";
if (
  process.env.DEPLOY_TARGET !== "local" ||
  process.env.SUPABASE_URL !== expectedSupabase ||
  process.env.OPENROUTESERVICE_API_KEY !== "fictional-travel-e2e-only"
)
  throw new Error(
    "Travel fixtures require the isolated local test environment",
  );
const original = globalThis.fetch;
const id = "aa000000-0000-4000-8000-000000000001";
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.pdok.nl") {
    if (url.pathname.endsWith("/search"))
      return Promise.resolve(
        Response.json({
          features: [
            {
              id,
              properties: {
                collection_id: "adres",
                display_name: "FICTIEF Testplein 12A bis, 1234AB Testplaats",
              },
            },
          ],
        }),
      );
    return Promise.resolve(
      Response.json({
        id,
        geometry: { type: "Point", coordinates: [4.313, 52.079] },
        properties: {
          openbare_ruimte_naam: "FICTIEF Testplein",
          huisnummer: 12,
          huisletter: "A",
          toevoeging: "bis",
          postcode: "1234AB",
          woonplaats_naam: "Testplaats",
          identificatie: "9999999999999999",
        },
      }),
    );
  }
  if (url.hostname === "api.heigit.org") {
    if (
      new Headers(init?.headers).get("authorization") !==
      "fictional-travel-e2e-only"
    )
      throw new Error("Real provider credentials forbidden in tests");
    const body = JSON.parse(init.body),
      duration = url.pathname.includes("cycling") ? 1500 : 1080;
    if (url.pathname.includes("/matrix/"))
      return Promise.resolve(
        Response.json({
          durations: [body.destinations.map(() => duration)],
          distances: [body.destinations.map(() => 5000)],
        }),
      );
    return Promise.resolve(
      Response.json({
        features: [
          {
            geometry: { type: "LineString", coordinates: body.coordinates },
            properties: { summary: { duration, distance: 5000 } },
          },
        ],
      }),
    );
  }
  return original(input, init);
};
