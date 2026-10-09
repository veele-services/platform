import { expect, it } from "vitest";
import {
  audienceSchema,
  availabilityInputSchema,
  productCommandSchema,
  querySchema,
} from "./model";
const tenant = "11111111-1111-4111-8111-111111111111";
it("requires both explicit tenant scope and recipient groups; empty never means everybody", () => {
  for (const a of [
    { scope: "selected", tenants: [], groups: ["staff"] },
    { scope: "all", tenants: [], groups: [] },
    { scope: "internal", tenants: [], groups: ["management"] },
    { scope: "all", tenants: [tenant], groups: ["staff"] },
  ])
    expect(audienceSchema.safeParse(a).success).toBe(false);
  expect(
    audienceSchema.parse({
      scope: "selected",
      tenants: [tenant],
      groups: ["management", "staff"],
    }),
  ).toBeTruthy();
});
it("registers staging and production independently and rejects duplicate or empty availability selections", () => {
  expect(
    availabilityInputSchema.parse([
      { environment: "staging", scope: "all", tenants: [], phased: false },
    ]),
  ).toHaveLength(1);
  expect(
    availabilityInputSchema.safeParse([
      {
        environment: "production",
        scope: "selected",
        tenants: [],
        phased: true,
      },
    ]).success,
  ).toBe(false);
  expect(
    availabilityInputSchema.safeParse([
      { environment: "staging", scope: "all", tenants: [], phased: false },
      { environment: "staging", scope: "all", tenants: [], phased: false },
    ]).success,
  ).toBe(false);
});
it("never accepts browser-supplied submitter, tenant, state or publication in an idea", () => {
  const p = {
    workspace: "backoffice",
    requestId: tenant,
    operation: {
      command: "submit_idea",
      payload: {
        title: "Planning verbeteren",
        category: "Planning",
        problem: "Een concrete verbetering voor onze planning",
        suggestion: "",
        benefit: "",
      },
    },
  };
  expect(productCommandSchema.parse(p)).toBeTruthy();
  for (const key of [
    "tenantId",
    "createdBy",
    "state",
    "audience",
    "publication",
  ])
    expect(
      productCommandSchema.safeParse({
        ...p,
        operation: {
          ...p.operation,
          payload: { ...p.operation.payload, [key]: tenant },
        },
      }).success,
    ).toBe(false);
});
it("bounds literal searches and pagination without accepting an actor override", () => {
  expect(
    querySchema.parse({ search: "%'_", page: "2", pageSize: "25" }),
  ).toMatchObject({ search: "%'_", page: 2, pageSize: 25 });
  for (const input of [
    { page: 0 },
    { pageSize: 1000 },
    { tenantId: tenant },
    { search: "x".repeat(161) },
  ])
    expect(querySchema.safeParse(input).success).toBe(false);
});
