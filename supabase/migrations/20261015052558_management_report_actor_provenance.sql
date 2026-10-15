-- Reconcile only identity metadata of snapshots captured before the explicit
-- profile/initiator split. A manual creation must have its original native
-- audit record; a worker job never becomes a human action. All snapshot data,
-- dates, versions, scopes, source references and original audit events remain.
alter table private.cockpit_reports disable trigger cockpit_report_immutable;
with reconciled as (
 update private.cockpit_reports r set created_by=a.actor_user_id
 from public.audit_events a
 where a.tenant_id=r.tenant_id and a.entity_type='management_report' and a.entity_id=r.id and a.action='management.report.create'
 and a.actor_user_id=r.profile_user_id and r.created_by is null
 and not exists(select 1 from private.cockpit_report_jobs j where j.report_id=r.id)
 returning r.tenant_id,r.id,r.created_by
)
insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
select tenant_id,null,'management.report.actor_reconciled','management_report',id,jsonb_build_object('created_by',null),jsonb_build_object('created_by',created_by,'source','original manual creation audit') from reconciled;
alter table private.cockpit_reports enable trigger cockpit_report_immutable;
