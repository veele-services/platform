import assert from "node:assert/strict";
import test from "node:test";

import {
  FIELDGRID_ROUTES,
  PLATFORM_ROUTES,
  TENANT_ROUTES,
  getFieldgridRoute,
  permissionParts,
  type FieldgridRouteDefinition,
} from "../../artifacts/backoffice/src/lib/navigation/route-registry";

const tenantRoutes = TENANT_ROUTES as readonly FieldgridRouteDefinition[];
const platformRoutes = PLATFORM_ROUTES as readonly FieldgridRouteDefinition[];
const allRoutes = FIELDGRID_ROUTES as readonly FieldgridRouteDefinition[];

test("route ids are globally unique and primary routes have a group", () => {
  assert.equal(
    new Set(allRoutes.map((route) => route.id)).size,
    allRoutes.length,
  );

  for (const route of allRoutes.filter(
    (candidate) => candidate.releaseVisibility === "primary",
  )) {
    assert.ok(route.navGroup, `${route.id} must belong to a navigation group`);
  }
});

test("tenant navigation follows the grouped daily information architecture", () => {
  const groups = new Map(
    tenantRoutes
      .filter((route) => route.releaseVisibility === "primary")
      .map((route) => [route.id, route.navGroup]),
  );

  assert.equal(groups.get("tenant-dashboard"), "daily");
  assert.equal(groups.get("tenant-planning"), "daily");
  assert.equal(groups.get("tenant-assignments"), "daily");
  assert.equal(groups.get("tenant-customers"), "relations");
  assert.equal(groups.get("tenant-objects"), "relations");
  assert.equal(groups.get("tenant-personnel"), "people");
  assert.equal(groups.get("tenant-quotes"), "administration");
  assert.equal(groups.get("tenant-tickets"), "communication");
  assert.equal(groups.get("tenant-settings"), "management");
});

test("map is a planning view and support routes stay outside primary navigation", () => {
  assert.equal(
    tenantRoutes.some((route) => route.href.includes("view=map")),
    false,
  );

  for (const id of ["tenant-help", "tenant-roadmap", "tenant-releases"]) {
    assert.equal(
      tenantRoutes.find((route) => route.id === id)?.releaseVisibility,
      "support",
    );
  }
});

test("unfinished platform service routes stay hidden from release navigation", () => {
  for (const id of ["platform-tickets", "platform-notifications"]) {
    assert.equal(
      platformRoutes.find((route) => route.id === id)?.releaseVisibility,
      "hidden",
    );
  }
});

test("route matching chooses the most specific canonical route", () => {
  assert.equal(
    getFieldgridRoute("/personnel/verlof", "tenant")?.id,
    "tenant-leave",
  );
  assert.equal(
    getFieldgridRoute("/instellingen/rollen", "tenant")?.id,
    "tenant-settings",
  );
  assert.equal(
    getFieldgridRoute("/platform/tenants/example", "platform")?.id,
    "platform-tenant-detail",
  );
});

test("every declared permission has valid resource and action parts", () => {
  for (const route of tenantRoutes) {
    if (!route.permission) continue;
    const permission = permissionParts(route.permission);
    assert.ok(permission, `invalid permission on ${route.id}`);
    assert.ok(permission.resource.length > 0);
    assert.ok(permission.action.length > 0);
  }
});
