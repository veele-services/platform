import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contentUrl = new URL("../content/website-content.json", import.meta.url);
const content = JSON.parse(await readFile(contentUrl, "utf8"));

const expectedRoutes = [
  "/",
  "/diensten",
  "/schoonmaak",
  "/schoonmaak/kantoorschoonmaak",
  "/schoonmaak/vve-vastgoed",
  "/schoonmaak/winkels",
  "/schoonmaak/horeca",
  "/schoonmaak/glasbewassing",
  "/schoonmaak/specialistisch-oplevering",
  "/beveiliging",
  "/beveiliging/objectbeveiliging",
  "/beveiliging/mobiele-surveillance",
  "/beveiliging/winkelbeveiliging",
  "/beveiliging/evenementen",
  "/beveiliging/horeca",
  "/beveiliging/receptie-toegangscontrole",
  "/beveiliging/persoonsbeveiliging",
  "/beveiliging/chauffeursdiensten",
  "/facilitair",
  "/facilitair/receptie-gastvrijheid",
  "/facilitair/evenementenpersoneel",
  "/facilitair/horeca-bar",
  "/facilitair/sanitaire-service",
  "/oplossingen",
  "/oplossingen/kantoren",
  "/oplossingen/vve-vastgoed",
  "/oplossingen/retail",
  "/oplossingen/horeca-hotels",
  "/oplossingen/evenementen",
  "/oplossingen/zorg-onderwijs",
  "/over-ons",
  "/cases",
  "/kennis",
  "/werken-bij",
  "/contact",
  "/offerte",
  "/portaal",
  "/den-haag",
  "/scheveningen",
  "/rijswijk",
  "/voorburg-leidschendam",
  "/wassenaar",
  "/delft",
  "/zoetermeer",
];

test("marketing inventory contains exactly the approved 44 unique routes", () => {
  const actualRoutes = content.pages.map((page) => page.slug);

  assert.equal(actualRoutes.length, 44);
  assert.equal(new Set(actualRoutes).size, 44);
  assert.deepEqual([...actualRoutes].sort(), [...expectedRoutes].sort());

  for (const route of actualRoutes) {
    assert.match(route, /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/);
    assert.equal(route === "/" || route.endsWith("/") === false, true);
  }
});

test("every route has complete metadata and one matching SEO record", () => {
  assert.equal(content.seo_matrix.length, 44);
  assert.equal(new Set(content.seo_matrix.map((entry) => entry.slug)).size, 44);

  for (const page of content.pages) {
    assert.ok(page.name.trim(), `${page.slug} has no name`);
    assert.ok(page.h1.trim(), `${page.slug} has no h1`);
    assert.ok(page.seo_title.trim(), `${page.slug} has no SEO title`);
    assert.ok(page.meta.trim(), `${page.slug} has no meta description`);

    const seo = content.seo_matrix.find((entry) => entry.slug === page.slug);
    assert.ok(seo, `${page.slug} has no SEO record`);
    assert.equal(seo.title, page.seo_title, `${page.slug} SEO title differs`);
    assert.equal(seo.meta, page.meta, `${page.slug} SEO description differs`);
  }
});
