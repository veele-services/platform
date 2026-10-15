// Explicit local browser-test provider boundary. Never loaded by application or
// deployment code; no real provider key or outgoing email is used.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS Node preload, executed before Next initializes.
const {appendFileSync}=require('node:fs');
if(process.env.DEPLOY_TARGET!=='local'||process.env.FIELDGRID_LOCAL_MAIL_CAPTURE!=='1'||!process.env.FIELDGRID_LOCAL_MAIL_CAPTURE_PATH?.startsWith('/tmp/fieldgrid-'))throw new Error('Local mail capture requires an explicit isolated test runtime');
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(!['api.sendgrid.com','api.eu.sendgrid.com'].includes(url.hostname))return originalFetch(input,init);
 if(url.pathname!=='/v3/mail/send'||init?.method!=='POST')throw new Error('Unexpected provider operation in local fixture');
 const body=JSON.parse(init.body),recipients=body.personalizations?.flatMap(p=>p.to?.map(r=>r.email)||[])||[];
 if(!recipients.length||recipients.some(r=>!r.endsWith('.invalid')))throw new Error('Local provider fixture rejects non-synthetic recipients');
 const id='local-capture-'+crypto.randomUUID();
 // Do not log content, account activation tokens or provider credentials.
 appendFileSync(process.env.FIELDGRID_LOCAL_MAIL_CAPTURE_PATH,JSON.stringify({id,recipients,subject:body.subject,from:body.from.email,contentTypes:body.content.map(c=>c.type),trackingDisabled:body.tracking_settings?.click_tracking?.enable===false,delivery:body.personalizations[0].custom_args?.fieldgrid_delivery,transport:body.personalizations[0].custom_args?.fieldgrid_transport})+'\n',{mode:0o600});
 return new Response(null,{status:202,headers:{'x-message-id':id}});
};
