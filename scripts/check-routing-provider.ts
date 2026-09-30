import { checkRoutingProvider } from "../lib/travel/provider-smoke";

void checkRoutingProvider(process.env).catch((error: unknown) => {
  // Only our own credential-free errors; never print provider bodies or request headers.
  console.error(
    error instanceof Error ? error.message : "Routingcontrole mislukt.",
  );
  process.exitCode = 1;
});
