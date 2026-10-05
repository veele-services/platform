import { createHash } from "node:crypto";

/** Only the existing controlled public current-logo endpoint. This fingerprint
 * changes on immutable logo replacement; no browser-provided URL or path. */
export function brandingLogoVersion(path:string){return createHash("sha256").update(path).digest("hex");}
export function currentBrandingLogoPath(tenantId:string,path:string|null|undefined){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenantId)||!path||!path.startsWith(`${tenantId}/`))return null;
 if(path.split("/").some(segment=>!segment||segment==="."||segment==="..")||/[\\%?#\u0000-\u001f\u007f]/.test(path))return null;
 return `/api/branding/${tenantId}/email-logo?v=${brandingLogoVersion(path)}`;
}
