import "server-only";
import sharp from "sharp";

/** Decode every pixel and strip EXIF/location metadata before customer use. */
export async function validateReportPhoto(bytes:Uint8Array,mime:string):Promise<{bytes:Buffer;mime:string;extension:string}>{
 if(!bytes.length||bytes.length>10*1024*1024)throw new Error("Foto mag maximaal 10 MB zijn");
 const formats:Record<string,string>={"image/jpeg":"jpeg","image/png":"png","image/webp":"webp"};
 if(!formats[mime])throw new Error("Gebruik JPG, PNG of WebP");
 const input=sharp(bytes,{limitInputPixels:20_000_000,failOn:"warning"});
 const info=await input.metadata();
 if(info.format!==formats[mime]||(info.pages??1)!==1)throw new Error("Fotoformaat komt niet overeen met het bestand");
 const clean=input.rotate();
 const output=await (mime==="image/jpeg"?clean.jpeg({quality:92}):mime==="image/webp"?clean.webp({quality:92}):clean.png()).toBuffer();
 if(output.length>10*1024*1024)throw new Error("Foto is na verwerking te groot");
 return {bytes:output,mime,extension:mime==="image/jpeg"?"jpg":formats[mime]};
}
