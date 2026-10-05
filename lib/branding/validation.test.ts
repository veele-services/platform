import { describe,expect,it } from "vitest";
import { rejectLogoAnimation,tenantHouseStyleSchema,validateLogoMetadata } from "./validation";
const input={primaryColor:"#222C35",accentColor:"#41AC42",senderName:"Fictieve leverancier",senderEmail:"",expectedUpdatedAt:"2026-10-05T09:00:00.123456+00:00",logoAction:"keep"};
describe("tenant house style input",()=>{
 it("uses existing seeds and timestamp without a competing secondary setting",()=>{expect(tenantHouseStyleSchema.parse(input)).toMatchObject({primaryColor:"#222c35",accentColor:"#41ac42"});});
 it.each(["tenantId","customerId","logo_path","logoUrl","whiteLabelEnabled","iban","secondaryColor"])("rejects forged %s",field=>{expect(tenantHouseStyleSchema.safeParse({...input,[field]:"FORGED"}).success).toBe(false);});
 it.each([{primaryColor:"red"},{accentColor:"url(https://external.invalid)"},{expectedUpdatedAt:"invalid"},{senderName:"x"},{senderEmail:"invalid"},{logoAction:"delete_history"}])("rejects malformed settings",change=>{expect(tenantHouseStyleSchema.safeParse({...input,...change}).success).toBe(false);});
 it.each([["png","image/png"],["jpeg","image/jpeg"],["webp","image/webp"]])("accepts genuine bounded %s metadata",(format,mime)=>{expect(()=>validateLogoMetadata({format,width:1440,height:400,pages:1},mime)).not.toThrow();});
 it.each([{format:"svg",width:100,height:100},{format:"png",width:4097,height:100},{format:"png",width:4096,height:4096},{format:"png",width:1,height:1,pages:2},{format:"png",width:0,height:100}])("rejects unbounded, animated or unrecognized image metadata",metadata=>{expect(()=>validateLogoMetadata(metadata,"image/png")).toThrow();});
 it("rejects a declared MIME differing from the decoded format",()=>{expect(()=>validateLogoMetadata({format:"jpeg",width:100,height:100},"image/png")).toThrow();});
 it("rejects APNG animation controls even when a decoder exposes only its first frame",()=>{
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,8,97,99,84,76,0,0,0,2,0,0,0,0,0,0,0,0]);
  expect(()=>rejectLogoAnimation(bytes,"image/png")).toThrow("niet-geanimeerd");
 });
 it("rejects animated WebP feature flags before scanning",()=>{
  const bytes=new Uint8Array([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,2,0,0,0,0,0,0,0,0,0]);
  expect(()=>rejectLogoAnimation(bytes,"image/webp")).toThrow("niet-geanimeerd");
  bytes[20]=0;expect(()=>rejectLogoAnimation(bytes,"image/webp")).not.toThrow();
 });
});
