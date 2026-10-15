import {z} from 'zod';
import {getReports} from '@/lib/management-cockpit/reports-data';
import {reportQuerySchema} from '@/lib/management-cockpit/reports';
import {renderManagementReport} from '@/lib/pdf/management-report';
import {crmError} from '@/lib/platform-crm/model';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
export async function GET(request:Request){try{
 const {record}=z.object({record:z.uuid()}).strict().parse(Object.fromEntries(new URL(request.url).searchParams)),query=reportQuerySchema.parse({record,pageSize:5});
 const data=await getReports(query);if(!data.selected)return Response.json({error:'Deze rapportversie is niet beschikbaar.'},{status:403,headers});
 const bytes=await renderManagementReport(data.selected);
 // Rendering can yield while ownership, category scope or session changes.
 // Re-authorize the same immutable record before returning any private bytes.
 await getReports(query);
 return new Response(new Uint8Array(bytes),{headers:{...headers,'content-type':'application/pdf','content-disposition':'attachment; filename="Fieldgrid-Weekrapport-'+record+'.pdf"'}});
}catch(error){const{status}=crmError(error);return Response.json({error:'Deze rapportversie is niet beschikbaar binnen je actuele rechten.'},{status,headers})}}
