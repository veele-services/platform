if (process.env.DEPLOY_TARGET !== "production" || process.env.HEALTHCHECK_URL !== "https://fieldgrid.nl/api/healthz" || !/^[0-9a-f]{40}$/.test(process.env.RELEASE_SHA ?? "")) throw new Error("Onjuiste productiehealth-identiteit");
const healthcheckUrl = process.env.HEALTHCHECK_URL;
const releaseSha = process.env.RELEASE_SHA;

if (!healthcheckUrl || !releaseSha) throw new Error("HEALTHCHECK_URL en RELEASE_SHA zijn verplicht");

const target = new URL(healthcheckUrl);
target.searchParams.set("release", releaseSha);

let lastError;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    const response = await fetch(target, { headers: { accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("healthcheck gaf geen geldige JSON terug");
    }
    if (body.status !== "ok" || body.environment !== "production" || body.database !== "ready" || body.scanner !== "ready" || body.release !== releaseSha) {
      throw new Error("healthcheck-inhoud komt niet overeen met de productie-release");
    }
    console.log(`Healthcheck geslaagd voor release ${releaseSha.slice(0, 12)}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

throw new Error(`Healthcheck faalde: ${lastError instanceof Error ? lastError.message : "onbekende fout"}`);
