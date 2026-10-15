import type {Database} from '@/lib/database.types';
type Personnel=Database['public']['Tables']['personnel']['Row'];
export const personnelDirectoryColumns='id,tenant_id,user_id,employee_number,full_name,email,phone,status,start_date,end_date,created_at,updated_at,version,standard_vehicle,departure_kind,departure_depot_id,return_to_departure' as const;
type DirectoryPerson=Pick<Personnel,'id'|'tenant_id'|'user_id'|'employee_number'|'full_name'|'email'|'phone'|'status'|'start_date'|'end_date'|'created_at'|'updated_at'|'version'|'standard_vehicle'|'departure_kind'|'departure_depot_id'|'return_to_departure'>;
/** Preserve the existing WorkspaceData shape without selecting private columns.
 * Private fields are deliberately empty, never inferred from public contacts. */
export function personnelDirectoryRow(p:DirectoryPerson):Personnel{return{
 ...p,emergency_contact:{},home_address:{},alternate_departure_address:{},
 preferred_name:null,mobile_phone:null,birth_date:null,
 driving_license:false,driving_license_categories:[],carpool_allowed:false,
 own_transport:false,travel_limitations:null,notification_preferences:{},
 availability_preferences:{},availability_self_service_enabled:false,
 onboarding_draft:{},onboarding_step:0,onboarding_completed_at:null,onboarding_version:1,
}}
