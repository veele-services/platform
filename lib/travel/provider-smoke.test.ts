import { describe, expect, it, vi } from "vitest";
import { checkRoutingProvider } from "./provider-smoke";

const env = {
  DEPLOY_TARGET: "staging",
  OPENROUTESERVICE_API_KEY: "fictional-smoke-test-only",
};
const successfulResponse = (url: string | URL | Request) =>
  String(url).includes("/directions/")
    ? Response.json({
        routes: [{ summary: { duration: 600, distance: 1500 } }],
      })
    : Response.json({ durations: [[600]], distances: [[1500]] });
describe("credential-safe live deployment routing check", () => {
  it("checks all four supported profiles, sending only public coordinates in longitude/latitude order", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => successfulResponse(url));
    const log = vi.fn();
    await expect(checkRoutingProvider(env, fetcher, log)).resolves.toEqual({
      degradedProfiles: [],
    });
    expect(
      fetcher.mock.calls.map(([url]) => String(url).split("/").at(-1)),
    ).toEqual([
      "driving-car",
      "cycling-regular",
      "cycling-electric",
      "foot-walking",
    ]);
    expect(String(fetcher.mock.calls[3][0])).toContain(
      "/directions/foot-walking",
    );
    expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toMatchObject({
      coordinates: [
        [8.66044, 49.41571],
        [8.67842, 49.40664],
      ],
      instructions: false,
      geometry: false,
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      locations: [
        [8.66044, 49.41571],
        [8.67842, 49.40664],
      ],
      sources: ["0"],
      destinations: ["1"],
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      env.OPENROUTESERVICE_API_KEY,
    );
  });
  it("refuses a missing key without calling the provider", async () => {
    const fetcher = vi.fn();
    await expect(
      checkRoutingProvider({ DEPLOY_TARGET: "staging" }, fetcher),
    ).rejects.toThrow("ontbreekt");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires a canonical deployed environment and an HTTPS base without credentials", async () => {
    const fetcher = vi.fn();
    await expect(
      checkRoutingProvider({ ...env, DEPLOY_TARGET: "production" }, fetcher),
    ).rejects.toThrow("deploymentomgeving");
    await expect(
      checkRoutingProvider(
        { ...env, OPENROUTESERVICE_BASE_URL: "http://localhost" },
        fetcher,
      ),
    ).rejects.toThrow("Ongeldige");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("respects explicit manual-only operation", async () => {
    const fetcher = vi.fn(),
      log = vi.fn();
    await checkRoutingProvider(
      { DEPLOY_TARGET: "staging", ROUTING_PROVIDER: "disabled" },
      fetcher,
      log,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("handmatige"));
  });
  it("permits production profiles only at the canonical production origin", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => successfulResponse(url));
    await checkRoutingProvider({ ...env, DEPLOY_TARGET: "production", APP_URL: "https://fieldgrid.nl" }, fetcher, vi.fn());
    expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(checkRoutingProvider({ ...env, DEPLOY_TARGET: "production", APP_URL: "https://staging.fieldgrid.nl" }, fetcher)).rejects.toThrow("deploymentomgeving");
  });
  it("reports HTTP failures without the provider body or key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(env.OPENROUTESERVICE_API_KEY, { status: 401 }),
      );
    await expect(checkRoutingProvider(env, fetcher)).rejects.toThrow(
      "HTTP 401",
    );
  });
  it("does not mistake an absent route for zero travel time", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ durations: [[null]], distances: [[null]] }),
      );
    await expect(checkRoutingProvider(env, fetcher)).rejects.toThrow(
      "geen bruikbaar",
    );
  });
  it("hides network error contents", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(env.OPENROUTESERVICE_API_KEY));
    await expect(checkRoutingProvider(env, fetcher)).rejects.toThrow(
      "provider niet bereikbaar",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries one transient network failure without weakening response validation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockImplementation(async (url) => successfulResponse(url));
    const log = vi.fn();
    await checkRoutingProvider(env, fetcher, log);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).locations).toEqual(
      [
        [8.66044, 49.41571],
        [8.67842, 49.40664],
      ],
    );
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).locations).toEqual(
      [
        [8.6837, 49.40854],
        [8.69014, 49.40778],
      ],
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("nog één begrensde poging"),
    );
    expect(log).toHaveBeenCalledWith(
      "Basisrouting foot-walking: beschikbaar.",
    );
  });
  it("records an isolated walking outage without weakening required profile checks", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/directions/foot-walking"))
        throw new Error(env.OPENROUTESERVICE_API_KEY);
      return successfulResponse(url);
    });
    const log = vi.fn();
    await expect(checkRoutingProvider(env, fetcher, log)).resolves.toEqual({
      degradedProfiles: ["foot-walking"],
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Routingdegradatie foot-walking"),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      env.OPENROUTESERVICE_API_KEY,
    );
  });
  it("still blocks when a required profile is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/matrix/cycling-regular"))
        throw new Error("temporary outage");
      return successfulResponse(url);
    });
    await expect(checkRoutingProvider(env, fetcher, vi.fn())).rejects.toThrow(
      "cycling-regular: provider niet bereikbaar",
    );
  });
});
