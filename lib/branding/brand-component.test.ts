import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
describe("tenant brand identity", () => {
  it("uses only the logo when configured", () => {
    const html = renderToStaticMarkup(createElement(FieldgridBrand, { tenantName: "Example tenant", logoUrl: "/api/branding/test/email-logo" }));
    expect(html).toContain('alt="Logo van Example tenant"');
    expect(html).not.toContain("brand-tenant-name"); expect(html).not.toContain("brand-name-fallback");
  });
  it("shows the tenant name without a logo and Fieldgrid without tenant branding", () => {
    expect(renderToStaticMarkup(createElement(FieldgridBrand, { tenantName: "Example tenant" }))).toContain(">Example tenant</span>");
    expect(renderToStaticMarkup(createElement(FieldgridBrand))).toContain(">Fieldgrid</span>");
  });
});
