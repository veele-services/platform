import {readFile} from 'node:fs/promises';
import {processNotificationDeliveryClaims} from '../../lib/notifications/worker';
async function main(){
 const file=process.argv[2];if(!/^\/tmp\/fieldgrid-crm-delivery-[a-f0-9-]+\.json$/.test(file??'')||process.env.DEPLOY_TARGET!=='local'||process.env.SUPABASE_URL!=='http://127.0.0.1:60321')throw Error('Isolated CRM fixture required');
 const input=JSON.parse(await readFile(file,'utf8'));
 if(!input.recipient?.endsWith('@source-crm-admin.invalid')||!['failed','accepted'].includes(input.outcome)||!Array.isArray(input.claims)||input.claims.length!==1)throw Error('Invalid local transport fixture');
 const original=globalThis.fetch;let captured=0;
 globalThis.fetch=async(request,init)=>{
  const url=new URL(typeof request==='string'?request:request instanceof URL?request.href:request.url);
  if(!['api.sendgrid.com','api.eu.sendgrid.com'].includes(url.hostname))return original(request,init);
  const body=JSON.parse(String(init?.body)),recipients=body.personalizations?.flatMap((p:{to:{email:string}[]})=>p.to.map(r=>r.email));
  if(url.pathname!=='/v3/mail/send'||init?.method!=='POST'||recipients?.length!==1||recipients[0]!==input.recipient||body.from?.email!=='sender@fieldgrid-test.invalid')throw Error('Unexpected external transport');
  captured++;return input.outcome==='failed'?Response.json({errors:[{message:'FICTITIOUS confirmed provider rejection'}]},{status:400}):new Response(null,{status:202,headers:{'x-message-id':'local-crm-capture-'+crypto.randomUUID()}});
 };
 // The real worker starts only the supplied lease, freezes its message,
 // applies central policy, records transport and finishes the delivery.
 const result=await processNotificationDeliveryClaims(input.claims);if(captured!==1||result[input.outcome==='failed'?'failed':'sent']!==1)throw Error('Native CRM worker outcome not confirmed');
 console.log('Native CRM queue/policy/worker transport outcome confirmed: '+input.outcome);
}
main().catch(()=>{console.error('Isolated CRM delivery fixture failed; no credentials or message bodies logged.');process.exitCode=1});
