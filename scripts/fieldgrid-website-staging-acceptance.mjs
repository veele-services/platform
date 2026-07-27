#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

export const WEBSITE_STAGING_ACCEPTANCE_VERSION =
  "fieldgrid-website-staging-acceptance-v1";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_ASSETS = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const PERFORMANCE_BUDGET_MS = 4_000;
const FORM_ENDPOINT_PATTERN =
  /^\/api\/website-forms\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/submissions$/iu;

function isFullSha(value) {
  return /^[a-f0-9]{40}$/u.test(value ?? "");
}

export function safeStagingUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.staging\.fieldgrid\.nl$/u.test(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${label} must be a credential-free HTTPS staging.fieldgrid.nl URL.`,
    );
  }
  return url;
}

export function validateWebsiteStagingAcceptanceConfig(
  input,
  env = process.env,
) {
  const errors = [];
  if (!isFullSha(input.expectedStagingSha))
    errors.push("expected staging SHA must be an exact lowercase commit SHA");
  if (env.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (env.TARGET_ENVIRONMENT !== "staging")
    errors.push("TARGET_ENVIRONMENT must be staging");
  if (env.GITHUB_REF_NAME && env.GITHUB_REF_NAME !== "staging")
    errors.push("workflow must run from staging");
  if (env.GITHUB_SHA && env.GITHUB_SHA !== input.expectedStagingSha)
    errors.push("checkout SHA differs from expected staging SHA");

  try {
    const health = safeStagingUrl(input.websiteHealthUrl, "website health");
    if (health.pathname !== "/healthz")
      errors.push("website health URL must end at /healthz");
  } catch (error) {
    errors.push(error.message);
  }

  try {
    const marketingHealth = safeStagingUrl(
      input.marketingHealthUrl,
      "marketing health",
    );
    if (marketingHealth.pathname !== "/healthz")
      errors.push("marketing health URL must end at /healthz");
  } catch (error) {
    errors.push(error.message);
  }

  let managed;
  let custom;
  try {
    managed = safeStagingUrl(input.managedUrl, "managed acceptance");
  } catch (error) {
    errors.push(error.message);
  }
  try {
    custom = safeStagingUrl(input.customUrl, "custom acceptance");
  } catch (error) {
    errors.push(error.message);
  }
  if (managed && custom && managed.hostname === custom.hostname)
    errors.push("managed and custom acceptance hosts must differ");
  if (custom && env.FIELDGRID_CUSTOM_EXPECTED_HOST !== custom.hostname) {
    errors.push("custom acceptance host differs from the expected custom host");
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u.test(
      env.FIELDGRID_CUSTOM_ROUTE_KEY ?? "",
    )
  ) {
    errors.push("custom route key is missing or invalid");
  }
  return errors;
}

function parseArgs(argv) {
  const options = {
    run: false,
    expectedStagingSha: "",
    websiteHealthUrl: process.env.WEBSITE_PUBLIC_HEALTH_URL ?? "",
    marketingHealthUrl: process.env.MARKETING_PUBLIC_HEALTH_URL ?? "",
    managedUrl: process.env.WEBSITE_MANAGED_ACCEPTANCE_URL ?? "",
    customUrl: process.env.WEBSITE_CUSTOM_ACCEPTANCE_URL ?? "",
    evidenceDir: join(repoRoot, "artifacts", "website-staging-acceptance"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (argument === "--check") options.run = false;
    else if (argument === "--expected-staging")
      options.expectedStagingSha = argv[++index] ?? "";
    else if (argument === "--website-health")
      options.websiteHealthUrl = argv[++index] ?? "";
    else if (argument === "--marketing-health")
      options.marketingHealthUrl = argv[++index] ?? "";
    else if (argument === "--managed-url")
      options.managedUrl = argv[++index] ?? "";
    else if (argument === "--custom-url")
      options.customUrl = argv[++index] ?? "";
    else if (argument === "--evidence-dir")
      options.evidenceDir = resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function pathUrl(base, pathname) {
  const url = new URL(base);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchBounded(url, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    redirect: options.redirect ?? "follow",
    headers: { Accept: options.accept ?? "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = options.body === false ? "" : await response.text();
  const durationMs = Math.round(performance.now() - startedAt);
  if (Buffer.byteLength(body, "utf8") > MAX_HTML_BYTES)
    throw new Error("response exceeded the bounded acceptance size");
  return { response, body, durationMs };
}

function assertStatus(result, label) {
  if (result.response.status !== 200)
    throw new Error(`${label} returned HTTP ${result.response.status}.`);
}

function htmlSignals(body) {
  return {
    lang: /<html[^>]+\blang=["'][^"']+["']/iu.test(body),
    viewport:
      /<meta[^>]+\bname=["']viewport["'][^>]*>/iu.test(body) ||
      /<meta[^>]+\bcontent=["'][^"']*width=device-width[^"']*["'][^>]*>/iu.test(
        body,
      ),
    main: /<main(?:\s|>)/iu.test(body),
    heading: /<h1(?:\s|>)/iu.test(body),
    canonical: /<link[^>]+\brel=["']canonical["'][^>]*>/iu.test(body),
    structuredData:
      /<script[^>]+\btype=["']application\/ld\+json["'][^>]*>/iu.test(body),
  };
}

function assetUrls(body, pageUrl) {
  const urls = [];
  const pattern =
    /<(?:script|link)\b[^>]+(?:src|href)=["']([^"'#?]+(?:\?[^"']*)?)["']/giu;
  for (const match of body.matchAll(pattern)) {
    let candidate;
    try {
      candidate = new URL(match[1], pageUrl);
    } catch {
      continue;
    }
    if (
      candidate.origin === pageUrl.origin &&
      !urls.some((url) => url.href === candidate.href)
    ) {
      urls.push(candidate);
    }
    if (urls.length >= MAX_ASSETS) break;
  }
  return urls;
}

async function verifyAssets(body, pageUrl) {
  const assets = assetUrls(body, pageUrl);
  if (assets.length === 0)
    throw new Error("no same-origin script or stylesheet assets found");
  for (const asset of assets) {
    const result = await fetchBounded(asset, {
      accept: "*/*",
      body: false,
    });
    if (result.response.status !== 200)
      throw new Error(`asset smoke returned HTTP ${result.response.status}`);
  }
  return { checked: assets.length, healthy: true };
}

async function verifyWebsiteMode(baseUrl, expectedMode) {
  const root = await fetchBounded(baseUrl);
  assertStatus(root, `${expectedMode} root`);
  if (
    root.response.headers.get("x-fieldgrid-website-delivery") !== expectedMode
  ) {
    throw new Error(`${expectedMode} route marker is missing or incorrect.`);
  }
  if (
    root.response.headers.get("x-content-type-options")?.toLowerCase() !==
    "nosniff"
  ) {
    throw new Error(`${expectedMode} security headers are incomplete.`);
  }
  if (root.durationMs > PERFORMANCE_BUDGET_MS)
    throw new Error(`${expectedMode} root exceeded the performance budget.`);

  const html = htmlSignals(root.body);
  if (Object.values(html).some((value) => !value))
    throw new Error(`${expectedMode} HTML/SEO/accessibility contract failed.`);

  const [robots, sitemap, assets] = await Promise.all([
    fetchBounded(pathUrl(baseUrl, "/robots.txt"), {
      accept: "text/plain",
    }),
    fetchBounded(pathUrl(baseUrl, "/sitemap.xml"), {
      accept: "application/xml",
    }),
    verifyAssets(root.body, baseUrl),
  ]);
  assertStatus(robots, `${expectedMode} robots`);
  assertStatus(sitemap, `${expectedMode} sitemap`);
  if (!/user-agent:/iu.test(robots.body))
    throw new Error(`${expectedMode} robots response is invalid.`);
  if (!/<urlset(?:\s|>)/iu.test(sitemap.body))
    throw new Error(`${expectedMode} sitemap response is invalid.`);

  return {
    mode: expectedMode,
    host: baseUrl.hostname,
    rootStatus: root.response.status,
    durationMs: root.durationMs,
    performanceBudgetMs: PERFORMANCE_BUDGET_MS,
    html,
    robots: true,
    sitemap: true,
    assets,
    secretOrBodyRecorded: false,
  };
}

async function verifyReleaseMarkers(expectedSha, env = process.env) {
  const markers = [
    {
      label: "core",
      baseDir: env.STAGING_BASE_DIR || "/var/www/veele/staging",
    },
    {
      label: "website_stack",
      baseDir:
        env.WEBSITE_STACK_BASE_DIR || "/var/www/veele/website-stack-staging",
    },
  ];
  for (const marker of markers) {
    const actual = (
      await readFile(
        join(marker.baseDir, "current", ".fieldgrid-release-sha"),
        "utf8",
      )
    ).trim();
    if (actual !== expectedSha) {
      throw new Error(
        `${marker.label} staging release marker differs from expected SHA.`,
      );
    }
  }
  return {
    exact: true,
    sha: expectedSha,
    coreAndWebsiteStackEqual: true,
  };
}

async function verifyUnboundTenantHost(expectedSha) {
  const hostname = `unbound-${expectedSha.slice(0, 12)}.staging.fieldgrid.nl`;
  const result = await fetchBounded(new URL(`https://${hostname}/`), {
    redirect: "manual",
  });
  if (result.response.status !== 404) {
    throw new Error(
      `unbound staging tenant host returned HTTP ${result.response.status}.`,
    );
  }
  if (result.response.headers.get("location")) {
    throw new Error("unbound staging tenant host returned a redirect.");
  }
  if (result.response.headers.has("x-fieldgrid-website-delivery")) {
    throw new Error(
      "unbound staging tenant host exposed a website delivery marker.",
    );
  }
  return {
    host: hostname,
    tlsVerified: true,
    status: 404,
    redirected: false,
    tenantContentExposed: false,
  };
}

