import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const crmLeads = sqliteTable('crm_leads', {
 id:text('id').primaryKey(), identityKey:text('identity_key').notNull().unique(), name:text('name').notNull(), company:text('company').notNull(), email:text('email').notNull(), phone:text('phone').notNull().default(''), sector:text('sector').notNull().default(''), team:text('team').notNull().default(''), stage:text('stage').notNull().default('new'), owner:text('owner').notNull().default(''), nextActionAt:text('next_action_at'), value:integer('value').notNull().default(0), source:text('source').notNull().default('website'), isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull()
});
export const crmRequests = sqliteTable('crm_requests', {
 id:text('id').primaryKey(), idempotencyKey:text('idempotency_key').notNull().unique(), payloadHash:text('payload_hash').notNull(), leadId:text('lead_id').notNull().references(()=>crmLeads.id),name:text('name').notNull().default(''),company:text('company').notNull().default(''),email:text('email').notNull().default(''),phone:text('phone').notNull().default(''),sector:text('sector').notNull().default(''),team:text('team').notNull().default(''),kind:text('kind').notNull(),goal:text('goal').notNull().default(''),message:text('message').notNull().default(''),date:text('date'),time:text('time'),source:text('source').notNull().default('website'),isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull()
},t=>[index('crm_requests_lead_idx').on(t.leadId)]);
export const crmAppointments = sqliteTable('crm_appointments',{
 id:text('id').primaryKey(),leadId:text('lead_id').notNull().references(()=>crmLeads.id),requestId:text('request_id').references(()=>crmRequests.id),date:text('date').notNull(),time:text('time').notNull(),endTime:text('end_time').notNull(),startsAt:text('starts_at').notNull(),endsAt:text('ends_at').notNull(),status:text('status').notNull().default('requested'),location:text('location').notNull().default('telephone'),isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull()
});
export const crmReservations = sqliteTable('crm_reservations',{
 id:text('id').primaryKey(),appointmentId:text('appointment_id').notNull().references(()=>crmAppointments.id,{onDelete:'cascade'}),slot:text('slot').notNull().unique()
},t=>[uniqueIndex('crm_reservation_appointment_slot').on(t.appointmentId,t.slot)]);
export const crmActivities = sqliteTable('crm_activities',{
 id:text('id').primaryKey(),leadId:text('lead_id').notNull().references(()=>crmLeads.id),type:text('type').notNull(),body:text('body').notNull(),isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull()
});
export const crmTasks = sqliteTable('crm_tasks',{
 id:text('id').primaryKey(),leadId:text('lead_id').references(()=>crmLeads.id),title:text('title').notNull(),dueAt:text('due_at'),completed:integer('completed',{mode:'boolean'}).notNull().default(false),owner:text('owner').notNull().default(''),isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull()
});
export const crmNotifications = sqliteTable('crm_notifications',{
 id:text('id').primaryKey(),leadId:text('lead_id').notNull().references(()=>crmLeads.id),requestId:text('request_id').notNull().references(()=>crmRequests.id).unique(),status:text('status').notNull().default('pending_config'),recipient:text('recipient').notNull().default(''),attempts:integer('attempts').notNull().default(0),lastError:text('last_error').notNull().default(''),acceptedAt:text('accepted_at'),sendingAt:text('sending_at'),isDemo:integer('is_demo',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull()
});
export const crmSettings = sqliteTable('crm_settings',{id:text('id').primaryKey(),value:text('value').notNull(),updatedAt:text('updated_at').notNull()});
// The NOT NULL guard aborts the complete intake batch when a key is reused with a different payload.
export const crmIdempotency = sqliteTable('crm_idempotency',{key:text('key').primaryKey(),payloadHash:text('payload_hash').notNull()});
