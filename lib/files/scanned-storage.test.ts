import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks=vi.hoisted(()=>({rpc:vi.fn(),download:vi.fn(),upload:vi.fn(),scan:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc,storage:{from:()=>({download:mocks.download,upload:mocks.upload})}})}));
vi.mock("@/lib/tickets/scan",()=>({TICKET_FILE_LIMIT:10485760,scanTicketBytes:mocks.scan}));
import { publishScannedFile, readScannedFile, scanFileBytes } from "./scanned-storage";
const bytes=Buffer.from("%PDF-1.7\nFICTITIOUS TEST ONLY"),hash=createHash("sha256").update(bytes).digest("hex");
const scan={status:"clean",engine:"FICTITIOUS ClamAV mock",databaseVersion:"FICTITIOUS",databaseAt:new Date().toISOString()};
const input={bucket:"customer-documents",path:"tenant/customer/fixture.pdf",bytes,mime:"application/pdf",authorize:vi.fn()};
let receipt:string|null;
beforeEach(()=>{
 vi.resetAllMocks();receipt=null;
 mocks.scan.mockResolvedValue(scan);mocks.upload.mockResolvedValue({error:null});mocks.download.mockResolvedValue({data:new Blob([bytes],{type:input.mime}),error:null});
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
   if(name==="file_scan_state")return{data:{id:"object-id",version:"FICTITIOUS-v1",size:bytes.length,mime:input.mime,sha256:receipt},error:null};
   if(name==="file_scan_attest"){receipt=(args.proof as {sha256:string}).sha256;return{error:null};}
   throw Error("Unexpected RPC");
 });
});
it("scans immutable bytes and binds proof to the actual stored object version",async()=>{
 const result=await publishScannedFile(input);expect(result.sha256).toBe(hash);expect(receipt).toBe(hash);
 expect(input.authorize).toHaveBeenCalledTimes(3);expect(mocks.scan).toHaveBeenCalledWith(bytes);
 expect(mocks.upload).toHaveBeenCalledWith(input.path,bytes,{contentType:input.mime,upsert:false,cacheControl:"0"});
 expect(mocks.rpc).toHaveBeenCalledWith("file_scan_attest",expect.objectContaining({expected_id:"object-id",expected_version:"FICTITIOUS-v1",proof:expect.objectContaining({sha256:hash,size:bytes.length})}));
});
it.each(["rejected","pending","error"])("never publishes scanner outcome %s",async status=>{
 mocks.scan.mockResolvedValue({...scan,status});await expect(publishScannedFile(input)).rejects.toThrow("geweigerd");expect(mocks.upload).not.toHaveBeenCalled();expect(receipt).toBeNull();
});
it("does not publish when scanner is unavailable",async()=>{
 mocks.scan.mockRejectedValue(Error("Scanner unavailable"));await expect(publishScannedFile(input)).rejects.toThrow();expect(mocks.upload).not.toHaveBeenCalled();
});
it("revocation while scanning cannot publish",async()=>{
 input.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("Revoked"));await expect(publishScannedFile(input)).rejects.toThrow("Revoked");expect(mocks.upload).not.toHaveBeenCalled();
});
it("revocation during publication never certifies the object for raw reads",async()=>{
 input.authorize.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("Revoked"));
 await expect(publishScannedFile(input)).rejects.toThrow("Revoked");expect(receipt).toBeNull();
});
it("a same-content conflict retry succeeds without overwriting",async()=>{
 mocks.upload.mockResolvedValue({error:{statusCode:409}});expect((await publishScannedFile(input)).sha256).toBe(hash);expect(receipt).toBe(hash);
});
it("a same-path different-content retry never receives a clean receipt",async()=>{
 mocks.upload.mockResolvedValue({error:{statusCode:409}});mocks.download.mockResolvedValue({data:new Blob(["%PDF-different"]),error:null});
 await expect(publishScannedFile(input)).rejects.toThrow("andere inhoud");expect(receipt).toBeNull();
});
it("an unknown Storage error is not treated as an idempotent success",async()=>{
 mocks.upload.mockResolvedValue({error:{statusCode:503}});await expect(publishScannedFile(input)).rejects.toThrow();expect(mocks.download).not.toHaveBeenCalled();
});
it("legacy authorized reads are scanned without changing the original bytes",async()=>{
 expect((await readScannedFile(input.bucket,input.path))?.bytes).toEqual(new Uint8Array(bytes));expect(receipt).toBe(hash);expect(mocks.upload).not.toHaveBeenCalled();
});
it("only an exact receipt avoids a repeat scan",async()=>{
 receipt=hash;expect((await readScannedFile(input.bucket,input.path))?.sha256).toBe(hash);expect(mocks.scan).not.toHaveBeenCalled();
});
it("receipt hash is checked even if the parent has no digest",async()=>{
 receipt="a".repeat(64);await expect(readScannedFile(input.bucket,input.path)).rejects.toThrow("Bestandscontrole mislukt");
});
it("source hash must also match the stored bytes",async()=>{
 await expect(readScannedFile(input.bucket,input.path,"b".repeat(64))).rejects.toThrow("Bestandscontrole mislukt");expect(receipt).toBeNull();
});
it("a changed object during scan cannot be certified",async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{id:"object-id",version:"v1",size:bytes.length,mime:input.mime,sha256:null},error:null})
 .mockResolvedValueOnce({data:{id:"object-id",version:"v2",size:bytes.length,mime:input.mime,sha256:null},error:null});
 await expect(readScannedFile(input.bucket,input.path)).rejects.toThrow();expect(receipt).toBeNull();
});
it("metadata-only attestation errors do not release bytes",async()=>{
 mocks.rpc.mockImplementation(async name=>name==="file_scan_state"?{data:{id:"object-id",version:"v1",size:bytes.length,mime:input.mime},error:null}:{error:{code:"40001"}});
 await expect(readScannedFile(input.bucket,input.path)).rejects.toThrow();
});
it("preserves but does not silently approve historical files beyond the scan limit",async()=>{
 mocks.rpc.mockResolvedValue({data:{id:"object-id",version:"v1",size:10485761,mime:input.mime},error:null});
 await expect(readScannedFile(input.bucket,input.path)).rejects.toThrow("blijft bewaard");expect(mocks.download).not.toHaveBeenCalled();
});
it.each(["tenant/../file.pdf","tenant/%2f/file.pdf","tenant//file.pdf","tenant/back\\slash.pdf"])("rejects unsafe path %s before access",async path=>{
 await expect(readScannedFile(input.bucket,path)).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not accept a format by filename or supplied MIME alone",async()=>{
 await expect(scanFileBytes(Buffer.from("<script>"),"image/png")).rejects.toThrow("bestandsformaat");expect(mocks.scan).not.toHaveBeenCalled();
});
