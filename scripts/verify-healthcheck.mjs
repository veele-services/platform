const healthcheckUrl = process.env.HEALTHCHECK_URL;
const releaseSha = process.env.RELEASE_SHA;

if (!healthcheckUrl || !releaseSha) throw new Error("HEALTHCHECK_URL en RELEASE_SHA zijn verplicht");

const target = new URL(healthcheckUrl);
target.searchParams.set("release", releaseSha);

let lastError;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    const response = await fetch(target, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (body.status !== "ok" || body.environment !== "staging" || body.database !== "ready" || body.scanner !== "ready" || body.release !== releaseSha) {
      throw new Error("healthcheck-inhoud komt niet overeen met de staging-release");
    }
    console.log(`Healthcheck geslaagd voor release ${releaseSha.slice(0, 12)}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

throw new Error(`Healthcheck faalde: ${lastError instanceof Error ? lastError.message : "onbekende fout"}`);
