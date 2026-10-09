import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(), tenant: vi.fn(), permission: vi.fn(), upload: vi.fn(),
  update: vi.fn(), insert: vi.fn(), filters: [] as Array<[string, unknown]>,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/platform/data", () => ({ requirePlatformAdmin: mocks.platform }));
vi.mock("@/lib/management/auth", () => ({ requireBackofficePermission: mocks.permission }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: mocks.tenant,
  hasAnyRole: (context: { tenant?: { roles: string[] } }, roles: string[]) => context.tenant?.roles.some(role => roles.includes(role)),
}));
vi.mock("@/lib/files/scanned-storage", () => ({ uploadScannedFile: mocks.upload }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => database() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database() }));

import { uploadPlatformTenantLogo } from "@/app/platform/actions";
import { uploadTenantLogo } from "@/app/app/operations-actions";

const tenantId = "10000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000002";
function database() {
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { mocks.filters.push([key, value]); return query; },
    single: async () => ({ data: { logo_path: null }, error: null }),
    update: (value: unknown) => { mocks.update(value); return query; },
    insert: mocks.insert,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return { from: () => query };
}

type ImageFixture = { bytes: Uint8Array; mime: string };
const images = new Map<string, ImageFixture>();
const actions = [
  { name: "platform", upload: uploadPlatformTenantLogo },
  { name: "tenant", upload: uploadTenantLogo },
] as const;
function form(fixture: ImageFixture) {
  const data = new FormData();
  data.set("tenantId", tenantId);
  data.set("logo", new File([new Uint8Array(fixture.bytes)], "fictitious-logo", { type: fixture.mime }));
  return data;
}

beforeAll(async () => {
  for (const [format, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]] as const) {
    const bytes = await sharp({ create: { width: 24, height: 12, channels: 3, background: "#315b6e" } }).toFormat(format).toBuffer();
    images.set(format, { bytes, mime });
  }
  for (const [name, width, height] of [["wide", 4097, 1], ["tall", 1, 4097], ["pixels", 4001, 4000]] as const) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    images.set(name, { bytes, mime: "image/png" });
  }
  const frames = Buffer.alloc(2 * 2 * 2 * 4);
  for (let offset = 0; offset < frames.length; offset += 4) {
    frames[offset] = offset < 16 ? 255 : 0;
    frames[offset + 1] = offset < 16 ? 0 : 255;
    frames[offset + 3] = 255;
  }
  const animated = await sharp(frames, { raw: { width: 2, height: 4, channels: 4, pageHeight: 2 } }).webp({ lossless: true, loop: 0, delay: [100, 100] }).toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  images.set("animated", { bytes: animated, mime: "image/webp" });
  const complete = await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).png().toBuffer();
  const truncated = complete.subarray(0, 80);
  expect((await sharp(truncated).metadata()).width).toBe(100);
  await expect(sharp(truncated).stats()).rejects.toThrow();
  images.set("truncated", { bytes: truncated, mime: "image/png" });
  images.set("mime-spoof", { ...images.get("jpeg")!, mime: "image/png" });
  images.set("svg", { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="red"/></svg>'), mime: "image/svg+xml" });
  images.set("over-bytes", { bytes: new Uint8Array(2 * 1024 * 1024 + 1), mime: "image/png" });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.platform.mockResolvedValue({ user: { id: actorId } });
  mocks.tenant.mockResolvedValue({ user: { id: actorId }, tenant: { id: tenantId, roles: ["tenant_admin"], enabledServices: [] } });
  mocks.permission.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({});
  mocks.insert.mockResolvedValue({ error: null });
});

describe.each(actions)("$name logo upload matches PWA image requirements", ({ name, upload }) => {
  it.each(["png", "jpeg", "webp"])("fully decodes genuine %s before scanning and immutable metadata publication", async format => {
    const fixture = images.get(format)!;
    expect((await upload(form(fixture))).ok).toBe(true);
    expect(mocks.upload).toHaveBeenCalledOnce();
    const [, bucket, path, bytes, mime] = mocks.upload.mock.calls[0];
    expect(bucket).toBe("branding");
    expect(path).toMatch(new RegExp(`^${tenantId}/logo-[a-f0-9-]{36}\\.${format === "jpeg" ? "jpg" : format}$`));
    expect(bytes).toEqual(new Uint8Array(fixture.bytes));
    expect(mime).toBe(fixture.mime);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ logo_path: path });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upload.mock.invocationCallOrder[0]);
    expect(mocks.filters).toContainEqual(["tenant_id", tenantId]);
  });

  it.each(["wide", "tall", "pixels", "animated", "truncated", "mime-spoof", "svg", "over-bytes"])("rejects real %s image violation before scanner/Storage or metadata side effects", async violation => {
    expect((await upload(form(images.get(violation)!))).ok).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps the authorization gate before publishing even a valid logo", async () => {
    if (name === "platform") mocks.platform.mockRejectedValueOnce(new Error("Geen platformrecht"));
    else mocks.permission.mockRejectedValueOnce(new Error("Geen huisstijlrecht"));
    expect((await upload(form(images.get("png")!))).ok).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves scanner failure instead of publishing validated but unattested bytes", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Scanner niet gereed"));
    expect((await upload(form(images.get("png")!))).ok).toBe(false);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

it("retains platform identity revalidation after scan/upload and before metadata changes", async () => {
  mocks.platform.mockResolvedValueOnce({ user: { id: actorId } }).mockResolvedValueOnce({ user: { id: "10000000-0000-4000-8000-000000000003" } });
  expect((await uploadPlatformTenantLogo(form(images.get("png")!))).ok).toBe(false);
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.platform).toHaveBeenCalledTimes(2);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
