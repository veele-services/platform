import { profiles } from "./model";

const routingCheckAttempts = 2;
const routingCheckTimeoutMs = 20_000;
const routingCheckRoutes = [
  // Den Haag Centraal → Den Haag HS.
  [
    [4.3244, 52.0808],
    [4.322, 52.0695],
  ],
  // Utrecht Centraal → Utrecht Vaartsche Rijn. A second public route keeps a
  // local graph/snap issue from being mistaken for total provider failure.
  [
    [5.1102, 52.0893],
    [5.1217, 52.0787],
  ],
] as const;

/** Deployment-only smoke check using public railway stations, never tenant data. */
export async function checkRoutingProvider(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
  log: (message: string) => void = console.log,
) {
  if (env.DEPLOY_TARGET !== "staging" && !(env.DEPLOY_TARGET === "production" && env.APP_URL === "https://fieldgrid.nl"))
    throw new Error("Routingcontrole vereist een geconfigureerde deploymentomgeving.");
  if (env.ROUTING_PROVIDER === "disabled") {
    log(
      "Automatische routing is expliciet uitgeschakeld; alleen handmatige reistijden.",
    );
    return;
  }
  const key = env.OPENROUTESERVICE_API_KEY;
  if (!key || key.length < 10)
    throw new Error(
      "OPENROUTESERVICE_API_KEY ontbreekt in GitHub Environment.",
    );
  const base =
    env.OPENROUTESERVICE_BASE_URL ||
    "https://api.heigit.org/openrouteservice/v2";
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("Ongeldige routingbasis.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Ongeldige routingbasis.");
  for (const profile of new Set(
    Object.values(profiles).filter((value): value is string => value !== null),
  )) {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= routingCheckAttempts; attempt += 1) {
      try {
        response = await fetcher(
          `${base.replace(/\/$/, "")}/matrix/${profile}`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(routingCheckTimeoutMs),
            headers: {
              Authorization: key,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              locations: routingCheckRoutes[attempt - 1],
              sources: ["0"],
              destinations: ["1"],
              metrics: ["duration", "distance"],
              units: "m",
              resolve_locations: false,
            }),
          },
        );
        break;
      } catch {
        if (attempt < routingCheckAttempts) {
          log(
            `Routingcontrole ${profile}: tijdelijke netwerkfout; nog één begrensde poging.`,
          );
        }
      }
    }
    if (!response) {
      throw new Error(
        `Routingcontrole ${profile}: provider niet bereikbaar; deployment niet activeren.`,
      );
    }
    if (!response.ok)
      throw new Error(
        `Routingcontrole ${profile}: HTTP ${response.status}; controleer providersleutel, toegang en limiet.`,
      );
    let data: { durations?: unknown[][]; distances?: unknown[][] };
    try {
      data = await response.json();
    } catch {
      throw new Error(`Routingcontrole ${profile}: ongeldig antwoord.`);
    }
    const values = [data.durations?.[0]?.[0], data.distances?.[0]?.[0]];
    if (
      !values.every(
        (value) =>
          typeof value === "number" && Number.isFinite(value) && value > 0,
      )
    )
      throw new Error(
        `Routingcontrole ${profile}: geen bruikbaar traject ontvangen.`,
      );
    log(`Basisrouting ${profile}: beschikbaar.`);
  }
}
