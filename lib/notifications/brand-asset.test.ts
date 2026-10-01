import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const scans=vi.hoisted(()=>({read:vi.fn(),publish:vi.fn()}));
vi.mock("@/lib/files/scanned-storage",()=>({readScannedFile:scans.read,publishScannedFile:scans.publish}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(slug:string,path:string)=>`https://${slug}.example.test${path}`}));
import { freezeEmailLogo } from "./brand-asset";
const bytes=Buffer.from("FICTITIOUS-image-bytes"),hash=createHash("sha256").update(bytes).digest("hex");
function client(active=true){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:active?{id:"tenant"}:null,error:null})};return{from:()=>q} as unknown as Parameters<typeof freezeEmailLogo>[0];}
beforeEach(()=>{vi.resetAllMocks();scans.read.mockResolvedValueOnce({bytes,mime:"image/png",sha256:hash}).mockResolvedValue(null);});
describe("immutable scanned mail branding", () => {
 it("publishes public logo bytes through the scan gateway into a content-addressed path", async()=>{
  expect(await freezeEmailLogo(client(),"tenant","fixture","tenant/logo.png")).toBe(`https://fixture.example.test/api/branding/tenant/email-logo?asset=${hash}.png`);
  expect(scans.publish.mock.calls[0][0]).toMatchObject({bucket:"branding",path:`tenant/notification-assets/${hash}.png`,bytes,mime:"image/png"});
  await expect(scans.publish.mock.calls[0][0].authorize()).resolves.toBeUndefined();
 });
 it("never downloads another tenant's asset or an arbitrary object path", async()=>{
  for(const path of ["other/logo.png","tenant/../other/logo.png"])await expect(freezeEmailLogo(client(),"tenant","fixture",path)).rejects.toThrow();
  expect(scans.read).not.toHaveBeenCalled();
 });
 it("refuses an existing content-addressed asset whose bytes no longer match",async()=>{
  scans.read.mockReset().mockResolvedValueOnce({bytes,mime:"image/png"}).mockRejectedValueOnce(Error("Bestandscontrole mislukt"));
  await expect(freezeEmailLogo(client(),"tenant","fixture","tenant/logo.png")).rejects.toThrow("Bestandscontrole mislukt");
  expect(scans.read.mock.calls[1][2]).toBe(hash);expect(scans.publish).not.toHaveBeenCalled();
 });
 it("does not publish for a deactivated organization",async()=>{
  await expect(freezeEmailLogo(client(false),"tenant","fixture","tenant/logo.png")).rejects.toThrow("niet actief");expect(scans.publish).not.toHaveBeenCalled();
 });
});
