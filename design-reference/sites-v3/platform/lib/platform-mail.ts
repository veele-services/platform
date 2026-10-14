import type {CrmNotificationContext} from '../src/crm-types';

type Runtime=Record<string,unknown>;
export interface PlatformIdentity { userId:string; email:string; name:string }
const value=(runtime:Runtime,key:string)=>typeof runtime[key]==='string'?(runtime[key] as string).trim():'';
const validEmail=(email:string)=>email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export function configuredPlatformAdmin(runtime:Runtime):PlatformIdentity|null {
 const email=value(runtime,'FIELDGRID_ADMIN_EMAIL').toLowerCase();
 return validEmail(email)?{userId:'platform-admin',email,name:'Platformbeheerder'}:null;
}
// The Sites ingress supplies these headers. This owner-account fallback is only
// appropriate while this prototype's Site audience remains owner-private.
// The deployed platform uses FIELDGRID_ADMIN_EMAIL and its platform_admins role.
export function authenticatedOwner(req:Request):PlatformIdentity|null {
 const userId=req.headers.get('oai-authenticated-user-id')?.trim()||'';
 const email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()||'';
 if(!userId||userId.length>256||!validEmail(email))return null;
 let name='Platformbeheerder';
 const encoded=req.headers.get('oai-authenticated-user-full-name');
 if(encoded&&req.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){
  try{name=decodeURIComponent(encoded).trim().slice(0,120)||name;}catch{/* Keep the safe fallback. */}
 }
 return {userId,email,name};
}
export function storedPlatformIdentity(raw:unknown):PlatformIdentity|null {
 if(typeof raw!=='string')return null;
 try{const p=JSON.parse(raw);return typeof p.userId==='string'&&p.userId&&typeof p.email==='string'&&validEmail(p.email)?{userId:p.userId,email:p.email.toLowerCase(),name:typeof p.name==='string'&&p.name?p.name:'Platformbeheerder'}:null;}catch{return null;}
}
export function globalMailConfiguration(runtime:Runtime){
 const apiKey=value(runtime,'SENDGRID_API_KEY'),fromEmail=value(runtime,'SENDGRID_FROM_EMAIL');
 const fromName=value(runtime,'SENDGRID_FROM_NAME')||'Fieldgrid';
 const apiBase=value(runtime,'SENDGRID_API_BASE')||'https://api.sendgrid.com/';
 let endpoint='';try{const u=new URL('v3/mail/send',apiBase);if(u.protocol==='https:'&&!u.username&&!u.password)endpoint=u.href;}catch{/* Invalid global configuration stays disabled. */}
 return {apiKey,fromEmail,fromName,endpoint,configured:Boolean(apiKey&&validEmail(fromEmail)&&endpoint)};
}
export function notificationContext(runtime:Runtime,owner:PlatformIdentity|null):CrmNotificationContext {
 const admin=configuredPlatformAdmin(runtime),recipient=admin||owner;
 return {provider:'SendGrid',configuration:'global',recipientEmail:recipient?.email||'',recipientName:recipient?.name||'Platformbeheerder',recipientSource:admin?'platform_admin':owner?'owner_account':'unresolved',providerConfigured:globalMailConfiguration(runtime).configured};
}
export async function sendPlatformMail(runtime:Runtime,input:{recipientEmail:string;recipientName:string;subject:string;text:string;replyToEmail:string;replyToName:string}){
 const config=globalMailConfiguration(runtime);
 if(!config.configured||!validEmail(input.recipientEmail))throw new Error('Globale e-mailverzending is nog niet beschikbaar.');
 const result=await fetch(config.endpoint,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:input.recipientEmail,name:input.recipientName}],subject:input.subject}],from:{email:config.fromEmail,name:config.fromName},reply_to:{email:input.replyToEmail,name:input.replyToName},content:[{type:'text/plain',value:input.text}]}),signal:AbortSignal.timeout(12000)});
 if(result.status!==202)throw new Error(`E-mailprovider antwoordde met HTTP ${result.status}. Controleer de globale e-mailinstellingen.`);
}
