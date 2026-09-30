import { createHash } from "node:crypto";
import sharp from "sharp";

/** Fully decode PNG and require a visible stroke; a transparent/white canvas,
 * malformed input or a few isolated pixels are not an accepted signature. */
export async function validateSignaturePng(dataUrl: string): Promise<{ bytes: Buffer; sha256: string }> {
  if(!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)||dataUrl.length>2_800_000)throw new Error("Gebruik een geldige PNG-handtekening");
  const source=Buffer.from(dataUrl.slice("data:image/png;base64,".length),"base64");
  if(source.length<32||source.length>2*1024*1024||!source.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("Ongeldige handtekeningafbeelding");
  try {
    const image=sharp(source,{limitInputPixels:2_000_000,failOn:"warning"});
    const meta=await image.metadata();
    if(meta.format!=="png"||!meta.width||!meta.height||meta.width<100||meta.height<40||meta.width>2000||meta.height>1000||(meta.pages??1)>1)throw new Error();
    const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let ink=0,minX=info.width,maxX=0,minY=info.height,maxY=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const i=(y*info.width+x)*4,alpha=data[i+3]/255;
      const luminance=(data[i]+data[i+1]+data[i+2])/3*alpha+255*(1-alpha);
      if(luminance<210){ink++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
    if(ink<40||maxX-minX<20||maxY-minY<5)throw new Error();
    const bytes=await sharp(source,{limitInputPixels:2_000_000}).png().toBuffer();
    return {bytes,sha256:createHash("sha256").update(bytes).digest("hex")};
  }catch{throw new Error("Plaats een zichtbare handtekening in het tekenvlak");}
}
