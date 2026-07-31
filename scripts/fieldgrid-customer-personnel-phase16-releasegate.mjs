#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const strictEvidence = args.has("--strict-evidence");

const outputDir =
  process.env.FIELDGRID_CP_PHASE16_OUT_DIR ||
  join(process.cwd(), "outputs", "customer-personnel-phase16-releasegate");

const viewports = [
  { id: "mobile-320", width: 320, height: 568 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-430", width: 430, height: 932 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1280", width: 1280, height: 800 },
  { id: "desktop-1440", width: 1440, height: 1100 },
  { id: "desktop-1920", width: 1920, height: 1080 },
  { id: "zoom-200-1024", width: 1024, height: 768, cssZoom: 2 },
];

const customerBaseUrl = trimTrailingSlash(process.env.FIELDGRID_CUSTOMER_PORTAL_BASE_URL || "");
const personnelBaseUrl = trimTrailingSlash(process.env.FIELDGRID_PERSONNEL_PORTAL_BASE_URL || "");
const customerCookie = process.env.FIELDGRID_CUSTOMER_PORTAL_COOKIE || "";
const personnelCookie = process.env.FIELDGRID_PERSONNEL_PORTAL_COOKIE || "";
const customerStorageState =
  process.env.FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE || "";
const personnelStorageState =
  process.env.FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE || "";

const customerTargets = [
  { id: "dashboard", path: "/", label: "Dashboard" },
  { id: "objects", path: "/objecten", label: "Objecten" },
  { id: "object-detail", path: envPath("FIELDGRID_CUSTOMER_OBJECT_PATH", "/objecten/:objectId"), label: "Objectdetail", needsConcretePath: true },
  { id: "assignments", path: "/opdrachten", label: "Opdrachten" },
  { id: "assignment-detail", path: envPath("FIELDGRID_CUSTOMER_ASSIGNMENT_PATH", "/opdrachten/:assignmentId"), label: "Opdrachtdetail", needsConcretePath: true },
  { id: "request-flow", path: "/opdrachten/aanvragen", label: "Aanvraagflow" },
  { id: "finance", path: "/financieel", label: "Financieel" },
  { id: "invoices", path: "/facturen", label: "Facturen" },
  { id: "payments", path: "/betalingen", label: "Betalingen" },
  { id: "quotes", path: "/offertes", label: "Offertes" },
  { id: "documents", path: "/documenten", label: "Documenten" },
  { id: "reports", path: "/rapporten", label: "Rapportages" },
  { id: "notifications", path: "/meldingen", label: "Meldingen" },
  { id: "tickets", path: "/meldingen/tickets", label: "Meldingen en tickets" },
  { id: "help", path: "/help", label: "Hulpcentrum" },
  { id: "releases", path: "/releases", label: "Wat is nieuw" },
  { id: "roadmap-request", path: "/roadmap/new", label: "Idee insturen" },
  { id: "profile", path: "/profiel", label: "Profiel" },
  { id: "security", path: "/beveiliging", label: "Beveiliging" },
  { id: "settings", path: "/instellingen", label: "Instellingen" },
];

const personnelTargets = [
  { id: "dashboard", path: "/", label: "Dashboard" },
  { id: "planning", path: "/opdrachten", label: "Planning en opdrachten" },
  { id: "assignment-detail", path: envPath("FIELDGRID_PERSONNEL_ASSIGNMENT_PATH", "/opdrachten/:assignmentId"), label: "Opdrachtdetail", needsConcretePath: true },
  { id: "open-assignments", path: "/openstaand", label: "Openstaand" },
  { id: "hours", path: "/uren", label: "Uren" },
  { id: "availability", path: "/beschikbaarheid", label: "Beschikbaarheid" },
  { id: "leave", path: "/verlof", label: "Verlof" },
  { id: "messages", path: "/berichten", label: "Berichten" },
  { id: "notifications", path: "/meldingen", label: "Meldingen" },
  { id: "documents", path: "/documenten", label: "Documenten" },
  { id: "profile", path: "/profiel", label: "Profiel" },
  { id: "security", path: "/beveiliging", label: "Beveiliging" },
  { id: "settings", path: "/instellingen", label: "Instellingen" },
  { id: "news", path: "/nieuws", label: "Nieuws" },
  { id: "help", path: "/help", label: "Hulpcentrum" },
  { id: "releases", path: "/releases", label: "Wat is nieuw" },
  { id: "roadmap-request", path: "/roadmap/new", label: "Idee insturen" },
];

