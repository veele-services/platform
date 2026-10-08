import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ APP_URL: "https://fieldgrid.example.test" }) }));
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/files/scanned-storage", () => ({ readScannedFile: read }));
import { getBrandingLogoUrl } from "./logo";
import type { createClient } from "@/lib/supabase/server";
const tenant = "10000000-0000-4000-8000-000000000001";
const client = {} as Awaited<ReturnType<typeof createClient>>;
beforeEach(() => { read.mockReset(); read.mockResolvedValue({ mime: "image/png", bytes: new Uint8Array(20) }); });
describe("browser logo origin", () => {
  it("uses the current origin so tenant CSP can display the scanned logo", async () => {
    const result = await getBrandingLogoUrl(client, `${tenant}/brand.png`);
    expect(result).toMatch(new RegExp(`^/api/branding/${tenant}/email-logo\\?v=[a-f0-9]{64}$`));
    expect(new URL(result!, "https://tenant.fieldgrid.nl").origin).toBe("https://tenant.fieldgrid.nl");
  });
  it("keeps exported email templates on an explicit trusted absolute origin", async () => {
    const result = await getBrandingLogoUrl(client, `${tenant}/brand.png`, { absolute: true });
    expect(result).toMatch(/^https:\/\/fieldgrid\.example\.test\/api\/branding\//);
  });
  it("does not render an unreadable or non-image asset", async () => {
    read.mockResolvedValue(null); expect(await getBrandingLogoUrl(client, `${tenant}/brand.png`)).toBeNull();
    read.mockResolvedValue({ mime: "text/html", bytes: new Uint8Array(20) }); expect(await getBrandingLogoUrl(client, `${tenant}/brand.png`)).toBeNull();
  });
});
