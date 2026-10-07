const port = Number(process.env.PORT);
const secret = process.env.ADMIN_API_SECRET;
const expectedPort = process.env.DEPLOY_TARGET === "staging" ? 3301 : process.env.DEPLOY_TARGET === "production" ? 3302 : undefined;

if (!expectedPort || port !== expectedPort || !secret || secret.length < 32) {
  console.error("Workerconfiguratie ontbreekt of is ongeldig.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    await response.arrayBuffer();
    if (!response.ok) throw new Error("worker request failed");
    console.log("Fieldgrid-workerbatch voltooid.");
  } catch {
    console.error("Fieldgrid-workerbatch mislukt.");
    process.exitCode = 1;
  }
}
