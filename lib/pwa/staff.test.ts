import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildStaffManifest, buildStaffMetadata, FIELDGRID_PWA_IDENTITY, isStaffPwaPresentationPath, staffPwaAssetSize } from "./presentation";
import { isProtectedPage } from "@/lib/auth/session-signal";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), admin: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), file: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/files/scanned-storage", () => ({ readScannedFile: mocks.file }));
import { getStaffPwaIdentity, getStaffPwaSource } from "./staff";
import { renderStaffPwaImage } from "./image";
import { GET as manifestGET } from "@/app/staff/manifest.webmanifest/route";
import { GET as imageGET } from "@/app/staff/pwa/[asset]/route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const fixtureTenant = () => ({ id: tenantId, name: "Fictieve werkgever", tenant_branding: { primary_color: "#31495e", logo_path: `${tenantId}/fixture.png` }, tenant_settings: { white_label_enabled: false } });
let tenant = fixtureTenant();

beforeEach(async () => {
  vi.clearAllMocks();
  tenant = fixtureTenant();
  mocks.headers.mockResolvedValue(new Headers({ "x-fieldgrid-host-kind": "tenant", "x-fieldgrid-tenant-slug": "fixture-tenant" }));
  mocks.admin.mockReturnValue({ from: mocks.from });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single };
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.single.mockImplementation(async () => ({ data: tenant, error: null }));
  mocks.file.mockResolvedValue({ mime: "image/png", bytes: await sharp({ create: { width: 320, height: 160, channels: 4, background: "#e32040" } }).png().toBuffer(), sha256: "f".repeat(64) });
});

