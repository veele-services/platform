import {sourceNews} from '@/lib/news/data';
import {notFound,redirect} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {SourceNews} from '@/components/fieldgrid/information/news';
export default async function NewsPage(){const context=await getAuthContext(),tenant=context.tenant;if(tenant?.roles.length===1&&tenant.roles[0]==='staff')redirect('/staff');if(!tenant||!tenant.enabledServices.includes('personeel')||!['backoffice.access','backoffice.news.read'].every(p=>hasManagementPermission(tenant,p)))notFound();let data;try{data=await Promise.all([sourceNews(),getPlanningShellData(tenant.id)])}catch(e){if((e as {code?:string}).code==='42501')notFound();throw e}const[initial,shell]=data;return <BackofficeShell context={{...context,tenant}} data={shell} initialView="nieuws" presentation="sites-management"><SourceNews initial={initial} tenantId={tenant.id} actorId={context.user.id} timezone={tenant.timezone}/></BackofficeShell>}
