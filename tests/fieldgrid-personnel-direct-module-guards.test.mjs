import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function functionScope(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing function marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return source.slice(start, end === -1 ? undefined : end);
}

function assertModuleGuardBeforeFetch({
  path,
  module,
  startMarker,
  endMarker,
  fetchMarker,
}) {
  const source = read(path);
  assert.match(
    source,
    /import \{ requireCurrentPortalModule \} from "@\/lib\/auth\/tenant"/u,
    `${path} must import the canonical portal module guard`,
  );
  const scope = functionScope(source, startMarker, endMarker);
  const guardMarker = `await requireCurrentPortalModule("${module}")`;
  const guardIndex = scope.indexOf(guardMarker);
  const fetchIndex = scope.indexOf(fetchMarker);
  assert.notEqual(guardIndex, -1, `${path} must guard module ${module}`);
  assert.notEqual(fetchIndex, -1, `${path} must fetch through ${fetchMarker}`);
  assert.ok(
    guardIndex < fetchIndex,
    `${path} must require module ${module} before ${fetchMarker}`,
  );
}

test("personnel direct module routes guard entitlement before every data fetch", () => {
  for (const contract of [
    {
      path: "artifacts/personeel-pwa/src/app/(app)/documenten/page.tsx",
      module: "documents",
      startMarker: "export default async function DocumentenPage",
      fetchMarker: "await getMyDocuments(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/meldingen/page.tsx",
      module: "notifications",
      startMarker: "export default async function MeldingenPage",
      fetchMarker: "await getMyNotifications(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/instellingen/meldingen/page.tsx",
      module: "notifications",
      startMarker: "export default async function InstellingenMeldingenPage",
      fetchMarker: "await getMyPersonnel(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/help/page.tsx",
      module: "knowledgebase",
      startMarker: "export default async function PersonnelHelpPage",
      fetchMarker: "await getPersonnelKnowledgebaseHelpIndex(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/help/[slug]/page.tsx",
      module: "knowledgebase",
      startMarker: "export async function generateMetadata",
      endMarker: "export default async function PersonnelHelpArticlePage",
      fetchMarker: "await getPersonnelKnowledgebaseArticle(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/help/[slug]/page.tsx",
      module: "knowledgebase",
      startMarker: "export default async function PersonnelHelpArticlePage",
      fetchMarker: "await getPersonnelKnowledgebaseArticle(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/releases/page.tsx",
      module: "releases",
      startMarker: "export default async function PersonnelReleasesPage",
      fetchMarker: "await listPersonnelReleases(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/releases/[slug]/page.tsx",
      module: "releases",
      startMarker: "export default async function PersonnelReleaseDetailPage",
      fetchMarker: "await getPersonnelRelease(",
    },
    {
      path: "artifacts/personeel-pwa/src/app/(app)/releases/media/[mediaId]/route.ts",
      module: "releases",
      startMarker: "export async function GET",
      fetchMarker: "await getPersonnelReleaseMedia(",
    },
  ]) {
    assertModuleGuardBeforeFetch(contract);
  }
});
