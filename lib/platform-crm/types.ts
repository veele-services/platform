export type CrmStage = 'new'|'contacted'|'scheduled'|'proposal'|'trial'|'won'|'lost';
export type CrmKind = 'appointment'|'demo'|'trial';
export type CrmNotificationStatus = 'pending_config'|'queued'|'sending'|'accepted'|'failed'|'demo'|'uncertain'|'deferred'|'suppressed'|'cancelled'|'expired';
export interface CrmLead { latestKind?:CrmKind|null; revision:number; id:string; name:string; company:string; email:string; phone:string; sector:string; team:string; stage:CrmStage; owner:string; nextActionAt:string|null; value:number; source:string; isDemo:boolean; createdAt:string; updatedAt:string }
export interface CrmRequest { id:string; leadId:string; name:string; company:string; email:string; phone:string; sector:string; team:string; kind:CrmKind; goal:string; message:string; date:string|null; time:string|null; source:string; isDemo:boolean; createdAt:string }
export interface CrmActivity { id:string; leadId:string; type:string; body:string; createdAt:string; isDemo:boolean }
export interface CrmTask { revision:number; id:string; leadId:string|null; title:string; dueAt:string|null; completed:boolean; owner:string; isDemo:boolean; createdAt:string }
export interface CrmAppointment { revision:number; id:string; leadId:string; requestId:string|null; date:string; time:string; endTime:string; startsAt:string; endsAt:string; status:'requested'|'confirmed'|'cancelled'; location:'telephone'; isDemo:boolean; createdAt:string }
export interface CrmNotification { revision:number|null; subject?:string; body?:string; transport?:{subject:string;text:string}|null; id:string; leadId:string; requestId:string; status:CrmNotificationStatus; recipient:string; attempts:number; lastError:string; acceptedAt:string|null; createdAt:string; isDemo:boolean }
export interface CrmSettings { revision:number; weekdays:number[]; startTime:string; endTime:string; durationMinutes:30; bufferMinutes:number; leadTimeHours:number; horizonDays:number; blockedDates:string[]; emailEnabled:boolean; timezone:'Europe/Amsterdam' }
export interface CrmNotificationContext { provider:'SendGrid'; configuration:'global'; recipientEmail:string; recipientName:string; recipientSource:'platform_admin'|'owner_account'|'unresolved'; providerConfigured:boolean }
export interface CrmDetail { lead:CrmLead; requests:CrmRequest[]; tasks:CrmTask[]; appointments:CrmAppointment[]; activities:CrmActivity[]; notifications:CrmNotification[]; totals:{requests:number;openTasks:number;tasks:number;appointments:number;activities:number};page:number;pageSize:number }
export interface CrmState { detail:CrmDetail|null; pageLeadIds:string[];pageAppointmentIds:string[];selection:Partial<Record<CrmStage,{count:number;value:number}>>; observedAt:string; owners:Array<{id:string;name:string;email:string}>; counts:{active:number;value:number;stages:Partial<Record<CrmStage,number>>;requests:number;recentRequests:number;appointments:number;requestedAppointments:number;tasks:number;followups:number;overdue:number;overdueTasks:number}; pagination:{page:number;pageSize:number;total:number}; leads:CrmLead[]; requests:CrmRequest[]; activities:CrmActivity[]; tasks:CrmTask[]; appointments:CrmAppointment[]; notifications:CrmNotification[]; settings:CrmSettings; notificationContext:CrmNotificationContext; mailConfigured:boolean }
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
