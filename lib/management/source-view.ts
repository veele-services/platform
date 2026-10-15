import {z} from 'zod';
import {managementSnapshotSchema,type ManagementRole,type ManagementSnapshot} from './model';
export const sourceManagementSnapshotSchema=z.object({snapshot:managementSnapshotSchema,enabledServices:z.array(z.string())});
/** Configuration counts, never an authorization decision or a claim that a
 * role may open a particular financial or confidential dossier. */
export function rolePermissionSummary(role:Pick<ManagementRole,'permissions'>,catalog:ManagementSnapshot['catalog'],enabledServices:string[]){
 const keys=new Set(role.permissions),known=catalog.filter(p=>keys.has(p.key));
 return {operation:known.filter(p=>['planning','work_orders','commercial','followup','tasks','customers','objects'].includes(p.module)).length,finance:enabledServices.includes('finance')?known.filter(p=>p.module==='finance').length:null,confidentialPersonnel:enabledServices.includes('personeel')?known.filter(p=>p.module==='personnel'&&p.sensitive).length:null};
}
