import { describe, expect, it, vi } from "vitest";
import { checkRoutingProvider } from "./provider-smoke";

const env = {
  DEPLOY_TARGET: "staging",
  OPENROUTESERVICE_API_KEY: "fictional-smoke-test-only",
};
describe("credential-safe live deployment routing check", () => {
  it("checks all four supported profiles, sending only public coordinates in longitude/latitude order", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ durations: [[600]], distances: [[1500]] }),
      );
    // Each response needs an unread body.
    fetcher.mockImplementation(async () =>
      Response.json({ durations: [[600]], distances: [[1500]] }),
    );
    const log = vi.fn();
    await checkRoutingProvider(env, fetcher, log);
    expect(
      fetcher.mock.calls.map(([url]) => String(url).split("/").at(-1)),
    ).toEqual([
      "driving-car",
      "cycling-regular",
      "cycling-electric",
      "foot-walking",
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      locations: [
        [4.3244, 52.0808],
        [4.322, 52.0695],
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
    const fetcher = vi.fn(async () => Response.json({ durations: [[600]], distances: [[1500]] }));
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
  });
});
