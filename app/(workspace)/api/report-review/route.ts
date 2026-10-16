import {crmError} from '@/lib/platform-crm/model';
import {reportReviewQuery} from '@/lib/work-orders/source-presentation';
import {getReportReviewList} from '@/lib/work-orders/report-review-data';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(request:Request){
 try{return reply(await getReportReviewList(reportReviewQuery.parse(Object.fromEntries(new URL(request.url).searchParams))))}
 catch(error){const mapped=crmError(error);return reply({ok:false,error:mapped.status===403?'Rapportcontroles zijn niet beschikbaar binnen je actuele rechten.':mapped.error},mapped.status)}
}
