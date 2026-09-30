import { describe,it,expect } from "vitest";
import sharp from "sharp";
import { validateSignaturePng } from "./report-signature";

async function image(kind:"transparent"|"white"|"stroke"|"dot"){
 const width=200,height=80,bytes=Buffer.alloc(width*height*4,kind==="white"?255:0);
 if(kind==="stroke"||kind==="dot")for(let x=20;x<(kind==="dot"?22:150);x++){const y=20+Math.floor((x-20)/5);for(let d=0;d<3;d++){const i=((y+d)*width+x)*4;bytes[i]=20;bytes[i+1]=35;bytes[i+2]=55;bytes[i+3]=255;}}
 return `data:image/png;base64,${(await sharp(bytes,{raw:{width,height,channels:4}}).png().toBuffer()).toString("base64")}`;
}
describe("signature image evidence",()=>{
 it.each(["transparent","white","dot"] as const)("rejects a %s canvas",async kind=>{await expect(validateSignaturePng(await image(kind))).rejects.toThrow("zichtbare handtekening");});
 it("rejects forged PNG MIME/base64",async()=>{await expect(validateSignaturePng("data:image/png;base64,"+Buffer.from("not an image").toString("base64"))).rejects.toThrow();});
 it("decodes and canonicalizes visible strokes without preserving image metadata",async()=>{const input=await image("stroke");const first=await validateSignaturePng(input),retry=await validateSignaturePng(input);expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);expect(first.sha256).toBe(retry.sha256);expect((await sharp(first.bytes).metadata()).format).toBe("png");});
});