describe("host-bound staff installation identity", () => {
  it("keeps Fieldgrid icon, name and colours for a branded tenant without white-label", async () => {
    const source = await getStaffPwaSource();
    expect(source).toEqual({ tenantId, logoPath: null, identity: FIELDGRID_PWA_IDENTITY });
    expect(mocks.eq.mock.calls).toEqual([["slug", "fixture-tenant"], ["status", "active"]]);
    expect(mocks.file).not.toHaveBeenCalled();
    const response = await manifestGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const manifest = await response.json();
    expect(manifest).toMatchObject({ id: "/staff", name: "Fieldgrid", start_url: "/staff", scope: "/", display: "standalone", prefer_related_applications: false });
    expect(JSON.stringify(manifest)).not.toMatch(/Fictieve|fixture|tenantId|logo_path|settings|roles/);
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "192x192", "512x512", "512x512"]);
  });

  it("uses the current host tenant only when the live white-label entitlement is true", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    const identity = await getStaffPwaIdentity();
    expect(identity).toMatchObject({ name: "Fictieve werkgever", whiteLabel: true, themeColor: "#31495e", iconUrl: "/staff/pwa/icon-192.png" });
    expect(buildStaffManifest(identity).icons?.every(icon => icon.src.startsWith("/staff/pwa/"))).toBe(true);
    const metadata = buildStaffMetadata(identity);
    expect(metadata.other).toEqual({ "apple-mobile-web-app-capable": "yes" });
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "Fictieve werkgever" });
    expect(JSON.stringify(metadata.icons)).toContain("/staff/pwa/apple-touch.png");
    expect(JSON.stringify(metadata)).not.toContain(tenantId);
  });

  it("returns Fieldgrid on the platform host without a tenant or account query", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-fieldgrid-host-kind": "platform" }));
    expect(await getStaffPwaIdentity()).toEqual(FIELDGRID_PWA_IDENTITY);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    {}, { "x-fieldgrid-host-kind": "invalid" },
    { "x-fieldgrid-host-kind": "platform", "x-fieldgrid-tenant-slug": "fixture-tenant" },
    { "x-fieldgrid-host-kind": "tenant", "x-fieldgrid-tenant-slug": "../other" },
  ])("fails closed for untrusted or inconsistent host signals %j", async signals => {
    mocks.headers.mockResolvedValue(new Headers(Object.entries(signals).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
    await expect(getStaffPwaIdentity()).rejects.toThrow("Onbekende tenant");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([{ data: null, error: null }, { data: fixtureTenant(), error: { message: "outage" } }, { data: { ...fixtureTenant(), tenant_settings: null }, error: null }])("never falls back to another tenant or stale branding after resolver failure", async reply => {
    mocks.single.mockResolvedValue(reply);
    expect((await manifestGET()).status).toBe(404);
  });

  it("ignores a foreign or unsafe stored logo path instead of reading it", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    tenant.tenant_branding.logo_path = "20000000-0000-4000-8000-000000000002/foreign.png";
    expect((await getStaffPwaSource()).logoPath).toBeNull();
    const image = await renderStaffPwaImage("icon-192.png");
    expect(image).not.toBeNull();
    expect(mocks.file).not.toHaveBeenCalled();
  });
});

describe("public, scanned, bounded PWA presentation images", () => {
  it("renders actual tenant bytes as padded PNGs within the maskable safe zone", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    const bytes = await renderStaffPwaImage("maskable-512.png");
    expect(mocks.file).toHaveBeenCalledExactlyOnceWith("branding", tenant.tenant_branding.logo_path, undefined, expect.anything());
    const image = sharp(bytes!);
    expect(await image.metadata()).toMatchObject({ format: "png", width: 512, height: 512 });
    const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    expect(pixel(256, 256)).toEqual([227, 32, 64]);
    expect(pixel(256, 30)).toEqual([255, 255, 255]);
    expect(pixel(10, 256)).toEqual([255, 255, 255]);
  });

  it("preserves every corner of a square logo inside the Android safe circle", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    mocks.file.mockResolvedValue({ mime: "image/png", bytes: await sharp({ create: { width: 256, height: 256, channels: 4, background: "#e32040" } }).png().toBuffer() });
    for (const size of [192, 512]) {
      const { data, info } = await sharp((await renderStaffPwaImage(`maskable-${size}.png`))!).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let paintedPixels = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 3;
        if (data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255) continue;
        paintedPixels++;
        expect(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)).toBeLessThanOrEqual(size * 0.4);
      }
      expect(paintedPixels).toBeGreaterThan(size * size * 0.25);
    }
  });

  it("renders tenant branding on Apple splash and rechecks identity after I/O", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    const response = await imageGET(new Request("https://fixture.test/staff/pwa/splash-750x1334.png?tenantId=FORGED"), { params: Promise.resolve({ asset: "splash-750x1334.png" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).toMatchObject({ width: 750, height: 1334 });
    expect(mocks.single).toHaveBeenCalledTimes(2);
  });

  it("never exposes bytes when entitlement or current logo changes during file I/O", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    mocks.file.mockImplementation(async () => {
      const bytes = await sharp({ create: { width: 10, height: 10, channels: 4, background: "red" } }).png().toBuffer();
      tenant.tenant_settings.white_label_enabled = false;
      return { bytes, mime: "image/png" };
    });
    expect(await renderStaffPwaImage("icon-192.png")).toBeNull();
    tenant.tenant_settings.white_label_enabled = true;
    mocks.single.mockResolvedValueOnce({ data: structuredClone(tenant), error: null }).mockResolvedValueOnce({ data: { ...tenant, tenant_branding: { ...tenant.tenant_branding, logo_path: `${tenantId}/replacement.png` } }, error: null });
    expect(await renderStaffPwaImage("icon-192.png")).toBeNull();
  });

  it("fails closed for unscanned, invalid MIME, oversized and invalid image bytes", async () => {
    tenant.tenant_settings.white_label_enabled = true;
    for (const file of [null, { bytes: new Uint8Array([1]), mime: "image/svg+xml" }, { bytes: new Uint8Array(2 * 1024 * 1024 + 1), mime: "image/png" }, { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" }]) {
      mocks.file.mockResolvedValue(file);
      expect((await imageGET(new Request("https://fixture.test/staff/pwa/icon-192.png"), { params: Promise.resolve({ asset: "icon-192.png" }) })).status).toBe(404);
    }
  });

  it.each(["../../secret", "icon-8192.png", "splash-100000x100000.png", "https://attacker.invalid/image.png", "icon-192.png/anything"])("rejects unsupported dimensions or paths before any lookup: %s", async asset => {
    expect(await renderStaffPwaImage(asset)).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.file).not.toHaveBeenCalled();
  });

  it("keeps authenticated routes protected and only exempts exact fixed public assets", () => {
    for (const path of ["/staff/manifest.webmanifest", "/staff/pwa/icon-192.png", "/staff/pwa/splash-750x1334.png"]) {
      expect(isStaffPwaPresentationPath(path)).toBe(true);
      expect(isProtectedPage(path)).toBe(false);
    }
    for (const path of ["/staff", "/staff/notificaties", "/staff/pwa/secret.png", "/staff/manifest.webmanifest/private", "/staff/pwa/icon-192.png/secret"]) expect(isProtectedPage(path)).toBe(true);
    expect(staffPwaAssetSize("splash-2048x2732.png")).toMatchObject({ width: 2048, height: 2732, kind: "splash" });
  });

  it("bounds concurrent anonymous render work and releases capacity after failures", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    mocks.headers.mockImplementation(async () => { await gate; throw new Error("fixture resolution failure"); });
    const request = () => imageGET(new Request("https://fixture.test/staff/pwa/splash-2048x2732.png"), { params: Promise.resolve({ asset: "splash-2048x2732.png" }) });
    const pending = Array.from({ length: 4 }, request);
    const busy = await request();
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("2");
    release();
    expect((await Promise.all(pending)).map(response => response.status)).toEqual([404, 404, 404, 404]);
    expect((await request()).status).toBe(404);
  });
});
