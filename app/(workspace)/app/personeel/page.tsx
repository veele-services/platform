import {notFound} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {getPersonnelDirectoryData} from '@/lib/personnel/directory-data';
import {getPlanningShellData} from '@/lib/planning/data';
import {hasManagementPermission} from '@/lib/management/model';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
import {SitesPersonnelList} from '@/components/fieldgrid/management-cockpit/personnel-list';
import {Empty,PageHeading,Panel} from '@/components/fieldgrid/crm/ui';
export default async function PersonnelPage(){
 const context=await getAuthContext(),tenant=context.tenant;
 if(!tenant||!tenant.enabledServices.includes('personeel')||!hasManagementPermission(tenant,'backoffice.personnel.read'))notFound();
 const allowed=hasManagementPermission(tenant,'backoffice.functions.cockpit_entity_query'),data=allowed?await getPersonnelDirectoryData(tenant.id):await getPlanningShellData(tenant.id);
 return <BackofficeShell context={{...context,tenant}} initialView="personeel" data={data} presentation="sites-management">{allowed?<SitesPersonnelList tenant={tenant} data={data}/>:<><PageHeading eyebrow="TEAM" title="Personeel"/><Panel><Empty title="Deze weergave is afgeschermd" text="Je actuele rechten geven geen toegang tot deze lijst- en dossierweergave."/></Panel></>}</BackofficeShell>;
}
