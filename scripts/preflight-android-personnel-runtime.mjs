#!/usr/bin/env node

const runtimeOnly = process.argv.includes("--runtime-only");
const targets = [
  {
    brand: "veele",
    packageId: "nl.veeleservices.personeel",
    origin: "https://veeleservices.fieldgrid.nl",
    runtimePath: "/personeel",
    signingDigest:
      process.env.VEELE_PLAY_APP_SIGNING_SHA256?.replaceAll(
        ":",
        "",
      ).toLowerCase() ?? null,
  },
  {
    brand: "fieldgrid",
    packageId: "nl.fieldgrid.personeel",
    origin: "https://fieldgrid.nl",
    runtimePath: "/personeel",
    signingDigest:
      process.env.FIELDGRID_PLAY_APP_SIGNING_SHA256?.replaceAll(
        ":",
        "",
      ).toLowerCase() ?? null,
  },
];

function fail(message) {
  throw new Error(message);
}

async function fetchSameHost(url, options = {}) {
  const expectedOrigin = new URL(url).origin;
  let current = url;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      ...options,
    });
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get("location");
    if (!location) fail(`Redirect zonder Location-header: ${current}`);
    const next = new URL(location, current);
    if (next.origin !== expectedOrigin) {
      fail(`Cross-host redirect niet toegestaan: ${current} -> ${next.href}`);
    }
    current = next.href;
  }

  fail(`Te veel redirects: ${url}`);
}

function normalizeDigest(value) {
  return typeof value === "string"
    ? value.replaceAll(":", "").toLowerCase()
    : "";
}

for (const target of targets) {
  const runtime = await fetchSameHost(`${target.origin}${target.runtimePath}`, {
    headers: {
      "User-Agent": "Fieldgrid-Android-Play-Preflight/1.0",
    },
  });
  if (!runtime.response.ok) {
    fail(
      `${target.brand} runtime is niet gereed: HTTP ${runtime.response.status} op ${runtime.finalUrl}`,
    );
  }

  process.stdout.write(
    `${target.brand}: runtime-ok ${runtime.response.status} ${runtime.finalUrl}\n`,
  );

  if (runtimeOnly) continue;

  const assetLinks = await fetchSameHost(
    `${target.origin}/.well-known/assetlinks.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Fieldgrid-Android-Play-Preflight/1.0",
      },
    },
  );
  if (!assetLinks.response.ok) {
    fail(
      `${target.brand} assetlinks ontbreekt: HTTP ${assetLinks.response.status}`,
    );
  }

  const body = await assetLinks.response.json().catch(() => null);
  if (!Array.isArray(body)) {
    fail(`${target.brand} assetlinks is geen JSON-array.`);
  }

  const statement = body.find(
    (candidate) =>
      candidate?.target?.namespace === "android_app" &&
      candidate?.target?.package_name === target.packageId &&
      Array.isArray(candidate?.relation) &&
      candidate.relation.includes("delegate_permission/common.handle_all_urls"),
  );
  if (!statement) {
    fail(
      `${target.brand} assetlinks bevat geen geldige verklaring voor ${target.packageId}.`,
    );
  }

  if (target.signingDigest) {
    const fingerprints = Array.isArray(
      statement.target?.sha256_cert_fingerprints,
    )
      ? statement.target.sha256_cert_fingerprints.map(normalizeDigest)
      : [];
    if (!fingerprints.includes(target.signingDigest)) {
      fail(
        `${target.brand} assetlinks bevat niet het opgegeven Play app-signingcertificaat.`,
      );
    }
  }

  process.stdout.write(`${target.brand}: assetlinks-ok\n`);
}
