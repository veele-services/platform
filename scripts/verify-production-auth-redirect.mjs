const publicOrigin = "https://fieldgrid.nl";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyPublicAuthRedirect() {
  requireCondition(
    process.env.DEPLOY_TARGET === "production" && process.env.APP_URL === publicOrigin,
    "Controle geweigerd: alleen de vaste publieke productieorigin is toegestaan.",
  );

  const target = new URL("/auth/confirm", publicOrigin);
  target.search = new URLSearchParams({
    token_hash: "fictitious-production-redirect-check-not-a-credential",
    type: "magiclink",
    next: "/platform",
  }).toString();

  let response;
  try {
    response = await fetch(target, {
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("De publieke redirect kon niet binnen de time-out worden gecontroleerd.");
  }
  await response.body?.cancel().catch(() => undefined);

  requireCondition(response.status === 307, "De publieke Auth-route retourneert geen HTTP 307.");
  const location = response.headers.get("location");
  requireCondition(Boolean(location), "De publieke Auth-route mist een Location-header.");
  let destination;
  try {
    destination = new URL(location, target);
  } catch {
    throw new Error("De publieke Auth-route retourneert een ongeldige Location-header.");
  }
  requireCondition(
    destination.origin === publicOrigin && destination.pathname === "/login",
    "De Auth-redirect behoudt de publieke productieorigin en loginroute niet.",
  );
  requireCondition(
    destination.searchParams.get("error") === "otp_required" &&
      destination.searchParams.get("next") === "/platform" &&
      destination.searchParams.size === 2 &&
      !destination.hash && !destination.username && !destination.password,
    "De Auth-redirect bevat niet uitsluitend de verwachte OTP-loginparameters.",
  );
  requireCondition(!response.headers.has("set-cookie"), "De oude Auth-link mag geen cookie instellen.");
  requireCondition(
    response.headers.get("cache-control")?.split(",").some(value => value.trim().toLowerCase() === "no-store"),
    "De Auth-redirect mist no-store.",
  );
  requireCondition(response.headers.get("referrer-policy") === "no-referrer", "De Auth-redirect mist no-referrer.");
  console.log("Publieke Auth-redirect gecontroleerd: OTP-login op dezelfde productieorigin, zonder credentials of sessiecookie.");
}

verifyPublicAuthRedirect().catch(error => {
  // Only fixed local diagnostics are emitted; never print response headers,
  // URLs, cookies, environment values or provider response bodies.
  console.error(error.message);
  process.exitCode = 1;
});