async function runAcceptance(options, env = process.env) {
  const errors = validateWebsiteStagingAcceptanceConfig(options, env);
  if (errors.length > 0) throw new Error(errors.join("; "));

  const healthUrl = safeStagingUrl(options.websiteHealthUrl, "website health");
  const marketingHealthUrl = safeStagingUrl(
    options.marketingHealthUrl,
    "marketing health",
  );
  const managedUrl = safeStagingUrl(options.managedUrl, "managed acceptance");
  const customUrl = safeStagingUrl(options.customUrl, "custom acceptance");
  const health = await fetchBounded(healthUrl, {
    accept: "application/json",
  });
  assertStatus(health, "website runtime health");
  let healthPayload;
  try {
    healthPayload = JSON.parse(health.body);
  } catch {
    throw new Error("website runtime health did not return JSON.");
  }
  if (
    healthPayload?.status !== "ok" ||
    healthPayload?.service !== "fieldgrid-website-runtime"
  ) {
    throw new Error("website runtime health contract failed.");
  }

  const marketingHealth = await fetchBounded(marketingHealthUrl, {
    accept: "application/json",
  });
  assertStatus(marketingHealth, "marketing process health");
  let marketingHealthPayload;
  try {
    marketingHealthPayload = JSON.parse(marketingHealth.body);
  } catch {
    throw new Error("marketing process health did not return JSON.");
  }
  if (
    marketingHealthPayload?.status !== "ok" ||
    marketingHealthPayload?.service !== "fieldgrid-marketing-website"
  ) {
    throw new Error("marketing process health contract failed.");
  }

  const candidateHealthUrl = pathUrl(marketingHealthUrl, "/api/health");
  const candidateHealth = await fetchBounded(candidateHealthUrl, {
    accept: "application/json",
  });
  assertStatus(candidateHealth, "custom candidate health");
  let candidateHealthPayload;
  try {
    candidateHealthPayload = JSON.parse(candidateHealth.body);
  } catch {
    throw new Error("custom candidate health did not return JSON.");
  }
  if (
    candidateHealthPayload?.schemaVersion !== 3 ||
    candidateHealthPayload?.status !== "healthy" ||
    candidateHealthPayload?.providerKey !== "fieldgrid_vps" ||
    candidateHealthPayload?.routeKey !== env.FIELDGRID_CUSTOM_ROUTE_KEY ||
    candidateHealthPayload?.releaseId !==
      `git-commit:${options.expectedStagingSha}` ||
    candidateHealthPayload?.expectedHost !==
      env.FIELDGRID_CUSTOM_EXPECTED_HOST ||
    candidateHealthPayload?.forms?.platformEndpoint !== true
  ) {
    throw new Error("custom candidate identity or readiness differs.");
  }

  const formConfig = await fetchBounded(
    pathUrl(customUrl, "/fieldgrid-runtime/form-config"),
    { accept: "application/json" },
  );
  assertStatus(formConfig, "custom form configuration");
  let formConfigPayload;
  try {
    formConfigPayload = JSON.parse(formConfig.body);
  } catch {
    throw new Error("custom form configuration did not return JSON.");
  }
  if (
    formConfigPayload?.enabled !== true ||
    !FORM_ENDPOINT_PATTERN.test(formConfigPayload?.endpoint ?? "")
  ) {
    throw new Error("custom form endpoint is not configured.");
  }

  const release = await verifyReleaseMarkers(options.expectedStagingSha, env);
  const [managed, custom, unboundTenantHost] = await Promise.all([
    verifyWebsiteMode(managedUrl, "managed_cms"),
    verifyWebsiteMode(customUrl, "custom_nextjs"),
    verifyUnboundTenantHost(options.expectedStagingSha),
  ]);
  return {
    version: WEBSITE_STAGING_ACCEPTANCE_VERSION,
    environment: "staging",
    status: "pass",
    exactStagingRelease: release,
    websiteRuntime: {
      host: healthUrl.hostname,
      status: health.response.status,
    },
    marketingRuntime: {
      status: marketingHealth.response.status,
      candidateIdentityMatched: true,
      formEndpointConfigured: true,
      endpointRecorded: false,
    },
    managed,
    custom,
    unboundTenantHost,
    productionChanged: false,
    deploymentPerformed: false,
    secretsRecorded: false,
    completedAt: new Date().toISOString(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.run) {
    if (!isFullSha("a".repeat(40)))
      throw new Error("acceptance self-check failed");
    safeStagingUrl(
      "https://website.staging.fieldgrid.nl/healthz",
      "self-check",
    );
    process.stdout.write(
      `${WEBSITE_STAGING_ACCEPTANCE_VERSION}: contract check passed\n`,
    );
    return;
  }
  const evidence = await runAcceptance(options);
  await mkdir(options.evidenceDir, { recursive: true });
  const evidencePath = join(
    options.evidenceDir,
    `acceptance-${options.expectedStagingSha}.json`,
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o640,
  });
  await chmod(evidencePath, 0o640);
  process.stdout.write(
    `${WEBSITE_STAGING_ACCEPTANCE_VERSION}: staging acceptance passed\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${WEBSITE_STAGING_ACCEPTANCE_VERSION}: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
}
