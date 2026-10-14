export type CrmStage = 'new'|'contacted'|'scheduled'|'proposal'|'trial'|'won'|'lost';
export type CrmKind = 'appointment'|'demo'|'trial';
export type CrmNotificationStatus = 'pending_config'|'queued'|'sending'|'accepted'|'failed'|'demo';
export interface CrmLead { id:string; name:string; company:string; email:string; phone:string; sector:string; team:string; stage:CrmStage; owner:string; nextActionAt:string|null; value:number; source:string; isDemo:boolean; createdAt:string; updatedAt:string }
export interface CrmRequest { id:string; leadId:string; name:string; company:string; email:string; phone:string; sector:string; team:string; kind:CrmKind; goal:string; message:string; date:string|null; time:string|null; source:string; isDemo:boolean; createdAt:string }
export interface CrmActivity { id:string; leadId:string; type:string; body:string; createdAt:string; isDemo:boolean }
export interface CrmTask { id:string; leadId:string|null; title:string; dueAt:string|null; completed:boolean; owner:string; isDemo:boolean; createdAt:string }
export interface CrmAppointment { id:string; leadId:string; requestId:string|null; date:string; time:string; endTime:string; startsAt:string; endsAt:string; status:'requested'|'confirmed'|'cancelled'; location:'telephone'; isDemo:boolean; createdAt:string }
export interface CrmNotification { id:string; leadId:string; requestId:string; status:CrmNotificationStatus; recipient:string; attempts:number; lastError:string; acceptedAt:string|null; createdAt:string; isDemo:boolean }
export interface CrmSettings { weekdays:number[]; startTime:string; endTime:string; durationMinutes:30; bufferMinutes:number; leadTimeHours:number; horizonDays:number; blockedDates:string[]; emailEnabled:boolean; timezone:'Europe/Amsterdam' }
export interface CrmNotificationContext { provider:'SendGrid'; configuration:'global'; recipientEmail:string; recipientName:string; recipientSource:'platform_admin'|'owner_account'|'unresolved'; providerConfigured:boolean }
export interface CrmState { leads:CrmLead[]; requests:CrmRequest[]; activities:CrmActivity[]; tasks:CrmTask[]; appointments:CrmAppointment[]; notifications:CrmNotification[]; settings:CrmSettings; notificationContext:CrmNotificationContext; mailConfigured:boolean }
export interface CrmIntake { idempotencyKey:string; kind:CrmKind; name:string; company:string; email:string; phone?:string; sector?:string; team?:string; goal?:string; message?:string; date?:string; time?:string }
export interface CrmIntakeResult { ok:true; leadId:string; requestId:string; appointmentId?:string; notificationStatus:CrmNotificationStatus }
export interface CrmAvailability { date:string; slots:string[]; timezone:'Europe/Amsterdam'; durationMinutes:30 }
export const CRM_STAGES: {id:CrmStage;label:string}[] = [{id:'new',label:'Nieuw'},{id:'contacted',label:'In contact'},{id:'scheduled',label:'Afspraak gepland'},{id:'proposal',label:'Voorstel'},{id:'trial',label:'Proefperiode'},{id:'won',label:'Gewonnen'},{id:'lost',label:'Verloren'}];
// API: GET /api/crm; POST /api/crm/intake; GET /api/crm/availability?date=YYYY-MM-DD
// PATCH /api/crm/settings accepts partial CrmSettings.
// PATCH /api/crm/leads/:id accepts {stage?,owner?,nextActionAt?,value?}; POST /api/crm/leads/:id/activity {body}.
// POST /api/crm/tasks {leadId?,title,dueAt?,owner?}; PATCH /api/crm/tasks/:id {title?,dueAt?,completed?,owner?}.
// PATCH /api/crm/appointments/:id {action:'confirm'|'cancel'|'reschedule',date?,time?}; GET .../:id/ics.
// POST /api/crm/notifications/:id/retry {}; POST /api/crm/demo-data {}; DELETE /api/crm/demo-data.
// Mutations return {ok:true,...}; refresh GET /api/crm afterwards. Errors: {ok:false,error,code}.
