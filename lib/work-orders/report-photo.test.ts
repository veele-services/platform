import { expect,it,vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only",()=>({}));
import { validateReportPhoto } from "./report-photo";
it("fully decodes accepted photos and removes embedded metadata",async()=>{const input=await sharp({create:{width:8,height:8,channels:3,background:"blue"}}).withMetadata({exif:{IFD0:{Copyright:"INTERNAL CANARY"}}}).jpeg().toBuffer();const clean=await validateReportPhoto(input,"image/jpeg");expect((await sharp(clean.bytes).metadata()).exif).toBeUndefined();expect(clean.extension).toBe("jpg");});
it("rejects misleading MIME, corrupt bytes and non-image content",async()=>{const png=await sharp({create:{width:8,height:8,channels:3,background:"blue"}}).png().toBuffer();await expect(validateReportPhoto(png,"image/jpeg")).rejects.toThrow();await expect(validateReportPhoto(Buffer.from("<svg><script>alert(1)</script></svg>"),"image/png")).rejects.toThrow();await expect(validateReportPhoto(png.subarray(0,30),"image/png")).rejects.toThrow();});