const staticChecks = [
  checkAppRoutes("klant-pwa", "artifacts/klant-pwa/src/app", customerTargets),
  checkAppRoutes("personeel-pwa", "artifacts/personeel-pwa/src/app", personnelTargets),
  checkNavigationHrefs("klant-pwa", [
    "artifacts/klant-pwa/src/app",
    "artifacts/klant-pwa/src/components",
  ]),
  checkNavigationHrefs("personeel-pwa", [
    "artifacts/personeel-pwa/src/app",
    "artifacts/personeel-pwa/src/components",
  ]),
  checkRawDialogs(),
  checkSecurityCopy(),
  checkNotificationHrefs(),
];

const screenshotPlan = {
  customer: {
    baseUrl: customerBaseUrl,
    hasCookie: Boolean(customerCookie),
    hasStorageState: Boolean(customerStorageState),
    targets: customerTargets,
  },
  personnel: {
    baseUrl: personnelBaseUrl,
    hasCookie: Boolean(personnelCookie),
    hasStorageState: Boolean(personnelStorageState),
    targets: personnelTargets,
  },
  viewports,
};

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  runtimeEvidenceStatus: "manual",
  staticChecks,
  screenshotPlan,
  screenshotResults: [],
  backlog: buildBacklog(),
};

if (
  (customerBaseUrl && (customerCookie || customerStorageState)) ||
  (personnelBaseUrl && (personnelCookie || personnelStorageState))
) {
  report.screenshotResults = await runScreenshots();
  report.runtimeEvidenceStatus = "captured";
}

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase16-releasegate.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = staticChecks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);
const screenshotFailures = report.screenshotResults.filter(
  (result) =>
    result.status === "failed" ||
    result.status === "skipped" ||
    result.httpStatus === null ||
    result.httpStatus >= 400 ||
    result.authRedirected ||
    result.routeMatches === false ||
    result.horizontalOverflow ||
    result.hasServerError ||
    result.undersizedInteractiveElements > 0 ||
    result.keyboardFocus?.ok === false ||
    result.axe?.seriousOrCriticalViolations > 0,
);
const missingEvidence =
  strictEvidence &&
  (
    !customerBaseUrl ||
    !personnelBaseUrl ||
    (!customerCookie && !customerStorageState) ||
    (!personnelCookie && !personnelStorageState) ||
    report.screenshotResults.length !==
      (customerTargets.length + personnelTargets.length) * viewports.length
  );

if (failures.length > 0 || screenshotFailures.length > 0 || missingEvidence) {
  console.error(`Customer/personnel phase 16 releasegate failed. Report: ${reportPath}`);
  if (failures.length > 0) console.error(JSON.stringify(failures, null, 2));
  if (screenshotFailures.length > 0) console.error(JSON.stringify(screenshotFailures, null, 2));
  if (missingEvidence) {
    console.error("Strict evidence requires both portal base URLs, authenticated cookies/storage, concrete detail paths and a result for every target at every required viewport.");
  }
  process.exit(1);
}

if (report.screenshotResults.length === 0) {
  console.log(`Customer/personnel phase 16 static gate passed; authenticated runtime evidence is manual. Report: ${reportPath}`);
} else {
  console.log(`Customer/personnel phase 16 releasegate passed with authenticated runtime evidence. Report: ${reportPath}`);
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/u, "");
}

function envPath(name, fallback) {
  return process.env[name] || fallback;
}

function walkFiles(root, predicate = () => true) {
  const files = [];
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkFiles(path, predicate));
    } else if (predicate(path)) {
      files.push(path);
    }
  }
  return files;
}

function read(path) {
  return readFileSync(path, "utf8");
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function appRouteFromPage(root, file) {
  const rel = toPosix(relative(root, file));
  if (!rel.endsWith("/page.tsx") && rel !== "page.tsx") return null;
  const parts = rel
    .replace(/\/page\.tsx$/u, "")
    .replace(/^page\.tsx$/u, "")
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? ":param" : part));
  return `/${parts.join("/")}`.replace(/\/$/u, "") || "/";
}

