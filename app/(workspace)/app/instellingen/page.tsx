import {notFound,redirect} from 'next/navigation';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {createClient} from '@/lib/supabase/server';
import {getPlanningShellData} from '@/lib/planning/data';
import {BackofficeShell} from '@/components/fieldgrid/backoffice-shell';
/** Settings need branding and tenant preferences, never a full HR workspace. */
export default async function SettingsPage(){
 const context=await getAuthContext(),tenant=context.tenant;
 if(tenant?.roles.length===1&&tenant.roles[0]==='staff')redirect('/staff');
 if(!tenant||!['backoffice.access','backoffice.settings.read'].every(p=>hasManagementPermission(tenant,p)))notFound();
 const db=await createClient(),[shell,settings]=await Promise.all([getPlanningShellData(tenant.id),db.from('tenant_settings').select('*').eq('tenant_id',tenant.id).maybeSingle()]);
 if(settings.error)throw new Error('De organisatie-instellingen konden niet worden geladen.');shell.settings=settings.data;
 return <BackofficeShell context={{...context,tenant}} data={shell} initialView="instellingen" presentation="sites-management"/>;
}
