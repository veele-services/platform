import {crmError} from '@/lib/platform-crm/model';
import {sourceNews} from '@/lib/news/data';
export async function GET(request:Request){try{if(new URL(request.url).search) return Response.json({error:'Ongeldige selectie.'},{status:422,headers:{'cache-control':'private, no-store'}});return Response.json(await sourceNews(),{headers:{'cache-control':'private, no-store'}})}catch(e){const r=crmError(e);return Response.json({error:r.status===403?'Nieuws is niet beschikbaar binnen je actuele rechten.':r.error},{status:r.status,headers:{'cache-control':'private, no-store'}})}}
