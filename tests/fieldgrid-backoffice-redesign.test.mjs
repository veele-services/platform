import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("backoffice shell follows the compact premium navigation contract", async () => {
  const [sidebar, globals, header, routes] = await Promise.all([
    read("artifacts/backoffice/src/components/layout/Sidebar.tsx"),
    read("artifacts/backoffice/src/app/globals.css"),
    read("artifacts/backoffice/src/components/layout/DashboardHeader.tsx"),
    read("artifacts/backoffice/src/lib/navigation/route-registry.ts"),
  ]);

  assert.match(sidebar, /w-\[232px\]/u);
  assert.match(sidebar, /w-\[68px\]/u);
  assert.match(sidebar, /w-\[278px\]/u);
  assert.match(sidebar, /Beveiligde omgeving/u);
  assert.match(sidebar, /min-h-11/u);
  assert.match(globals, /\.sidebar-link\.active::before/u);
  assert.match(globals, /tenant-sidebar-surface/u);
  assert.match(header, /h-\[70px\]/u);
  assert.match(header, /operationele context/u);
  assert.doesNotMatch(header, /<h1/u);
  assert.match(routes, /title: "Medewerkers"/u);
  assert.match(routes, /title: "Verlof & beschikbaarheid"/u);
});

test("dashboard is task-led and no longer renders the legacy hero or card wall", async () => {
  const [page, experience] = await Promise.all([
    read("artifacts/backoffice/src/app/(dashboard)/page.tsx"),
    read(
      "artifacts/backoffice/src/components/dashboard/DashboardExperience.tsx",
    ),
  ]);

  assert.doesNotMatch(page, /Tenant command center/iu);
  assert.match(page, /Vandaag aandacht nodig/u);
  assert.match(page, /todayInAmsterdam/u);
  assert.match(
    page,
    /overflow-hidden rounded-lg border border-border bg-card/u,
  );
  assert.match(experience, /persona === "all"[\s\S]*: \[persona\]/u);
  assert.doesNotMatch(experience, /ring-2 ring-primary/u);
});

test("planning uses one calm cockpit header, a visible desktop queue and a display drawer", async () => {
  const source = await read(
    "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
  );

  assert.doesNotMatch(source, /planningPulseCards/u);
  assert.match(source, /<h1[^>]*>[\s\S]*Planning[\s\S]*<\/h1>/u);
  assert.match(source, /xl:grid-cols-\[300px_minmax\(0,1fr\)\]/u);
  assert.match(source, /title="Weergave"/u);
  assert.match(source, /Zoek medewerker, klant, object of werkbon/u);
  assert.doesNotMatch(source, /aria-label="Zoeken"/u);
});

test("Dossier 360 and personnel access use one responsive, explicit experience", async () => {
  const [personnelPage, detailActions, portalAccess, dossier, responsive] =
    await Promise.all([
      read("artifacts/backoffice/src/app/(dashboard)/personnel/[id]/page.tsx"),
      read(
        "artifacts/backoffice/src/components/personnel/PersonnelDetailActions.tsx",
      ),
      read(
        "artifacts/backoffice/src/components/personnel/PersonnelPortalAccessCard.tsx",
      ),
      read(
        "artifacts/backoffice/src/components/dossiers/DossierWorkspacePanel.tsx",
      ),
      read(
        "artifacts/backoffice/src/components/tenant-ui/tenant-detail-responsive-actions.tsx",
      ),
    ]);

  assert.match(personnelPage, /TenantDetailResponsiveActions/u);
  assert.equal(
    personnelPage.match(/<PersonnelPortalAccessCard/gu)?.length,
    1,
    "personnel page must render one canonical portal-access control",
  );
  assert.doesNotMatch(detailActions, /Uitnodiging opnieuw sturen/u);
  assert.match(
    detailActions,
    /Account geactiveerd, maar de activatiemail is niet verstuurd/u,
  );
  assert.match(portalAccess, /role="alert"/u);
  assert.match(portalAccess, /size-11/u);
  assert.match(dossier, /CLASSIFICATION_LABEL/u);
  assert.match(dossier, /divide-y divide-border/u);
  assert.match(responsive, /fixed bottom-/u);
});

test("redesign screenshot evidence covers dashboard, planning and personnel 360", async () => {
  const script = await read(
    "scripts/fieldgrid-backoffice-redesign-screenshots.mjs",
  );
  for (const target of [
    "dashboard-desktop-1440",
    "dashboard-mobile-390",
    "dashboard-mobile-navigation-390",
    "planning-desktop-1440",
    "personnel-360-desktop-1440",
    "personnel-360-mobile-390",
  ]) {
    assert.match(script, new RegExp(target, "u"));
  }
  assert.match(script, /pageHorizontalOverflow/u);
  assert.match(script, /drawerWidth/u);
});