function routeRegex(route) {
  if (route === "/") return /^\/$/u;
  const pattern = route
    .split("/")
    .map((part) => (part === ":param" ? "[^/]+" : escapeRegex(part)))
    .join("/");
  return new RegExp(`^${pattern}$`, "u");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function checkAppRoutes(appName, root, targets) {
  const routes = walkFiles(root, (file) => file.endsWith("page.tsx"))
    .map((file) => appRouteFromPage(root, file))
    .filter(Boolean);
  const routePatterns = routes.map(routeRegex);
  const failures = [];

  for (const target of targets) {
    if (target.needsConcretePath) {
      const patternRoute = target.path.replace(/:[^/]+/gu, ":param");
      if (!routes.includes(patternRoute)) {
        failures.push({
          id: "missing-dynamic-route",
          target: target.id,
          path: target.path,
          expectedRoute: patternRoute,
        });
      }
      continue;
    }

    if (!routePatterns.some((pattern) => pattern.test(target.path))) {
      failures.push({ id: "missing-route", target: target.id, path: target.path });
    }
  }

  return {
    id: `${appName}:routes`,
    status: failures.length === 0 ? "passed" : "failed",
    checked: targets.length,
    routes: routes.sort(),
    failures,
  };
}

function checkNavigationHrefs(appName, roots) {
  const appRoot = `artifacts/${appName}/src/app`;
  const routePatterns = walkFiles(appRoot, (file) => file.endsWith("page.tsx"))
    .map((file) => appRouteFromPage(appRoot, file))
    .filter(Boolean)
    .map(routeRegex);
  const files = roots.flatMap((root) =>
    walkFiles(root, (file) => file.endsWith(".tsx") || file.endsWith(".ts")),
  );
  const hrefPattern = /(?:href=|href:\s*)["'`]([^"'`$][^"'`]*)["'`]/gu;
  const failures = [];
  const checked = [];

  for (const file of files) {
    const normalizedFile = toPosix(file);
    if (normalizedFile.endsWith("/DevNav.tsx")) continue;
    const content = read(file);
    for (const match of content.matchAll(hrefPattern)) {
      const href = match[1];
      if (!href.startsWith("/") || shouldSkipHref(href)) continue;
      const pathname =
        href
          .split(/[?#]/u)[0]
          .replace(/\$\{[^}]+\}/gu, ":param")
          .replace(/\/$/u, "") || "/";
      checked.push({ file: toPosix(file), href });
      if (!routePatterns.some((pattern) => pattern.test(pathname))) {
        failures.push({ id: "broken-local-href", file: toPosix(file), href });
      }
    }
  }

  return {
    id: `${appName}:navigation-hrefs`,
    status: failures.length === 0 ? "passed" : "failed",
    checked: checked.length,
    failures,
  };
}

function shouldSkipHref(href) {
  return (
    href.startsWith("/api/") ||
    href.startsWith("/auth/") ||
    href.startsWith("/debug/") ||
    href.startsWith("/klant/api/") ||
    href.startsWith("/personeel/api/") ||
    /\.(?:ico|png|svg|jpg|jpeg|webp|pdf)$/iu.test(href.split(/[?#]/u)[0]) ||
    href.includes(":")
  );
}

function checkRawDialogs() {
  const files = [
    ...walkFiles("artifacts/klant-pwa/src", (file) => /\.(tsx?|jsx?)$/u.test(file)),
    ...walkFiles("artifacts/personeel-pwa/src", (file) => /\.(tsx?|jsx?)$/u.test(file)),
  ];
  const rawDialogPattern = /\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/u;
  const failures = [];

  for (const file of files) {
    const content = read(file);
    if (rawDialogPattern.test(content)) {
      failures.push({ id: "raw-browser-dialog", file: toPosix(file) });
    }
  }

  return {
    id: "raw-browser-dialogs",
    status: failures.length === 0 ? "passed" : "failed",
    checked: files.length,
    failures,
  };
}

function checkSecurityCopy() {
  const files = [
    ...walkFiles("artifacts/klant-pwa/src/app", (file) => /\.(tsx?|jsx?)$/u.test(file)),
    ...walkFiles("artifacts/klant-pwa/src/components", (file) => /\.(tsx?|jsx?)$/u.test(file)),
    ...walkFiles("artifacts/personeel-pwa/src/app", (file) => /\.(tsx?|jsx?)$/u.test(file)),
    ...walkFiles("artifacts/personeel-pwa/src/components", (file) => /\.(tsx?|jsx?)$/u.test(file)),
  ].filter((file) => /beveiliging|Security|Password|Mfa|auth|login|reset-wachtwoord|wachtwoord-vergeten/u.test(file));
  const blockedPatterns = [
    /MFA\/TOTP/u,
    /TODO/u,
    /coming soon/iu,
    /binnenkort beschikbaar/iu,
    /niet geimplementeerd/iu,
    /not implemented/iu,
  ];
  const failures = [];

  for (const file of files) {
    const content = read(file);
    for (const pattern of blockedPatterns) {
      if (pattern.test(content)) {
        failures.push({ id: "security-placeholder-copy", file: toPosix(file), pattern: String(pattern) });
      }
    }
  }

  return {
    id: "security-copy",
    status: failures.length === 0 ? "passed" : "failed",
    checked: files.length,
    failures,
  };
}

function checkNotificationHrefs() {
  const files = [
    ...walkFiles("artifacts/backoffice/src/app/actions", (file) => file.endsWith(".ts")),
    ...walkFiles("lib/db/src", (file) => file.endsWith(".ts")),
  ];
  const contracts = {
    customer: {
      allowed: [
        "/",
        "/objecten",
        "/opdrachten",
        "/meldingen",
        "/meldingen/tickets",
        "/facturen",
        "/betalingen",
        "/offertes",
        "/documenten",
        "/rapporten",
        "/help",
        "/releases",
        "/roadmap",
        "/profiel",
        "/beveiliging",
        "/instellingen",
        "/financieel",
      ],
      forbidden: ["/platform", "/berichten", "/openstaand", "/uren", "/beschikbaarheid", "/verlof", "/nieuws"],
    },
    personnel: {
      allowed: [
        "/",
        "/opdrachten",
        "/openstaand",
        "/uren",
        "/berichten",
        "/meldingen",
        "/documenten",
        "/help",
        "/releases",
        "/roadmap",
        "/profiel",
        "/beveiliging",
        "/instellingen",
        "/beschikbaarheid",
        "/verlof",
        "/nieuws",
      ],
      forbidden: ["/platform", "/meldingen/tickets", "/facturen", "/betalingen", "/offertes", "/rapporten", "/objecten"],
    },
    management: {
      allowed: ["/", "/opdrachten", "/planning", "/tickets", "/instellingen", "/platform"],
      forbidden: ["/meldingen/tickets", "/berichten"],
    },
  };
  const failures = [];
  const checked = [];

  for (const file of files) {
    const content = read(file);
    for (const audience of Object.keys(contracts)) {
      const audienceRegex = new RegExp(`audience:\\s*["']${audience}["']`, "gu");
      for (const audienceMatch of content.matchAll(audienceRegex)) {
        const windowText = content.slice(audienceMatch.index, audienceMatch.index + 900);
        const hrefMatches = [...windowText.matchAll(/href:\s*["'`]([^"'`$]+)["'`]/gu)];
        for (const hrefMatch of hrefMatches) {
          const href = hrefMatch[1].split(/[?#]/u)[0].replace(/\/$/u, "") || "/";
          checked.push({ file: toPosix(file), audience, href });
          const contract = contracts[audience];
          if (contract.forbidden.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))) {
            failures.push({ id: "forbidden-audience-href", file: toPosix(file), audience, href });
          }
          if (!contract.allowed.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))) {
            failures.push({ id: "unknown-audience-href", file: toPosix(file), audience, href });
          }
        }
      }
    }
  }

  return {
    id: "notification-hrefs",
    status: failures.length === 0 ? "passed" : "failed",
    checked: checked.length,
    failures,
  };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is niet geinstalleerd in deze workspace. Installeer Playwright in de runner of draai met CI-cache. Originele fout: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function cookieFromHeader(header, baseUrl) {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split("=");
      return {
        name,
        value: valueParts.join("="),
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      };
    })
    .filter((cookie) => cookie.name && cookie.value);
}

async function runScreenshots() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const app of [
      {
        id: "customer",
        baseUrl: customerBaseUrl,
        cookie: customerCookie,
        storageState: customerStorageState,
        targets: customerTargets,
      },
      {
        id: "personnel",
        baseUrl: personnelBaseUrl,
        cookie: personnelCookie,
        storageState: personnelStorageState,
        targets: personnelTargets,
      },
    ]) {
      if (!app.baseUrl || (!app.cookie && !app.storageState)) continue;
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState: app.storageState || undefined,
          reducedMotion: "reduce",
        });
        const cookies = cookieFromHeader(app.cookie, app.baseUrl);
        if (cookies.length > 0) await context.addCookies(cookies);
        const page = await context.newPage();

        for (const target of app.targets) {
          if (target.path.includes(":")) {
            results.push({
              app: app.id,
              target: target.id,
              viewport: viewport.id,
              status: "skipped",
              reason: "Concrete dynamic route path not supplied through env.",
            });
            continue;
          }

          const url = `${app.baseUrl}${target.path}`;
          const screenshot = join(outputDir, "screenshots", `${app.id}-${viewport.id}-${target.id}.png`);
          await mkdir(join(outputDir, "screenshots"), { recursive: true });
          try {
            const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
            if (viewport.cssZoom) {
              await page.evaluate((zoom) => {
                document.documentElement.style.zoom = String(zoom);
              }, viewport.cssZoom);
            }
            const responseUrl = page.url();
            const keyboardFocus = await verifyKeyboardFocus(page);
            const axe = await scanAccessibility(page);
            await page.screenshot({
              path: screenshot,
              fullPage: true,
              animations: "disabled",
              caret: "hide",
            });
            const metrics = await page.evaluate(() => {
              const interactive = Array.from(
                document.querySelectorAll(
                  "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link]",
                ),
              );
              const undersized = interactive.filter((item) => {
                const rect = item.getBoundingClientRect();
                const style = window.getComputedStyle(item);
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  (rect.width < 44 || rect.height < 44)
                );
              }).length;
              const text = document.body?.innerText || "";
              return {
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                undersizedInteractiveElements: undersized,
                hasServerError: /Application error|server-side exception|Digest:/iu.test(text),
                currentPath: window.location.pathname,
              };
            });
            const authRedirected = isAuthenticationRedirect(responseUrl);
            results.push({
              app: app.id,
              target: target.id,
              label: target.label,
              viewport: viewport.id,
              url,
              responseUrl,
              status: "captured",
              httpStatus: response?.status() ?? null,
              authRedirected,
              routeMatches: samePathname(responseUrl, url),
              screenshot,
              ...metrics,
              undersizedInteractiveElements:
                viewport.width <= 430
                  ? metrics.undersizedInteractiveElements
                  : 0,
              keyboardFocus,
              axe,
            });
          } catch (error) {
            results.push({
              app: app.id,
              target: target.id,
              viewport: viewport.id,
              url,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function verifyKeyboardFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) {
      return { ok: false, reason: "tab-did-not-focus-a-control" };
    }
    const rect = active.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    const visibleIndicator =
      (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== "none";
    return {
      ok:
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        visibleIndicator,
      reason: visibleIndicator ? null : "focused-control-has-no-visible-indicator",
      tagName: active.tagName,
    };
  });
}

async function scanAccessibility(page) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const analysis = await new AxeBuilder({ page }).analyze();
  const violations = analysis.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
  return {
    seriousOrCriticalViolations: violations.length,
    violations,
  };
}

function isAuthenticationRedirect(value) {
  if (!value) return false;
  const pathname = new URL(value).pathname;
  return /\/(?:login|onboarding|wachtwoord-wijzigen|context-kiezen|privacy)(?:\/|$)/u.test(pathname);
}

function samePathname(left, right) {
  const normalize = (value) => {
    const pathname = new URL(value).pathname.replace(/\/+$/u, "");
    return pathname || "/";
  };
  return normalize(left) === normalize(right);
}

function buildBacklog() {
  const items = [];
  if (
    !customerBaseUrl ||
    !personnelBaseUrl ||
    (!customerCookie && !customerStorageState) ||
    (!personnelCookie && !personnelStorageState)
  ) {
    items.push({
      id: "CP16-P1-AUTHENTICATED-SCREENSHOTS",
      priority: "P1",
      owner: "release",
      description:
        "Draai de screenshotmodus tegen staging met FIELDGRID_CUSTOMER_PORTAL_BASE_URL, FIELDGRID_PERSONNEL_PORTAL_BASE_URL en geldige auth cookies/storage voor beide portalen.",
    });
  }

  if (customerTargets.some((target) => target.path.includes(":")) || personnelTargets.some((target) => target.path.includes(":"))) {
    items.push({
      id: "CP16-P2-DYNAMIC-DETAIL-PATHS",
      priority: "P2",
      owner: "release",
      description:
        "Lever concrete detailroutes aan via FIELDGRID_CUSTOMER_OBJECT_PATH, FIELDGRID_CUSTOMER_ASSIGNMENT_PATH en FIELDGRID_PERSONNEL_ASSIGNMENT_PATH voor volledige detail-screenshotdekking.",
    });
  }

  return items;
}
