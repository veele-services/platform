import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectFiles(directory, extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relative, extensions));
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(relative);
    }
  }

  return files;
}

test("Sprint 12 active source no longer uses legacy map tile/rendering providers", () => {
  const activeFiles = [
    ...collectFiles("artifacts/backoffice/src"),
    ...collectFiles("artifacts/klant-pwa/src"),
    ...collectFiles("artifacts/personeel-pwa/src"),
    ...collectFiles("lib/db/src"),
  ];

  const forbidden = [
    /maplibre/iu,
    /leaflet/iu,
    /basemaps\.cartocdn\.com/iu,
    /tile\.openstreetmap\.org/iu,
    /maps\/api\/directions/iu,
    /maps\/api\/distancematrix/iu,
    /GOOGLE_ROUTES_API_KEY/u,
  ];

  for (const file of activeFiles) {
    const content = read(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(content, pattern, `${file} contains legacy map integration`);
    }
  }
});

test("Sprint 12 package dependencies do not include legacy map renderers", () => {
  const pkg = JSON.parse(read("package.json"));
  const workspace = [
    "artifacts/backoffice/package.json",
    "artifacts/klant-pwa/package.json",
    "artifacts/personeel-pwa/package.json",
    "artifacts/api-server/package.json",
  ].map((file) => JSON.parse(read(file)));

  for (const packageJson of [pkg, ...workspace]) {
    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };
    assert.equal(dependencies["maplibre-gl"], undefined);
    assert.equal(dependencies.leaflet, undefined);
    assert.equal(dependencies["@carto/carto-react"], undefined);
    assert.equal(dependencies["@carto/carto-vl"], undefined);
  }
});

test("Sprint 12 route provider only accepts the canonical server key", () => {
  const provider = read("artifacts/backoffice/src/lib/planning/routes/route-provider.ts");
  const googleProvider = read("artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts");
  const config = read("artifacts/backoffice/src/lib/google-maps/config.ts");
  const rootEnv = read(".env.example");
  const backofficeEnv = read("artifacts/backoffice/.env.example");
  const deploymentDocs = read("docs/deployment/google-maps-platform.md");

  for (const content of [provider, googleProvider, config, rootEnv, backofficeEnv, deploymentDocs]) {
    assert.doesNotMatch(content, /GOOGLE_ROUTES_API_KEY/u);
  }

  assert.match(provider, /process\.env\.GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.match(googleProvider, /process\.env\.GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.match(config, /GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.match(deploymentDocs, /oude routespecifieke keynaam wordt niet meer gelezen/u);
});

test("Sprint 12 Google Maps remains lazy-loaded and not app-shell loaded", () => {
  const loader = read("artifacts/backoffice/src/lib/google-maps/client-loader.ts");
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");
  const dashboardLayout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const rootLayout = read("artifacts/backoffice/src/app/layout.tsx");

  assert.match(loader, /window\.__fieldgridGoogleMapsLoader/u);
  assert.match(loader, /FIELDGRID_GOOGLE_MAPS_SCRIPT_ID/u);
  assert.match(canvas, /IntersectionObserver/u);
  assert.match(canvas, /data-google-map-lazy/u);
  assert.doesNotMatch(dashboardLayout, /loadGoogleMapsJavaScriptApi|maps\.googleapis\.com/u);
  assert.doesNotMatch(rootLayout, /loadGoogleMapsJavaScriptApi|maps\.googleapis\.com/u);
});

test("Sprint 12 cleanup is tracked by package gate", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(
    pkg.scripts["fieldgrid:google-maps-sprint12:check"],
    "node --test tests/fieldgrid-google-maps-sprint12-legacy-cleanup.test.mjs",
  );
});
