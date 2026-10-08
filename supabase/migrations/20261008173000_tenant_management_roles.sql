-- Explicit tenant management roles. Portal and platform identities remain separate.
set local check_function_bodies = off;
create table private.management_roles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 code text not null check(code in ('owner','management','planning','administration','support')), name text not null,
 revision bigint not null default 1, created_at timestamptz not null default now(), unique(tenant_id,code), unique(tenant_id,id)
);
create table private.management_role_permissions (
 tenant_id uuid not null,role_id uuid not null,capability text not null references public.permission_catalog(key),
 primary key(role_id,capability),foreign key(tenant_id,role_id) references private.management_roles(tenant_id,id) on delete cascade
);
create table private.management_members (
 tenant_id uuid not null,membership_id uuid primary key,role_id uuid not null,full_name text not null,
 revision bigint not null default 1, invited_by uuid references auth.users(id), invited_at timestamptz,accepted_at timestamptz,revoked_at timestamptz,
 foreign key(tenant_id,membership_id) references public.tenant_memberships(tenant_id,id) on delete cascade,
 foreign key(tenant_id,role_id) references private.management_roles(tenant_id,id)
);
create table private.management_receipts (
 tenant_id uuid not null references public.tenants(id),actor_id uuid not null,request_id uuid not null,
 fingerprint text not null,result jsonb not null,primary key(tenant_id,actor_id,request_id)
);
create table private.management_transfers (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 source_membership uuid not null,target_membership uuid not null,status text not null default 'pending' check(status in ('pending','accepted','cancelled','expired')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '48 hours'),accepted_at timestamptz,
 foreign key(tenant_id,source_membership) references public.tenant_memberships(tenant_id,id),
 foreign key(tenant_id,target_membership) references public.tenant_memberships(tenant_id,id)
);
create unique index management_transfer_pending on private.management_transfers(tenant_id) where status='pending';
do $lock$declare t text;begin
 foreach t in array array['management_roles','management_role_permissions','management_members','management_receipts','management_transfers'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end$lock$;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes) select key,'tenant',name,case action when 'read' then 'Pagina en bijbehorende gegevens bekijken' else 'Bijbehorende gegevens wijzigen en acties uitvoeren' end,module,action,array['tenant'] from (values ('backoffice.overview.read','Overzicht','overview','read'),('backoffice.overview.write','Overzicht','overview','write'),('backoffice.commercial.read','Aanvragen en offertes','commercial','read'),('backoffice.commercial.write','Aanvragen en offertes','commercial','write'),('backoffice.planning.read','Planbord','planning','read'),('backoffice.planning.write','Planbord','planning','write'),('backoffice.work_orders.read','Werkbonnen','work_orders','read'),('backoffice.work_orders.write','Werkbonnen','work_orders','write'),('backoffice.tasks.read','Taken en tarieven','tasks','read'),('backoffice.tasks.write','Taken en tarieven','tasks','write'),('backoffice.customers.read','Klanten','customers','read'),('backoffice.customers.write','Klanten','customers','write'),('backoffice.objects.read','Objecten','objects','read'),('backoffice.objects.write','Objecten','objects','write'),('backoffice.personnel.read','Personeel','personnel','read'),('backoffice.personnel.write','Personeel','personnel','write'),('backoffice.reports.read','Rapportcontrole','reports','read'),('backoffice.reports.write','Rapportcontrole','reports','write'),('backoffice.finance.read','Facturen en betalingen','finance','read'),('backoffice.finance.write','Facturen en betalingen','finance','write'),('backoffice.news.read','Nieuws','news','read'),('backoffice.news.write','Nieuws','news','write'),('backoffice.followup.read','Opvolging','followup','read'),('backoffice.followup.write','Opvolging','followup','write'),('backoffice.settings.read','Instellingen','settings','read'),('backoffice.settings.write','Instellingen','settings','write'),('backoffice.access','Backoffice openen','access','read'),('management.users.read','Gebruikers bekijken','management','read'),('management.users.manage','Gebruikers uitnodigen en wijzigen','management','write'),('management.roles.manage','Rollen en rechten beheren','management','write'),('management.ownership.transfer','Eigenaarschap overdragen','management','write'))v(key,name,module,action) on conflict(key) do nothing;


insert into public.permission_catalog(key,domain,name,description,module,action,scopes) select key,'tenant',name,'Afzonderlijke serverfunctie; ook het bijbehorende pagina- en actierecht is vereist.',module,action,array['tenant'] from (values ('backoffice.functions.accept_object_proposal','accept object proposal','objects','write'),('backoffice.functions.answer_work_order_checklist','answer work order checklist','work_orders','write'),('backoffice.functions.assign_work_order_task','assign work order task','work_orders','write'),('backoffice.functions.attach_invoice_pdf','attach invoice pdf','finance','write'),('backoffice.functions.attach_work_order_checklist','attach work order checklist','work_orders','write'),('backoffice.functions.bind_object_customer','bind object customer','objects','write'),('backoffice.functions.change_work_order_planning','change work order planning','planning','write'),('backoffice.functions.change_work_order_signature_policy','change work order signature policy','work_orders','write'),('backoffice.functions.commercial_booking','commercial booking','commercial','write'),('backoffice.functions.commercial_cancel_booking','commercial cancel booking','commercial','write'),('backoffice.functions.commercial_command','commercial command','commercial','write'),('backoffice.functions.commercial_detail','commercial detail','commercial','read'),('backoffice.functions.commercial_list','commercial list','commercial','read'),('backoffice.functions.commercial_next_visit','commercial next visit','commercial','write'),('backoffice.functions.commercial_options','commercial options','commercial','read'),('backoffice.functions.commercial_order_context','commercial order context','commercial','read'),('backoffice.functions.commercial_save_quote','commercial save quote','commercial','write'),('backoffice.functions.commercial_save_request','commercial save request','commercial','write'),('backoffice.functions.confirm_shift_interest','confirm shift interest','planning','write'),('backoffice.functions.create_commercial_period_invoice','create commercial period invoice','finance','write'),('backoffice.functions.create_execution_invoice','create execution invoice','finance','write'),('backoffice.functions.customer_command','customer command','customers','write'),('backoffice.functions.customer_commercial_followup','customer commercial followup','customers','read'),('backoffice.functions.customer_document_metadata','customer document metadata','customers','write'),('backoffice.functions.customer_file_access','customer file access','customers','read'),('backoffice.functions.customer_history','customer history','customers','read'),('backoffice.functions.customer_list','customer list','customers','read'),('backoffice.functions.customer_owners','customer owners','customers','read'),('backoffice.functions.dispatch_work_order','dispatch work order','planning','write'),('backoffice.functions.execution_invoice_concepts','execution invoice concepts','finance','read'),('backoffice.functions.extend_object_access','extend object access','objects','write'),('backoffice.functions.finalize_invoice','finalize invoice','finance','write'),('backoffice.functions.get_planboard','get planboard','planning','read'),('backoffice.functions.get_planboard_order','get planboard order','planning','read'),('backoffice.functions.manage_work_order','manage work order','work_orders','write'),('backoffice.functions.mutate_work_order','mutate work order','work_orders','write'),('backoffice.functions.object_agreement_options','object agreement options','objects','read'),('backoffice.functions.object_customer_accounts','object customer accounts','objects','read'),('backoffice.functions.object_dossier_owners','object dossier owners','objects','read'),('backoffice.functions.personnel_availability','personnel availability','personnel','read'),('backoffice.functions.personnel_document_file','personnel document file','personnel','read'),('backoffice.functions.personnel_dossier_owners','personnel dossier owners','personnel','read'),('backoffice.functions.personnel_dossier_staff_projection','personnel dossier staff projection','personnel','read'),('backoffice.functions.personnel_dossier_summary','personnel dossier summary','personnel','read'),('backoffice.functions.personnel_mobility','personnel mobility','personnel','read'),('backoffice.functions.personnel_qualification_gaps','personnel qualification gaps','personnel','read'),('backoffice.functions.prepare_work_order_signature','prepare work order signature','work_orders','write'),('backoffice.functions.publish_announcement','publish announcement','news','write'),('backoffice.functions.record_customer_agreement','record customer agreement','customers','write'),('backoffice.functions.register_manual_payment','register manual payment','finance','write'),('backoffice.functions.reschedule_work_order','reschedule work order','planning','write'),('backoffice.functions.review_object_visit_request','review object visit request','objects','write'),('backoffice.functions.review_staff_leave_request','review staff leave request','personnel','write'),('backoffice.functions.review_staff_time_correction','review staff time correction','personnel','write'),('backoffice.functions.review_work_order','review work order','reports','write'),('backoffice.functions.review_work_order_report','review work order report','reports','write'),('backoffice.functions.save_object_dossier','save object dossier','objects','write'),('backoffice.functions.save_work_order','save work order','work_orders','write'),('backoffice.functions.set_staff_availability_permission','set staff availability permission','personnel','write'),('backoffice.functions.set_staff_leave_entitlement','set staff leave entitlement','personnel','write'),('backoffice.functions.submit_work_order_report','submit work order report','work_orders','write'),('backoffice.functions.task_catalogue','task catalogue','tasks','read'),('backoffice.functions.task_catalogue_command','task catalogue command','tasks','write'),('backoffice.functions.transition_work_order','transition work order','work_orders','write'),('backoffice.functions.travel_day_departure','travel day departure','planning','read'),('backoffice.functions.waive_work_order_signature','waive work order signature','work_orders','write'),('backoffice.functions.work_order_communication','work order communication','work_orders','write'),('backoffice.functions.work_order_dossier','work order dossier','work_orders','read'),('backoffice.functions.work_order_exception_command','work order exception command','work_orders','write'),('backoffice.functions.work_order_exceptions','work order exceptions','work_orders','read'),('backoffice.functions.work_order_list','work order list','work_orders','read'),('backoffice.functions.work_order_operational_rows','work order operational rows','work_orders','read'),('backoffice.functions.work_order_operational_task_data','work order operational task data','work_orders','read'),('backoffice.functions.work_order_options','work order options','work_orders','read'),('backoffice.functions.work_order_related_command','work order related command','work_orders','write'),('backoffice.functions.work_order_related_context','work order related context','work_orders','read'),('backoffice.functions.work_order_report','work order report','work_orders','read'),('backoffice.functions.work_order_report_file','work order report file','work_orders','read'),('backoffice.functions.work_order_series_command','work order series command','work_orders','write'),('backoffice.functions.work_order_signature_settings','work order signature settings','work_orders','read'),('backoffice.functions.work_order_task_context','work order task context','work_orders','read'),('backoffice.functions.work_order_template_command','work order template command','work_orders','write'))v(key,name,module,action) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes) select key,'tenant',name,'Klantportaaltoegang beheren; bijbehorend klantrecht is ook vereist.',module,action,array['tenant'] from (values ('backoffice.functions.customer_portal_bind','customer portal bind','customers','write'),('backoffice.functions.customer_portal_management','customer portal management','customers','read'))v(key,name,module,action) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes) select key,'tenant',name,'Afzonderlijke functie; het bijbehorende pagina- en actierecht is ook vereist.',module,action,array['tenant'] from (values ('backoffice.functions.object_visit_context','object visit context','objects','read'),('backoffice.functions.object_visit_signals','object visit signals','objects','read'),('backoffice.functions.get_object_document','get object document','objects','read'),('backoffice.functions.customer_extra_agreements','customer extra agreements','customers','read'),('backoffice.functions.customer_object_visits','customer object visits','objects','read'),('backoffice.functions.submit_object_visit_request','submit object visit request','objects','write'),('backoffice.functions.update_object_visit_request','update object visit request','objects','write'),('backoffice.functions.acknowledge_object_instruction','acknowledge object instruction','objects','write'),('backoffice.functions.acknowledge_object_request','acknowledge object request','objects','write'),('backoffice.functions.withdraw_object_request','withdraw object request','objects','write'),('backoffice.functions.register_visit_attachment','register visit attachment','objects','write'))v(key,name,module,action) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,sensitive,dependencies) values('backoffice.personnel.sensitive','tenant','Vertrouwelijke personeelsdossiers','Arbeidsovereenkomsten, HR-notities, privédocumenten en vertrouwelijke persoonsgegevens bekijken.','personnel','read',array['tenant'],true,array['backoffice.personnel.read']) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,sensitive,dependencies) values('backoffice.objects.secrets.read','tenant','Beveiligde objectgegevens onthullen','Beveiligde objectwaarden na aanvullende OTP-verificatie bekijken.','objects','read',array['tenant'],true,array['backoffice.objects.read']),('backoffice.objects.secrets.write','tenant','Beveiligde objectgegevens beheren','Waarden en toegang tot beveiligde objectgegevens na OTP-verificatie wijzigen.','objects','write',array['tenant'],true,array['backoffice.objects.read','backoffice.objects.write','backoffice.objects.secrets.read']) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies) values('backoffice.functions.send_commercial_quote','tenant','Offerte of herinnering versturen','Offertebezorging en herinneringen versturen.','commercial','write',array['tenant'],array['backoffice.commercial.read','backoffice.commercial.write']),('backoffice.functions.upload_commercial_attachment','tenant','Bijlage bij aanvraag of offerte uploaden','Bestanden bij aanvragen en offertes opslaan.','commercial','write',array['tenant'],array['backoffice.commercial.read','backoffice.commercial.write']) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies) values('backoffice.functions.record_task_execution','tenant','Taakuitvoering beheren','Een taakuitvoering namens management vastleggen; toegewezen personeelsuitvoering blijft afzonderlijk.','work_orders','write',array['tenant'],array['backoffice.work_orders.read','backoffice.work_orders.write']),('backoffice.functions.prepare_personnel_checklist','tenant','Personeelschecklist aanmaken','Onboarding- of offboardingchecklist voorbereiden.','personnel','write',array['tenant'],array['backoffice.personnel.read','backoffice.personnel.write','backoffice.personnel.sensitive']) on conflict(key) do nothing;
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies) values('backoffice.functions.retry_commercial_messages','tenant','Commerciële berichten opnieuw aanbieden','Eerdere aanvraag- en offerteberichten opnieuw aanbieden.','commercial','write',array['tenant'],array['backoffice.commercial.read','backoffice.commercial.write']) on conflict(key) do nothing;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
select key,'tenant',name,'Afzonderlijke serviceactie; ook pagina- en schrijfrecht zijn vereist.',module,'write',array['tenant'],array['backoffice.'||module||'.read','backoffice.'||module||'.write']
from (values
 ('backoffice.functions.send_invoice','Factuur versturen','finance'),
 ('backoffice.functions.create_payment_bundle','Betaalverzoek maken','finance'),
 ('backoffice.functions.invite_personnel','Medewerker uitnodigen','personnel'),
 ('backoffice.functions.repeat_personnel_invitation','Medewerker opnieuw uitnodigen','personnel')
) v(key,name,module) on conflict(key) do nothing;

create function private.management_seed(t uuid) returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
 insert into private.management_roles(tenant_id,code,name) values(t,'owner','Eigenaar'),(t,'management','Management'),(t,'planning','Planning'),(t,'administration','Administratie'),(t,'support','Support') on conflict(tenant_id,code) do nothing;
 for r in select * from private.management_roles where tenant_id=t loop
  if not exists(select 1 from private.management_role_permissions where role_id=r.id) then
   insert into private.management_role_permissions(tenant_id,role_id,capability)
   select t,r.id,c.key from public.permission_catalog c where c.domain='tenant' and (
    r.code='owner'
    or r.code='management' and c.key not like 'management.%' and c.key not in ('tickets.internal.hr','tickets.redact','tickets.permissions','notifications.permissions')
    or r.code='planning' and (c.key like 'backoffice.functions.%' and ((c.module in ('overview','planning','work_orders') and c.action in ('read','write')) or c.module in ('customers','objects','tasks','personnel','followup') and c.action='read') or c.key in ('backoffice.access','backoffice.overview.read','backoffice.planning.read','backoffice.planning.write','backoffice.work_orders.read','backoffice.work_orders.write','backoffice.customers.read','backoffice.objects.read','backoffice.tasks.read','backoffice.personnel.read','backoffice.followup.read') or c.key in ('tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.support.read','tickets.support.create','tickets.support.reply','notifications.read_own','notifications.preferences'))
    or r.code='administration' and (c.key like 'backoffice.functions.%' and ((c.module in ('finance','customers') and c.action in ('read','write')) or c.module in ('overview','commercial','work_orders','reports','followup') and c.action='read') or c.key in ('backoffice.access','backoffice.overview.read','backoffice.finance.read','backoffice.finance.write','backoffice.customers.read','backoffice.customers.write','backoffice.commercial.read','backoffice.work_orders.read','backoffice.reports.read','backoffice.followup.read') or c.key in ('tickets.support.read','tickets.support.create','tickets.support.reply','notifications.read_own','notifications.preferences'))
    or r.code='support' and (c.key like 'backoffice.functions.%' and c.module in ('overview','followup') and c.action='read' or c.key in ('backoffice.access','backoffice.overview.read','backoffice.followup.read') or c.key in ('tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.internal.manage','tickets.internal.assign','tickets.internal.close','tickets.support.read','tickets.support.create','tickets.support.reply','tickets.support.note','tickets.support.manage','tickets.support.assign','tickets.support.close','notifications.read_own','notifications.preferences'))
   ) on conflict do nothing;
  end if;
 end loop;
end$$;
select private.management_seed(id) from public.tenants;

-- Existing owners retain their complete authority. Other legacy memberships
-- retain their reviewed authority until the owner explicitly assigns a new role.
insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at)
select m.tenant_id,m.id,r.id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Gebruiker'),now()
from public.tenant_memberships m join auth.users u on u.id=m.user_id join private.management_roles r on r.tenant_id=m.tenant_id and r.code='owner'
where 'tenant_admin'=any(m.roles) and m.status='active';

create function private.management_has(t uuid,actor uuid,cap text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id
 join public.tenants tn on tn.id=m.tenant_id and tn.status='active' join auth.users u on u.id=m.user_id
 join private.management_role_permissions p on p.role_id=mm.role_id and p.tenant_id=mm.tenant_id
 where mm.tenant_id=t and m.user_id=actor and m.status='active' and mm.revoked_at is null and p.capability=cap
 and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
$$;
create function private.management_is_managed(t uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=actor)
$$;
create function private.management_allowed(t uuid,cap text) returns boolean language sql stable security definer set search_path='' as $$
 select not private.management_is_managed(t,auth.uid()) or (private.actor_session_active() and private.management_has(t,auth.uid(),'backoffice.access') and private.management_has(t,auth.uid(),cap))
$$;
create function private.management_assert(t uuid,cap text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.management_allowed(t,cap) then raise exception 'Je rol geeft geen toegang tot deze functie.' using errcode='42501';end if;
end$$;
create function private.management_fresh_owner(t uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare mid uuid;
begin
 if not private.actor_session_active() or not exists(select 1 from public.tenants where id=t and status='active') then raise exception 'Log opnieuw in.' using errcode='42501';end if;
 select m.id into mid from private.management_members mm join private.management_roles r on r.id=mm.role_id
 join public.tenant_memberships m on m.id=mm.membership_id
 where mm.tenant_id=t and m.user_id=auth.uid() and m.status='active' and mm.revoked_at is null and r.code='owner';
 if mid is null then raise exception 'Alleen de eigenaar kan gebruikers en rollen beheren.' using errcode='42501';end if;
 if not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and s.created_at>now()-interval '15 minutes' and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='otp')) then
  raise exception 'Log opnieuw in met een inlogcode om gebruikers, rechten of eigenaarschap te wijzigen.' using errcode='42501';end if;
 return mid;
end$$;

create function private.management_member_initialize() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and 'tenant_admin'=any(new.roles) and not exists(select 1 from private.management_members where membership_id=new.id) then
  perform private.management_seed(new.tenant_id);
  insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at)
  select new.tenant_id,new.id,r.id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Gebruiker'),now()
  from private.management_roles r join auth.users u on u.id=new.user_id where r.tenant_id=new.tenant_id and r.code='owner';
 end if;
 return new;
end$$;
create trigger management_member_initialize after insert on public.tenant_memberships for each row execute function private.management_member_initialize();
create function private.management_last_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.tenants where id=old.tenant_id) then return case when tg_op='DELETE' then old else new end;end if;
 if exists(select 1 from private.management_members mm join private.management_roles r on r.id=mm.role_id where mm.membership_id=old.id and r.code='owner')
 and (tg_op='DELETE' or new.status<>'active') then
  perform pg_advisory_xact_lock(hashtextextended('management:'||old.tenant_id::text,0));
  if not exists(select 1 from private.management_members mm join private.management_roles r on r.id=mm.role_id
   join public.tenant_memberships m on m.id=mm.membership_id join auth.users u on u.id=m.user_id
   where mm.tenant_id=old.tenant_id and r.code='owner' and m.id<>old.id and m.status='active' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then
   raise exception 'Draag eerst het eigenaarschap over aan een actieve gebruiker.' using errcode='23514';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
create trigger management_last_owner before update of status or delete on public.tenant_memberships for each row execute function private.management_last_owner();

-- Reuse the existing capability registry/resolver. Managed accounts never fall
-- back to stale bootstrap/direct tenant grants; platform grants are untouched.
CREATE OR REPLACE FUNCTION private.ticket_has_cap(t uuid, actor uuid, cap text, category uuid DEFAULT NULL::uuid, person uuid DEFAULT NULL::uuid, obj uuid DEFAULT NULL::uuid, customer uuid DEFAULT NULL::uuid, assigned uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if private.management_is_managed(t,actor) and exists(select 1 from public.permission_catalog where key=cap and domain='tenant') then
  if not private.management_has(t,actor,cap) then return false;end if;
  -- Existing scoped grants and explicit disabled grants remain an additional
  -- boundary. HR always needs its independently delegated exact record scope.
  if cap<>'tickets.internal.hr' and not exists(select 1 from public.permission_grants g where g.tenant_id=t and g.user_id=actor and g.capability=cap) then return true;end if;
 end if;
return (select exists(select 1 from public.permission_grants g join public.permission_catalog c on c.key=g.capability
 left join public.tenant_memberships m on m.id=g.membership_id and m.tenant_id=g.tenant_id and m.user_id=g.user_id
 where g.user_id=actor and g.capability=cap and g.enabled and ((c.domain='platform' and g.tenant_id is null) or (c.domain='tenant' and g.tenant_id=t and m.status='active'))
 and (not(g.scope?'tenant_ids') or g.scope->'tenant_ids' ? t::text)
 and (not(g.scope?'category_ids') or g.scope->'category_ids' ? category::text)
 and (not(g.scope?'personnel_ids') or g.scope->'personnel_ids' ? person::text)
 and (not(g.scope?'object_ids') or g.scope->'object_ids' ? obj::text)
 and (not(g.scope?'customer_ids') or g.scope->'customer_ids' ? customer::text)
 and (not coalesce((g.scope->>'assigned_only')::boolean,false) or assigned=actor)
 and (g.scope->>'all'='true' or g.scope ?| array['tenant_ids','category_ids','personnel_ids','object_ids','customer_ids','assigned_only'])));
end;
$function$
;

create function public.management_context(target_tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.tenant_memberships; mm private.management_members; r private.management_roles;
begin
 if not private.actor_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang.' using errcode='42501';end if;
 select * into m from public.tenant_memberships where tenant_id=target_tenant and user_id=auth.uid() and status='active';
 if not found then raise exception 'Geen toegang.' using errcode='42501';end if;
 select * into mm from private.management_members where membership_id=m.id;
 if not found then return jsonb_build_object('managed',false,'role',null,'permissions',null);end if;
 if mm.revoked_at is not null then return jsonb_build_object('managed',true,'role',null,'displayName',mm.full_name,'permissions','[]'::jsonb);end if;
 select * into r from private.management_roles where id=mm.role_id;
 update private.management_members set accepted_at=coalesce(accepted_at,now()) where membership_id=m.id;
 return jsonb_build_object('managed',true,'role',r.name,'displayName',mm.full_name,'permissions',coalesce((select jsonb_agg(capability order by capability) from private.management_role_permissions where role_id=r.id),'[]'));
end$$;
create function public.management_query(target_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.actor_session_active() or not private.management_has(target_tenant,auth.uid(),'management.users.read') then raise exception 'Geen toegang tot gebruikersbeheer.' using errcode='42501';end if;
 return jsonb_build_object(
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'revision',r.revision,'permissions',coalesce((select jsonb_agg(p.capability order by p.capability) from private.management_role_permissions p where p.role_id=r.id),'[]')) order by case r.code when 'owner' then 0 when 'management' then 1 when 'planning' then 2 when 'administration' then 3 else 4 end) from private.management_roles r where r.tenant_id=target_tenant),'[]'),
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'name',coalesce(mm.full_name,u.raw_user_meta_data->>'full_name',u.email),'email',u.email,'status',case when mm.revoked_at is not null then 'revoked' else m.status::text end,'roleId',mm.role_id,'roleName',coalesce(r.name,'Bestaande rol'),'revision',coalesce(mm.revision,1),'invitedAt',mm.invited_at,'acceptedAt',mm.accepted_at) order by coalesce(mm.full_name,u.email)) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join private.management_members mm on mm.membership_id=m.id left join private.management_roles r on r.id=mm.role_id where m.tenant_id=target_tenant and (mm.membership_id is not null or m.roles<>array['staff']::public.app_role[])),'[]'),
 'catalog',coalesce((select jsonb_agg(jsonb_build_object('key',key,'name',name,'description',description,'module',module,'action',action,'dependencies',dependencies,'sensitive',sensitive) order by module,key) from public.permission_catalog where domain='tenant'),'[]'),
 'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'source',x.source_membership,'target',x.target_membership,'expiresAt',x.expires_at)) from private.management_transfers x where x.tenant_id=target_tenant and x.status='pending' and x.expires_at>now()),'[]'),
 'canManage',exists(select 1 from private.management_members mm join private.management_roles r on r.id=mm.role_id join public.tenant_memberships m on m.id=mm.membership_id where mm.tenant_id=target_tenant and m.user_id=auth.uid() and m.status='active' and r.code='owner'));
end$$;
create function public.management_pending_transfer(target_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.actor_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang.' using errcode='42501';end if;
 return coalesce((select jsonb_build_object('id',x.id,'expiresAt',x.expires_at,'sourceName',coalesce(mm.full_name,u.email)) from private.management_transfers x join public.tenant_memberships m on m.id=x.target_membership and m.user_id=auth.uid() and m.status='active' join public.tenant_memberships s on s.id=x.source_membership join auth.users u on u.id=s.user_id left join private.management_members mm on mm.membership_id=s.id where x.tenant_id=target_tenant and x.status='pending' and x.expires_at>now() limit 1),'null'::jsonb);
end$$;

create function public.management_command(target_tenant uuid,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();mid uuid;fingerprint text;previous private.management_receipts;r private.management_roles;
 target public.tenant_memberships;mm private.management_members;cap text;result jsonb;tr private.management_transfers;
begin
 if not exists(select 1 from public.tenants where id=target_tenant and status='active') or not private.actor_session_active() or request_id is null or input is null or jsonb_typeof(input)<>'object' then raise exception 'Geen toegang.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('management:'||target_tenant::text,0));
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('command',command,'input',input)::text,'utf8'),'sha256'),'hex');
 select * into previous from private.management_receipts where tenant_id=target_tenant and actor_id=actor and management_receipts.request_id=management_command.request_id;
 if found then
  if previous.fingerprint<>fingerprint then raise exception 'Deze aanvraag is al voor een andere wijziging gebruikt.' using errcode='23514';end if;
  -- A replay never revives a revoked actor or completes a new transfer.
  if not exists(select 1 from public.tenant_memberships where tenant_id=target_tenant and user_id=actor and status='active') then raise exception 'Geen toegang.' using errcode='42501';end if;
  return previous.result;
 end if;
 if command='accept_transfer' then
  if not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=actor and s.created_at>now()-interval '15 minutes' and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='otp')) then raise exception 'Log opnieuw in om de overdracht te accepteren.' using errcode='42501';end if;
  select * into tr from private.management_transfers where id=(input->>'transferId')::uuid and tenant_id=target_tenant and status='pending' and expires_at>now() for update;
  select * into target from public.tenant_memberships where id=tr.target_membership and tenant_id=target_tenant and user_id=actor and status='active';
  if tr.id is null or target.id is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'Deze overdracht is niet beschikbaar.' using errcode='42501';end if;
  if not exists(select 1 from private.management_members owner_member join private.management_roles mgrole on mgrole.id=owner_member.role_id join public.tenant_memberships m on m.id=owner_member.membership_id where m.id=tr.source_membership and m.status='active' and owner_member.revoked_at is null and mgrole.code='owner') then raise exception 'De eigenaar is intussen gewijzigd.' using errcode='23514';end if;
  update private.management_members set role_id=(select id from private.management_roles where tenant_id=target_tenant and code='owner'),revision=revision+1 where membership_id=target.id;
  update private.management_members set role_id=(select id from private.management_roles where tenant_id=target_tenant and code='management'),revision=revision+1 where membership_id=tr.source_membership;
  update public.tenant_memberships set roles=array(select distinct unnest(roles||array['tenant_admin']::public.app_role[])) where id=target.id;
  update public.tenant_memberships set roles=array(select distinct unnest(array_remove(roles,'tenant_admin'::public.app_role)||array['management','planner','finance','hr']::public.app_role[])) where id=tr.source_membership;
  update private.management_transfers set status='accepted',accepted_at=now() where id=tr.id;
  result:=jsonb_build_object('id',tr.id,'status','accepted');
 else
  mid:=private.management_fresh_owner(target_tenant);
  if command='prepare_invite' then
   if length(btrim(input->>'name')) not between 2 and 160 or length(input->>'email') not between 3 and 320 or not exists(select 1 from private.management_roles where id=(input->>'roleId')::uuid and tenant_id=target_tenant and code<>'owner') then raise exception 'Ongeldige uitnodiging.' using errcode='23514';end if;
   result:=jsonb_build_object('authorized',true);
  elsif command='save_role' then
   select * into r from private.management_roles where id=(input->>'roleId')::uuid and tenant_id=target_tenant for update;
   if r.id is null or r.code='owner' then raise exception 'De eigenaarrol kan niet worden gewijzigd.' using errcode='42501';end if;
   if r.revision is distinct from (input->>'revision')::bigint then raise exception 'Deze rol is intussen gewijzigd. Vernieuw het overzicht.' using errcode='40001';end if;
   if jsonb_typeof(input->'permissions') is distinct from 'array' or jsonb_array_length(input->'permissions')>250 then raise exception 'Ongeldige rechten.' using errcode='23514';end if;
   if not(input->'permissions' ? 'backoffice.access') then raise exception 'Een managementrol moet de backoffice kunnen openen.' using errcode='23514';end if;
   for cap in select jsonb_array_elements_text(input->'permissions') loop
    if not exists(select 1 from public.permission_catalog where key=cap and domain='tenant') or cap like 'management.%' then raise exception 'Dit recht is uitsluitend voor de eigenaar.' using errcode='42501';end if;
    if cap like 'backoffice.%.write' and not(input->'permissions' ? replace(cap,'.write','.read')) then raise exception 'Geef ook inzage voor een wijzigingsrecht.' using errcode='23514';end if;
    if exists(select 1 from public.permission_catalog c cross join lateral unnest(c.dependencies) dep where c.key=cap and not(input->'permissions' ? dep)) then raise exception 'Een afhankelijk recht ontbreekt.' using errcode='23514';end if;
   end loop;
   delete from private.management_role_permissions where role_id=r.id;
   insert into private.management_role_permissions(tenant_id,role_id,capability) select target_tenant,r.id,x from (select distinct jsonb_array_elements_text(input->'permissions') x) v;
   update private.management_roles set revision=revision+1 where id=r.id;
   result:=jsonb_build_object('id',r.id,'revision',r.revision+1);
  elsif command='invite' then
   select * into r from private.management_roles where id=(input->>'roleId')::uuid and tenant_id=target_tenant and code<>'owner';
   if r.id is null or length(btrim(input->>'name')) not between 2 and 160 or not exists(select 1 from auth.users where id=(input->>'userId')::uuid and lower(email)=lower(input->>'email') and deleted_at is null and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'Ongeldige uitnodiging.' using errcode='23514';end if;
   if exists(select 1 from public.tenant_memberships where tenant_id=target_tenant and user_id=(input->>'userId')::uuid) then raise exception 'Dit account is al verbonden. Pas de bestaande gebruiker aan.' using errcode='23514';end if;
   insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at) values(target_tenant,(input->>'userId')::uuid,array['management','planner','finance','hr']::public.app_role[],'active',now()) returning * into target;
   insert into private.management_members(tenant_id,membership_id,role_id,full_name,invited_by,invited_at) values(target_tenant,target.id,r.id,btrim(input->>'name'),actor,now());
   result:=jsonb_build_object('id',target.id,'userId',target.user_id,'email',input->>'email','name',btrim(input->>'name'),'role',r.name,'deliveryId',request_id);
  elsif command in ('assign','revoke','resend') then
   select * into target from public.tenant_memberships where id=(input->>'memberId')::uuid and tenant_id=target_tenant for update;
   select * into mm from private.management_members where membership_id=target.id;
   if target.id is null or target.user_id=actor or exists(select 1 from private.management_roles where id=mm.role_id and code='owner') then raise exception 'Je kunt jezelf of een eigenaar niet via deze actie wijzigen.' using errcode='42501';end if;
   if coalesce(mm.revision,1) is distinct from (input->>'revision')::bigint then raise exception 'Deze gebruiker is intussen gewijzigd. Vernieuw het overzicht.' using errcode='40001';end if;
   if command='assign' then
    select * into r from private.management_roles where id=(input->>'roleId')::uuid and tenant_id=target_tenant and code<>'owner';
    if r.id is null then raise exception 'Kies een managementrol.' using errcode='23514';end if;
    insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at) select target_tenant,target.id,r.id,coalesce(mm.full_name,u.raw_user_meta_data->>'full_name',u.email),now() from auth.users u where u.id=target.user_id
    on conflict(membership_id) do update set role_id=excluded.role_id,revoked_at=null,revision=management_members.revision+1;
    update public.tenant_memberships set roles=array(select distinct unnest(array_remove(roles,'tenant_admin'::public.app_role)||array['management','planner','finance','hr']::public.app_role[])),status='active',revoked_at=null where id=target.id;
    result:=jsonb_build_object('id',target.id);
   elsif command='revoke' then
    update public.tenant_memberships set roles=case when 'staff'=any(roles) then array['staff']::public.app_role[] else roles end,status=case when 'staff'=any(roles) then 'active'::public.membership_status else 'revoked'::public.membership_status end,revoked_at=case when 'staff'=any(roles) then null else now() end where id=target.id;
    update private.management_members set revoked_at=now(),revision=revision+1 where membership_id=target.id;
    update private.management_transfers set status='cancelled' where tenant_id=target_tenant and status='pending' and target_membership=target.id;
    result:=jsonb_build_object('id',target.id);
   else
    if target.status<>'active' or mm.membership_id is null or mm.revoked_at is not null then raise exception 'Activeer deze gebruiker voordat je een uitnodiging verstuurt.' using errcode='23514';end if;
    update private.management_members set invited_at=now(),revision=revision+1 where membership_id=target.id;
    select * into r from private.management_roles where id=mm.role_id;
    result:=(select jsonb_build_object('id',target.id,'userId',target.user_id,'email',email,'name',mm.full_name,'role',r.name,'deliveryId',request_id) from auth.users where id=target.user_id);
   end if;
  elsif command='transfer' then
   select * into target from public.tenant_memberships where id=(input->>'memberId')::uuid and tenant_id=target_tenant and status='active' and user_id<>actor;
   if target.id is null or not exists(select 1 from private.management_members where membership_id=target.id and accepted_at is not null and revoked_at is null) then raise exception 'Kies een actieve gebruiker die al is ingelogd.' using errcode='23514';end if;
   update private.management_transfers set status='expired' where tenant_id=target_tenant and status='pending' and expires_at<=now();
   insert into private.management_transfers(tenant_id,source_membership,target_membership) values(target_tenant,mid,target.id) returning * into tr;
   result:=jsonb_build_object('id',tr.id,'status','pending');
  elsif command='cancel_transfer' then
   update private.management_transfers set status='cancelled' where tenant_id=target_tenant and id=(input->>'transferId')::uuid and source_membership=mid and status='pending' returning * into tr;
   if tr.id is null then raise exception 'Geen open overdracht gevonden.' using errcode='23514';end if;
   result:=jsonb_build_object('id',tr.id,'status','cancelled');
  else raise exception 'Onbekende gebruikersactie.' using errcode='23514';end if;
 end if;
 insert into private.management_receipts values(target_tenant,actor,request_id,fingerprint,result);
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,actor,'management.'||command,'management',null,jsonb_build_object('requestId',request_id,'result',result-'email'-'name'));
 return result;
end$$;
revoke all on function public.management_context(uuid),public.management_query(uuid),public.management_pending_transfer(uuid),public.management_command(uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.management_context(uuid),public.management_query(uuid),public.management_pending_transfer(uuid),public.management_command(uuid,text,jsonb,uuid) to authenticated;

-- Every mapped backoffice RPC checks both its module and its explicit function key.
CREATE OR REPLACE FUNCTION public.accept_object_proposal(target_tenant uuid, target_proposal uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.object_request_proposals;r public.object_visit_requests;rev public.task_revisions;cat public.task_catalog;task uuid;
begin
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.accept_object_proposal');

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into p from public.object_request_proposals where tenant_id=target_tenant and id=target_proposal for update;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=p.request_id for update;
 if p.id is null or r.id is null or r.created_by<>auth.uid() or not private.customer_visit_access(target_tenant,p.object_id,r.work_order_id) then raise exception 'Geen toegang tot dit voorstel' using errcode='42501';end if;
 if p.accepted_at is not null then return;end if;
 if r.state<>'proposal' or r.needs_review or r.work_order_task_id is not null or exists(select 1 from public.object_request_proposals n where n.request_id=p.request_id and n.version>p.version) then raise exception 'Dit voorstel is gewijzigd. Bekijk de nieuwste versie.' using errcode='40001';end if;
 select * into rev from public.task_revisions where id=p.task_revision_id and tenant_id=target_tenant;
 select * into cat from public.task_catalog where id=rev.task_id and tenant_id=target_tenant;
 update public.object_request_proposals set accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=p.id;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,added_by)
 values(target_tenant,r.work_order_id,rev.id,cat.code,p.title,rev.duration_minutes,p.quantity,rev.unit,p.price_cents,p.vat_basis_points,true,'awaiting_review',auth.uid()) returning id into task;
 update public.object_visit_requests set state='accepted',work_order_task_id=task where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'accepted:'||p.id::text);
end $function$
;
CREATE OR REPLACE FUNCTION public.answer_work_order_checklist(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.work_order_checklists;w public.work_orders;a public.work_order_checklist_answers;q jsonb;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;r jsonb;val jsonb:=input->'value';na boolean:=coalesce((input->>'notApplicable')::boolean,false);manager boolean;attachment uuid:=nullif(input->>'attachmentId','')::uuid;
begin


 if not private.object_session_active() then raise exception 'Een actieve sessie is vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into c from public.work_order_checklists where tenant_id=target_tenant and id=(input->>'checklistId')::uuid;
 select * into w from public.work_orders where tenant_id=target_tenant and id=c.work_order_id for update;
 manager:=private.planning_access(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.answer_work_order_checklist');
 if w.id is null or not(manager or (private.has_role(target_tenant,array['staff']::public.app_role[]) and exists(select 1 from public.work_order_assignments crew join public.personnel p on p.tenant_id=crew.tenant_id and p.id=crew.personnel_id join public.dispatches d on d.assignment_id=crew.id and d.revoked_at is null where crew.work_order_id=w.id and p.user_id=auth.uid() and crew.status not in ('cancelled','returned')))) then raise exception 'Geen toegang tot deze checklist' using errcode='42501';end if;
 if w.status not in ('in_progress','completed','correction_required') or coalesce(to_jsonb(w)->>'report_state','draft') in ('waiting_signature','review','approved') then raise exception 'Antwoorden horen bij de actieve uitvoering; een ingediend rapport blijft bewaard' using errcode='23514';end if;
 if mid is null then raise exception 'Een herhaalsleutel is vereist' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'answer',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select x into q from jsonb_array_elements(c.definition->'questions')x where x->>'id'=input->>'questionId';
 if q is null then raise exception 'Deze vraag bestaat niet in de checklistversie' using errcode='23514';end if;
 if na then if not coalesce((q->>'allowNA')::boolean,false) or length(btrim(coalesce(input->>'reason','')))<3 then raise exception 'Niet van toepassing vereist toestemming en een reden' using errcode='23514';end if;
 else
 if q->>'type' in ('check','boolean') and jsonb_typeof(val) is distinct from 'boolean' or q->>'type'='number' and jsonb_typeof(val) is distinct from 'number' or q->>'type' in ('text','choice') and jsonb_typeof(val) is distinct from 'string' then raise exception 'Het antwoord past niet bij deze vraag' using errcode='23514';end if;
 if q->>'type'='choice' and not((q->'options') ? (val#>>'{}')) then raise exception 'Kies een beschikbare antwoordoptie' using errcode='23514';end if;
 if length(val::text)>10000 then raise exception 'Het antwoord is te lang' using errcode='23514';end if;
 end if;
 if attachment is not null and not exists(select 1 from public.attachments x where x.tenant_id=target_tenant and x.id=attachment and x.work_order_id=w.id and x.deleted_at is null and x.mime_type in ('image/jpeg','image/png','image/webp')) then raise exception 'Kies een foto uit deze werkbon' using errcode='23514';end if;
 select * into a from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->>'id' for update;
 if a.id is not null and a.updated_by<>auth.uid() and not manager then raise exception 'Checklistantwoord is niet van jou; vraag de backoffice om een correctie' using errcode='42501';end if;
   if attachment is not null and not manager and not exists(select 1 from public.attachments proof where proof.tenant_id=target_tenant and proof.work_order_id=w.id and proof.id=attachment and proof.uploaded_by=auth.uid()) then raise exception 'Kies een eigen bewijsfoto' using errcode='42501';end if;
   if coalesce(a.version,0)<>coalesce((input->>'version')::bigint,0) then raise exception 'Dit antwoord is intussen gewijzigd. Bekijk de actuele waarde.' using errcode='40001';end if;
 insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,not_applicable,reason,attachment_id,updated_by) values(target_tenant,c.id,q->>'id',val,na,coalesce(input->>'reason',''),attachment,auth.uid())
 on conflict(tenant_id,checklist_id,question_id) do update set value=excluded.value,not_applicable=excluded.not_applicable,reason=excluded.reason,attachment_id=excluded.attachment_id,updated_by=excluded.updated_by,version=public.work_order_checklist_answers.version+1,updated_at=clock_timestamp() returning * into a;
 update public.work_orders set version=version+1 where id=w.id;
 r:=jsonb_build_object('ok',true,'id',a.id,'version',a.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'answer',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_answer','work_order',w.id,jsonb_build_object('checklistId',c.id,'questionId',q->>'id','answerVersion',a.version));
 return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.assign_work_order_task(target_tenant uuid, target_task uuid, expected_version bigint, personnel uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task public.work_order_tasks;work public.work_orders;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.assign_work_order_task');

 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen actuele beheertoegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into task from public.work_order_tasks where tenant_id=target_tenant and id=target_task for update;
 select * into work from public.work_orders where tenant_id=target_tenant and id=task.work_order_id for update;
 if task.id is null or task.execution_version<>expected_version then raise exception 'De taak is gewijzigd' using errcode='40001';end if;
 if work.archive_at is not null or work.status in ('approved','invoice_ready','invoiced','cancelled') or work.report_state in ('waiting_signature','review','approved') then raise exception 'Deze taak kan niet meer worden verdeeld' using errcode='23514';end if;
 update public.work_order_tasks set assigned_personnel_id=personnel,execution_version=execution_version+1 where id=task.id;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.task_assigned','work_order_task',task.id,jsonb_build_object('personnel_id',personnel));
end $function$
;
CREATE OR REPLACE FUNCTION public.attach_invoice_pdf(target_invoice_id uuid, storage_path text, sha256 text)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.invoices;
begin
 perform private.management_assert((select tenant_id from public.invoices where id=target_invoice_id),'backoffice.finance.write');
 perform private.management_assert((select tenant_id from public.invoices where id=target_invoice_id),'backoffice.functions.attach_invoice_pdf');

  select * into target from public.invoices i where i.id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if target.status = 'draft' then raise exception 'Finalize invoice before attaching its PDF' using errcode = '23514'; end if;
  if sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid SHA-256 digest' using errcode = '23514'; end if;
  if target.pdf_sha256 is not null and target.pdf_sha256 <> sha256 then
    raise exception 'A finalized invoice PDF cannot be replaced silently' using errcode = '23514';
  end if;
  update public.invoices set pdf_storage_path = storage_path, pdf_sha256 = sha256 where id = target.id returning * into target;
  return target;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.attach_work_order_checklist(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;v public.work_order_template_versions;template_name text;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.attach_work_order_checklist');

 if not private.object_manage(target_tenant) or not private.service_enabled(target_tenant,'rapportage') then raise exception 'Geen checklistbeheer' using errcode='42501';end if;
 if jsonb_typeof(input)<>'object' or mid is null or (input->>'version')::bigint is null or (input->>'version')::bigint<1 or input->>'orderId' is null or input->>'revisionId' is null or exists(select 1 from jsonb_object_keys(input) k where k not in('mutationId','orderId','revisionId','version')) then raise exception 'Ongeldige checklistwijziging' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'checklist:attach',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null or w.status in('approved','invoice_ready','invoiced','cancelled') or w.report_state not in('draft','correction') then raise exception 'Vraag eerst een rapportcorrectie. De vastgelegde oplevering blijft behouden.' using errcode='23514';end if;
 select tv.* into v from public.work_order_template_versions tv join public.work_order_templates t on t.tenant_id=tv.tenant_id and t.id=tv.template_id where tv.tenant_id=target_tenant and tv.id=(input->>'revisionId')::uuid and tv.state='published' and t.kind='checklist';
 if v.id is null then raise exception 'Kies een gepubliceerde checklistversie van deze organisatie' using errcode='23514';end if;
 if exists(select 1 from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id and c.template_revision_id=v.id) then raise exception 'Deze checklistversie is al gekoppeld' using errcode='23514';end if;
 if (select count(*) from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id)>=20 then raise exception 'Maximaal twintig checklists per werkbon' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where tenant_id=target_tenant and id=v.template_id;
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition) values(target_tenant,w.id,v.id,template_name,v.definition);
 update public.work_orders set version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=w.id returning * into w;
 result:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'checklist:attach',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_added','work_order',w.id,jsonb_build_object('revisionId',v.id,'name',template_name,'version',v.version));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.bind_object_customer(target_tenant uuid, target_object uuid, email_address text, is_active boolean, allow_secrets boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid;
begin
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.bind_object_customer');

 if not private.object_manage(target_tenant) or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) or not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object) then raise exception 'Geen toegang' using errcode='42501';end if;
 select id into u from auth.users where lower(email)=lower(btrim(email_address)) and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<clock_timestamp());
 if u is null then raise exception 'Geen gecontroleerd account beschikbaar' using errcode='23514';end if;
 insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,manage_secrets) values(target_tenant,target_object,u,is_active,allow_secrets)
 on conflict(tenant_id,object_id,user_id) do update set active=excluded.active,manage_secrets=excluded.manage_secrets;
end $function$
;
CREATE OR REPLACE FUNCTION public.change_work_order_planning(target_tenant uuid, target_work_order uuid, expected_version bigint, mutation_id uuid, target_start timestamp with time zone, target_end timestamp with time zone, target_assignments jsonb, confirmed_warnings text[] DEFAULT '{}'::text[], undo_change uuid DEFAULT NULL::uuid, appointment_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<planning_mutation>>
declare w public.work_orders; person public.personnel; a record; req record; current_a public.work_order_assignments;
 old_state jsonb; new_state jsonb; prior public.planning_changes; undo_record public.planning_changes;
 warnings jsonb:='[]'::jsonb; tz text; window_start timestamptz; window_end timestamptz;
 n integer; assignment_id uuid; desired_status text; route record; neighbour public.work_order_assignments;
begin
 perform private.management_assert(target_tenant,'backoffice.planning.write');
 perform private.management_assert(target_tenant,'backoffice.functions.change_work_order_planning');

 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if expected_version is null or expected_version<1 or mutation_id is null then raise exception 'Een geldige wijzigingsversie en wijzigingssleutel zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_work_order for update;
 if not found then raise exception 'Werkbon niet gevonden' using errcode='42501';end if;
 select * into prior from public.planning_changes where id=mutation_id;
 if found then
   if prior.tenant_id<>target_tenant or prior.actor_user_id<>auth.uid() or prior.work_order_id<>w.id then raise exception 'Ongeldige wijzigingssleutel' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'changeId',prior.id,'version',w.version,'replayed',true);
 end if;
 if w.version<>expected_version then raise exception 'De planning is intussen gewijzigd. Bekijk de actuele situatie en probeer opnieuw.' using errcode='40001';end if;
 if w.status not in ('planned','released','seen','travelling') or w.actual_start_at is not null or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and (actual_start_at is not null or status in ('in_progress','completed'))) then
   raise exception 'Deze uitvoering kan niet meer via het planbord worden gewijzigd' using errcode='23514';end if;
 old_state:=private.planning_snapshot(w.id);
 if undo_change is not null then
   select * into undo_record from public.planning_changes where id=undo_change and tenant_id=target_tenant and actor_user_id=auth.uid() and work_order_id=w.id and undone_by is null for update;
   if not found or (undo_record.after_data->>'version')::bigint<>w.version or exists(select 1 from public.planning_changes c where c.tenant_id=target_tenant and c.actor_user_id=auth.uid() and c.created_at>undo_record.created_at) then
     raise exception 'Deze wijziging kan niet meer veilig ongedaan worden gemaakt' using errcode='40001';end if;
   target_start:=(undo_record.before_data->>'start')::timestamptz;
   target_end:=(undo_record.before_data->>'end')::timestamptz;
   target_assignments:=undo_record.before_data->'assignments';
   appointment_data:=undo_record.before_data->'appointment';
 end if;
 if appointment_data is not null then
   if jsonb_typeof(appointment_data)<>'object' or not(appointment_data ?& array['requestedDate','windowKind','requiredPersonnel','instructions']) then raise exception 'Ongeldige afspraakgegevens' using errcode='23514';end if;
   w.requested_date:=(appointment_data->>'requestedDate')::date;
   w.customer_window_kind:=appointment_data->>'windowKind';
   w.required_personnel:=(appointment_data->>'requiredPersonnel')::integer;
   w.day_instructions:=appointment_data->>'instructions';
   if w.customer_window_kind is null or w.customer_window_kind not in ('unknown','arrival','execution') or w.required_personnel is null or w.required_personnel not between 1 and 100 or w.day_instructions is null or length(w.day_instructions)>2000 or (w.requested_date is not null and not isfinite(w.requested_date)) then raise exception 'Controleer de afspraakgegevens' using errcode='23514';end if;
 end if;
 if target_assignments is null or jsonb_typeof(target_assignments)<>'array' or jsonb_array_length(target_assignments)>100 then raise exception 'Ongeldige medewerkersselectie' using errcode='23514';end if;
 if (target_start is null)<>(target_end is null) or target_end<=target_start or (target_start is null and (w.status<>'planned' or jsonb_array_length(target_assignments)>0)) then raise exception 'Vul een geldige begin- en eindtijd in' using errcode='23514';end if;
 if target_start is not null and (not isfinite(target_start) or not isfinite(target_end) or target_end-target_start>interval '7 days' or date_trunc('minute',target_start)<>target_start or date_trunc('minute',target_end)<>target_end) then raise exception 'Gebruik hele minuten en een uitvoering van maximaal zeven dagen' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if (select count(*) from jsonb_array_elements(target_assignments))<>(select count(distinct x->>'personnelId') from jsonb_array_elements(target_assignments)x) then raise exception 'Selecteer iedere medewerker maximaal één keer' using errcode='23514';end if;
 select s.starts_at,s.ends_at into window_start,window_end from public.appointment_slots s where s.tenant_id=target_tenant and s.id=w.appointment_slot_id;
 if target_start is not null then
   if w.requested_date is not null and (target_start at time zone tz)::date<>w.requested_date then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','requested-date','message','De planning wijkt af van de gewenste datum '||to_char(w.requested_date,'DD-MM-YYYY')));end if;
   if window_start is not null then
     if w.customer_window_kind='unknown' then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','window-unknown','message','Het type klantvenster is onbekend; controleer de afspraak.'));
     elsif target_start<window_start or (w.customer_window_kind='arrival' and target_start>window_end) or(w.customer_window_kind='execution' and target_end>window_end) then
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','customer-window','message',case when w.customer_window_kind='arrival' then 'De begintijd valt buiten het aankomstvenster.' else 'De volledige uitvoering past niet binnen het klantvenster.' end));end if;
   end if;
 end if;
 n:=jsonb_array_length(target_assignments);
 if n<w.required_personnel then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','staffing','message',(w.required_personnel-n)::text||' medewerker(s) ontbreken voor de gewenste bezetting.'));end if;
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   if a."personnelId" is null or a.start is null or a."end" is null or a."end"<=a.start or a.start<target_start or a."end">target_end or date_trunc('minute',a.start)<>a.start or date_trunc('minute',a."end")<>a."end" then raise exception 'Ongeldig tijdvak voor medewerker' using errcode='23514';end if;
   select * into person from public.personnel where tenant_id=target_tenant and id=a."personnelId";
   if not found then raise exception 'Medewerker niet gevonden in deze organisatie' using errcode='42501';end if;
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=person.id and status not in ('cancelled','returned');
   -- An unchanged historical assignment remains intact; no new work for inactive staff.
   if person.status<>'active' and (current_a.id is null or (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end")) then raise exception 'Medewerker % is niet actief',person.full_name using errcode='23514';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind in ('unavailable','leave','sick') and v.starts_at<a."end" and v.ends_at>a.start) then raise exception '% is niet beschikbaar in dit tijdvak',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.work_order_assignments other join public.work_orders ow on ow.id=other.work_order_id and ow.tenant_id=other.tenant_id where other.tenant_id=target_tenant and other.personnel_id=person.id and other.work_order_id<>w.id and other.status not in ('completed','returned','cancelled') and ow.status<>'cancelled' and other.projected_start_at<a."end" and other.projected_end_at>a.start) then raise exception '% heeft een overlappende uitvoering',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<(date_trunc('day',a.start at time zone tz)+interval '1 day') at time zone tz and v.ends_at>date_trunc('day',a.start at time zone tz) at time zone tz)
    and not exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<=a.start and v.ends_at>=a."end") then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','hours:'||person.id,'message',person.full_name||': buiten de bekende werktijden.'));end if;
   for req in select * from private.assignment_requirements(target_tenant,person.id,w.id,a.start,a."end") loop
     if not private.qualified_for_period(target_tenant,person.id,req.code,a.start,a."end") then
       if req.hard_requirement then raise exception '% mist de vereiste kwalificatie % voor de volledige uitvoering',person.full_name,req.code using errcode='23514';end if;
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','qualification:'||person.id||':'||req.code,'message',person.full_name||': controleer kwalificatie '||req.code));
     end if;
   end loop;
   -- Only an existing calculation whose endpoints match the actual neighbouring
   -- objects is usable here. No assumed home base, mode or invented minutes.
   for route in select l.* from public.travel_legs l join public.work_order_assignments ra on ra.id=l.assignment_id and ra.tenant_id=l.tenant_id
     where l.tenant_id=target_tenant and ra.work_order_id=w.id and ra.personnel_id=person.id and l.error_code is null and l.calculated_at is not null and l.estimated_minutes is not null loop
     if route.direction='before' then
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_end_at<=a.start order by aa.projected_end_at desc limit 1;
     else
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_start_at>=a."end" order by aa.projected_start_at limit 1;
     end if;
     if neighbour.id is not null and exists(select 1 from public.objects ob join public.work_orders ow on ow.object_id=ob.id and ow.tenant_id=ob.tenant_id
       where ow.tenant_id=target_tenant and ow.id=neighbour.work_order_id and ob.address=case when route.direction='before' then route.origin_address else route.destination_address end)
       and exists(select 1 from public.objects ob where ob.tenant_id=target_tenant and ob.id=w.object_id and ob.address=case when route.direction='before' then route.destination_address else route.origin_address end)
       and (case when route.direction='before' then a.start-neighbour.projected_end_at else neighbour.projected_start_at-a."end" end)<make_interval(mins=>route.estimated_minutes) then
         warnings:=warnings||jsonb_build_array(jsonb_build_object('key','travel:'||person.id||':'||route.direction,'message',person.full_name||': minder ruimte tussen afspraken dan de bestaande reisberekening van '||route.estimated_minutes||' minuten. Controleer de route opnieuw.'));
     end if;
   end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(warnings)x where not(coalesce(x->>'key','')=any(coalesce(confirmed_warnings,'{}')))) then
   return jsonb_build_object('ok',false,'code','confirmation','warnings',warnings,'before',old_state,'proposed',jsonb_build_object('start',target_start,'end',target_end,'assignments',target_assignments));
 end if;
 -- Removing an assignment archives it and revokes its dispatch, preserving time,
 -- reports, historical dispatches and invoice relations. Never delete the work order.
 update public.dispatches d set revoked_at=clock_timestamp() where d.tenant_id=target_tenant and d.work_order_id=w.id and d.revoked_at is null and not exists(select 1 from public.work_order_assignments aa join jsonb_array_elements(target_assignments)x on (x->>'personnelId')::uuid=aa.personnel_id where aa.id=d.assignment_id);
 update public.work_order_assignments aa set status='cancelled' where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.status not in ('cancelled','returned') and not exists(select 1 from jsonb_array_elements(target_assignments)x where (x->>'personnelId')::uuid=aa.personnel_id);
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=a."personnelId";
   desired_status:=case when w.status='planned' then 'planned' else 'released' end;
   if current_a.id is null then
     insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,status)
     values(target_tenant,w.id,a."personnelId",a.start,a."end",a.start,a."end",desired_status) returning id into assignment_id;
   else
     assignment_id:=current_a.id;
     if (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end") or current_a.status in ('cancelled','returned') then
       update public.work_order_assignments set planned_start_at=a.start,planned_end_at=a."end",projected_start_at=a.start,projected_end_at=a."end",status=case when status in ('cancelled','returned') then desired_status else status end where id=assignment_id;
     end if;
   end if;
   if w.status<>'planned' and not exists(select 1 from public.dispatches d where d.tenant_id=target_tenant and d.assignment_id=planning_mutation.assignment_id and d.revoked_at is null) then
     insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values(target_tenant,w.id,assignment_id,auth.uid(),'planning:'||mutation_id||':'||a."personnelId");
   end if;
 end loop;
 update public.work_orders set planned_start_at=target_start,planned_end_at=target_end,projected_start_at=target_start,projected_end_at=target_end,
   requested_date=w.requested_date,customer_window_kind=w.customer_window_kind,required_personnel=w.required_personnel,day_instructions=w.day_instructions,
    planning_state=case
      when undo_change is not null then coalesce(undo_record.before_data->>'planningState',w.planning_state)
      when w.planning_state='unassigned' and target_start is not null and jsonb_array_length(target_assignments)>0 then 'tentative'
      when w.planning_state='tentative' and target_start is null then 'unassigned'
      else w.planning_state end where id=w.id;
 -- Restore the old contractual planned interval on undo without changing reality.
 if undo_change is not null then
   update public.work_orders set planned_start_at=(undo_record.before_data->>'plannedStart')::timestamptz,planned_end_at=(undo_record.before_data->>'plannedEnd')::timestamptz where id=w.id;
   update public.work_order_assignments aa set planned_start_at=(x->>'plannedStart')::timestamptz,planned_end_at=(x->>'plannedEnd')::timestamptz from jsonb_array_elements(target_assignments)x where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.personnel_id=(x->>'personnelId')::uuid;
 end if;
 -- Cached routes depend on both neighbours, their origins and departure times.
 -- The existing route module can recalculate; stale minutes must not masquerade as reliable.
 update public.travel_legs leg set error_code='planning_changed',calculated_at=null where leg.tenant_id=target_tenant and leg.actual_started_at is null and exists(select 1 from public.work_order_assignments aa where aa.id=leg.assignment_id and aa.tenant_id=target_tenant and aa.personnel_id in(select (x->>'personnelId')::uuid from jsonb_array_elements(target_assignments||(old_state->'assignments'))x));
 new_state:=private.planning_snapshot(w.id);
 insert into public.planning_changes(id,tenant_id,work_order_id,actor_user_id,before_data,after_data,confirmed_warnings) values(mutation_id,target_tenant,w.id,auth.uid(),old_state,new_state,warnings);
 if undo_change is not null then update public.planning_changes set undone_by=mutation_id where id=undo_change;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(target_tenant,auth.uid(),case when undo_change is null then 'planning.changed' else 'planning.undone' end,'work_order',w.id,old_state,new_state||jsonb_build_object('confirmed_warnings',warnings,'mutation_id',mutation_id));
 if w.status<>'planned' then
   for a in select distinct (x->>'personnelId')::uuid as pid from jsonb_array_elements(target_assignments)x loop
     perform private.enqueue_event(target_tenant,'work_order.rescheduled','work_order',w.id,jsonb_build_object('personnel_id',a.pid),'planning:'||mutation_id||':'||a.pid);
   end loop;
 end if;
 return jsonb_build_object('ok',true,'changeId',mutation_id,'version',(new_state->>'version')::bigint,'warnings',warnings);
end $function$
;
CREATE OR REPLACE FUNCTION public.change_work_order_signature_policy(target_order uuid, expected_version bigint, mode text, employee_required boolean, reason text, mutation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;candidate public.work_orders;before_policy jsonb;after_policy jsonb;prior private.work_order_policy_changes;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_order),'backoffice.work_orders.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_order),'backoffice.functions.change_work_order_signature_policy');

 select * into w from public.work_orders where id=target_order for update;
 if w.id is null or not private.object_session_active() or not private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen bevoegdheid om de ondertekenafspraak te wijzigen' using errcode='42501';end if;
 select * into prior from private.work_order_policy_changes where id=mutation_id;
 if found then
  if (prior.work_order_id,prior.actor_id,prior.mode,prior.employee_required,prior.reason) is distinct from (w.id,auth.uid(),mode,employee_required,btrim(reason)) then raise exception 'Herhaalsleutel is al voor een andere wijziging gebruikt' using errcode='23514';end if;return;
 end if;
 if w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd; herlaad voor aanpassen' using errcode='40001';end if;
 if mode is null or mode not in ('inherit','none','optional','required') or employee_required is null or reason is null or length(btrim(reason)) not between 5 and 2000 then raise exception 'Kies een ondertekenregel en motiveer de wijziging' using errcode='23514';end if;
 if w.status in ('cancelled','approved','invoice_ready','invoiced') or w.report_state not in ('draft','correction') then raise exception 'Vraag eerst rapportcorrectie aan; goedgekeurde afspraken blijven bewaard' using errcode='23514';end if;
 before_policy:=private.work_order_signature_policy(w);candidate:=w;candidate.signature_mode:=mode;candidate.employee_signature_required:=employee_required;candidate.signature_policy_snapshot:=null;
 after_policy:=private.work_order_signature_policy(candidate);
 -- An existing report obligation may not be lowered through the policy UI.
 -- Its independently authorized waiver remains the explicit exception path.
 if exists(select 1 from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id)
 and ((before_policy->>'mode'='required' and after_policy->>'mode'<>'required') or (coalesce((before_policy->>'employeeRequired')::boolean,false) and not coalesce((after_policy->>'employeeRequired')::boolean,false))) then
  raise exception 'Een bestaande rapportplicht kan niet worden verlaagd; gebruik een afzonderlijk bevoegde vrijstelling voor klantondertekening' using errcode='23514';end if;
 insert into private.work_order_policy_changes(id,tenant_id,work_order_id,actor_id,transaction_id,old_policy,new_policy,mode,employee_required,reason)
 values(mutation_id,w.tenant_id,w.id,auth.uid(),pg_current_xact_id(),w.signature_policy_snapshot,after_policy,mode,employee_required,btrim(reason));
 update public.work_orders set signature_mode=mode,employee_signature_required=employee_required,signature_policy_snapshot=after_policy,signature_required=after_policy->>'mode'='required' where id=w.id;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(w.tenant_id,auth.uid(),'work_order.signature_policy_changed','work_order',w.id,before_policy,jsonb_build_object('policy',after_policy,'reason',btrim(reason),'mutationId',mutation_id));
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_booking(target_tenant uuid, command_id uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;sl public.appointment_slots;tk public.external_action_tokens;v_hash text:=input->>'token_hash';result jsonb;receipt private.commercial_commands;v_start timestamptz:=(input->>'starts_at')::timestamptz;v_end timestamptz:=(input->>'ends_at')::timestamptz;
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_booking');

 if not private.commercial_member(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then if receipt.actor_id<>auth.uid() or receipt.command<>'booking' or receipt.payload<>input then raise exception 'Deze actiereferentie is al gebruikt' using errcode='23514';end if;return receipt.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'work_order_id')::uuid for update;
 if w.id is null or w.status<>'planned' or w.projected_start_at is not null or w.appointment_slot_id is not null then raise exception 'Kies een nog niet ingeplande opname of goedgekeurde opdracht' using errcode='23514';end if;
 if w.visit_kind='execution' and not exists(select 1 from public.quotes where id=w.quote_id and tenant_id=target_tenant and status='accepted') and length(coalesce(w.commercial_terms->>'direct_agreement',''))<10 then raise exception 'Uitvoering vereist offerteakkoord of een vastgelegde bestaande afspraak' using errcode='23514';end if;
 if coalesce((input->>'capacity')::integer,1) not between 1 and 20 then raise exception 'Kies een capaciteit tussen 1 en 20' using errcode='23514';end if;
 if v_start is null or v_end is null or v_start<=clock_timestamp() or v_end<=v_start or v_end-v_start>interval '12 hours' or v_hash!~'^[a-f0-9]{64}$' then raise exception 'Controleer het toekomstige tijdvak' using errcode='23514';end if;
 insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity) values(target_tenant,v_start,v_end,coalesce((input->>'capacity')::integer,1)) returning * into sl;
 insert into public.external_action_tokens(tenant_id,purpose,subject_id,work_order_id,booking_kind,token_hash,expires_at,recipient) values(target_tenant,'booking',coalesce(w.request_id,w.id),w.id,w.visit_kind,v_hash,least(v_start,clock_timestamp()+interval '14 days'),(select billing_email from public.customers where id=w.customer_id and tenant_id=target_tenant)) returning * into tk;
 insert into public.booking_options(tenant_id,token_id,slot_id) values(target_tenant,tk.id,sl.id);
 result:=jsonb_build_object('id',tk.id,'work_order_id',w.id);
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'booking',input,result);
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,w.request_id,w.quote_id,auth.uid(),'booking.link_created',jsonb_build_object('work_order_id',w.id,'kind',w.visit_kind,'slot_id',sl.id));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_cancel_booking(target_tenant uuid, target_order uuid, command_id uuid, reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders; receipt private.commercial_commands;
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_cancel_booking');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if length(trim(coalesce(reason,''))) not between 3 and 2000 or command_id is null then raise exception 'Vul de reden van annuleren in' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>'booking_cancel' or receipt.payload<>jsonb_build_object('order',target_order,'reason',reason) then raise exception 'Deze actiereferentie is al gebruikt' using errcode='23514';end if;return true;
 end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order for update;
 if w.id is null then raise exception 'Afspraak niet beschikbaar' using errcode='42501';end if;
 if w.status<>'planned' or w.projected_start_at is not null or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and status<>'cancelled') then raise exception 'Deze afspraak heeft al personeelsplanning. Pas die eerst aan via het planbord.' using errcode='23514';end if;
 -- Revoke every link for this unplanned visit before releasing its reservation.
 update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and purpose='booking' and work_order_id=w.id and revoked_at is null;
 if w.appointment_slot_id is not null then
  update public.appointment_slots set booked_count=greatest(0,booked_count-1),status=case when status='full' then 'available' else status end where tenant_id=target_tenant and id=w.appointment_slot_id;
  update public.requests set preferred_slot_id=null,version=version+1 where tenant_id=target_tenant and id=w.request_id and preferred_slot_id=w.appointment_slot_id;
  update public.work_orders set appointment_slot_id=null,customer_window_kind='arrival',requested_date=null,version=version+1 where id=w.id;
 end if;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,details) values(target_tenant,w.request_id,w.quote_id,auth.uid(),'booking.cancelled',reason,jsonb_build_object('work_order_id',w.id));
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'booking_cancel',jsonb_build_object('order',target_order,'reason',reason),'{"ok":true}');
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_command(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.commercial_commands;q public.quotes;n public.quotes;r public.requests;w public.work_orders;l jsonb;result jsonb:='{}'::jsonb;v_id uuid:=nullif(input->>'id','')::uuid;ev bigint:=nullif(input->>'version','')::bigint;state text;kind text;reason text:=trim(coalesce(input->>'reason',''));v_new uuid;recipient text;v_snapshot jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_command');

 if not private.commercial_member(target_tenant) or command_id is null then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 -- Same lock order as planning and visit requests, then a short tenant commercial lock.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and private.commercial_commands.id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 if command='request_save' then result:=public.commercial_save_request(target_tenant,input);
 elsif command='quote_save' then result:=public.commercial_save_quote(target_tenant,input);
 elsif command in ('publish','revise','decide','convert','quote_archive','quote_delete','quote_followup') then
  select * into q from public.quotes where tenant_id=target_tenant and quotes.id=v_id for update;
  if q.id is null then raise exception 'Offerte niet beschikbaar' using errcode='42501';end if;
  if command='convert' and q.operation_id is not null then result:=jsonb_build_object('id',q.id,'operation_id',q.operation_id);
  elsif command='publish' and q.published_at is not null and q.status='awaiting_acceptance' then result:=jsonb_build_object('id',q.id);
  else
   if ev is null or q.version<>ev then raise exception 'Deze offerte is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
   if command='publish' then
    if q.status<>'draft' or q.archived_at is not null then raise exception 'Alleen een concept kan worden aangeboden' using errcode='23514';end if;
    perform private.commercial_relations(target_tenant,q.customer_id,q.object_id,q.contact_id,q.owner_id);
    if q.object_id is null then raise exception 'Koppel eerst het definitieve werkobject' using errcode='23514';end if;
    if jsonb_array_length(q.lines)=0 or length(trim(coalesce(q.terms->>'scope','')))<3 or length(trim(coalesce(q.terms->>'discipline','')))<2 or q.expires_at is null or q.expires_at<=clock_timestamp() then raise exception 'Vul werkzaamheden, dienst, regels en een toekomstige geldigheidsdatum in' using errcode='23514';end if;
    if q.work_kind='recurring' and(length(trim(coalesce(q.terms->>'frequency','')))<2 or nullif(q.terms->>'starts_on','') is null or q.price_basis='once') then raise exception 'Terugkerend werk vereist een frequentie, startdatum en expliciete prijsbasis' using errcode='23514';end if;
    if q.terms->>'pricing_method' not in ('fixed','estimate','actual') then raise exception 'Kies een prijsafspraak' using errcode='23514';end if;
    v_snapshot:=private.commercial_snapshot(q);recipient:=v_snapshot#>>'{contact,email}';
    if recipient is null or recipient!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Vul een geldig e-mailadres van de ontvanger in' using errcode='23514';end if;
    update public.quotes set snapshot=v_snapshot,published_at=clock_timestamp(),status='awaiting_acceptance',next_action='Klantakkoord opvolgen',version=version+1 where quotes.id=q.id;
    update public.quotes set superseded_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where tenant_id=target_tenant and series_id=q.series_id and quotes.id<>q.id and status in ('awaiting_acceptance','sent','change_requested') and superseded_at is null;
    update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and purpose='quote_acceptance' and subject_id in(select x.id from public.quotes x where x.series_id=q.series_id and x.id<>q.id and x.accepted_at is null) and revoked_at is null;
    if q.request_id is not null then update public.requests set status='processed',outcome='quote',next_action='Offerte volgen',version=version+1 where requests.id=q.request_id;end if;
    kind:='quote.published';result:=jsonb_build_object('id',q.id);
   elsif command='revise' then
    select * into n from public.quotes where tenant_id=target_tenant and series_id=q.series_id order by revision desc limit 1;
    if n.status='draft' then result:=jsonb_build_object('id',n.id);
    else
     v_new:=gen_random_uuid();
     insert into public.quotes(id,tenant_id,series_id,previous_id,request_id,customer_id,object_id,contact_id,quote_number,revision,subject,work_kind,price_basis,owner_id,subtotal_cents,vat_cents,total_cents,snapshot,lines,terms,expires_at,visit_request_id)
     values(v_new,target_tenant,q.series_id,n.id,q.request_id,q.customer_id,q.object_id,q.contact_id,q.quote_number,n.revision+1,q.subject,q.work_kind,q.price_basis,coalesce(q.owner_id,auth.uid()),q.subtotal_cents,q.vat_cents,q.total_cents,'{}',q.lines,q.terms,clock_timestamp()+interval '14 days',q.visit_request_id);
     result:=jsonb_build_object('id',v_new);kind:='quote.revised';
    end if;
   elsif command='decide' then result:=private.commercial_decide(q.id,target_tenant,input,auth.uid(),input->>'channel');
   elsif command='convert' then
    if q.snapshot->>'schema' is distinct from '1' or jsonb_array_length(q.lines)=0 then raise exception 'Deze historische prijsopgave bevat geen vastgelegde uitvoeringsregels. Maak een gecontroleerde revisie of een directe opdracht op basis van het bewaarde akkoord.' using errcode='23514';end if;
    if q.status<>'accepted' or q.object_id is null or q.archived_at is not null then raise exception 'Een geaccepteerde offerte met werkobject is vereist' using errcode='23514';end if;
    if exists(select 1 from jsonb_array_elements(q.lines) line where coalesce(nullif(line->>'duration_minutes','')::integer,nullif(input#>>array['durations',line->>'id'],'')::integer,0) not between 1 and 43200) then raise exception 'Vul voor iedere regel zonder planningduur een duur in. Het geaccepteerde document blijft ongewijzigd.' using errcode='23514';end if;
    insert into public.work_orders(tenant_id,work_order_number,request_id,quote_id,customer_id,object_id,discipline,created_by,requested_date,day_instructions,commercial_terms)
    values(target_tenant,'WB-'||to_char(now(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),q.request_id,q.id,q.customer_id,q.object_id,q.terms->>'discipline',auth.uid(),nullif(q.terms->>'starts_on','')::date,left(concat_ws(E'\n',q.terms->>'scope',q.terms->>'preparation'),2000),jsonb_build_object('quote_id',q.id,'revision',q.revision,'work_kind',q.work_kind,'price_basis',q.price_basis,'frequency',q.terms->>'frequency','starts_on',q.terms->>'starts_on','ends_on',q.terms->>'ends_on','pricing_method',q.terms->>'pricing_method')) returning * into w;
    for l in select value from jsonb_array_elements(q.lines) loop
     insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by,commercial_snapshot)
     values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',coalesce((l->>'duration_minutes')::integer,(input#>>array['durations',l->>'id'])::integer),(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid(),jsonb_build_object('quote_id',q.id,'revision',q.revision,'line',l,'price_basis',q.price_basis,'accepted_at',q.accepted_at));
    end loop;
    if q.work_kind='recurring' then
     insert into public.object_records(tenant_id,object_id,kind,title,body,state,starts_at,ends_at,service,owner_user_id,details,created_by)
     values(target_tenant,q.object_id,'programme',q.subject,q.terms->>'scope','active',((q.terms->>'starts_on')::date::timestamp at time zone(select timezone from public.tenants where id=target_tenant)),case when nullif(q.terms->>'ends_on','') is not null then (((q.terms->>'ends_on')::date+1)::timestamp at time zone(select timezone from public.tenants where id=target_tenant)) end,q.terms->>'discipline',q.owner_id,jsonb_build_object('commercial_quote_id',q.id,'revision',q.revision,'frequency',q.terms->>'frequency','planning','Bezoeken worden afzonderlijk door de planner bevestigd'),auth.uid());
    end if;
    update public.quotes set operation_id=w.id,next_action='Inplannen',followup_on=null,version=version+1 where quotes.id=q.id;
    if q.request_id is not null then update public.requests set status='processed',outcome='order',next_action='Inplannen',version=version+1 where requests.id=q.request_id;end if;
    result:=jsonb_build_object('id',q.id,'operation_id',w.id);kind:='quote.converted';
   elsif command='quote_followup' then
    perform private.commercial_relations(target_tenant,q.customer_id,q.object_id,q.contact_id,(input->>'owner_id')::uuid);
    if q.status in ('rejected','expired') or q.archived_at is not null then raise exception 'Deze offerte vraagt geen actieve opvolging' using errcode='23514';end if;
    update public.quotes set owner_id=(input->>'owner_id')::uuid,next_action=input->>'next_action',followup_on=nullif(input->>'followup_on','')::date,version=version+1 where quotes.id=q.id;kind:='quote.followup';
   elsif command='quote_archive' then
    update public.quotes set archived_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where quotes.id=q.id;
    update public.external_action_tokens set revoked_at=clock_timestamp() where tenant_id=target_tenant and subject_id=q.id and revoked_at is null;kind:='quote.archived';
   elsif command='quote_delete' then
    if q.status<>'draft' or q.previous_id is not null or exists(select 1 from public.quotes where previous_id=q.id) or exists(select 1 from public.work_orders where quote_id=q.id) or exists(select 1 from public.commercial_attachments where quote_id=q.id) then raise exception 'Deze offerte heeft historie. Archiveer haar in plaats van verwijderen.' using errcode='23514';end if;
    delete from public.commercial_events where quote_id=q.id;delete from public.quotes where quotes.id=q.id;result:=jsonb_build_object('deleted',true);
   end if;
  end if;
 elsif command in ('information','request_status','request_archive','request_delete','note','request_direct','inspection') then
  select * into r from public.requests where tenant_id=target_tenant and requests.id=v_id for update;
  if r.id is null then raise exception 'Aanvraag niet beschikbaar' using errcode='42501';end if;
  if ev is null or r.version<>ev then raise exception 'Deze aanvraag is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
  if command='information' then
   if length(reason) not between 3 and 5000 or r.status not in ('new','review','waiting_info') or r.archived_at is not null then raise exception 'Vul de klantvraag in voor een actieve aanvraag' using errcode='23514';end if;
   update public.requests set status='waiting_info',next_action='Reactie klant opvolgen',followup_on=nullif(input->>'followup_on','')::date,version=version+1 where requests.id=r.id;
   insert into public.commercial_events(tenant_id,request_id,actor_id,kind,body,visibility) values(target_tenant,r.id,auth.uid(),'request.information_requested',reason,'customer');
  elsif command='request_status' then
   state:=input->>'status';
   if state not in ('review','waiting_info','rejected','withdrawn') or length(reason)<3 then raise exception 'Kies een status en leg een toelichting vast' using errcode='23514';end if;
   if r.status in ('rejected','withdrawn','processed') or r.archived_at is not null then raise exception 'Deze aanvraag is al afgehandeld' using errcode='23514';end if;
   update public.requests set status=state,next_action=case when state in ('rejected','withdrawn') then '' when state='waiting_info' then 'Reactie klant opvolgen' else 'Aanvraag beoordelen' end,followup_on=case when state in ('rejected','withdrawn') then null else nullif(input->>'followup_on','')::date end,version=version+1 where requests.id=r.id;kind:='request.'||state;
  elsif command='request_archive' then update public.requests set archived_at=clock_timestamp(),next_action='',followup_on=null,version=version+1 where requests.id=r.id;kind:='request.archived';
  elsif command='request_delete' then
   if r.status<>'new' or exists(select 1 from public.quotes where request_id=r.id) or exists(select 1 from public.work_orders where request_id=r.id) or exists(select 1 from public.external_action_tokens where subject_id=r.id) or exists(select 1 from public.commercial_attachments where request_id=r.id) or exists(select 1 from public.mail_deliveries m where m.tenant_id=target_tenant and m.render_snapshot->>'request_id'=r.id::text and (m.attempts>0 or m.status not in ('queued','suppressed'))) or exists(select 1 from public.commercial_events ev where ev.request_id=r.id and ev.kind not in ('request.received','request.updated')) then raise exception 'Deze aanvraag heeft afhankelijke registraties. Archiveer haar.' using errcode='23514';end if;
   update public.mail_deliveries set status='cancelled',last_error='Ongebruikte aanvraag verwijderd vóór verzending.' where tenant_id=target_tenant and render_snapshot->>'request_id'=r.id::text and attempts=0 and status in ('queued','suppressed');delete from public.commercial_events where request_id=r.id;delete from public.requests where requests.id=r.id;result:=jsonb_build_object('deleted',true);
  elsif command='note' then
   if length(reason) not between 2 and 10000 then raise exception 'Vul de notitie in' using errcode='23514';end if;
   update public.requests set version=version+1 where requests.id=r.id;kind:='request.note';
  elsif command in ('request_direct','inspection') then
   if r.object_id is null then raise exception 'Koppel eerst het definitieve object' using errcode='23514';end if;
   if r.archived_at is not null or r.status in ('rejected','withdrawn') then raise exception 'Deze aanvraag is niet meer actief' using errcode='23514';end if;
   select * into w from public.work_orders where tenant_id=target_tenant and request_id=r.id and visit_kind=case when command='inspection' then 'inspection' else 'execution' end and status<>'cancelled' limit 1;
   if w.id is not null then result:=jsonb_build_object('operation_id',w.id);
   else
    if command='request_direct' and length(reason)<10 then raise exception 'Leg de bestaande prijsafspraak of contractdekking vast' using errcode='23514';end if;
    insert into public.work_orders(tenant_id,work_order_number,request_id,customer_id,object_id,discipline,created_by,visit_kind,day_instructions,commercial_terms)
    values(target_tenant,'WB-'||to_char(now(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),r.id,r.customer_id,r.object_id,r.discipline,auth.uid(),case when command='inspection' then 'inspection' else 'execution' end,left(r.description,2000),jsonb_build_object('direct_agreement',reason,'request_id',r.id)) returning * into w;
    if command='request_direct' then
     if jsonb_array_length(coalesce(input->'lines','[]'))=0 then raise exception 'Selecteer de overeengekomen werkzaamheden' using errcode='23514';end if;
     for l in select value from jsonb_array_elements(private.commercial_prices(target_tenant,input->'lines')->'lines') loop
      if nullif(l->>'duration_minutes','') is null then raise exception 'Vul de duur van de werkzaamheden in' using errcode='23514';end if;
      if (l->>'discount_basis_points')::integer<>0 then raise exception 'Gebruik bij een directe prijsafspraak het overeengekomen nettotarief zonder losse korting, of stel een offerte op.' using errcode='23514';end if;
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by) values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',(l->>'duration_minutes')::integer,(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid());
     end loop;
     update public.requests set status='processed',outcome='direct_order',next_action='Inplannen',version=version+1 where requests.id=r.id;
    else update public.requests set status='review',next_action='Opname inplannen',version=version+1 where requests.id=r.id;end if;
    result:=jsonb_build_object('operation_id',w.id);kind:=case when command='inspection' then 'request.inspection' else 'request.direct_order' end;
   end if;
  end if;
 else raise exception 'Onbekende commerciële actie' using errcode='23514';end if;
 if kind is not null then insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,body,details) values(target_tenant,coalesce(r.id,q.request_id),q.id,auth.uid(),kind,reason,result);end if;
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),command,input,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_detail(target_tenant uuid, target_id uuid, source_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quotes;r public.requests;result jsonb;v_request uuid;v_series uuid;
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.read');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_detail');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if source_kind='quote' then
  select * into q from public.quotes where tenant_id=target_tenant and id=target_id;if q.id is null then raise exception 'Offerte niet beschikbaar' using errcode='42501';end if;
  result:=jsonb_build_object('record',to_jsonb(q),'preview',case when q.published_at is null and q.status='draft' then private.commercial_snapshot(q) else q.snapshot end);v_request:=q.request_id;v_series:=q.series_id;
 elsif source_kind='request' then
  select * into r from public.requests where tenant_id=target_tenant and id=target_id;if r.id is null then raise exception 'Aanvraag niet beschikbaar' using errcode='42501';end if;
  result:=jsonb_build_object('record',to_jsonb(r));v_request:=r.id;
 elsif source_kind in ('visit','proposal') then
  select jsonb_build_object('record',to_jsonb(v),'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by p.version desc),'[]') from public.object_request_proposals p where p.request_id=v.id and p.tenant_id=target_tenant)) into result
  from public.object_visit_requests v where v.tenant_id=target_tenant and(v.id=target_id and source_kind='visit' or source_kind='proposal' and v.id=(select request_id from public.object_request_proposals where tenant_id=target_tenant and id=target_id));
  if result is null then raise exception 'Bezoekverzoek niet beschikbaar' using errcode='42501';end if;
  return result;
 else raise exception 'Onbekend dossier' using errcode='23514';end if;
 return result||jsonb_build_object('quotes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.revision desc,x.created_at desc),'[]') from public.quotes x where x.tenant_id=target_tenant and(case when v_series is not null then x.series_id=v_series else x.request_id=v_request end)),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor',u.email) order by e.created_at desc),'[]') from public.commercial_events e left join auth.users u on u.id=e.actor_id where e.tenant_id=target_tenant and(e.request_id=v_request or e.quote_id in(select id from public.quotes where series_id=v_series and tenant_id=target_tenant))),
 'deliveries',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'recipient',m.recipient,'attempts',m.attempts,'error',m.last_error,'sent_at',m.sent_at,'subject',m.render_snapshot->>'subject') order by m.created_at desc),'[]') from public.mail_deliveries m where m.tenant_id=target_tenant and (m.render_snapshot->>'request_id'=v_request::text or m.render_snapshot->>'quote_id' in(select id::text from public.quotes where tenant_id=target_tenant and (series_id=v_series or request_id=v_request)))),
 'attachments',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.commercial_attachments d where d.tenant_id=target_tenant and(case when source_kind='quote' then d.quote_id=target_id else d.request_id=target_id end)),
 'operations',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'kind',w.visit_kind,'start',w.projected_start_at,'status',w.status,'bookable',w.appointment_slot_id is null,'booking_active',exists(select 1 from public.external_action_tokens where tenant_id=target_tenant and work_order_id=w.id and purpose='booking' and revoked_at is null),'terms',w.commercial_terms)),'[]') from public.work_orders w where w.tenant_id=target_tenant and(w.request_id=v_request or w.quote_id=q.id)));
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_list(target_tenant uuid, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare today date;result jsonb;v_page integer:=greatest(1,least(coalesce((filters->>'page')::integer,1),100000));v_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25)));v_tab text:=coalesce(filters->>'tab','requests');v_sort text:=coalesce(filters->>'sort','attention');
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.read');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_list');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if v_tab not in ('requests','quotes') or v_sort not in ('attention','updated','number','customer','amount','expires') then raise exception 'Ongeldige lijstoptie' using errcode='23514';end if;
 select(now() at time zone timezone)::date into today from public.tenants where id=target_tenant;
 with base as materialized(select value as x from private.commercial_rows(target_tenant) value
  where (coalesce(filters->>'customer','')='' or value->>'customer_id'=filters->>'customer') and (coalesce(filters->>'object','')='' or value->>'object_id'=filters->>'object')
  and (coalesce(filters->>'work_kind','')='' or value->>'work_kind'=filters->>'work_kind') and(coalesce(filters->>'source','')='' or value->>'source'=filters->>'source')
  and(coalesce(filters->>'owner','')='' or value->>'owner_id'=filters->>'owner') and(coalesce(filters->>'priority','')='' or value->>'priority'=filters->>'priority')
  and (coalesce(filters->>'from','')='' or (value->>'created_at')::timestamptz>=(filters->>'from')::date::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'until','')='' or (value->>'created_at')::timestamptz<((filters->>'until')::date+1)::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'archived','')='yes' or value->>'archived_at' is null)
  and (coalesce(filters->>'q','')='' or strpos(lower(concat_ws(' ',value->>'number',value->>'subject',value->>'customer',value->>'object',value#>>'{address,street}',value#>>'{address,postal_code}',value#>>'{address,city}')),lower(left(filters->>'q',200)))>0)),
 marked as(select x,(x->>'tab'='requests' and x->>'status'='new') is_new,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'followup_on')::date<=today) followup,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'expires_at')::timestamptz>now() and ((x->>'expires_at')::timestamptz at time zone(select timezone from public.tenants where id=target_tenant))::date<=today+3) expiring,
  (x->>'tab'='quotes' and x->>'status'='accepted' and x->>'operation_id' is null) convert from base),
 filtered as (select * from marked where x->>'tab'=v_tab and(coalesce(filters->>'status','')='' or x->>'status'=filters->>'status')
  and(coalesce(filters->>'operation','')='' or filters->>'operation'='none' and x->>'operation_id' is null or filters->>'operation'='unplanned' and x->>'operation_id' is not null and coalesce((x->>'planned')::boolean,false)=false or filters->>'operation'='planned' and (x->>'planned')::boolean)
  and(case coalesce(filters->>'attention','') when '' then true when 'new' then is_new when 'followup' then followup when 'expiring' then expiring when 'convert' then convert when 'overdue' then (x->>'followup_on')::date<=today else false end)),
 ordered as(select x from filtered order by
  case when v_sort='attention' then coalesce((x->>'followup_on')::date,'infinity') end asc,
  case when v_sort='number' then x->>'number' when v_sort='customer' then x->>'customer' end asc,
  case when v_sort='amount' then (x->>'subtotal_cents')::bigint end desc,
  case when v_sort='expires' then(x->>'expires_at')::timestamptz end asc nulls last,
  (x->>'updated_at')::timestamptz desc,x->>'id' asc
  limit v_size offset(v_page-1)*v_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(x) from ordered),'[]'),'total',(select count(*) from filtered),'page',v_page,'page_size',v_size,'today',today,
 'counts',jsonb_build_object('new',(select count(*) from marked where is_new),'followup',(select count(*) from marked where followup),'expiring',(select count(*) from marked where expiring),'convert',(select count(*) from marked where convert))) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_next_visit(target_tenant uuid, quote_id uuid, visit_date date, command_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quotes;w public.work_orders;original public.work_orders;l jsonb;duration integer;receipt private.commercial_commands;payload jsonb:=jsonb_build_object('quote_id',quote_id,'date',visit_date);
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_next_visit');

 if not private.commercial_member(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into receipt from private.commercial_commands where tenant_id=target_tenant and id=command_id;
 if found then if receipt.actor_id<>auth.uid() or receipt.command<>'next_visit' or receipt.payload<>payload then raise exception 'Gebruik een nieuwe actiereferentie' using errcode='23514';end if;return(receipt.result->>'id')::uuid;end if;
 select * into q from public.quotes where tenant_id=target_tenant and id=quote_id for update;
 if q.id is null or q.status<>'accepted' or q.archived_at is not null or q.work_kind<>'recurring' or q.operation_id is null or visit_date is null or visit_date<(q.terms->>'starts_on')::date or visit_date>nullif(q.terms->>'ends_on','')::date then raise exception 'Kies een bezoek binnen de geaccepteerde looptijd' using errcode='23514';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and work_orders.quote_id=q.id and requested_date=visit_date and status<>'cancelled' order by created_at limit 1;
 if w.id is null then
  select * into original from public.work_orders where tenant_id=target_tenant and id=q.operation_id;
  insert into public.work_orders(tenant_id,work_order_number,request_id,quote_id,customer_id,object_id,discipline,created_by,requested_date,day_instructions,commercial_terms)
  values(target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),q.request_id,q.id,q.customer_id,q.object_id,q.terms->>'discipline',auth.uid(),visit_date,left(concat_ws(E'\n',q.terms->>'scope',q.terms->>'preparation'),2000),original.commercial_terms) returning * into w;
  for l in select value from jsonb_array_elements(q.lines) loop
   select duration_minutes into duration from public.work_order_tasks where tenant_id=target_tenant and work_order_id=original.id and commercial_snapshot#>>'{line,id}'=l->>'id';
   insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,added_by,commercial_snapshot)
   values(target_tenant,w.id,nullif(l->>'task_revision_id','')::uuid,l->>'task_code',l->>'description',coalesce((l->>'duration_minutes')::integer,duration),(l->>'quantity')::numeric,l->>'unit',(l->>'price_cents')::bigint,(l->>'vat_basis_points')::integer,auth.uid(),jsonb_build_object('quote_id',q.id,'revision',q.revision,'line',l,'price_basis',q.price_basis,'accepted_at',q.accepted_at));
  end loop;
  insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,q.request_id,q.id,auth.uid(),'order.visit_created',jsonb_build_object('work_order_id',w.id,'date',visit_date));
 end if;
 insert into private.commercial_commands(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),'next_visit',payload,jsonb_build_object('id',w.id));return w.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_options(target_tenant uuid, query text DEFAULT ''::text, customer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.read');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_options');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 return jsonb_build_object(
 'brand',(select jsonb_build_object('name',t.name,'slug',t.slug,'primary',b.primary_color,'accent',b.accent_color,'logo_source',b.logo_path,'sender_name',b.sender_name,'sender_email',b.sender_email,'footer',b.pdf_footer,'white_label',s.white_label_enabled,'business',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(s.settings->'business','{}')) where key in ('legal_name','address','postal_code','city','country','kvk','vat_number','iban','website','phone') and jsonb_typeof(value)='string')) from public.tenants t join public.tenant_branding b on b.tenant_id=t.id join public.tenant_settings s on s.tenant_id=t.id where t.id=target_tenant),
 'customers',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from(select id,name,status,billing_email,phone,billing_address,customer_number from public.customers where tenant_id=target_tenant and(strpos(lower(name||' '||coalesce(billing_email,'')||' '||customer_number),lower(left(query,200)))>0 or id=customer) order by(id=customer) desc nulls last,name,id limit 50)c),
 'objects',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from(select id,name,customer_id,address from public.objects where tenant_id=target_tenant and customer_id=customer and dossier_status<>'archived' order by name,id)o),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.customer_contacts c where tenant_id=target_tenant and customer_id=customer),
 'owners',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email))),'[]') from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.user_id=m.user_id and p.tenant_id=m.tenant_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select r.id,r.price_cents,r.vat_basis_points,r.unit,r.duration_minutes,c.code,c.name,c.discipline from public.task_revisions r join public.task_catalog c on c.id=r.task_id and c.tenant_id=target_tenant where r.tenant_id=target_tenant and r.valid_until is null and c.active order by c.name,r.revision desc)x));
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_order_context(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;q public.quotes;r public.requests;
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.read');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_order_context');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if w.id is null then raise exception 'Opdracht niet beschikbaar' using errcode='42501';end if;
 select * into q from public.quotes where tenant_id=target_tenant and id=w.quote_id;
 select * into r from public.requests where tenant_id=target_tenant and id=w.request_id;
 return jsonb_build_object('quote_id',q.id,'quote_number',q.quote_number,'revision',q.revision,'request_id',r.id,'request_number',r.request_number,'kind',w.visit_kind,'work_kind',q.work_kind,'frequency',q.terms->>'frequency','price_basis',q.price_basis,'starts_on',q.terms->>'starts_on','ends_on',q.terms->>'ends_on');
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_save_quote(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quotes;r public.requests;prices jsonb;v_id uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);c uuid:=(input->>'customer_id')::uuid;o uuid:=nullif(input->>'object_id','')::uuid;contact uuid:=nullif(input->>'contact_id','')::uuid;own uuid:=coalesce(nullif(input->>'owner_id','')::uuid,auth.uid());req uuid:=nullif(input->>'request_id','')::uuid;v_terms jsonb:=coalesce(input->'terms','{}');
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_save_quote');

 if octet_length(input::text)>250000 or v_id is null or ev<0 then raise exception 'Controleer de invoer' using errcode='23514';end if;
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 select * into q from public.quotes where id=v_id and tenant_id=target_tenant for update;
 if found and ev=0 then return jsonb_build_object('id',q.id);end if;
 if (q.id is not null and q.version<>ev) or(q.id is null and ev<>0) then raise exception 'Deze offerte is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
 if q.id is not null and(q.status<>'draft' or q.archived_at is not null) then raise exception 'Maak een nieuwe conceptversie van deze offerte' using errcode='23514';end if;
 perform private.commercial_relations(target_tenant,c,o,contact,own);
 if req is not null then
  select * into r from public.requests where tenant_id=target_tenant and id=req;
  if r.id is not null and r.customer_id=c and r.object_id is null and o is not null and not exists(select 1 from public.quotes where request_id=r.id and status<>'draft') and not exists(select 1 from public.work_orders where request_id=r.id) then
   update public.requests set object_id=o,version=version+1 where id=r.id returning * into r;
   update public.quotes set object_id=o,version=version+1 where tenant_id=target_tenant and request_id=r.id and status='draft' and id<>v_id;
  end if;
  if r.id is null or r.customer_id<>c or r.object_id is distinct from o or r.archived_at is not null then raise exception 'Controleer de aanvraag, klant en objectkoppeling' using errcode='23514';end if;
 end if;
 if length(trim(coalesce(input->>'subject',''))) not between 2 and 180 then raise exception 'Vul een onderwerp in' using errcode='23514';end if;
 prices:=private.commercial_prices(target_tenant,coalesce(input->'lines','[]'));
 -- Whitelist public terms; caller-controlled objects never enter the snapshot.
 v_terms:=jsonb_build_object('introduction',coalesce(v_terms->>'introduction',''),'scope',coalesce(v_terms->>'scope',''),'included',coalesce(v_terms->>'included',''),'excluded',coalesce(v_terms->>'excluded',''),'preparation',coalesce(v_terms->>'preparation',''),'conditions',coalesce(v_terms->>'conditions',''),'frequency',coalesce(v_terms->>'frequency',''),'starts_on',nullif(v_terms->>'starts_on',''),'ends_on',nullif(v_terms->>'ends_on',''),'pricing_method',coalesce(v_terms->>'pricing_method','fixed'),'discipline',coalesce(v_terms->>'discipline',r.discipline,''));
 if exists(select 1 from jsonb_each_text(v_terms) where length(value)>10000) or nullif(v_terms->>'ends_on','')::date<nullif(v_terms->>'starts_on','')::date then raise exception 'Controleer de looptijd en documentteksten' using errcode='23514';end if;
 if q.id is null then
  if req is not null and exists(select 1 from public.quotes where tenant_id=target_tenant and request_id=req and archived_at is null) then raise exception 'Deze aanvraag heeft al een offerte. Open die offerte of maak een nieuwe versie.' using errcode='23514';end if;
  insert into public.quotes(id,tenant_id,series_id,request_id,customer_id,object_id,contact_id,quote_number,subject,work_kind,price_basis,owner_id,followup_on,subtotal_cents,vat_cents,total_cents,snapshot,lines,terms,expires_at)
  values(v_id,target_tenant,v_id,req,c,o,contact,'OFF-'||to_char(now(),'YYYY')||'-'||upper(substr(v_id::text,1,8)),input->>'subject',coalesce(input->>'work_kind','once'),coalesce(input->>'price_basis','once'),own,nullif(input->>'followup_on','')::date,(prices->>'subtotal_cents')::bigint,(prices->>'vat_cents')::bigint,(prices->>'total_cents')::bigint,'{}',prices->'lines',v_terms,nullif(input->>'expires_at','')::timestamptz) returning * into q;
 else
  update public.quotes set customer_id=c,object_id=o,contact_id=contact,subject=input->>'subject',work_kind=input->>'work_kind',price_basis=input->>'price_basis',owner_id=own,followup_on=nullif(input->>'followup_on','')::date,subtotal_cents=(prices->>'subtotal_cents')::bigint,vat_cents=(prices->>'vat_cents')::bigint,total_cents=(prices->>'total_cents')::bigint,lines=prices->'lines',terms=v_terms,expires_at=nullif(input->>'expires_at','')::timestamptz,version=version+1 where id=v_id returning * into q;
 end if;
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind) values(target_tenant,q.request_id,q.id,auth.uid(),'quote.draft_saved');
 return jsonb_build_object('id',q.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.commercial_save_request(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.requests;c uuid;contact uuid;o uuid;own uuid;rid uuid:=(input->>'id')::uuid;ev bigint:=coalesce((input->>'version')::bigint,0);
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.write');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_save_request');

 if octet_length(input::text)>250000 or rid is null or ev<0 then raise exception 'Controleer de invoer' using errcode='23514';end if;
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_tenant::text||rid::text,0));
 select * into r from public.requests where id=rid and tenant_id=target_tenant for update;
 if found and ev=0 then return jsonb_build_object('id',r.id,'customer_id',r.customer_id,'contact_id',r.contact_id,'version',r.version);end if;
 if (r.id is not null and r.version<>ev) or (r.id is null and ev<>0) then raise exception 'Deze aanvraag is intussen gewijzigd. Herlaad eerst.' using errcode='40001';end if;
 if r.archived_at is not null then raise exception 'Deze aanvraag is gearchiveerd' using errcode='23514';end if;
 c:=nullif(input->>'customer_id','')::uuid;o:=nullif(input->>'object_id','')::uuid;contact:=nullif(input->>'contact_id','')::uuid;own:=coalesce(nullif(input->>'owner_id','')::uuid,auth.uid());
 if c is null and ev=0 and length(trim(input#>>'{prospect,name}'))>=2 then
  if length(input#>>'{prospect,name}')>180 or length(coalesce(input#>>'{prospect,phone}',''))>40 or (length(coalesce(input#>>'{prospect,email}',''))>0 and input#>>'{prospect,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Controleer de contactgegevens van de prospect' using errcode='23514';end if;
  c:=gen_random_uuid();
  if length(trim(coalesce(input#>>'{prospect,email}','')))=0 and length(trim(coalesce(input#>>'{prospect,phone}','')))=0 then raise exception 'Vul e-mail of telefoon in voor de nieuwe prospect' using errcode='23514';end if;
  insert into public.customers(id,tenant_id,customer_number,name,billing_email,phone,status) values(c,target_tenant,'KL-'||upper(substr(c::text,1,8)),trim(input#>>'{prospect,name}'),nullif(input#>>'{prospect,email}',''),nullif(input#>>'{prospect,phone}',''),'lead');
  if length(trim(coalesce(input#>>'{prospect,contact}','')))>=2 then
   insert into public.customer_contacts(tenant_id,customer_id,full_name,email,phone,is_primary) values(target_tenant,c,input#>>'{prospect,contact}',nullif(input#>>'{prospect,email}',''),nullif(input#>>'{prospect,phone}',''),true) returning id into contact;
  end if;
 end if;
 perform private.commercial_relations(target_tenant,c,o,contact,own);
 if length(trim(coalesce(input->>'subject',''))) not between 2 and 180 or length(trim(coalesce(input->>'description',r.description,''))) not between 3 and 10000 or length(trim(coalesce(input->>'discipline',''))) not between 2 and 100 or length(trim(coalesce(input->>'next_action',''))) not between 2 and 300 then raise exception 'Vul onderwerp, omschrijving, dienst en volgende actie in' using errcode='23514';end if;
 if r.id is null then
  insert into public.requests(id,tenant_id,request_number,customer_id,object_id,contact_id,subject,description,discipline,source,priority,work_kind,owner_id,next_action,followup_on,preferences,created_by)
  values(rid,target_tenant,'AAN-'||to_char(now(),'YYYY')||'-'||upper(substr(rid::text,1,8)),c,o,contact,input->>'subject',input->>'description',input->>'discipline',coalesce(input->>'source','backoffice'),coalesce(input->>'priority','normal'),coalesce(input->>'work_kind','once'),own,input->>'next_action',nullif(input->>'followup_on','')::date,coalesce(input->'preferences','{}'),auth.uid()) returning * into r;
 else
  if exists(select 1 from public.quotes where request_id=r.id and (customer_id<>c or object_id is distinct from o) and not(status='draft' and customer_id=c and object_id is null and o is not null)) or exists(select 1 from public.work_orders where request_id=r.id and(customer_id<>c or object_id is distinct from o)) then raise exception 'Klant en object zijn al vastgelegd in een offerte of opdracht' using errcode='23514';end if;
  update public.requests set customer_id=c,object_id=o,contact_id=contact,subject=input->>'subject',discipline=input->>'discipline',priority=input->>'priority',work_kind=input->>'work_kind',owner_id=own,next_action=input->>'next_action',followup_on=nullif(input->>'followup_on','')::date,preferences=coalesce(input->'preferences','{}'),version=version+1 where id=rid returning * into r;
  update public.quotes set object_id=o,version=version+1 where tenant_id=target_tenant and request_id=r.id and status='draft' and object_id is null and o is not null;
 end if;
 insert into public.commercial_events(tenant_id,request_id,actor_id,kind) values(target_tenant,rid,auth.uid(),case when ev=0 then 'request.received' else 'request.updated' end);
 return jsonb_build_object('id',r.id,'customer_id',r.customer_id,'contact_id',r.contact_id,'version',r.version);
end $function$
;
CREATE OR REPLACE FUNCTION public.confirm_shift_interest(target_shift_id uuid, target_personnel_id uuid)
 RETURNS open_shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.open_shifts;
  result public.open_shifts;
begin
 perform private.management_assert((select tenant_id from public.open_shifts where id=target_shift_id),'backoffice.planning.write');
 perform private.management_assert((select tenant_id from public.open_shifts where id=target_shift_id),'backoffice.functions.confirm_shift_interest');

  select * into target from public.open_shifts s where s.id = target_shift_id for update;
  if not found then raise exception 'Open shift not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner role required' using errcode = '42501';
  end if;
  if target.status <> 'open' then raise exception 'Open shift is no longer open' using errcode = '23514'; end if;
  if not exists (
    select 1 from public.shift_interests i
    join public.personnel p on p.tenant_id = i.tenant_id and p.id = i.personnel_id and p.status = 'active'
    join public.personnel_functions pf on pf.tenant_id = p.tenant_id and pf.personnel_id = p.id and pf.function_id = target.function_id
    where i.tenant_id = target.tenant_id and i.open_shift_id = target.id
      and i.personnel_id = target_personnel_id and i.status = 'interested'
      and not exists (
        select 1 from unnest(target.required_certificate_codes) required_code
        where not exists (
          select 1 from public.qualifications q where q.tenant_id = target.tenant_id
            and q.personnel_id = p.id and q.code = required_code
            and (q.valid_until is null or q.valid_until >= current_date)
        )
      )
  ) then raise exception 'Personnel is not eligible or interested' using errcode = '42501'; end if;
  if exists (
    select 1 from public.work_order_assignments a
    where a.tenant_id = target.tenant_id and a.personnel_id = target_personnel_id
      and a.status not in ('completed','returned','cancelled')
      and tstzrange(a.projected_start_at, a.projected_end_at, '[)') && tstzrange(target.starts_at, target.ends_at, '[)')
  ) then raise exception 'Personnel already has an overlapping assignment' using errcode = '23514'; end if;
  perform 1 from public.work_orders w where w.tenant_id = target.tenant_id and w.id = target.work_order_id for update;
  insert into public.work_order_assignments (tenant_id, work_order_id, personnel_id, planned_start_at, planned_end_at, projected_start_at, projected_end_at)
  values (target.tenant_id, target.work_order_id, target_personnel_id, target.starts_at, target.ends_at, target.starts_at, target.ends_at)
  on conflict (tenant_id, work_order_id, personnel_id) do update
  set planned_start_at = excluded.planned_start_at, planned_end_at = excluded.planned_end_at,
      projected_start_at = excluded.projected_start_at, projected_end_at = excluded.projected_end_at;
  update public.open_shifts set status = 'assigned', selected_personnel_id = target_personnel_id where id = target.id returning * into result;
  update public.shift_interests set status = case when personnel_id = target_personnel_id then 'selected' else 'rejected' end
  where tenant_id = target.tenant_id and open_shift_id = target.id;
  update public.work_orders set projected_start_at = target.starts_at, projected_end_at = target.ends_at where id = target.work_order_id;
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target.tenant_id, auth.uid(), 'open_shift.assigned', 'open_shift', target.id, jsonb_build_object('personnel_id', target_personnel_id));
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_commercial_period_invoice(target_tenant uuid, target_quote uuid, period_start date, request_id uuid, confirmed boolean)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quotes;inv public.invoices;p public.commercial_billing_periods;l jsonb;t public.work_order_tasks;v_end date;anchor date;months integer;tz text;
begin
 perform private.management_assert(target_tenant,'backoffice.finance.write');
 perform private.management_assert(target_tenant,'backoffice.functions.create_commercial_period_invoice');

 if not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') or not private.object_session_active() then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 if confirmed is distinct from true or request_id is null then raise exception 'Bevestig de volledige overeengekomen factuurperiode' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into q from public.quotes where tenant_id=target_tenant and id=target_quote for update;
 if q.id is null or q.status<>'accepted' or q.price_basis not in ('week','month') or q.work_kind<>'recurring' then raise exception 'Selecteer een geaccepteerde periodieke prijsafspraak' using errcode='23514';end if;
 select * into p from public.commercial_billing_periods where tenant_id=target_tenant and quote_id=q.id and starts_on=period_start;
 if found then select * into inv from public.invoices where tenant_id=target_tenant and id=p.invoice_id;return inv;end if;
 anchor:=(q.terms->>'starts_on')::date;select timezone into tz from public.tenants where id=target_tenant;
 if period_start is null or period_start<anchor then raise exception 'Kies een periode vanaf de afgesproken startdatum' using errcode='23514';end if;
 if q.price_basis='week' then
  if (period_start-anchor)%7<>0 then raise exception 'De weekperioden beginnen op de afgesproken startdag' using errcode='23514';end if;v_end:=period_start+7;
 else
  months:=(extract(year from period_start)::integer-extract(year from anchor)::integer)*12+extract(month from period_start)::integer-extract(month from anchor)::integer;
  if period_start<>(anchor+make_interval(months=>months))::date then raise exception 'De maandperioden volgen de afgesproken startdatum' using errcode='23514';end if;v_end:=(anchor+make_interval(months=>months+1))::date;
 end if;
 if v_end>(clock_timestamp() at time zone tz)::date or v_end-1>nullif(q.terms->>'ends_on','')::date then raise exception 'Factureer alleen een volledig verstreken periode binnen de looptijd. Spreek voor een gedeeltelijke periode eerst een afzonderlijke prijs af.' using errcode='23514';end if;
 insert into public.invoices(tenant_id,customer_id,created_by,source_request_id) values(target_tenant,q.customer_id,auth.uid(),request_id) returning * into inv;
 insert into public.commercial_billing_periods(tenant_id,quote_id,invoice_id,starts_on,ends_before,confirmed_by) values(target_tenant,q.id,inv.id,period_start,v_end,auth.uid()) returning * into p;
 for l in select value from jsonb_array_elements(q.lines) loop
  select task.* into t from public.work_order_tasks task join public.work_orders wo on wo.tenant_id=task.tenant_id and wo.id=task.work_order_id
  where task.tenant_id=target_tenant and wo.quote_id=q.id and wo.status='invoice_ready' and task.completed_at is not null and coalesce(task.executed_quantity,task.quantity)>=(l->>'quantity')::numeric and task.commercial_snapshot#>>'{line,id}'=l->>'id' and (wo.projected_start_at at time zone tz)::date>=period_start and (wo.projected_start_at at time zone tz)::date<v_end
  order by wo.projected_start_at,task.id limit 1 for update of task;
  if t.id is null then raise exception 'Voor iedere perioderegel is gecontroleerde uitvoering in deze periode nodig. Rond eerst de rapportcontrole af.' using errcode='23514';end if;
  insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,commercial_period_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents)
  values(target_tenant,inv.id,t.work_order_id,t.id,p.id,l->>'description',(l->>'quantity')::numeric,t.unit,t.unit_price_cents,0,t.vat_basis_points,0,0);
 end loop;
 inv:=public.finalize_invoice(inv.id);
 insert into public.commercial_events(tenant_id,request_id,quote_id,actor_id,kind,details) values(target_tenant,q.request_id,q.id,auth.uid(),'invoice.period_created',jsonb_build_object('invoice_id',inv.id,'starts_on',period_start,'ends_before',v_end));
 return inv;
end $function$
;
CREATE OR REPLACE FUNCTION public.create_execution_invoice(target_tenant uuid, request_id uuid, sources jsonb)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inv public.invoices;t public.work_order_tasks;w public.work_orders;src jsonb;customer uuid; qty numeric;
begin
 perform private.management_assert(target_tenant,'backoffice.finance.write');
 perform private.management_assert(target_tenant,'backoffice.functions.create_execution_invoice');

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 if request_id is null then raise exception 'Verzoekreferentie ontbreekt' using errcode='23514';end if;
 select * into inv from public.invoices where tenant_id=target_tenant and source_request_id=request_id;
 if found then return inv;end if;
 if jsonb_typeof(sources)<>'array' or jsonb_array_length(sources) not between 1 and 500 then raise exception 'Selecteer de te factureren uitvoering' using errcode='23514';end if;
 for src in select value from jsonb_array_elements(sources) loop
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=(src->>'taskId')::uuid for update;
  select * into w from public.work_orders where tenant_id=target_tenant and id=t.work_order_id for update;
  if w.id is null or w.status<>'invoice_ready' or (customer is not null and customer<>w.customer_id) then raise exception 'Selecteer gecontroleerde werkbonnen van één klant' using errcode='23514';end if;
  if inv.id is null then customer:=w.customer_id;insert into public.invoices(tenant_id,customer_id,created_by,source_request_id) values(target_tenant,customer,auth.uid(),request_id) returning * into inv;end if;
  qty:=(src->>'quantity')::numeric;
  insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents,source_snapshot)
  values(target_tenant,inv.id,w.id,t.id,t.task_code||' · '||t.task_name,qty,t.unit,t.unit_price_cents,0,t.vat_basis_points,0,0,'{}');
 end loop;
 inv:=public.finalize_invoice(inv.id);
 -- A partial allocation leaves the reviewed remainder available, without another visit.
 update public.work_orders w1 set status='invoice_ready' where w1.tenant_id=target_tenant and w1.id in (select work_order_id from public.invoice_lines where invoice_id=inv.id)
 and exists(select 1 from public.work_order_tasks t1 where t1.tenant_id=target_tenant and t1.work_order_id=w1.id and t1.completed_at is not null and t1.unit_price_cents>0 and (not t1.is_extra_work or t1.extra_work_status='approved') and coalesce(t1.executed_quantity,t1.quantity)>(select coalesce(sum(l.quantity),0) from public.invoice_lines l where l.tenant_id=target_tenant and (l.work_order_task_id=t1.id or (l.work_order_task_id is null and l.work_order_id=t1.work_order_id and l.source_snapshot->>'work_order_task_id'=t1.id::text))));
 return inv;
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_command(target_tenant uuid, request_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.write');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_command');

 return (select private.customer_command(target_tenant,request_id,command,input));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.customer_commercial_followup(target_tenant uuid, target_customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_commercial_followup');

 if not private.customer_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Geen toegang tot de klant' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x->>'followup_on',x->>'updated_at',x->>'id') from private.commercial_rows(target_tenant) x
 where x->>'customer_id'=target_customer::text and x->>'archived_at' is null
 and ((x->>'source_kind'='request' and x->>'status' in ('new','review','waiting_info'))
 or (x->>'source_kind'='quote' and x->>'status' in ('draft','awaiting_acceptance','change_requested'))
 or (x->>'source_kind'='quote' and x->>'status'='accepted' and x->>'operation_id' is null))), '[]');
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_document_metadata(target_tenant uuid, target_document uuid, expected_version bigint, input_category text, input_visibility text, portal_object uuid, input_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.write');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_document_metadata');

 if not private.customer_manage(target_tenant) or input_category not in ('agreement','correspondence','report','photo','other') or input_visibility not in ('internal','customer') then raise exception 'Geen toegang' using errcode='42501';end if;
 update public.customer_documents set category=input_category,visibility=input_visibility,
   portal_object_id=case when input_visibility='customer' then portal_object else null end,
   archived=input_archived,metadata_version=metadata_version+1
 where tenant_id=target_tenant and id=target_document and metadata_version=expected_version;
 if not found then raise exception 'Document intussen gewijzigd of niet beschikbaar' using errcode='40001';end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_file_access(target_tenant uuid, target_id uuid, kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_file_access');

 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 if kind='document' then
  select jsonb_build_object('bucket','customer-documents','path',d.storage_path,'name',d.file_name,'mime',d.mime_type,
   'scope',jsonb_build_array(d.tenant_id::text,d.customer_id::text),'sha256',d.sha256)
  into result from public.customer_documents d where d.tenant_id=target_tenant and d.id=target_id
   and(private.customer_manage(target_tenant) or private.customer_document_access(target_tenant,d.id));
 elsif kind='invoice' then
  select jsonb_build_object('bucket','invoices','path',i.pdf_storage_path,'name',i.invoice_number||'.pdf','mime','application/pdf',
   'scope',jsonb_build_array(i.tenant_id::text,i.id::text),'sha256',i.pdf_sha256)
  into result from public.invoices i where i.tenant_id=target_tenant and i.id=target_id and i.pdf_storage_path is not null
   and((private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance')) or private.customer_invoice_access(target_tenant,i.id));
 end if;
 if result is null then raise exception 'Document niet beschikbaar' using errcode='42501';end if;return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_history(target_tenant uuid, target_customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_history');

 if not private.customer_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Geen toegang tot de klanttijdlijn' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x.at desc) from (
  select a.id,a.created_at as at,coalesce(p.full_name,u.email,'Gebruiker') as actor,a.entity_type as source,a.action
  from public.audit_events a left join auth.users u on u.id=a.actor_user_id left join public.personnel p on p.tenant_id=a.tenant_id and p.user_id=a.actor_user_id
  where a.tenant_id=target_tenant and ((a.entity_type='customers' and a.entity_id=target_customer) or (a.entity_type in ('customer_contacts','customer_documents','customer_notes') and a.after_data->>'customer_id'=target_customer::text) or (a.entity_type='customer_agreements' and private.commercial_access(target_tenant) and a.after_data->>'customer_id'=target_customer::text))
  order by a.created_at desc limit 200
 ) x),'[]');
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_list(target_tenant uuid, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb; page_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25))); page_no integer:=greatest(1,least(100000,coalesce((filters->>'page')::int,1))); sort_key text:=coalesce(filters->>'sort','name'); finance boolean:=private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance');
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_list');

 if not private.customer_manage(target_tenant) then raise exception 'Geen toegang tot klanten' using errcode='42501';end if;
 with source as (
  select c.id,c.customer_number,c.name,c.customer_type,c.status,c.version,c.owner_user_id,
  coalesce(nullif(c.visit_address->>'city',''),c.billing_address->>'city','') city,
  (select full_name from public.customer_contacts cc where cc.tenant_id=c.tenant_id and cc.customer_id=c.id and cc.active and (cc.active_from is null or cc.active_from<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) and (cc.active_until is null or cc.active_until>=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1) contact,
  (select count(*) from public.objects o where o.tenant_id=c.tenant_id and o.customer_id=c.id and o.dossier_status='active') objects,
  (select min(w.projected_start_at) from public.work_orders w where w.tenant_id=c.tenant_id and w.customer_id=c.id and w.status not in ('cancelled','completed','approved','invoiced') and w.projected_start_at>=now()) next_visit,
  (select count(*) from public.requests r where r.tenant_id=c.tenant_id and r.customer_id=c.id and r.archived_at is null and r.status in ('new','review','waiting_info')) requests,
  (select count(*) from public.customer_notes n where n.tenant_id=c.tenant_id and n.customer_id=c.id and n.state='open' and n.kind='action') actions,
  case when finance then (select count(*) from public.invoices i where i.tenant_id=c.tenant_id and i.customer_id=c.id and i.status not in ('draft','paid','void','credited') and i.total_cents>i.paid_cents) else null end financial_attention,
  c.services,c.email,c.billing_email,c.phone
  from public.customers c where c.tenant_id=target_tenant
 ), filtered as (
  select * from source s where
  (coalesce(filters->>'q','')='' or concat_ws(' ',s.name,s.customer_number,s.city,s.email,s.billing_email,s.phone,s.contact) ilike '%'||replace(replace(filters->>'q','%','\%'),'_','\_')||'%')
  and (coalesce(filters->>'status','')='' or s.status=filters->>'status')
  and (coalesce(filters->>'type','')='' or s.customer_type=filters->>'type')
  and (coalesce(filters->>'city','')='' or s.city ilike '%'||(filters->>'city')||'%')
  and (coalesce(filters->>'owner','')='' or s.owner_user_id::text=filters->>'owner')
  and (coalesce(filters->>'service','')='' or filters->>'service'=any(s.services))
  and (coalesce(filters->>'attention','')='' or (filters->>'attention'='objects' and s.objects>0) or (filters->>'attention'='requests' and s.requests>0) or (filters->>'attention'='actions' and s.actions>0) or (filters->>'attention'='finance' and s.financial_attention>0)
   or (filters->>'attention'='commercial' and exists(select 1 from public.quotes q where q.tenant_id=target_tenant and q.customer_id=s.id and q.archived_at is null and q.status='awaiting_acceptance' and q.followup_on<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date)))
 ), paged as (
 select * from filtered order by
 case when sort_key='name' then lower(name) end asc,case when sort_key='name_desc' then lower(name) end desc,
 case when sort_key='number' then customer_number end,case when sort_key='city' then city end,
 case when sort_key='status' then status end,case when sort_key='next_visit' then next_visit end,
 case when sort_key='attention' then actions+requests end desc,id limit page_size offset (page_no-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'services'-'email'-'billing_email'-'phone') from paged p),'[]'), 'total',(select count(*) from filtered),'page',page_no,'pageSize',page_size,'finance',finance) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_owners(target_tenant uuid)
 RETURNS TABLE(id uuid, label text, commercial boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_owners');

 return query select m.user_id,
  coalesce(nullif(btrim(p.full_name),''),
   nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
   nullif(btrim(concat_ws(' ',nullif(u.raw_user_meta_data->>'first_name',''),nullif(u.raw_user_meta_data->>'last_name',''))),''),
   'Naam niet vastgelegd')::text,
  m.roles&&array['tenant_admin','management','finance']::public.app_role[]
 from public.tenant_memberships m
 join auth.users u on u.id=m.user_id
 left join lateral (
  select p.full_name from public.personnel p
  where p.tenant_id=m.tenant_id and (p.user_id=m.user_id or (u.email_confirmed_at is not null and lower(p.email)=lower(u.email)))
  order by (p.user_id=m.user_id) desc nulls last,p.id limit 1
 ) p on true
 where private.customer_manage(target_tenant) and m.tenant_id=target_tenant and m.status='active'
  and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]
 order by 2,m.user_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.dispatch_work_order(target_work_order_id uuid, target_personnel_id uuid, expected_version bigint, idempotency_key text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.work_orders;
  assignment public.work_order_assignments;
  result public.work_orders;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.planning.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.dispatch_work_order');

  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0)) from public.work_orders w where w.id=target_work_order_id; select * into target from public.work_orders w where w.id = target_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Planner role required' using errcode = '42501';
  end if;
  -- module-scoped dispatch retry
  if not private.service_enabled(target.tenant_id,'planning') then
    raise exception 'De module Planning is niet ingeschakeld' using errcode='42501';
  end if;
  if expected_version is null or expected_version<1 or nullif(btrim(idempotency_key),'') is null then
    raise exception 'Versie en herhaalcode zijn verplicht' using errcode='23514';
  end if;
  if exists(select 1 from public.dispatches d left join public.work_order_assignments a
    on a.id=d.assignment_id and a.tenant_id=d.tenant_id
    where d.tenant_id=target.tenant_id and d.idempotency_key=dispatch_work_order.idempotency_key
    and (d.work_order_id is distinct from target.id or a.work_order_id is distinct from target.id
      or a.personnel_id is distinct from target_personnel_id)) then
    raise exception 'Deze herhaalcode hoort bij een andere werkbon of medewerker' using errcode='23505';
  end if;
  if exists (
    select 1 from public.dispatches d
    where d.tenant_id = target.tenant_id
      and d.idempotency_key = dispatch_work_order.idempotency_key
  ) then
    return private.staff_work_order_result(target);
  end if;
  if target.version <> expected_version then
    raise exception 'Work order was changed by another user' using errcode = '40001';
  end if;
  if target.status not in ('planned','released') then
    raise exception 'Only planned work can be dispatched' using errcode = '23514';
  end if;

  select * into assignment
  from public.work_order_assignments a
  where a.tenant_id = target.tenant_id
    and a.work_order_id = target.id
    and a.personnel_id = target_personnel_id
  for update;
  if not found then raise exception 'Personnel is not assigned to this work order' using errcode = '23503'; end if;

  if assignment.status in ('cancelled','returned','completed') then raise exception 'Deze toewijzing is niet meer actief' using errcode='23514';end if; insert into public.dispatches (tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key)
  values (target.tenant_id, target.id, assignment.id, auth.uid(), dispatch_work_order.idempotency_key)
  on conflict on constraint dispatches_tenant_id_idempotency_key_key do nothing;

  update public.work_order_assignments
  set status = 'released'
  where id = assignment.id and status = 'planned';

  update public.work_orders
  set status = 'released', attention_reason = null
  where id = target.id
  returning * into result;

  insert into public.status_events (
    tenant_id, work_order_id, assignment_id, actor_user_id,
    previous_status, new_status, idempotency_key
  ) values (
    target.tenant_id, target.id, assignment.id, auth.uid(),
    target.status, 'released', dispatch_work_order.idempotency_key
  ) on conflict on constraint status_events_tenant_id_idempotency_key_key do nothing;

  perform private.enqueue_event(
    target.tenant_id,
    'work_order.dispatched',
    'work_order',
    target.id,
    jsonb_build_object('work_order_id', target.id, 'personnel_id', target_personnel_id),
    'dispatch:' || dispatch_work_order.idempotency_key
  );
  return private.staff_work_order_result(result);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.execution_invoice_concepts(target_tenant uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.finance.read');
 perform private.management_assert(target_tenant,'backoffice.functions.execution_invoice_concepts');

 if not private.object_session_active() or not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then
  raise exception 'Financiële toegang vereist' using errcode='42501';
 end if;
 if target_order is not null and not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order) then
  raise exception 'Concept niet beschikbaar' using errcode='P0002';
 end if;
 with sources as (
  select t.*,w.customer_id,w.work_order_number,w.title,w.version order_version,w.report_version,w.updated_at,
   used.quantity allocated_quantity,coalesce(t.executed_quantity,t.quantity)-used.quantity remaining
  from public.work_order_tasks t
  join public.work_orders w on w.tenant_id=t.tenant_id and w.id=t.work_order_id
  cross join lateral (select coalesce(sum(l.quantity),0) quantity from public.invoice_lines l
   where l.tenant_id=t.tenant_id and l.work_order_id=t.work_order_id
    and coalesce(l.work_order_task_id::text,l.source_snapshot->>'work_order_task_id')=t.id::text) used
  where t.tenant_id=target_tenant and (target_order is null or w.id=target_order)
   and w.status='invoice_ready' and w.report_state='approved' and w.archive_at is null
   and t.completed_at is not null and t.unit_price_cents>0
   and (not t.is_extra_work or t.extra_work_status='approved')
   and coalesce(t.commercial_snapshot->>'price_basis','') not in ('week','month')
   and coalesce(t.executed_quantity,t.quantity)>used.quantity
   and not exists(select 1 from public.object_visit_requests r where r.tenant_id=t.tenant_id and r.work_order_task_id=t.id and r.needs_review)
   and not exists(select 1 from public.object_request_proposals p join public.object_visit_requests r on r.tenant_id=p.tenant_id and r.id=p.request_id
    where r.tenant_id=t.tenant_id and r.work_order_task_id=t.id and p.accepted_at is not null
     and p.version=(select max(p2.version) from public.object_request_proposals p2 where p2.tenant_id=p.tenant_id and p2.request_id=p.request_id and p2.accepted_at is not null)
     and (t.quantity<>p.quantity or t.unit_price_cents<>p.price_cents or t.task_revision_id is distinct from p.task_revision_id))
   and not exists(select 1 from public.invoice_lines l where l.tenant_id=t.tenant_id and l.work_order_id=t.work_order_id and l.work_order_task_id is null
    and not exists(select 1 from public.work_order_tasks old where old.tenant_id=l.tenant_id and old.work_order_id=l.work_order_id and old.id::text=l.source_snapshot->>'work_order_task_id'))
 ), amounts as (
  select sources.*,case when commercial_snapshot ? 'quote_id' then
   round((allocated_quantity+remaining)*(commercial_snapshot#>>'{line,net_cents}')::numeric/(commercial_snapshot#>>'{line,quantity}')::numeric)
    -round(allocated_quantity*(commercial_snapshot#>>'{line,net_cents}')::numeric/(commercial_snapshot#>>'{line,quantity}')::numeric)
   else round(remaining*unit_price_cents) end subtotal
  from sources
 ), rate_groups as (
  select amounts.*,coalesce(sum(subtotal) over(partition by work_order_id,vat_basis_points order by created_at,id rows between unbounded preceding and 1 preceding),0) prior_subtotal
  from amounts
 ), priced as (
  select rate_groups.*,round((prior_subtotal+subtotal)*vat_basis_points/10000.0)-round(prior_subtotal*vat_basis_points/10000.0) vat
  from rate_groups
 ), candidates as (
  select work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at,
   sum(subtotal)::bigint subtotal,sum(vat)::bigint vat,sum(subtotal+vat)::bigint total,
   jsonb_agg(jsonb_build_object('taskId',id,'description',case when commercial_snapshot ? 'quote_id' then task_name
     ||case when coalesce((commercial_snapshot#>>'{line,discount_basis_points}')::integer,0)>0 then ' (incl. '||((commercial_snapshot#>>'{line,discount_basis_points}')::numeric/100)::text||'% korting)' else '' end
     else task_code||' · '||task_name end,
    'quantity',remaining,'unit',unit,'unitPriceCents',unit_price_cents,'vatBasisPoints',vat_basis_points,
    'subtotalCents',subtotal,'vatCents',vat,'totalCents',subtotal+vat) order by created_at,id) lines
  from priced group by work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',s.work_order_id,'customerId',s.customer_id,'number',s.work_order_number,'title',s.title,
   'version',s.order_version,'reportVersion',s.report_version,'updatedAt',s.updated_at,'issuedOn',(clock_timestamp() at time zone tenant.timezone)::date,
   'dueOn',(clock_timestamp() at time zone tenant.timezone)::date+coalesce((select payment_terms_days from public.tenant_settings where tenant_id=target_tenant),14),
   'customer',jsonb_build_object('name',customer.name,'legalName',customer.legal_name,'companyNumber',customer.company_number,'vatNumber',customer.vat_number,'email',coalesce(customer.billing_email,customer.email),'phone',customer.phone,'billingAddress',customer.billing_address,'billingPreferences',customer.billing_preferences),
   'branding',jsonb_build_object('tenant_name',tenant.name,'primary_color',brand.primary_color,'accent_color',brand.accent_color,
    'logo_path',brand.logo_path,'sender_email',brand.sender_email,'pdf_footer',brand.pdf_footer),
   'lines',s.lines,'subtotalCents',s.subtotal,'vatCents',s.vat,'totalCents',s.total) order by s.updated_at desc,s.work_order_id),'[]') into result
 from candidates s join public.tenants tenant on tenant.id=target_tenant and tenant.status='active'
 join public.customers customer on customer.tenant_id=target_tenant and customer.id=s.customer_id
 left join public.tenant_branding brand on brand.tenant_id=target_tenant;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.extend_object_access(target_tenant uuid, target_assignment uuid, until_time timestamp with time zone, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.work_order_assignments;w public.work_orders;
begin
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.extend_object_access');

 if not private.object_manage(target_tenant) or length(btrim(reason))<5 or until_time<=clock_timestamp() or until_time>clock_timestamp()+interval '4 hours' then raise exception 'Kies een eindtijd binnen vier uur en leg de reden vast' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into a from public.work_order_assignments where tenant_id=target_tenant and id=target_assignment and status in ('released','seen','travelling','in_progress');
 select * into w from public.work_orders where tenant_id=target_tenant and id=a.work_order_id and status in ('released','seen','travelling','in_progress');
 if w.id is null then raise exception 'Geen actieve gepubliceerde toewijzing' using errcode='23514';end if;
 insert into private.object_access_extensions values(a.id,until_time,reason,auth.uid(),1,clock_timestamp()) on conflict(assignment_id) do update set ends_at=excluded.ends_at,reason=excluded.reason,decided_by=excluded.decided_by,revision=private.object_access_extensions.revision+1,created_at=clock_timestamp();
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'object.access_extended','assignment',a.id,jsonb_build_object('endsAt',until_time,'reason',reason,'objectId',w.object_id));
end $function$
;
CREATE OR REPLACE FUNCTION public.finalize_invoice(target_invoice_id uuid)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid;
begin
 perform private.management_assert((select tenant_id from public.invoices where id=target_invoice_id),'backoffice.finance.write');
 perform private.management_assert((select tenant_id from public.invoices where id=target_invoice_id),'backoffice.functions.finalize_invoice');

 select tenant_id into t from public.invoices where id=target_invoice_id;
 if not private.commercial_access(t) or not private.service_enabled(t,'finance') then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 perform 1 from public.invoices where id=target_invoice_id for update;
 return private.finalize_invoice_snapshot(target_invoice_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.get_planboard(target_tenant uuid, target_day date, list_view text DEFAULT 'unassigned'::text, search_text text DEFAULT ''::text, status_filter text DEFAULT ''::text, page_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tz text; ds timestamptz; de timestamptz; orders jsonb; board jsonb; people jsonb; availability_data jsonb; total integer; last_change jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.planning.read');
 perform private.management_assert(target_tenant,'backoffice.functions.get_planboard');

 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 perform private.refresh_live_planning(target_tenant);
 if target_day is null or not isfinite(target_day) or list_view not in ('unassigned','planned','running','completed','cancelled','all') or page_number<1 or page_number>100000 or length(search_text)>200 then raise exception 'Ongeldige planbordfilters' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 ds:=target_day::timestamp at time zone tz;de:=(target_day+1)::timestamp at time zone tz;
 with context_orders as materialized(
  select private.planboard_row(w.id) as row from public.work_orders w left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id
  where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and ((w.projected_start_at<de and w.projected_end_at>ds)
   or(w.projected_start_at is null and w.status='planned' and coalesce(w.requested_date,(s.starts_at at time zone tz)::date,target_day)=target_day))
 ), filtered as materialized(select row from context_orders where (list_view='all' or row->>'category'=list_view) and (status_filter='' or row->>'status'=status_filter)
  and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(concat_ws(' ',row->>'number',row->>'customer',row->>'object')))>0)),
 paged as(select row from filtered order by case when list_view='unassigned' then case row->>'priority' when 'urgent' then 0 when 'high' then 1 else 2 end end,
 case when list_view='unassigned' then coalesce(row->>'requestedDate',row->>'windowStart',row->>'start') else row->>'start' end nulls last,row->>'id' limit 50 offset (page_number-1)*50)
 select (select count(*) from filtered),coalesce((select jsonb_agg(row) from paged),'[]') into total,orders;
 select coalesce(jsonb_agg(private.planboard_row(w.id) order by w.projected_start_at,w.id),'[]') into board from public.work_orders w where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and (w.projected_start_at<de and w.projected_end_at>ds or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'number',p.employee_number,'status',p.status) order by p.full_name,p.id),'[]') into people from public.personnel p where p.tenant_id=target_tenant and (p.status='active' or exists(select 1 from public.work_order_assignments a where a.tenant_id=p.tenant_id and a.personnel_id=p.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.starts_at,'end',a.ends_at,'kind',case when a.kind='available' then 'available' else 'unavailable' end)),'[]') into availability_data from public.availability a where a.tenant_id=target_tenant and a.starts_at<de and a.ends_at>ds;
 select jsonb_build_object('id',c.id,'orderId',c.work_order_id,'version',(c.after_data->>'version')::bigint) into last_change from public.planning_changes c join public.work_orders w on w.tenant_id=c.tenant_id and w.id=c.work_order_id
 where c.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and c.actor_user_id=auth.uid() and c.undone_by is null and w.version=(c.after_data->>'version')::bigint and w.status in ('planned','released','seen','travelling') and w.actual_start_at is null
 and not exists(select 1 from public.planning_changes newer where newer.tenant_id=c.tenant_id and newer.actor_user_id=c.actor_user_id and newer.created_at>c.created_at) order by c.created_at desc limit 1;
 return jsonb_build_object('day',target_day,'timezone',tz,'board',board,'orders',orders,'total',total,'page',page_number,'people',people,'availability',availability_data,'undo',last_change);
end $function$
;
CREATE OR REPLACE FUNCTION public.get_planboard_order(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.planning.read');
 perform private.management_assert(target_tenant,'backoffice.functions.get_planboard_order');

 if not private.planning_access(target_tenant) or not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order and archive_at is null and planning_state<>'draft') then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 perform private.refresh_live_planning(target_tenant);
 return private.planboard_row(target_order);
end $function$
;
CREATE OR REPLACE FUNCTION public.manage_work_order(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;a public.work_order_assignments;r public.work_order_report_versions;prior private.work_order_commands;
 mid uuid:=(input->>'mutationId')::uuid;command text:=input->>'action';target text:=input->>'status';reason text:=btrim(coalesce(input->>'reason',''));hash text;result jsonb;at timestamptz:=clock_timestamp();next_status public.work_order_status;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.manage_work_order');

 if not private.object_manage(target_tenant) or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Beheerrecht vereist' using errcode='42501';end if;
 if mid is null or command not in('remove_assignment','status') or length(reason) not between 3 and 1000 then raise exception 'Kies een wijziging en leg een reden vast' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'manage:'||command,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null or w.status in('approved','invoice_ready','invoiced','cancelled') then raise exception 'Deze werkbon is alleen leesbaar' using errcode='23514';end if;
 if command='remove_assignment' then
  if w.report_state not in('draft','correction') then raise exception 'Vraag eerst rapportcorrectie; de vastgelegde oplevering blijft bewaard' using errcode='23514';end if;
  select * into a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'assignmentId')::uuid for update;
  if a.id is null then raise exception 'Inzet niet beschikbaar' using errcode='42501';end if;
  if a.status in('completed','returned','cancelled') then raise exception 'Afgesloten inzet blijft in de historie bewaard' using errcode='23514';end if;
  update public.time_entries set ends_at=greatest(at,starts_at+interval '1 microsecond') where tenant_id=target_tenant and assignment_id=a.id and ends_at is null;
  update public.work_order_assignments set status='returned',actual_end_at=case when actual_start_at is not null then greatest(at,actual_start_at+interval '1 microsecond') else null end,paused_at=null,return_reason_code='management_removed',return_note=reason where id=a.id;
  update public.dispatches set revoked_at=at where tenant_id=target_tenant and assignment_id=a.id and revoked_at is null;
  -- Preserve completed task attribution. Open tasks can be picked up by the remaining team.
  update public.work_order_tasks set assigned_personnel_id=null where tenant_id=target_tenant and work_order_id=w.id and assigned_personnel_id=a.personnel_id and completed_at is null;
  next_status:=case when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='in_progress') then 'in_progress'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='travelling') then 'travelling'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='seen') then 'seen'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status in('planned','released')) then case when w.published_at is null then 'planned'::public.work_order_status else 'released'::public.work_order_status end
   else 'returned'::public.work_order_status end;
  update public.work_orders set status=next_status,actual_end_at=case when next_status='returned' and actual_start_at is not null then at else null end,lead_personnel_id=case when lead_personnel_id=a.personnel_id then null else lead_personnel_id end where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,a.id,auth.uid(),a.status::public.work_order_status,'returned','planning_issue',reason,mid::text);
 elsif target in('correction_required','approved') then
  select * into r from public.work_order_report_versions where tenant_id=target_tenant and work_order_id=w.id and version=w.report_version;
  if r.id is null then raise exception 'Een actuele rapportversie is vereist voor rapportcontrole' using errcode='23514';end if;
  perform public.review_work_order_report(w.id,r.id,case when target='approved' then 'approved' else 'returned' end,reason);
 elsif target='planned' then
  if w.status<>'returned' or w.actual_start_at is not null or exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.actual_start_at is not null) then raise exception 'Alleen een teruggemelde, niet gestarte bon kan opnieuw worden ingepland. Maak voor resterend werk een opvolgbon.' using errcode='23514';end if;
  update public.work_orders set status='planned',planning_state='unassigned',published_at=null,attention_reason=null where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,auth.uid(),w.status,'planned','management_replan',reason,mid::text);
 elsif target in('released','cancelled') then
  perform public.mutate_work_order(target_tenant,jsonb_build_object('orderId',w.id,'version',w.version,'mutationId',gen_random_uuid(),'action',case when target='released' then 'publish' else 'cancel' end,'reason',reason));
 elsif target='returned' then
  if w.projected_start_at is null or w.projected_end_at is null then raise exception 'Deze bon is nog niet ingepland. Deel de bon eerst in of kies annuleren.' using errcode='23514';end if;
  if w.report_state not in('draft','correction') then raise exception 'Een ingediend rapport blijft bewaard; gebruik rapportcorrectie' using errcode='23514';end if;
  update public.time_entries e set ends_at=greatest(at,e.starts_at+interval '1 microsecond') where e.tenant_id=target_tenant and e.ends_at is null and exists(select 1 from public.work_order_assignments x where x.tenant_id=e.tenant_id and x.id=e.assignment_id and x.work_order_id=w.id);
  update public.work_order_assignments set status='returned',actual_end_at=case when actual_start_at is not null then greatest(at,actual_start_at+interval '1 microsecond') else null end,paused_at=null,return_reason_code='management_returned',return_note=reason where tenant_id=target_tenant and work_order_id=w.id and status not in('completed','returned','cancelled');
  update public.dispatches set revoked_at=at where tenant_id=target_tenant and work_order_id=w.id and revoked_at is null;
  update public.work_orders set status='returned',actual_end_at=case when actual_start_at is not null then at else null end where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,auth.uid(),w.status,'returned','management_returned',reason,mid::text);
 else raise exception 'Deze statuswijziging is niet toegestaan. Start en afronding volgen de echte uitvoering en rapportcontrole.' using errcode='23514';end if;
 perform private.refresh_live_planning(target_tenant);
 select * into w from public.work_orders where id=w.id;
 result:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'manage:'||command,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.management_'||command,'work_order',w.id,jsonb_build_object('status',w.status,'assignmentId',a.id,'reason',reason,'version',w.version));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.mutate_work_order(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;action text:=input->>'action';r jsonb;a record;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.mutate_work_order');

 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or action is null or action not in ('publish','archive','cancel','delete') then raise exception 'Ongeldige werkbonactie' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if not found then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from (input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null and action<>'archive' then raise exception 'Een gearchiveerde werkbon is alleen leesbaar' using errcode='23514';end if;
 if action='publish' then
  if w.status not in ('planned','released') or w.projected_start_at is null or not exists(select 1 from public.work_order_tasks where work_order_id=w.id) or not exists(select 1 from public.work_order_assignments where work_order_id=w.id and status not in ('cancelled','returned')) then raise exception 'Kies taken, een datum en minimaal één medewerker vóór publicatie' using errcode='23514';end if;
  update public.work_orders set published_at=coalesce(published_at,clock_timestamp()),planning_state='final' where id=w.id;
  for a in select * from public.work_order_assignments where work_order_id=w.id and status='planned' loop
    select * into w from public.work_orders where id=w.id;
    perform public.dispatch_work_order(w.id,a.personnel_id,w.version,'publish:'||mid||':'||a.id);
  end loop;
 elsif action='archive' then update public.work_orders set archive_at=clock_timestamp() where id=w.id;
 elsif action='cancel' then
  if length(btrim(coalesce(input->>'reason','')))<3 then raise exception 'Vul de reden van annulering in' using errcode='23514';end if;
  if w.actual_start_at is not null or w.status in ('approved','invoice_ready','invoiced','under_review','completed') then raise exception 'Een uitgevoerde of beoordeelde bon kan niet worden geannuleerd' using errcode='23514';end if;
  update public.dispatches set revoked_at=clock_timestamp() where work_order_id=w.id and revoked_at is null;
  update public.work_order_assignments set status='cancelled' where work_order_id=w.id and status not in ('completed','returned','cancelled');
  update public.work_orders set status='cancelled',attention_reason=btrim(input->>'reason') where id=w.id;
 elsif action='delete' then
  if not (private.work_order_row(w.id,false)->>'canDelete')::boolean or exists(select 1 from public.invoice_lines where work_order_id=w.id) or exists(select 1 from public.attachments where work_order_id=w.id) then raise exception 'Alleen een ongebruikt concept kan worden verwijderd; archiveer deze bon' using errcode='23514';end if;
  delete from public.work_orders where id=w.id;
 end if;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',coalesce((select version from public.work_orders where id=w.id),w.version));
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),action,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||action,'work_order',w.id,jsonb_build_object('reason',input->>'reason'));
 return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.object_agreement_options(target_tenant uuid, target_object uuid)
 RETURNS TABLE(id uuid, title text, version bigint, task_revision_id uuid, scope text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_agreement_options');

 return query select l.id,a.title,a.version,l.task_revision_id,l.scope from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id
 where l.tenant_id=target_tenant and l.object_id=target_object and private.object_manage(target_tenant) and a.state='active' and l.price_basis='visit' and not l.extra_work
 and not exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.object_customer_accounts(target_tenant uuid, target_object uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_customer_accounts');

 return query select u.id,u.email::text from public.object_customer_bindings b join auth.users u on u.id=b.user_id where b.tenant_id=target_tenant and b.object_id=target_object and private.object_manage(target_tenant) and private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.object_dossier_owners(target_tenant uuid)
 RETURNS TABLE(id uuid, label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_dossier_owners');

 return query select m.user_id,coalesce(p.full_name,u.email,'Beheerder') from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
 where private.object_manage(target_tenant) and m.tenant_id=target_tenant and m.status='active' and m.roles && array['tenant_admin','management','planner']::public.app_role[];
end;
$function$
;
CREATE OR REPLACE FUNCTION public.personnel_availability(target_tenant uuid)
 RETURNS TABLE(id uuid, tenant_id uuid, personnel_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, kind text, note text, approved_at timestamp with time zone, created_at timestamp with time zone, dossier_source_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_availability');

 return query select a.id,a.tenant_id,a.personnel_id,a.starts_at,a.ends_at,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true)
     then a.kind when a.kind='available' then 'available' else 'unavailable' end,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true) then a.note end,
   a.approved_at,a.created_at,
   case when private.can_access_personnel(a.tenant_id,a.personnel_id,true) then a.dossier_source_id end
 from public.availability a
 where a.tenant_id=target_tenant and (select auth.uid()) is not null
   and private.object_session_active() and private.service_enabled(target_tenant,'personeel')
   and private.can_access_personnel(a.tenant_id,a.personnel_id,false)
 order by a.starts_at,a.id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.personnel_document_file(target_tenant uuid, target_document uuid)
 RETURNS TABLE(id uuid, tenant_id uuid, personnel_id uuid, storage_path text, file_name text, mime_type text, sha256 text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document and d.personnel_id=private.current_personnel_id(target_tenant) and d.visible_to_employee and not d.dossier_managed and private.has_role(target_tenant,array['staff']::public.app_role[])) then
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_document_file');
 end if;

 return query select d.id,d.tenant_id,d.personnel_id,d.storage_path,d.file_name,d.mime_type,d.sha256
 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document
 and private.can_read_personnel_document(target_tenant,target_document);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.personnel_dossier_owners(target_tenant uuid)
 RETURNS TABLE(id uuid, label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_dossier_owners');

 if not private.dossier_access(target_tenant) then raise exception 'Access denied' using errcode='42501';end if;
 return query select m.user_id,coalesce(p.full_name,u.email,'Bevoegde beheerder') from public.tenant_memberships m
 join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
 where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[] order by coalesce(p.full_name,u.email);
end $function$
;
CREATE OR REPLACE FUNCTION public.personnel_dossier_staff_projection(target_tenant uuid, target_personnel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  projection jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_dossier_staff_projection');

  if target_tenant is null
    or target_personnel is null
    or not private.dossier_access(target_tenant)
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Dossiertoegang vereist' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'availability_self_service_enabled', person.availability_self_service_enabled,
    'version', person.version,
    'account_status', membership.status
  )
  into projection
  from public.personnel person
  left join public.tenant_memberships membership
    on membership.tenant_id = person.tenant_id
   and membership.user_id = person.user_id
  where person.tenant_id = target_tenant
    and person.id = target_personnel;

  if projection is null then
    raise exception 'Personeelslid niet beschikbaar' using errcode = '42501';
  end if;
  return projection;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.personnel_dossier_summary(target_tenant uuid)
 RETURNS TABLE(personnel_id uuid, employment_status text, function_id uuid, team text, ends_on date, open_actions bigint, certificate_attention boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_dossier_summary');

 if not private.dossier_access(target_tenant) then return;end if;
 return query select p.id,coalesce(profile.dossier_data->>'employmentStatus',case when p.status='former' then 'former' when p.status='invited' then 'preparation' else 'active' end),c.function_id,coalesce(c.dossier_data->>'team',''),c.ends_on,
  (select count(*) from public.personnel_dossier_items i where i.tenant_id=target_tenant and i.personnel_id=p.id and i.kind in('task','checklist') and i.dossier_status<>'completed'),
  exists(select 1 from public.certificates cert where cert.tenant_id=target_tenant and cert.personnel_id=p.id and cert.dossier_managed and(cert.dossier_status in('unverified','review','revoked','rejected') or cert.expires_on<=((now() at time zone 'Europe/Amsterdam')::date+30)))
   or exists(select 1 from public.function_catalog f cross join lateral unnest(f.required_certificate_codes) code where f.tenant_id=target_tenant
    and(f.id=c.function_id or exists(select 1 from public.personnel_functions pf where pf.tenant_id=target_tenant and pf.personnel_id=p.id and pf.function_id=f.id))
    and not private.qualified_for_period(target_tenant,p.id,code,now(),now()+interval '1 microsecond'))
   or exists(select 1 from public.qualification_requirements q where q.tenant_id=target_tenant and q.active and q.scope='function'
    and(q.subject_id=c.function_id or exists(select 1 from public.personnel_functions pf where pf.tenant_id=target_tenant and pf.personnel_id=p.id and pf.function_id=q.subject_id))
    and not private.qualified_for_period(target_tenant,p.id,q.code,now(),now()+interval '1 microsecond'))
 from public.personnel p left join public.personnel_dossier_items profile on profile.tenant_id=target_tenant and profile.personnel_id=p.id and profile.kind='profile'
 left join lateral(select pc.* from public.personnel_contracts pc where pc.tenant_id=target_tenant and pc.personnel_id=p.id and pc.active and pc.starts_on<=(now() at time zone 'Europe/Amsterdam')::date and(pc.ends_on is null or pc.ends_on>=(now() at time zone 'Europe/Amsterdam')::date) order by pc.starts_on desc limit 1)c on true where p.tenant_id=target_tenant;
end $function$
;
CREATE OR REPLACE FUNCTION public.personnel_mobility(target_tenant uuid, target_personnel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_mobility');

 if not private.object_session_active() or private.can_access_personnel(target_tenant,target_personnel,true) is not true then raise exception 'Geen toegang' using errcode='42501';end if;
 return (select jsonb_build_object('id',id,'version',version,'standard_vehicle',standard_vehicle,'departure_kind',departure_kind,'departure_depot_id',departure_depot_id,'return_to_departure',return_to_departure,'home_address',home_address,'alternate_departure_address',alternate_departure_address) from public.personnel where tenant_id=target_tenant and id=target_personnel);
end$function$
;
CREATE OR REPLACE FUNCTION public.personnel_qualification_gaps(target_tenant uuid)
 RETURNS TABLE(assignment_id uuid, personnel_id uuid, code text, hard_requirement boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.read');
 perform private.management_assert(target_tenant,'backoffice.functions.personnel_qualification_gaps');

 if not private.has_role(target_tenant,array['tenant_admin','management','hr','planner']::public.app_role[]) then raise exception 'Access denied' using errcode='42501';end if;
 return query select a.id,a.personnel_id,r.code,r.hard_requirement from public.work_order_assignments a
 cross join lateral private.assignment_requirements(a.tenant_id,a.personnel_id,a.work_order_id,a.projected_start_at,a.projected_end_at) r
 where a.tenant_id=target_tenant and a.projected_end_at>now() and a.status not in ('completed','returned','cancelled')
 and not private.qualified_for_period(a.tenant_id,a.personnel_id,r.code,a.projected_start_at,a.projected_end_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.prepare_work_order_signature(target_work_order_id uuid, target_report_id uuid, expected_hash text, signer_name text, signer_capacity text, signature_kind text, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work_order public.work_orders;
  report public.work_order_report_versions;
  intent private.work_order_signature_intents;
  session_id uuid;
begin
 if not private.work_order_execution_actor((select tenant_id from public.work_orders where id=target_work_order_id),target_work_order_id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.work_orders.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.prepare_work_order_signature');
 end if;

  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = target_work_order_id;
  session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if not private.work_order_execution_actor(
    work_order.tenant_id,
    work_order.id,
    auth.uid(),
    session_id
  ) then
    raise exception 'Vastleggen vereist personeelsuitvoering en actuele toewijzing'
      using errcode = '42501';
  end if;
  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = work_order.id
  for update;
  select candidate.* into report
  from public.work_order_report_versions candidate
  where candidate.tenant_id = work_order.tenant_id
    and candidate.id = target_report_id
    and candidate.work_order_id = work_order.id;
  if report.id is null
    or report.version <> work_order.report_version
    or report.content_hash <> expected_hash
    or report.state not in ('waiting_signature','review')
  then
    raise exception 'Bekijk eerst de actuele rapportversie opnieuw' using errcode = '40001';
  end if;
  if signature_kind not in ('customer','employee')
    or (signature_kind = 'customer' and report.signature_policy ->> 'mode' = 'none')
    or length(btrim(signer_name)) not between 2 and 120
    or length(btrim(signer_capacity)) not between 2 and 120
  then
    raise exception 'Vul naam en hoedanigheid in' using errcode = '23514';
  end if;
  if not private.is_delivery_owner(work_order.tenant_id,work_order.id,auth.uid()) then raise exception 'Alleen de opleververantwoordelijke tekent dit rapport' using errcode='42501';end if;
  if signature_kind = 'customer' then
    perform private.customer_signature_snapshot(report.snapshot);
    if encode(extensions.digest(report.snapshot::text, 'sha256'), 'hex') <> report.content_hash then
      raise exception 'De rapportinhoud en het inhoudskenmerk komen niet overeen'
        using errcode = '40001';
    end if;
  end if;
  select saved.* into intent
  from private.work_order_signature_intents saved
  where saved.id = idempotency_key;
  if found then
    if (
      intent.actor_id,
      intent.session_id,
      intent.report_id,
      intent.content_hash,
      intent.signer_name,
      intent.signer_capacity,
      intent.signature_kind
    ) is distinct from (
      auth.uid(),
      session_id,
      report.id,
      expected_hash,
      btrim(signer_name),
      btrim(signer_capacity),
      signature_kind
    ) then
      raise exception 'Ongeldige herhaalsleutel' using errcode = '23514';
    end if;
  else
    if report.state <> 'waiting_signature'
      or work_order.status in ('completed','approved','invoice_ready','invoiced','cancelled') then
      raise exception 'Deze rapportversie is al ingediend. Nieuwe ondertekening is niet mogelijk.' using errcode='23514';
    end if;
    if signature_kind = 'customer' then
    if exists (
      select 1 from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    ) then
      raise exception 'De klantondertekening is al vastgelegd' using errcode = '23514';
    end if;
    end if;
    insert into private.work_order_signature_intents (
      id, tenant_id, work_order_id, report_id, actor_id, session_id,
      content_hash, signer_name, signer_capacity, signature_kind, storage_path
    ) values (
      idempotency_key, work_order.tenant_id, work_order.id, report.id,
      auth.uid(), session_id, expected_hash, btrim(signer_name),
      btrim(signer_capacity), signature_kind,
      work_order.tenant_id || '/' || work_order.id || '/' || idempotency_key || '.png'
    ) returning * into intent;
  end if;
  return jsonb_build_object(
    'id', intent.id,
    'path', intent.storage_path,
    'consumed', intent.consumed_at is not null
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.publish_announcement(target_announcement_id uuid)
 RETURNS announcements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.announcements;
begin
 perform private.management_assert((select tenant_id from public.announcements where id=target_announcement_id),'backoffice.news.write');
 perform private.management_assert((select tenant_id from public.announcements where id=target_announcement_id),'backoffice.functions.publish_announcement');

  select * into target from public.announcements a where a.id = target_announcement_id for update;
  if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  if not private.has_role(target.tenant_id, array['tenant_admin','management']::public.app_role[]) then
    raise exception 'Management role required' using errcode = '42501';
  end if;
  if target.withdrawn_at is not null then raise exception 'A withdrawn announcement cannot be published' using errcode = '23514'; end if;
  update public.announcements
  set published_at = coalesce(publish_at, clock_timestamp())
  where id = target.id returning * into target;
  perform private.enqueue_event(
    target.tenant_id, 'announcement.published', 'announcement', target.id,
    jsonb_build_object('announcement_id', target.id, 'send_push', target.send_push, 'audience_roles', target.audience_roles),
    'announcement:' || target.id::text
  );
  return target;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_customer_agreement(target_tenant uuid, target_customer uuid, input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=(input->>'id')::uuid; prev public.customer_agreements; ln jsonb; ver bigint:=1; doc uuid:=nullif(input->>'documentId','')::uuid;
begin
 perform private.management_assert(target_tenant,'backoffice.customers.write');
 perform private.management_assert(target_tenant,'backoffice.functions.record_customer_agreement');

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.commercial_access(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status='active') then raise exception 'Geen toegang tot deze klantafspraak' using errcode='42501';end if;
 if exists(select 1 from public.customer_agreements where id=a) then
  if not exists(select 1 from public.customer_agreements where id=a and tenant_id=target_tenant and customer_id=target_customer and created_by=auth.uid()) then raise exception 'Ongeldige afspraak' using errcode='42501';end if;return a;
 end if;
 if doc is null or not exists(select 1 from public.customer_documents where tenant_id=target_tenant and customer_id=target_customer and id=doc) then raise exception 'Koppel het akkoordbewijs uit dit klantdossier' using errcode='23514';end if;
 if nullif(input->>'previousId','') is not null then
  select * into prev from public.customer_agreements where tenant_id=target_tenant and customer_id=target_customer and id=(input->>'previousId')::uuid for update;
  if prev.id is null or exists(select 1 from public.customer_agreements where previous_id=prev.id) then raise exception 'De overeenkomst is gewijzigd. Herlaad de nieuwste versie.' using errcode='40001';end if;
  ver:=prev.version+1;
 end if;
 if jsonb_typeof(input->'lines')<>'array' or jsonb_array_length(input->'lines') not between 1 and 100 or (input->>'acceptedOn')::date>(clock_timestamp() at time zone (select timezone from public.tenants where id=target_tenant))::date then raise exception 'Controleer de akkoorddatum en contractregels' using errcode='23514';end if;
 insert into public.customer_agreements(id,tenant_id,customer_id,previous_id,version,title,starts_on,ends_on,evidence_document_id,accepted_by_name,accepted_on)
 values(a,target_tenant,target_customer,prev.id,ver,input->>'title',(input->>'startsOn')::date,nullif(input->>'endsOn','')::date,doc,input->>'acceptedBy',(input->>'acceptedOn')::date);
 for ln in select value from jsonb_array_elements(input->'lines') loop
  if not exists(select 1 from public.objects where tenant_id=target_tenant and customer_id=target_customer and id=(ln->>'objectId')::uuid)
  or not exists(select 1 from public.task_revisions where tenant_id=target_tenant and id=(ln->>'taskRevisionId')::uuid) then raise exception 'Kies een object van deze klant en een bestaande catalogusversie' using errcode='23514';end if;
  insert into public.customer_agreement_lines(tenant_id,agreement_id,object_id,task_revision_id,scope,quantity,price_cents,limit_cents)
  values(target_tenant,a,(ln->>'objectId')::uuid,(ln->>'taskRevisionId')::uuid,ln->>'scope',(ln->>'quantity')::numeric,(ln->>'priceCents')::bigint,(ln->>'limitCents')::bigint);
 end loop;
 perform private.enqueue_event(target_tenant,'agreement.recorded','customer',target_customer,jsonb_build_object('agreement_id',a,'version',ver),'agreement:'||a::text);
 return a;
end $function$
;
CREATE OR REPLACE FUNCTION public.register_manual_payment(target_tenant_id uuid, payment_date timestamp with time zone, reference text, allocations jsonb, idempotency_key text)
 RETURNS payment_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  allocation jsonb;
  invoice_id uuid;
  allocation_amount bigint;
  total_amount bigint := 0;
  attempt public.payment_attempts;
begin
 perform private.management_assert(target_tenant_id,'backoffice.finance.write');
 perform private.management_assert(target_tenant_id,'backoffice.functions.register_manual_payment');

  if idempotency_key like 'mollie-%' then raise exception 'Provider retry keys are reserved' using errcode='23514'; end if;
  if not private.service_enabled(target_tenant_id,'finance') or not private.has_role(target_tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then
    raise exception 'At least one payment allocation is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key) then
    select * into attempt from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key;
    if attempt.provider <> 'manual' then raise exception 'Invalid manual payment identity' using errcode='23514'; end if;
    return attempt;
  end if;

  -- Deterministic ordering prevents deadlocks when two multi-invoice payments race.
  perform 1
  from public.invoices i
  join (
    select (value->>'invoice_id')::uuid as id
    from jsonb_array_elements(allocations)
  ) requested on requested.id = i.id
  where i.tenant_id = target_tenant_id
  order by i.id
  for update of i;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    if exists(select 1 from public.payment_allocations pa join public.payment_attempts p
      on p.tenant_id=pa.tenant_id and p.id=pa.payment_attempt_id
      where pa.tenant_id=target_tenant_id and pa.invoice_id=(allocation->>'invoice_id')::uuid and p.status in('open','pending')) then
      raise exception 'Controleer eerst de lopende online betaling' using errcode='23514';end if;
    if allocation_amount <= 0 then raise exception 'Allocation amount must be positive' using errcode = '23514'; end if;
    if not exists (
      select 1 from public.invoices i
      where i.tenant_id = target_tenant_id and i.id = invoice_id
        and i.status not in ('draft','credited','void')
        and i.total_cents - i.paid_cents >= allocation_amount
    ) then
      raise exception 'Invalid or excessive allocation for invoice %', invoice_id using errcode = '23514';
    end if;
    total_amount := total_amount + allocation_amount;
  end loop;

  insert into public.payment_attempts (
    tenant_id, provider, provider_mode, status, amount_cents, idempotency_key,
    provider_payload, paid_at, last_checked_at, created_by
  ) values (
    target_tenant_id, 'manual', 'manual', 'paid', total_amount, idempotency_key,
    jsonb_build_object('reference', reference, 'payment_date', payment_date),
    payment_date, clock_timestamp(), auth.uid()
  ) returning * into attempt;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    insert into public.payment_allocations (tenant_id, payment_attempt_id, invoice_id, amount_cents)
    values (target_tenant_id, attempt.id, invoice_id, allocation_amount);
    update public.invoices
    set paid_cents = paid_cents + allocation_amount,
        status = case when paid_cents + allocation_amount = total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
    where tenant_id = target_tenant_id and id = invoice_id;
  end loop;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
  values (target_tenant_id, auth.uid(), 'payment.manual_registered', 'payment_attempt', attempt.id, jsonb_build_object('amount_cents', total_amount, 'reference', reference), idempotency_key);
  return attempt;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reschedule_work_order(target_work_order_id uuid, target_personnel_id uuid, target_start_at timestamp with time zone, expected_version bigint)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders; result jsonb;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.planning.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.reschedule_work_order');

 select * into w from public.work_orders where id=target_work_order_id;
 if not found or not private.planning_access(w.tenant_id) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if (select count(*) from public.work_order_assignments where tenant_id=w.tenant_id and work_order_id=w.id and status not in ('cancelled','returned'))>1 then
   raise exception 'Gebruik het planbord om de volledige ploeg te verplaatsen' using errcode='23514';end if;
 result:=public.change_work_order_planning(w.tenant_id,w.id,expected_version,gen_random_uuid(),target_start_at,target_start_at+(w.projected_end_at-w.projected_start_at),jsonb_build_array(jsonb_build_object('personnelId',target_personnel_id,'start',target_start_at,'end',target_start_at+(w.projected_end_at-w.projected_start_at))));
 if not(result->>'ok')::boolean then raise exception 'Controleer en bevestig de afwijkingen in het planbord' using errcode='23514';end if;
 select * into w from public.work_orders where id=w.id;
 return private.staff_work_order_result(w);
end $function$
;
CREATE OR REPLACE FUNCTION public.review_object_visit_request(target_tenant uuid, target_request uuid, expected_version bigint, decision text, input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_visit_requests;t public.work_order_tasks;l public.customer_agreement_lines;a public.customer_agreements;rev public.task_revisions;cat public.task_catalog;w public.work_orders;task uuid;
begin
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.review_object_visit_request');

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.state='withdrawn' then raise exception 'Dit verzoek is ingetrokken. Maak zo nodig een nieuw verzoek.' using errcode='23514';end if;
 if decision='contract_extra' then
  if not private.commercial_access(target_tenant) then raise exception 'Commerciële beoordeling vereist' using errcode='42501';end if;
  select * into l from public.customer_agreement_lines where tenant_id=target_tenant and id=(input->>'agreementLineId')::uuid and object_id=r.object_id and extra_work and price_basis='visit';
  select * into a from public.customer_agreements where tenant_id=target_tenant and id=l.agreement_id and state='active' and evidence_document_id is not null;
  select * into w from public.work_orders where tenant_id=target_tenant and id=r.work_order_id;
  if l.id is null or a.id is null or a.customer_id<>w.customer_id or w.status not in ('planned','released','seen','travelling','in_progress') then raise exception 'Kies een geldige, onderbouwde meerwerkafspraak voor dit bezoek' using errcode='23514';end if;
  if r.work_order_task_id is not null then
   select * into t from public.work_order_tasks where tenant_id=target_tenant and id=r.work_order_task_id;
   if t.agreement_line_id=l.id and t.quantity=(input->>'quantity')::numeric and r.review_note=input->>'reason' then return;end if;
   raise exception 'Dit verzoek heeft al een uitvoeringstaak' using errcode='40001';
  end if;
  if r.id is null or r.version<>expected_version then raise exception 'Het verzoek is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
  if length(coalesce(input->>'reason',''))<2 or (input->>'quantity')::numeric is null or (input->>'quantity')::numeric<=0 then raise exception 'Vul beoordeling en hoeveelheid in' using errcode='23514';end if;
  select * into rev from public.task_revisions where tenant_id=target_tenant and id=l.task_revision_id;
  select * into cat from public.task_catalog where tenant_id=target_tenant and id=rev.task_id and active;
  if cat.id is null then raise exception 'Deze contracttaak is niet meer beschikbaar' using errcode='23514';end if;
  -- The existing agreement trigger verifies period, successor, aggregate quantity and amount
  -- and freezes the exact consent snapshot. No fabricated quote or fresh customer consent.
  insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,added_by,agreement_line_id)
  values(target_tenant,w.id,rev.id,cat.code,l.scope,rev.duration_minutes,(input->>'quantity')::numeric,rev.unit,l.price_cents,coalesce(l.vat_basis_points,rev.vat_basis_points),true,'awaiting_review',auth.uid(),l.id) returning id into task;
  update public.object_visit_requests set state='accepted',needs_review=false,review_note=input->>'reason',response=coalesce(input->>'response',response),work_order_task_id=task where id=r.id;
  perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'review:'||r.id::text||':'||(r.version+1)::text);
  return;
 end if;
 if decision in ('completed','partial','not_done') then
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=r.work_order_task_id;
  if t.id is null or t.completed_at is null or (case when t.execution_state='planned' then 'completed' else t.execution_state end)<>decision then raise exception 'Leg eerst het werkelijke uitvoeringsresultaat en de hoeveelheid vast op de werkbon' using errcode='23514';end if;
 end if;
 perform private.review_object_request_base(target_tenant,target_request,expected_version,decision,input);
end $function$
;
CREATE OR REPLACE FUNCTION public.review_staff_leave_request(target_tenant uuid, target_request uuid, decision text, expected_version bigint, approved_minutes integer, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.staff_leave_requests;
  staff_personnel_id uuid;
  availability_slot_id uuid;
  tenant_timezone text;
  before_request jsonb;
  decision_note text := note;
  confirmed_minutes integer;
  confirmed_minutes_by_year jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.review_staff_leave_request');

  if not private.object_session_active()
    or not exists (
      select 1 from public.tenants tenant
      where tenant.id = target_tenant and tenant.status = 'active'
    )
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if target_request is null
    or decision not in ('approve','reject')
    or expected_version is null
    or length(coalesce(decision_note, '')) > 2000
    or (
      decision = 'reject'
      and nullif(btrim(coalesce(decision_note, '')), '') is null
    )
  then
    raise exception 'Ongeldige verlofbeoordeling' using errcode = '23514';
  end if;

  select request.personnel_id
  into staff_personnel_id
  from public.staff_leave_requests request
  where request.tenant_id = target_tenant and request.id = target_request;
  if staff_personnel_id is null then
    raise exception 'Verlofaanvraag niet beschikbaar' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-leave:' || target_tenant::text || ':' || staff_personnel_id::text,
      0
    )
  );
  select request.*
  into request_row
  from public.staff_leave_requests request
  where request.tenant_id = target_tenant and request.id = target_request
  for update;

  if request_row.id is null then
    raise exception 'Verlofaanvraag niet beschikbaar' using errcode = '42501';
  end if;
  if request_row.version is distinct from expected_version then
    raise exception 'De verlofaanvraag is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if request_row.status <> 'pending' or request_row.availability_id is not null then
    raise exception 'Alleen een open verlofaanvraag kan worden beoordeeld' using errcode = '23514';
  end if;

  before_request := to_jsonb(request_row);
  if decision = 'approve' then
    confirmed_minutes := coalesce(approved_minutes, request_row.requested_minutes);
    if confirmed_minutes is null or confirmed_minutes not between 1 and 527040 then
      raise exception 'Leg het goedgekeurde aantal verlofuren vast' using errcode = '23514';
    end if;
    confirmed_minutes_by_year := private.staff_leave_allocate_minutes_by_year(
      request_row.starts_on,
      request_row.ends_on,
      request_row.requested_minutes_by_year,
      confirmed_minutes
    );
    if confirmed_minutes_by_year = '{}'::jsonb then
      raise exception 'Het goedgekeurde verlof kon niet per kalenderjaar worden verdeeld' using errcode = '23514';
    end if;
    select tenant.timezone
    into tenant_timezone
    from public.tenants tenant
    where tenant.id = target_tenant;

    insert into public.availability (
      tenant_id, personnel_id, starts_at, ends_at, kind, note, approved_at
    ) values (
      target_tenant,
      request_row.personnel_id,
      request_row.starts_on::timestamp without time zone at time zone tenant_timezone,
      (request_row.ends_on + 1)::timestamp without time zone at time zone tenant_timezone,
      'leave',
      nullif(request_row.note, ''),
      clock_timestamp()
    )
    returning id into availability_slot_id;

    update public.staff_leave_requests request
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = nullif(btrim(decision_note), ''),
        approved_minutes = confirmed_minutes,
        approved_minutes_by_year = confirmed_minutes_by_year,
        availability_id = availability_slot_id
    where request.tenant_id = target_tenant and request.id = target_request
    returning request.* into request_row;
  else
    update public.staff_leave_requests request
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = nullif(btrim(decision_note), '')
    where request.tenant_id = target_tenant and request.id = target_request
    returning request.* into request_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant,
    auth.uid(),
    'staff.leave.' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'staff_leave_request',
    request_row.id,
    before_request,
    to_jsonb(request_row)
  );

  return to_jsonb(request_row);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_staff_leave_request(target_tenant uuid, target_request uuid, decision text, expected_version bigint, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.review_staff_leave_request');

 return (select public.review_staff_leave_request(
    target_tenant,
    target_request,
    decision,
    expected_version,
    null::integer,
    note
  ));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_staff_time_correction(target_tenant uuid, target_request uuid, decision text, expected_version bigint, note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.staff_time_correction_requests;
  entry_row public.time_entries;
  day_review public.staff_day_reviews;
  staff_personnel_id uuid;
  tenant_timezone text;
  entry_day date;
  decision_note text := nullif(btrim(coalesce(note, '')), '');
  before_request jsonb;
  before_entry jsonb;
  before_day_review jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.review_staff_time_correction');

  if not private.object_session_active()
    or not exists (
      select 1 from public.tenants tenant
      where tenant.id = target_tenant and tenant.status = 'active'
    )
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if target_request is null
    or decision not in ('approve','reject')
    or expected_version is null
    or length(coalesce(note, '')) > 2000
    or (decision = 'reject' and decision_note is null)
  then
    raise exception 'Ongeldige beoordeling van het correctieverzoek' using errcode = '23514';
  end if;

  select request.personnel_id,
         tenant.timezone,
         (request.source_starts_at at time zone tenant.timezone)::date
  into staff_personnel_id, tenant_timezone, entry_day
  from public.staff_time_correction_requests request
  join public.tenants tenant on tenant.id = request.tenant_id
  where request.tenant_id = target_tenant
    and request.id = target_request;
  if staff_personnel_id is null then
    raise exception 'Correctieverzoek niet beschikbaar' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-day:' || target_tenant::text || ':' ||
      staff_personnel_id::text || ':' || entry_day::text,
      0
    )
  );
  select request.*
  into request_row
  from public.staff_time_correction_requests request
  where request.tenant_id = target_tenant
    and request.id = target_request
  for update;
  if request_row.id is null then
    raise exception 'Correctieverzoek niet beschikbaar' using errcode = '42501';
  end if;
  if request_row.created_by = auth.uid() then
    raise exception 'Een eigen correctieverzoek kan niet zelf worden beoordeeld' using errcode = '42501';
  end if;
  if request_row.version is distinct from expected_version then
    raise exception 'Het correctieverzoek is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Alleen een open correctieverzoek kan worden beoordeeld' using errcode = '23514';
  end if;

  select entry.*
  into entry_row
  from public.time_entries entry
  where entry.tenant_id = target_tenant
    and entry.personnel_id = request_row.personnel_id
    and entry.id = request_row.time_entry_id
  for update;
  if entry_row.id is null then
    raise exception 'De oorspronkelijke tijdregel is niet meer beschikbaar' using errcode = '42501';
  end if;

  select review.*
  into day_review
  from public.staff_day_reviews review
  where review.tenant_id = target_tenant
    and review.personnel_id = request_row.personnel_id
    and review.day = entry_day
  for update;

  before_request := to_jsonb(request_row);
  before_entry := to_jsonb(entry_row);
  before_day_review := case when day_review.id is null then null else to_jsonb(day_review) end;

  if decision = 'approve' then
    if entry_row.version is distinct from request_row.source_version
      or entry_row.kind is distinct from request_row.source_kind
      or entry_row.status is distinct from request_row.source_status
      or entry_row.starts_at is distinct from request_row.source_starts_at
      or entry_row.ends_at is distinct from request_row.source_ends_at
    then
      raise exception 'De oorspronkelijke tijdregel is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    if (request_row.requested_starts_at at time zone tenant_timezone)::date is distinct from entry_day
      or request_row.requested_ends_at <= request_row.requested_starts_at
      or exists (
        select 1
        from public.time_entries other
        where other.tenant_id = target_tenant
          and other.personnel_id = request_row.personnel_id
          and other.id <> request_row.time_entry_id
          and tstzrange(
                other.starts_at,
                coalesce(other.ends_at, 'infinity'::timestamptz),
                '[)'
              )
            && tstzrange(request_row.requested_starts_at, request_row.requested_ends_at, '[)')
      )
    then
      raise exception 'De gewenste correctie overlapt een andere tijdregel of valt buiten de werkdag' using errcode = '23514';
    end if;

    -- A confirmed snapshot must be explicitly confirmed again after its
    -- underlying hours change. Move it to closed before touching the guarded
    -- time row; an open day remains open and must first be closed by staff.
    if day_review.id is not null and day_review.state in ('confirmed','correction_requested') then
      update public.staff_day_reviews review
      set state = 'closed',
          closed_at = coalesce(review.closed_at, clock_timestamp()),
          confirmed_at = null,
          correction_requested_at = null
      where review.id = day_review.id
      returning review.* into day_review;
    end if;

    update public.time_entries entry
    set starts_at = request_row.requested_starts_at,
        ends_at = request_row.requested_ends_at,
        -- Approved hours are a signed-off snapshot. A changed snapshot must
        -- return to draft and be approved again; stale approval metadata may
        -- never survive the correction.
        status = case when entry.status = 'approved' then 'draft' else entry.status end,
        approved_by = case when entry.status = 'approved' then null else entry.approved_by end,
        approved_at = case when entry.status = 'approved' then null else entry.approved_at end
    where entry.tenant_id = target_tenant
      and entry.id = request_row.time_entry_id
    returning entry.* into entry_row;

    update public.staff_time_correction_requests request
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = decision_note
    where request.tenant_id = target_tenant
      and request.id = target_request
    returning request.* into request_row;
  else
    update public.staff_time_correction_requests request
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = clock_timestamp(),
        review_note = decision_note
    where request.tenant_id = target_tenant
      and request.id = target_request
    returning request.* into request_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant,
    auth.uid(),
    'staff.time.correction_' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'staff_time_correction_request',
    request_row.id,
    jsonb_build_object(
      'request', before_request,
      'time_entry', before_entry,
      'day_review', before_day_review
    ),
    jsonb_build_object(
      'request', to_jsonb(request_row),
      'time_entry', to_jsonb(entry_row),
      'day_review', case when day_review.id is null then null else to_jsonb(day_review) end
    )
  );

  return to_jsonb(request_row) - array['created_by','reviewed_by'];
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_work_order(target_work_order_id uuid, decision text, reason text DEFAULT NULL::text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r uuid;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.reports.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.review_work_order');

 select v.id into r from public.work_order_report_versions v join public.work_orders w on w.id=v.work_order_id and w.tenant_id=v.tenant_id where w.id=target_work_order_id and v.version=w.report_version;
 if r is null then raise exception 'Laat eerst de actuele rapportversie in de personeelsapp vastleggen' using errcode='23514';end if;
 return public.review_work_order_report(target_work_order_id,r,decision,reason);
end $function$
;
CREATE OR REPLACE FUNCTION public.review_work_order_report(target_work_order_id uuid, target_report_id uuid, decision text, reason text DEFAULT NULL::text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;r public.work_order_report_versions;result public.work_orders;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.reports.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.review_work_order_report');

 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then raise exception 'Rapportcontrolerecht vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id and id=target_report_id for update;
 if r.id is null or r.version<>w.report_version or r.state not in ('waiting_signature','review','correction') then raise exception 'Rapportversie is gewijzigd of reeds gecontroleerd' using errcode='40001';end if;
 if decision='approved' then
  perform private.validate_work_order_report(w);
  if not private.work_order_report_ready(r) or r.state<>'review' then raise exception 'Een geldige ondertekening of geautoriseerde vrijstelling ontbreekt' using errcode='23514';end if;
  update public.work_order_report_versions set state='approved',approved_at=clock_timestamp(),approved_by=auth.uid() where id=r.id;
 elsif decision='returned' and length(btrim(coalesce(reason,'')))>=3 then
  update public.work_order_report_versions set state='correction' where id=r.id;
 else raise exception 'Kies goedkeuren of een correctie met reden' using errcode='23514';end if;
 result:=private.work_order_review_legacy(w.id,decision,reason);
 update public.work_orders set report_state=case when decision='approved' then 'approved' else 'correction' end where id=w.id returning * into result;
 return private.staff_work_order_result(result);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_object_dossier(target_tenant uuid, input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.objects;v bigint;line text;
begin
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.save_object_dossier');

 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=(input->>'customerId')::uuid and (status not in ('inactive','archived','draft') or exists(select 1 from public.objects existing where existing.tenant_id=target_tenant and existing.id=(input->>'id')::uuid and existing.customer_id=customers.id))) then raise exception 'Kies een actieve klant binnen je organisatie' using errcode='23514';end if;
 select * into o from public.objects where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
 v:=(input->>'version')::bigint;
 if v=0 then
  if o.id is not null then return o.id;end if;
  insert into public.objects(id,tenant_id,customer_id,object_number,name,object_type,address,latitude,longitude,location_description,access_instructions,dossier_status)
  values((input->>'id')::uuid,target_tenant,(input->>'customerId')::uuid,'OBJ-'||upper(substr(replace(input->>'id','-',''),1,10)),input->>'name',input->>'type',coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),nullif(input->>'latitude','')::numeric,nullif(input->>'longitude','')::numeric,input->>'locationDescription',input->>'instructions',input->>'status') returning * into o;
  for line in select btrim(x) from unnest(string_to_array(coalesce(input->>'structure',''),E'\n'))x where btrim(x)<>'' loop
   insert into public.object_nodes(tenant_id,object_id,name,kind) values(target_tenant,o.id,line,'room');
  end loop;
  if length(coalesce(input->>'contact',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'contact','Contact en bereikbaarheid',input->>'contact','active');end if;
  if length(coalesce(input->>'programme',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'programme','Werkprogramma',input->>'programme','draft');end if;
  if length(coalesce(input->>'safety',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,details) values(target_tenant,o.id,'instruction','Veilig werken',input->>'safety','active','fixed',clock_timestamp(),'{"acknowledgement":true}');end if;
 else
  if o.id is null or o.version<>v then raise exception 'Het object is intussen gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
  update public.objects set customer_id=(input->>'customerId')::uuid,name=input->>'name',object_type=input->>'type',address=coalesce(input->'address',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city')),latitude=nullif(input->>'latitude','')::numeric,longitude=nullif(input->>'longitude','')::numeric,location_description=input->>'locationDescription',access_instructions=input->>'instructions',dossier_status=input->>'status' where id=o.id;
 end if;
 return o.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_work_order(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;old_w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;oid uuid:=(input->>'id')::uuid;hash text;
 item jsonb;r jsonb;planning jsonb;revision public.task_revisions;task public.task_catalog;contact public.customer_contacts;template public.work_order_template_versions;template_name text;
 task_json jsonb;old_tasks jsonb;new_tasks jsonb;new_checklists uuid[];old_checklists uuid[];cid uuid;slot uuid;warn text;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.save_work_order');

 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or oid is null or input->>'version' is null or (input->>'version')::bigint<0 then raise exception 'Een wijzigingssleutel en versie zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'save',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if not exists(select 1 from public.objects o join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id where o.tenant_id=target_tenant and o.id=(input->>'objectId')::uuid and c.id=(input->>'customerId')::uuid and o.active and c.status not in ('archived','inactive')) then raise exception 'Selecteer een object van de gekozen klant' using errcode='23514';end if;
 if length(btrim(coalesce(input->>'title','')))<2 or length(input->>'title')>180 or length(btrim(coalesce(input->>'discipline','')))=0 or length(input->>'description')>10000 or length(input->>'instructions')>4000 then raise exception 'Vul titel, dienst en geldige instructies in' using errcode='23514';end if;
 if coalesce(input->>'state','') not in ('draft','unassigned','tentative','final') or coalesce(input->>'signatureMode','') not in ('inherit','none','optional','required') or coalesce((input->>'requiredPersonnel')::int,0) not between 1 and 100 then raise exception 'Controleer planning en ondertekeninstellingen' using errcode='23514';end if;
 if nullif(input->>'plannerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'plannerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve planner van deze organisatie' using errcode='23514';end if;
 if nullif(input->>'leadPersonnelId','') is not null and not exists(select 1 from jsonb_array_elements(input->'assignments')x where x->>'personnelId'=input->>'leadPersonnelId') then raise exception 'De uitvoeringsverantwoordelijke moet aan deze bon zijn toegewezen' using errcode='23514';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'assignments','[]')) loop
 if not exists(select 1 from public.personnel p join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id where p.tenant_id=target_tenant and p.id=(item->>'personnelId')::uuid and p.status='active' and m.status='active' and 'staff'=any(m.roles)) then raise exception 'Een medewerker heeft geen actieve uitvoeringstoegang' using errcode='23514';end if;end loop;
 select * into old_w from public.work_orders where tenant_id=target_tenant and id=oid for update;
 if old_w.id is null and (input->>'version')::bigint<>0 or old_w.id is not null and old_w.version<>(input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd. Laad de actuele versie.' using errcode='40001';end if;
 if old_w.id is not null and (old_w.actual_start_at is not null or old_w.status not in ('planned','released','seen','travelling') or old_w.archive_at is not null) then raise exception 'De uitvoering is gestart of afgesloten; de afgesproken scope blijft bewaard' using errcode='23514';end if;
 if old_w.id is not null and (old_w.customer_id<>(input->>'customerId')::uuid or old_w.object_id<>(input->>'objectId')::uuid) then raise exception 'Klant en object van een bestaande bon blijven vastgelegd. Maak zo nodig een nieuwe bon.' using errcode='23514';end if;
 if old_w.published_at is not null and (old_w.signature_mode,old_w.employee_signature_required) is distinct from (input->>'signatureMode',(input->>'employeeSignatureRequired')::boolean) then raise exception 'Wijzig een gepubliceerde ondertekenafspraak via het gemotiveerde beleid in het rapportdossier' using errcode='23514';end if;
 if (old_w.id is null and input->>'signatureMode'<>'inherit' or old_w.id is not null and old_w.signature_mode<>input->>'signatureMode') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan afwijken van het ondertekenbeleid' using errcode='42501';end if;
 if coalesce(old_w.employee_signature_required,false) is distinct from coalesce((input->>'employeeSignatureRequired')::boolean,false) and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt de medewerkershandtekening' using errcode='42501';end if;
 task_json:=coalesce(input->'tasks','[]');
 if old_w.id is not null and coalesce((input->>'preserveTasks')::boolean,false) then select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions)),'[]') into task_json from public.work_order_tasks where work_order_id=oid;end if;
 if jsonb_array_length(task_json)>100 or (input->>'state'<>'draft' and jsonb_array_length(task_json)=0) then raise exception 'Kies minimaal één taak voor deze werkbon' using errcode='23514';end if;
 if nullif(input->>'templateRevisionId','') is not null then
 select v.* into template from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=(input->>'templateRevisionId')::uuid and t.kind='work_order' and (v.state='published' or (v.state='archived' and old_w.template_snapshot->>'id'=v.id::text));
 if template.id is null then raise exception 'Kies een gepubliceerde werkbontemplate' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where id=template.template_id;
 end if;
 select coalesce(array_agg(x::uuid order by x),'{}') into new_checklists from jsonb_array_elements_text(coalesce(input->'checklistRevisionIds','[]'))x;
 select coalesce(array_agg(template_revision_id order by template_revision_id),'{}') into old_checklists from public.work_order_checklists where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions) order by task_revision_id,quantity,instructions),'[]') into old_tasks from public.work_order_tasks where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',x->>'revisionId','quantity',(x->>'quantity')::numeric,'instructions',coalesce(x->>'instructions','')) order by x->>'revisionId',(x->>'quantity')::numeric,x->>'instructions'),'[]') into new_tasks from jsonb_array_elements(task_json)x;
 if old_w.id is not null and (old_tasks<>new_tasks or old_checklists<>new_checklists) and (old_w.published_at is not null or old_w.quote_id is not null or exists(select 1 from public.work_order_tasks t where t.work_order_id=oid and (t.execution_state<>'planned' or t.agreement_line_id is not null)) or exists(select 1 from public.work_order_checklist_answers a join public.work_order_checklists c on c.id=a.checklist_id where c.work_order_id=oid)) then raise exception 'De gepubliceerde of commerciële taken en antwoorden blijven behouden. Maak een gecontroleerde opvolgbon voor nieuwe scope.' using errcode='23514';end if;
 begin
 if nullif(input->>'windowStart','') is not null or nullif(input->>'windowEnd','') is not null then
  if (input->>'windowStart')::timestamptz is null or (input->>'windowEnd')::timestamptz<=(input->>'windowStart')::timestamptz then raise exception 'Controleer het klanttijdvenster' using errcode='23514';end if;
  if old_w.appointment_slot_id is not null then update public.appointment_slots set starts_at=(input->>'windowStart')::timestamptz,ends_at=(input->>'windowEnd')::timestamptz where id=old_w.appointment_slot_id;slot:=old_w.appointment_slot_id;
  else insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity,booked_count,status) values(target_tenant,(input->>'windowStart')::timestamptz,(input->>'windowEnd')::timestamptz,1,1,'full') returning id into slot;end if;
 else slot:=old_w.appointment_slot_id;end if;
 if old_w.id is null then
 insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,created_by,planning_state)
 values(oid,target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(replace(oid::text,'-',''),1,12)),(input->>'customerId')::uuid,(input->>'objectId')::uuid,input->>'discipline',auth.uid(),input->>'state');
 end if;
 update public.work_orders set title=btrim(input->>'title'),description=coalesce(input->>'description',''),discipline=input->>'discipline',priority=coalesce(input->>'priority','normal'),labels=array(select jsonb_array_elements_text(coalesce(input->'labels','[]'))),
 planner_user_id=nullif(input->>'plannerId','')::uuid,lead_personnel_id=nullif(input->>'leadPersonnelId','')::uuid,signature_mode=input->>'signatureMode',employee_signature_required=coalesce((input->>'employeeSignatureRequired')::boolean,false),
 planning_state=input->>'state',deadline=nullif(input->>'deadline','')::date,budget_labor_minutes=nullif(input->>'durationMinutes','')::int,
 requested_date=nullif(input->>'requestedDate','')::date,customer_window_kind=input->>'windowKind',required_personnel=(input->>'requiredPersonnel')::int,day_instructions=coalesce(input->>'instructions',''),appointment_slot_id=slot,
 details=details||jsonb_build_object('customerReference',coalesce(input->>'customerReference',''),'purchaseOrder',coalesce(input->>'purchaseOrder',''),'costCenter',coalesce(input->>'costCenter',''),'locationLabel',coalesce(input->>'locationLabel','')),
 template_snapshot=case when template.id is not null then jsonb_build_object('id',template.id,'name',template_name,'version',template.version,'definition',template.definition) else template_snapshot end
 where id=oid returning * into w;
 if old_w.id is null or old_tasks<>new_tasks then
 delete from public.work_order_tasks where work_order_id=oid;
 for item in select * from jsonb_array_elements(task_json) loop
 select * into revision from public.task_revisions where tenant_id=target_tenant and id=(item->>'revisionId')::uuid;
 select * into task from public.task_catalog where tenant_id=target_tenant and id=revision.task_id and active;
 if task.id is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Controleer taak en hoeveelheid' using errcode='23514';end if;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by)
 values(target_tenant,oid,revision.id,task.code,task.name,revision.duration_minutes,(item->>'quantity')::numeric,revision.unit,revision.price_cents,revision.vat_basis_points,coalesce(item->>'instructions',''),auth.uid());
 end loop;end if;
 delete from public.work_order_contacts where work_order_id=oid;
 for item in select * from jsonb_array_elements(coalesce(input->'contacts','[]')) loop
 select * into contact from public.customer_contacts where tenant_id=target_tenant and customer_id=w.customer_id and id=(item->>'id')::uuid and active and (cardinality(object_ids)=0 or w.object_id=any(object_ids));
 if not found then raise exception 'Contactpersoon hoort niet bij deze klant of dit object' using errcode='23514';end if;
 insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot) values(target_tenant,oid,contact.id,array(select jsonb_array_elements_text(item->'roles')),jsonb_build_object('name',contact.full_name,'email',contact.email,'phone',contact.phone));
 end loop;
 if old_checklists<>new_checklists then
 delete from public.work_order_checklists where work_order_id=oid;
 foreach cid in array new_checklists loop
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
 select target_tenant,oid,v.id,t.name,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=cid and v.state='published' and t.kind='checklist';
 if not found then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
 end loop;end if;
 if nullif(input->>'start','') is not null or old_w.projected_start_at is not null or jsonb_array_length(coalesce(input->'assignments','[]'))>0 then
 select * into w from public.work_orders where id=oid;
 planning:=public.change_work_order_planning(target_tenant,oid,w.version,gen_random_uuid(),nullif(input->>'start','')::timestamptz,nullif(input->>'end','')::timestamptz,coalesce(input->'assignments','[]'),array(select jsonb_array_elements_text(coalesce(input->'confirmedWarnings','[]'))));
 if not (planning->>'ok')::boolean then raise exception 'Planning vraagt bevestiging' using errcode='P0001',detail=planning::text;end if;
 end if;
 select * into w from public.work_orders where id=oid;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'save',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),case when old_w.id is null then 'work_order.created' else 'work_order.updated' end,'work_order',w.id,jsonb_build_object('version',w.version,'planningState',w.planning_state));
 return r;
 exception when sqlstate 'P0001' then get stacked diagnostics warn=pg_exception_detail;if warn is null or warn='' then raise;end if;return warn::jsonb||jsonb_build_object('error','Controleer en bevestig de planningswaarschuwingen.');
 end;
end $function$
;
CREATE OR REPLACE FUNCTION public.set_staff_availability_permission(target_tenant uuid, target_personnel uuid, enabled boolean, expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_person public.personnel;
  updated_person public.personnel;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.set_staff_availability_permission');

  if not private.object_session_active()
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(target_tenant, array['tenant_admin','management','hr']::public.app_role[])
  then
    raise exception 'Personeelsbeheer vereist' using errcode = '42501';
  end if;

  select *
  into current_person
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.id = target_personnel
    and p.status in ('invited','active')
  for update;

  if current_person.id is null then
    raise exception 'Medewerker niet beschikbaar' using errcode = '42501';
  end if;
  if current_person.version is distinct from expected_version then
    raise exception 'De medewerker is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
  end if;

  update public.personnel
  set availability_self_service_enabled = enabled
  where tenant_id = target_tenant and id = target_personnel
  returning * into updated_person;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.availability_permission.updated', 'personnel', target_personnel,
    jsonb_build_object('enabled', current_person.availability_self_service_enabled, 'version', current_person.version),
    jsonb_build_object('enabled', updated_person.availability_self_service_enabled, 'version', updated_person.version)
  );

  return jsonb_build_object(
    'personnel_id', target_personnel,
    'availability_self_service_enabled', updated_person.availability_self_service_enabled,
    'version', updated_person.version
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_staff_leave_entitlement(target_tenant uuid, target_personnel uuid, calendar_year integer, allowance_minutes integer, carryover_minutes integer, expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_row public.staff_leave_entitlements;
  updated_row public.staff_leave_entitlements;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.set_staff_leave_entitlement');

  if not private.object_session_active()
    or not private.service_enabled(target_tenant, 'personeel')
    or not private.has_role(
      target_tenant,
      array['tenant_admin','management','hr']::public.app_role[]
    )
    or not exists (
      select 1 from public.personnel person
      where person.tenant_id = target_tenant and person.id = target_personnel
    )
  then
    raise exception 'Management- of HR-toegang vereist' using errcode = '42501';
  end if;
  if calendar_year not between 2000 and 2200
    or allowance_minutes not between 0 and 527040
    or carryover_minutes not between 0 and 527040
    or allowance_minutes + carryover_minutes > 1054080
    or expected_version is null or expected_version < 0
  then
    raise exception 'Controleer kalenderjaar en verlofuren' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'fieldgrid-staff-leave-entitlement:' || target_tenant::text || ':'
      || target_personnel::text || ':' || calendar_year::text,
      0
    )
  );
  select entitlement.*
  into current_row
  from public.staff_leave_entitlements entitlement
  where entitlement.tenant_id = target_tenant
    and entitlement.personnel_id = target_personnel
    and entitlement.calendar_year = set_staff_leave_entitlement.calendar_year
  for update;

  if found then
    if current_row.version is distinct from expected_version then
      raise exception 'Het verlofsaldo is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    update public.staff_leave_entitlements entitlement
    set allowance_minutes = set_staff_leave_entitlement.allowance_minutes,
        carryover_minutes = set_staff_leave_entitlement.carryover_minutes,
        updated_by = auth.uid()
    where entitlement.tenant_id = target_tenant and entitlement.id = current_row.id
    returning entitlement.* into updated_row;
  else
    if expected_version <> 0 then
      raise exception 'Het verlofsaldo is intussen gewijzigd. Laad opnieuw.' using errcode = '40001';
    end if;
    insert into public.staff_leave_entitlements (
      tenant_id, personnel_id, calendar_year, allowance_minutes,
      carryover_minutes, updated_by
    ) values (
      target_tenant, target_personnel, calendar_year, allowance_minutes,
      carryover_minutes, auth.uid()
    ) returning * into updated_row;
  end if;

  insert into public.audit_events (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    target_tenant, auth.uid(), 'staff.leave.entitlement.updated',
    'staff_leave_entitlement', updated_row.id,
    case when current_row.id is null then null else jsonb_build_object(
      'calendar_year', current_row.calendar_year,
      'allowance_minutes', current_row.allowance_minutes,
      'carryover_minutes', current_row.carryover_minutes,
      'version', current_row.version
    ) end,
    jsonb_build_object(
      'calendar_year', updated_row.calendar_year,
      'allowance_minutes', updated_row.allowance_minutes,
      'carryover_minutes', updated_row.carryover_minutes,
      'version', updated_row.version
    )
  );
  return to_jsonb(updated_row) - 'updated_by';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_work_order_report(target_work_order_id uuid, expected_version bigint, summary text, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;r public.work_order_report_versions;body jsonb;policy jsonb;n integer;s uuid;
begin
 if not private.work_order_execution_actor((select tenant_id from public.work_orders where id=target_work_order_id),target_work_order_id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.work_orders.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.submit_work_order_report');
 end if;

 select * into w from public.work_orders where id=target_work_order_id;
 s:=nullif(auth.jwt()->>'session_id','')::uuid;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),s) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and submission_key=idempotency_key;
 if found then if r.work_order_id<>w.id or r.created_by<>auth.uid() or r.snapshot->>'summary'<>btrim(summary) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);end if;
 if w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd. Herlaad voor oplevering.' using errcode='40001';end if;
 if w.status in ('completed','cancelled','invoice_ready','invoiced','approved') or w.report_state not in ('draft','correction') or length(btrim(summary)) not between 3 and 5000 then raise exception 'Controleer de rapportsamenvatting en actuele fase' using errcode='23514';end if;
 if not private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then raise exception 'Het eerst geplande personeelslid verzorgt de klantoplevering' using errcode='42501';end if;
 perform private.validate_work_order_report(w);
 select greatest(coalesce(max(version),0)+1,w.report_version) into n from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id;
 policy:=private.work_order_signature_policy(w);body:=private.work_order_report_snapshot(w,btrim(summary));
 update public.work_order_report_versions set state='superseded' where tenant_id=w.tenant_id and work_order_id=w.id and state in ('waiting_signature','review','correction');
 insert into public.work_order_report_versions(tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key)
 values(w.tenant_id,w.id,n,body,encode(extensions.digest(body::text,'sha256'),'hex'),policy,case when policy->>'mode'='required' or (policy->>'employeeRequired')::boolean then 'waiting_signature' else 'review' end,auth.uid(),idempotency_key) returning * into r;
 update public.work_orders set report_version=n,report_state=r.state,signature_policy_snapshot=policy,status='completed',attention_reason=case when r.state='waiting_signature' then 'waiting_signature' else null end where id=w.id;
 perform private.enqueue_event(w.tenant_id,'work_order.report_submitted','work_order',w.id,jsonb_build_object('report_id',r.id,'state',r.state),'report-submitted:'||r.id);
 return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);
end $function$
;
CREATE OR REPLACE FUNCTION public.task_catalogue(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare finance boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.tasks.read');
 perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue');

 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot taakbeheer' using errcode='42501';end if;
 finance:=private.commercial_access(target_tenant);
 return jsonb_build_object('finance',finance,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from public.task_categories c where c.tenant_id=target_tenant),'[]'),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'categoryId',t.category_id,'code',t.code,'name',t.name,'description',t.description,'discipline',t.discipline,'active',t.active,'version',t.version,'revisionId',r.id,'duration',r.duration_minutes,'requiresPhoto',r.requires_photo,'requiresSignature',r.requires_customer_signature,'extraWork',coalesce(e.active,false))||case when finance then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.code,t.id)
   from public.task_catalog t left join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by r.revision desc limit 1)r on true left join public.extra_work_rules e on e.tenant_id=t.tenant_id and e.task_revision_id=r.id where t.tenant_id=target_tenant),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.task_catalogue_command(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.task_categories;t public.task_catalog;r public.task_revisions;new_revision public.task_revisions;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;action text:=input->>'action';hash text;result jsonb;new_code text;number integer;price bigint;vat integer;
begin
 perform private.management_assert(target_tenant,'backoffice.tasks.write');
 perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue_command');

 if not private.object_manage(target_tenant) then raise exception 'Geen toegang tot taakbeheer' using errcode='42501';end if;
 if mid is null or action not in('category_save','category_active','task_save','task_active') or jsonb_typeof(input)<>'object' then raise exception 'Ongeldige taakwijziging' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-catalogue:'||target_tenant,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'catalogue:'||action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if action like 'category_%' then
  if nullif(input->>'id','') is not null then
   select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
   if c.id is null then raise exception 'Categorie niet beschikbaar' using errcode='42501';end if;
   if c.version is distinct from (input->>'version')::bigint then raise exception 'Categorie is gewijzigd' using errcode='40001';end if;
  end if;
  if action='category_active' then
   if c.id is null or jsonb_typeof(input->'active')<>'boolean' then raise exception 'Kies een categorie en status' using errcode='23514';end if;
   update public.task_categories set active=(input->>'active')::boolean,version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  else
   if c.id is null then insert into public.task_categories(tenant_id,name,prefix) values(target_tenant,btrim(input->>'name'),upper(btrim(input->>'prefix'))) returning * into c;
   else update public.task_categories set name=btrim(input->>'name'),prefix=upper(btrim(input->>'prefix')),version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',c.id,'version',c.version);
 else
  if nullif(input->>'id','') is not null then
   select * into t from public.task_catalog where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
   if t.id is null then raise exception 'Taak niet beschikbaar' using errcode='42501';end if;
   if t.version is distinct from(input->>'version')::bigint then raise exception 'Taak is gewijzigd' using errcode='40001';end if;
   select * into r from public.task_revisions where tenant_id=target_tenant and task_id=t.id and valid_until is null order by revision desc limit 1 for update;
  end if;
  if action='task_active' then
   if t.id is null or jsonb_typeof(input->'active')<>'boolean' then raise exception 'Kies een taak en status' using errcode='23514';end if;
   update public.task_catalog set active=(input->>'active')::boolean,version=version+1 where id=t.id returning * into t;
  else
   if length(btrim(coalesce(input->>'name',''))) not between 2 and 180 or length(btrim(coalesce(input->>'discipline',''))) not between 2 and 100 or coalesce((input->>'duration')::integer,0) not between 1 and 1440 or length(coalesce(input->>'description',''))>3000 then raise exception 'Controleer naam, discipline en duur' using errcode='23514';end if;
   if not private.service_enabled(target_tenant,'rapportage') and(coalesce((input->>'extraWork')::boolean,false) or coalesce((input->>'requiresPhoto')::boolean,false) or coalesce((input->>'requiresSignature')::boolean,false)) then raise exception 'Rapportage is nodig voor bewijs en meerwerk' using errcode='23514';end if;
   if t.id is not null and not private.commercial_access(target_tenant) then
    if input ? 'priceCents' or input ? 'vatBasisPoints' then raise exception 'Tariefbeheer vereist' using errcode='42501';end if;
    price:=r.price_cents;vat:=r.vat_basis_points;
   else price:=(input->>'priceCents')::bigint;vat:=(input->>'vatBasisPoints')::integer;end if;
   if price is null or price<0 or vat is null or vat not between 0 and 10000 then raise exception 'Controleer prijs en btw' using errcode='23514';end if;
   if t.id is null then
    select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'categoryId')::uuid and active for update;
    if c.id is null then raise exception 'Kies een actieve taakcategorie' using errcode='23514';end if;
    number:=c.next_number;
    loop
     new_code:=c.prefix||'-'||lpad(number::text,greatest(3,length(number::text)),'0');
     exit when not exists(select 1 from public.task_catalog where tenant_id=target_tenant and task_catalog.code=new_code);
     number:=number+1;if number>=999999999 then raise exception 'Nummerreeks is uitgeput' using errcode='23514';end if;
    end loop;
    update public.task_categories set next_number=number+1,version=version+1,updated_at=clock_timestamp() where id=c.id;
    insert into public.task_catalog(tenant_id,category_id,code,name,description,discipline) values(target_tenant,c.id,new_code,btrim(input->>'name'),input->>'description',btrim(input->>'discipline')) returning * into t;
   else
    if input ? 'categoryId' then
     select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'categoryId')::uuid and(active or id=t.category_id);
     if c.id is null then raise exception 'Kies een actieve categorie binnen deze organisatie' using errcode='23514';end if;
    end if;
    update public.task_catalog set category_id=coalesce(c.id,category_id),name=btrim(input->>'name'),description=input->>'description',discipline=btrim(input->>'discipline'),version=version+1 where id=t.id returning * into t;
    update public.task_revisions set valid_until=greatest(clock_timestamp(),valid_from+interval '1 microsecond') where id=r.id;
   end if;
   insert into public.task_revisions(tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit,requires_photo,requires_customer_signature)
   values(target_tenant,t.id,coalesce(r.revision,0)+1,(input->>'duration')::integer,price,vat,coalesce(r.unit,'task'),coalesce((input->>'requiresPhoto')::boolean,false),coalesce((input->>'requiresSignature')::boolean,false)) returning * into new_revision;
   if coalesce((input->>'extraWork')::boolean,false) then insert into public.extra_work_rules(tenant_id,task_revision_id,requires_photo,requires_review) values(target_tenant,new_revision.id,new_revision.requires_photo,true);end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',t.id,'version',t.version,'code',t.code);
 end if;
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'catalogue:'||action,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'catalogue.'||action,case when action like 'category_%' then 'task_category' else 'task' end,(result->>'id')::uuid,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.transition_work_order(target_work_order_id uuid, action text, expected_version bigint, idempotency_key text, reason_code text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;a public.work_order_assignments;e public.status_events;now_at timestamptz:=clock_timestamp();result public.work_orders;
begin
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.work_orders.write');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.transition_work_order');

 select * into w from public.work_orders where id=target_work_order_id;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select aa.* into a from public.work_order_assignments aa join public.personnel p on p.id=aa.personnel_id and p.tenant_id=aa.tenant_id where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and p.user_id=auth.uid() and aa.status not in ('cancelled','returned') for update of aa;
 select * into e from public.status_events where tenant_id=w.tenant_id and status_events.idempotency_key=transition_work_order.idempotency_key;
 if found then if e.work_order_id<>w.id or e.actor_user_id<>auth.uid() or e.assignment_id<>a.id then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return private.staff_work_order_result(w);end if;
 if w.version is distinct from expected_version then raise exception 'De uitvoering is gewijzigd. Herlaad en probeer opnieuw.' using errcode='40001';end if;
 if action not in ('stop','pause','resume','complete','resubmit') then
  if action='start' and a.status='seen' then update public.work_order_assignments set status='travelling' where id=a.id;select version into expected_version from public.work_orders where id=w.id;end if;
  result:=private.work_order_transition_legacy(w.id,action,expected_version,idempotency_key,reason_code,note);
  if action='open' then update public.work_order_assignments set seen_at=coalesce(seen_at,now_at) where id=a.id;end if;
  if action='start' then perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;end if;
  return private.staff_work_order_result(result);
 end if;
 if action='resubmit' then
  perform public.submit_work_order_report(w.id,w.version,coalesce(nullif(note,''),'Bijgewerkte taakresultaten en klantzichtbare rapportage'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
  return private.staff_work_order_result(result);
 end if;
 if w.status in ('cancelled','approved','invoice_ready','invoiced') or a.status<>'in_progress' then raise exception 'Deze inzet is niet actief' using errcode='23514';end if;
 if action='pause' and a.paused_at is not null or action='resume' and a.paused_at is null then raise exception 'De pauzestatus is al gewijzigd' using errcode='40001';end if;
 if action='complete' and exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and t.completed_at is null and(not t.is_extra_work or t.extra_work_status<>'rejected')) then raise exception 'Leg de verplichte taakresultaten vast, of stop alleen de eigen inzet.' using errcode='23514';end if;
 update public.time_entries set ends_at=now_at where tenant_id=w.tenant_id and assignment_id=a.id and ends_at is null;
 if action='pause' then
  update public.work_order_assignments set paused_at=now_at where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'break',now_at);
 elsif action='resume' then
  update public.work_order_assignments set paused_at=null where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'work',now_at);
 else
  update public.work_order_assignments set status='completed',paused_at=null,actual_end_at=now_at,projected_start_at=coalesce(actual_start_at,projected_start_at),projected_end_at=greatest(now_at,coalesce(actual_start_at,projected_start_at)+interval '1 second') where id=a.id;
 end if;
 update public.work_orders set status=case when exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then 'in_progress'::public.work_order_status else 'completed'::public.work_order_status end,
 actual_end_at=case when not exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then now_at else null end where id=w.id returning * into result;
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
 perform private.enqueue_event(w.tenant_id,'work_order.'||action,'work_order',w.id,jsonb_build_object('assignment_id',a.id),'transition:'||idempotency_key);
 -- Compatibility for existing clients: their final complete creates a report;
 -- the current app explicitly separates stop from submit.
 if action='complete' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) and not exists(select 1 from public.work_order_assignments closed where closed.tenant_id=w.tenant_id and closed.work_order_id=w.id and closed.status not in('completed','returned','cancelled')) then
  perform public.submit_work_order_report(w.id,result.version,coalesce(nullif(note,''),'Uitgevoerde werkzaamheden volgens de vastgelegde taakresultaten'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
 end if;
 perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;
 return private.staff_work_order_result(result);
end $function$
;
CREATE OR REPLACE FUNCTION public.travel_day_departure(t uuid, p uuid, d date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(t,'backoffice.planning.read');
 perform private.management_assert(t,'backoffice.functions.travel_day_departure');

 if private.object_session_active() is not true or private.can_access_personnel(t,p,true) is not true then raise exception 'Geen toegang' using errcode='42501';end if;
 return (select departure_address from public.personnel_travel_days where tenant_id=t and personnel_id=p and day=d);
end$function$
;
CREATE OR REPLACE FUNCTION public.waive_work_order_signature(target_report_id uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.work_order_report_versions;w public.work_orders;settings jsonb;
begin
 perform private.management_assert((select tenant_id from public.work_order_report_versions where id=target_report_id),'backoffice.work_orders.write');
 perform private.management_assert((select tenant_id from public.work_order_report_versions where id=target_report_id),'backoffice.functions.waive_work_order_signature');

 select * into r from public.work_order_report_versions where id=target_report_id;select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id for update;
 select s.settings->'workOrders' into settings from public.tenant_settings s where tenant_id=r.tenant_id;
 if not private.object_session_active() or not private.has_role(r.tenant_id,array['tenant_admin','management']::public.app_role[]) or not coalesce((settings->>'allowSignatureWaivers')::boolean,false) or not coalesce(settings->'signatureWaiverUsers','[]') ? auth.uid()::text then raise exception 'Geen afzonderlijke bevoegdheid voor ondertekenvrijstelling' using errcode='42501';end if;
 if r.version<>w.report_version or r.state<>'waiting_signature' or length(btrim(reason)) not between 5 and 1000 then raise exception 'Kies de actuele rapportversie en leg een reden vast' using errcode='23514';end if;
 insert into public.work_order_signature_waivers(tenant_id,report_id,reason,actor_id) values(r.tenant_id,r.id,btrim(reason),auth.uid());
 if private.work_order_report_ready(r) then update public.work_order_report_versions set state='review' where id=r.id;update public.work_orders set report_state='review',attention_reason=null where id=w.id;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(w.tenant_id,auth.uid(),'report.signature_waived','work_order',w.id,jsonb_build_object('report_id',r.id,'reason',btrim(reason)));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_communication(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;a jsonb:=input->'attachment';body text:=btrim(coalesce(input->>'body',''));path text;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_communication');

 if not private.planning_access(target_tenant) or not private.object_session_active() then raise exception 'Geen toegang tot werkboncommunicatie' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if mid is null then raise exception 'Een wijzigingssleutel is verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-order-communication:'||mid,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'communication',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if length(body)>5000 or (length(body)=0 and a is null) then raise exception 'Vul een bericht in of kies een bestand' using errcode='23514';end if;
 if w.archive_at is not null then raise exception 'Een gearchiveerde werkbon is alleen leesbaar' using errcode='23514';end if;
 if coalesce((input->>'customerVisible')::boolean,false) and w.report_state in ('waiting_signature','review','approved') then raise exception 'Vraag eerst rapportcorrectie aan voordat klantzichtbare inhoud wordt toegevoegd' using errcode='23514';end if;
 if a is not null then
  path:=target_tenant||'/'||w.id||'/communication/'||mid||'.'||case a->>'mime' when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' end;
  if path is null or a->>'path' is distinct from path or coalesce((a->>'size')::bigint,0) not between 1 and 10485760 or a->>'sha256' !~ '^[0-9a-f]{64}$' or length(coalesce(a->>'name','')) not between 1 and 255 then raise exception 'Ongeldig werkbonbestand' using errcode='23514';end if;
  if not exists(select 1 from storage.objects s where s.bucket_id='reports' and s.name=path and s.metadata->>'mimetype'=a->>'mime' and (s.metadata->>'size')::bigint=(a->>'size')::bigint) then raise exception 'Het bestand is nog niet volledig opgeslagen. Probeer opnieuw.' using errcode='23514';end if;
 end if;
 if length(body)>0 then insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body,customer_visible) values(mid,target_tenant,w.id,auth.uid(),body,coalesce((input->>'customerVisible')::boolean,false));end if;
 if a is not null then insert into public.attachments(id,tenant_id,work_order_id,report_entry_id,uploaded_by,storage_bucket,storage_path,file_name,mime_type,size_bytes,sha256,customer_visible) values(mid,target_tenant,w.id,case when length(body)>0 then mid else null end,auth.uid(),'reports',path,a->>'name',a->>'mime',(a->>'size')::bigint,a->>'sha256',coalesce((input->>'customerVisible')::boolean,false));end if;
 result:=jsonb_build_object('ok',true,'id',mid);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'communication',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.communication','work_order',w.id,jsonb_build_object('entryId',mid,'attachment',a is not null,'customerVisible',coalesce((input->>'customerVisible')::boolean,false)));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_dossier(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;fin boolean;manage boolean;r jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_dossier');

 -- module-scoped work-order dossier
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not found then return null;end if;
 fin:=private.work_order_access(target_tenant,true);manage:=private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]);
 select jsonb_build_object('order',private.work_order_row(w.id,fin)||jsonb_build_object('description',w.description,'labels',w.labels,'instructions',w.day_instructions,
 'customerReference',coalesce(w.details->>'customerReference',''),'purchaseOrder',coalesce(w.details->>'purchaseOrder',''),'costCenter',coalesce(w.details->>'costCenter',''),'locationLabel',coalesce(w.details->>'locationLabel',''),
 'leadPersonnelId',w.lead_personnel_id,'plannerId',w.planner_user_id,'requestedDate',w.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',w.customer_window_kind,'durationMinutes',w.budget_labor_minutes,
 'signatureMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,'publishedAt',w.published_at,'templateSnapshot',w.template_snapshot,'templateRevisionId',w.template_snapshot->>'id','requestId',w.request_id,'quoteId',w.quote_id),
 'finance',fin,'canManage',manage,'canReview',private.management_allowed(target_tenant,'backoffice.reports.write') and private.service_enabled(target_tenant,'rapportage') and private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.contact_id,'name',c.snapshot->>'name','roles',c.roles,'email',c.snapshot->>'email','phone',c.snapshot->>'phone') order by c.snapshot->>'name') from public.work_order_contacts c where c.work_order_id=w.id),'[]'),
 'tasks',coalesce((select jsonb_agg(case when fin then to_jsonb(t) else to_jsonb(t)-'unit_price_cents'-'vat_basis_points'-'commercial_snapshot'-'staff_requested_amount_cents' end order by t.created_at,t.id) from public.work_order_tasks t where t.work_order_id=w.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',p.id,'name',p.full_name,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'seenAt',(select min(created_at) from public.status_events e where e.assignment_id=a.id and e.new_status='seen'),'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at) order by a.projected_start_at,a.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id),'[]'),
 'times',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'personnelId',p.id,'name',p.full_name,'start',t.starts_at,'end',t.ends_at,'kind',t.kind,'status',t.status) order by t.starts_at,t.id) from public.time_entries t join public.work_order_assignments a on a.id=t.assignment_id join public.personnel p on p.id=t.personnel_id where private.service_enabled(target_tenant,'personeel') and a.work_order_id=w.id and t.tenant_id=w.tenant_id),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,'customer_visible',r.customer_visible,'author',coalesce((select p.full_name from public.personnel p where p.tenant_id=r.tenant_id and p.user_id=r.author_user_id order by p.id limit 1),'Backoffice')) order by r.created_at,r.id) from public.report_entries r where private.service_enabled(target_tenant,'rapportage') and r.work_order_id=w.id and r.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'created_at',a.created_at,'customerVisible',a.customer_visible) order by a.created_at,a.id) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.work_order_id=w.id and a.deleted_at is null),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc,h.id) from (
  select item->>'id' id,(item->>'at')::timestamptz at,item->>'author' actor,item->>'title' event,item->>'description' note
  from jsonb_array_elements(case when private.service_enabled(target_tenant,'rapportage') then private.execution_activity(target_tenant,w.id,auth.uid()) else '[]'::jsonb end) item
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),'status.'||e.new_status::text,e.note
  from public.status_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.work_order_id=w.id and not private.service_enabled(target_tenant,'rapportage')
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),e.action,
   coalesce(e.after_data->>'reason',case when e.action='work_order.checklist_added' then e.after_data->>'name' end)
  from public.audit_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.entity_type='work_order' and e.entity_id=w.id
   and (not private.service_enabled(target_tenant,'rapportage') or e.action not in('work_order.open','work_order.travel','work_order.start','work_order.stop','work_order.pause','work_order.resume','work_order.return','work_order.communication'))
 )h),'[]'),
 'financial',case when fin then jsonb_build_object(
  'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'customerVisible',m.customer_visible,'unitPriceCents',f.unit_price_cents) order by m.created_at,m.id) from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id where m.tenant_id=target_tenant and m.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amountCents',e.amount_cents,'customerVisible',e.customer_visible) order by e.created_at,e.id) from public.work_order_expenses e where e.tenant_id=target_tenant and e.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'status',i.status,'totalCents',i.total_cents,'orderTotalCents',(select coalesce(sum(allocated.total_cents),0) from public.invoice_lines allocated where allocated.tenant_id=target_tenant and allocated.invoice_id=i.id and allocated.work_order_id=w.id),'paidCents',i.paid_cents,'pdfAvailable',i.pdf_storage_path is not null and i.pdf_sha256 is not null,'issuedOn',i.issued_on) order by i.created_at,i.id) from public.invoices i where i.tenant_id=target_tenant and private.service_enabled(target_tenant,'finance') and exists(select 1 from public.invoice_lines l where l.tenant_id=target_tenant and l.invoice_id=i.id and l.work_order_id=w.id)),'[]')
 ) else null end) into r from (select 1) dummy left join public.appointment_slots s on s.id=w.appointment_slot_id;
 return r;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_exception_command(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;e public.work_order_exceptions;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;manager boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_exception_command');

 if not private.object_session_active() then raise exception 'Actieve sessie vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 manager:=private.planning_access(target_tenant);
 if w.id is null or not(manager or private.work_order_execution_actor(target_tenant,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)) then raise exception 'Geen toegang tot deze werkbon' using errcode='42501';end if;
 -- private employee exception evidence
 if not manager and nullif(input->>'ownerId','') is not null then
   raise exception 'Alleen de planning kan een behandelaar kiezen' using errcode='42501';
 end if;
 if mid is null then raise exception 'Een wijzigingssleutel is verplicht' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'exception',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if input->>'action'='resolve' then
  if not manager then raise exception 'Alleen de planning kan een melding afhandelen' using errcode='42501';end if;
  select * into e from public.work_order_exceptions where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'id')::uuid for update;
  if e.id is null or e.version is distinct from (input->>'version')::bigint or e.state<>'open' then raise exception 'Deze melding is intussen gewijzigd' using errcode='40001';end if;
  if length(btrim(coalesce(input->>'resolution','')))<3 then raise exception 'Vul in hoe de melding is opgelost' using errcode='23514';end if;
  update public.work_order_exceptions set state='resolved',resolution=input->>'resolution',resolved_by=auth.uid(),resolved_at=clock_timestamp(),version=version+1 where id=e.id returning * into e;
 elsif input->>'action'='create' then
  if nullif(input->>'ownerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'ownerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve behandelaar' using errcode='23514';end if;
  if nullif(input->>'attachmentId','') is not null and not exists(select 1 from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=w.id and a.id=(input->>'attachmentId')::uuid and a.deleted_at is null
    and private.service_enabled(target_tenant,'rapportage')
    and (manager or (a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path))))
    then raise exception 'Geen toegang tot deze bijlage' using errcode='42501';end if;
  insert into public.work_order_exceptions(id,tenant_id,work_order_id,kind,description,owner_user_id,blocking,attachment_id,created_by)
  values(gen_random_uuid(),target_tenant,w.id,input->>'kind',input->>'description',coalesce(nullif(input->>'ownerId','')::uuid,w.planner_user_id,w.created_by),coalesce((input->>'blocking')::boolean,false),nullif(input->>'attachmentId','')::uuid,auth.uid()) returning * into e;
 else raise exception 'Ongeldige meldingsactie' using errcode='23514';end if;
 result:=jsonb_build_object('ok',true,'id',e.id,'version',e.version);insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'exception',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.exception_'||(input->>'action'),'work_order',w.id,jsonb_build_object('exceptionId',e.id,'kind',e.kind,'state',e.state));
 perform private.enqueue_event(target_tenant,'work_order.exception','work_order',w.id,jsonb_build_object('work_order_id',w.id,'exception_id',e.id,'owner_id',e.owner_user_id),'work-order-exception:'||mid);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_exceptions(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare backoffice boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_exceptions');

 backoffice:=private.work_order_access(target_tenant);
 if not private.object_session_active() or not private.service_enabled(target_tenant,'planning')
   or not (backoffice or (private.service_enabled(target_tenant,'personeel')
     and private.service_enabled(target_tenant,'rapportage')
     and private.is_work_order_assignee(target_tenant,target_order)))
   or not exists(select 1 from public.work_orders where id=target_order and tenant_id=target_tenant)
 then raise exception 'Geen toegang tot werkbonmeldingen' using errcode='42501';end if;
 return jsonb_build_object('canManage',private.planning_access(target_tenant),'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'kind',e.kind,'description',e.description,'ownerId',case when backoffice then e.owner_user_id else null end,
   'state',e.state,'blocking',e.blocking,'attachmentId',case when exists(select 1 from public.attachments a
     where a.tenant_id=e.tenant_id and a.work_order_id=e.work_order_id and a.id=e.attachment_id and a.deleted_at is null
       and private.service_enabled(target_tenant,'rapportage')
       and (backoffice or (a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path))))
     then e.attachment_id else null end,
   'resolution',e.resolution,'version',e.version,'createdAt',e.created_at,'resolvedAt',e.resolved_at)
   order by e.created_at desc,e.id) from public.work_order_exceptions e
   where e.tenant_id=target_tenant and e.work_order_id=target_order and (backoffice or e.created_by=auth.uid())),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_list(target_tenant uuid, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fin boolean; page_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25)));page_n int:=greatest(1,least(100000,coalesce((filters->>'page')::int,1)));q text:=coalesce(filters->>'q','');sorting text:=coalesce(filters->>'sort','date');result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_list');

 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);
 if length(q)>200 or sorting not in ('date','date_desc','number','title','customer','status') then raise exception 'Ongeldige zoekopdracht' using errcode='23514';end if;
 with filtered as materialized(
 select w.id,w.projected_start_at,w.created_at,private.work_order_row(w.id,fin) row from public.work_orders w join public.customers c on c.id=w.customer_id join public.objects o on o.id=w.object_id
 where w.tenant_id=target_tenant and ((filters->>'archived'='yes' and w.archive_at is not null) or (coalesce(filters->>'archived','')<>'yes' and w.archive_at is null))
 and (q='' or concat_ws(' ',w.work_order_number,w.title,w.discipline,c.name,o.name,o.address->>'street',o.address->>'postal_code',o.address->>'city',w.details->>'customerReference') ilike '%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%')
 and (coalesce(filters->>'customer','')='' or w.customer_id=(filters->>'customer')::uuid) and (coalesce(filters->>'object','')='' or w.object_id=(filters->>'object')::uuid)
 and (coalesce(filters->>'employee','')='' or exists(select 1 from public.work_order_assignments a where a.work_order_id=w.id and a.personnel_id=(filters->>'employee')::uuid and a.status not in ('cancelled','returned')))
 and (coalesce(filters->>'discipline','')='' or w.discipline=filters->>'discipline') and (coalesce(filters->>'priority','')='' or w.priority=filters->>'priority') and (coalesce(filters->>'source','')='' or w.source_kind=filters->>'source')
 and (coalesce(filters->>'from','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date>=(filters->>'from')::date)
 and (coalesce(filters->>'to','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date<=(filters->>'to')::date)
 ), flagged as materialized(select * from filtered where
 (coalesce(filters->>'report','')='' or row->>'reportState'=filters->>'report') and
 (coalesce(filters->>'planning','')='' or row->>'planningState'=filters->>'planning') and (coalesce(filters->>'execution','')='' or row->>'status'=filters->>'execution') and (coalesce(filters->>'billing','')='' or fin and row->>'billingState'=filters->>'billing') and
 (coalesce(filters->>'exception','')='' or (filters->>'exception'='crew' and (row->>'assignedPersonnel')::int<(row->>'requiredPersonnel')::int) or (filters->>'exception'='signature' and row->>'signatureState'='waiting') or (filters->>'exception'='remaining' and exists(select 1 from public.work_order_tasks t where t.work_order_id=filtered.id and t.execution_state in ('partial','not_done'))) or (filters->>'exception'='blocked' and row->>'status'='returned'))
 ), selected as(select * from flagged where coalesce(filters->>'view','all')='all' or row->>'category'=filters->>'view'), paged as(
 select * from selected order by
 case when sorting='date' then projected_start_at end asc nulls last,case when sorting='date_desc' then projected_start_at end desc nulls last,
 case when sorting='number' then row->>'number' when sorting='title' then row->>'title' when sorting='customer' then row->>'customer' when sorting='status' then row->>'status' end asc,
 created_at desc,id limit page_size offset (page_n-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(row) from paged),'[]'),'total',(select count(*) from selected),'page',page_n,'pageSize',page_size,'finance',fin,
 'canManage',private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]),
 'counts',jsonb_build_object('all',(select count(*) from flagged),'unassigned',(select count(*) from flagged where row->>'category'='unassigned'),'planned',(select count(*) from flagged where row->>'category'='planned'),'running',(select count(*) from flagged where row->>'category'='running'),'handling',(select count(*) from flagged where row->>'category'='handling'),'completed',(select count(*) from flagged where row->>'category'='completed'))) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_operational_rows(target_tenant uuid, target_customer uuid DEFAULT NULL::uuid, target_object uuid DEFAULT NULL::uuid, page_offset integer DEFAULT 0, page_size integer DEFAULT 500, open_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_operational_rows');

 if private.object_session_active() and private.has_role(target_tenant,array['hr']::public.app_role[]) and not private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) then return '[]'::jsonb;end if;
 if not private.work_order_access(target_tenant,false) then raise exception 'Geen operationele werkbontoegang' using errcode='42501';end if;
 if page_offset is null or page_offset<0 or page_size is null or page_size not between 1 and 500 then raise exception 'Ongeldige pagina' using errcode='23514';end if;
 return coalesce((select jsonb_agg(w.row order by w.projected_start_at desc nulls last,w.id) from
 (select to_jsonb(private.staff_work_order_result(wo)) as row,wo.projected_start_at,wo.id from public.work_orders wo where wo.tenant_id=target_tenant and(target_customer is null or wo.customer_id=target_customer) and(target_object is null or wo.object_id=target_object)
 and(not open_only or wo.status not in ('cancelled','completed','returned','under_review','approved','invoice_ready','invoiced')) order by wo.projected_start_at desc nulls last,wo.id limit page_size offset page_offset) w),'[]');
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_operational_task_data(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare financial boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_operational_task_data');

 if private.object_session_active() and private.has_role(target_tenant,array['hr']::public.app_role[]) and not private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) then return jsonb_build_object('taskRevisions','[]'::jsonb,'workOrderTasks','[]'::jsonb);end if;
 if not private.work_order_access(target_tenant,false) then raise exception 'Geen operationele taakinzage' using errcode='42501';end if;
 financial:=private.work_order_access(target_tenant,true);
 return jsonb_build_object('taskRevisions',coalesce((select jsonb_agg(case when financial then to_jsonb(r) else to_jsonb(r)-array['price_cents','vat_basis_points'] end order by r.revision desc,r.id) from public.task_revisions r where r.tenant_id=target_tenant),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(case when financial then to_jsonb(t) else (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(t)) where key=any(array['id','tenant_id','work_order_id','task_revision_id','task_code','task_name','duration_minutes','quantity','unit','is_extra_work','extra_work_status','allowed_for_staff','completed_at','completion_note','added_by','created_at','executed_quantity','execution_state','execution_version','instructions','assigned_personnel_id','scope_root_task_id','transferred_quantity','withdrawn_quantity'])) end order by t.created_at,t.id) from public.work_order_tasks t where t.tenant_id=target_tenant),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_options(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fin boolean;s public.tenant_settings;res jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_options');

 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);select * into s from public.tenant_settings where tenant_id=target_tenant;
 select jsonb_build_object('finance',fin,'canManageSignature',private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.change_work_order_signature_policy'),'defaultPaymentTermsDays',s.payment_terms_days,
 'defaultSignatureMode',coalesce(s.settings->'workOrders'->>'signatureMode',case when s.signature_required_default then 'required' else 'none' end),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'customer_number',c.customer_number) order by c.name,c.id) from public.customers c where tenant_id=target_tenant and status not in ('archived','inactive')),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'customer_id',o.customer_id,'name',o.name,'address',o.address,'signatureMode',coalesce(to_jsonb(o)->>'signature_mode','inherit'),'instructions',o.arrival_instruction) order by o.name,o.id) from public.objects o where tenant_id=target_tenant and active and dossier_status not in ('archived','paused')),'[]'),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'customer_id',c.customer_id,'objectIds',c.object_ids,'full_name',c.full_name,'email',c.email,'phone',c.phone) order by c.full_name,c.id) from public.customer_contacts c where c.tenant_id=target_tenant and c.active),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'personnel_number',p.employee_number) order by p.full_name,p.id) from public.personnel p where p.tenant_id=target_tenant and p.status='active' and exists(select 1 from public.tenant_memberships m where m.tenant_id=p.tenant_id and m.user_id=p.user_id and m.status='active' and 'staff'=any(m.roles))),'[]'),
 'planners',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label',coalesce(p.full_name,u.email,'Planner')) order by coalesce(p.full_name,u.email),m.user_id) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'revisionId',r.id,'code',t.code,'name',t.name,'discipline',t.discipline,'unit',r.unit,'durationMinutes',r.duration_minutes)||case when fin then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.name,t.id) from public.task_catalog t join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by revision desc limit 1)r on true where t.tenant_id=target_tenant and t.active),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'revisionId',v.id,'version',v.version,'editVersion',v.edit_version,'state',v.state,'definition',v.definition) order by t.name,v.version desc) from public.work_order_templates t join public.work_order_template_versions v on v.tenant_id=t.tenant_id and v.template_id=t.id where t.tenant_id=target_tenant),'[]'),
 'disciplines',coalesce((select jsonb_agg(d.discipline order by d.discipline) from (select distinct discipline from public.task_catalog where tenant_id=target_tenant and active)d),'[]')) into res;
 return res;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_related_command(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.work_order_related_receipts;source public.work_orders;task public.work_order_tasks;root public.work_order_tasks;line jsonb;
 target uuid;new_task uuid;amount numeric;actual numeric;transfer_mode boolean;result jsonb;reason text;source_id uuid;quote public.quotes;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_related_command');

 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot deze werkbonactie' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie en invoer zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 source_id:=(input->>'orderId')::uuid;
 select * into source from public.work_orders where tenant_id=target_tenant and id=source_id for update;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if source.version is distinct from (input->>'version')::bigint then raise exception 'De werkbon is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
 if command='material' then
  if source.status in ('invoice_ready','invoiced','cancelled') or source.archive_at is not null or exists(select 1 from public.signatures where tenant_id=target_tenant and work_order_id=source.id and report_version=source.report_version)
   or coalesce((input->>'customerVisible')::boolean,false) and to_jsonb(source)->>'report_state' in ('waiting_signature','review','approved') then raise exception 'Registreer verbruik vóór ondertekening en definitieve rapportcontrole' using errcode='23514';end if;
  if nullif(input->>'taskId','') is not null and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(input->>'taskId')::uuid) then raise exception 'Taak hoort niet bij deze werkbon' using errcode='23514';end if;
  if input ? 'unitPriceCents' or input ? 'costCents' then if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;end if;
  insert into public.work_order_material_usage(tenant_id,work_order_id,task_id,description,quantity,unit,customer_visible,created_by)
  values(target_tenant,source.id,nullif(input->>'taskId','')::uuid,input->>'description',(input->>'quantity')::numeric,input->>'unit',coalesce((input->>'customerVisible')::boolean,false),auth.uid()) returning id into target;
  if input ? 'unitPriceCents' or input ? 'costCents' then insert into private.work_order_material_finance values(target_tenant,target,(input->>'costCents')::bigint,(input->>'unitPriceCents')::bigint);end if;
  result:=jsonb_build_object('id',target);
 elsif command in ('split','followup','duplicate') then
  reason:=coalesce(input->>'reason','remainder');transfer_mode:=command='split' or(command='followup' and reason='remainder');
  if length(trim(coalesce(input->>'title',''))) not between 2 and 180 or length(coalesce(input->>'instructions',''))>2000 then raise exception 'Vul titel en geldige instructies in' using errcode='23514';end if;
  if command='followup' and reason not in ('remainder','repair','warranty','paid','inspection') then raise exception 'Kies een opvolgreden' using errcode='23514';end if;
  if transfer_mode and source.status='cancelled' then raise exception 'Een geannuleerde bon draagt geen nieuwe scope over' using errcode='23514';end if;
  if command='split' and exists(select 1 from public.work_order_relations where tenant_id=target_tenant and target_order_id=source.id and kind='split') then raise exception 'V1 ondersteunt één niveau deelbonnen. Gebruik een opvolgbon voor later restwerk.' using errcode='23514';end if;
  if command='followup' and reason='paid' then
   if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;
   select * into quote from public.quotes where tenant_id=target_tenant and id=(input->>'acceptedQuoteId')::uuid and customer_id=source.customer_id and object_id=source.object_id and status='accepted' and operation_id is null and archived_at is null;
   if quote.id is null then raise exception 'Kies een afzonderlijke geaccepteerde offerte voor dit betaalde vervolgwerk' using errcode='23514';end if;
   result:=public.commercial_command(target_tenant,gen_random_uuid(),'convert',jsonb_build_object('id',quote.id,'version',quote.version));
   target:=(result->>'operation_id')::uuid;
   update public.work_orders set title=input->>'title',description=coalesce(input->>'instructions',''),day_instructions=coalesce(input->>'instructions',''),requested_date=nullif(input->>'requestedDate','')::date,source_kind='followup' where id=target;
  else
   if jsonb_typeof(input->'tasks') is distinct from 'array' or jsonb_array_length(input->'tasks')>100 or(transfer_mode and jsonb_array_length(input->'tasks')=0) then raise exception 'Selecteer de over te nemen werkzaamheden' using errcode='23514';end if;
   if(select count(*) from jsonb_array_elements(input->'tasks'))<>(select count(distinct value->>'id') from jsonb_array_elements(input->'tasks')) then raise exception 'Selecteer iedere taak eenmaal' using errcode='23514';end if;
   target:=private.work_order_clone(target_tenant,source.id,input->>'title',coalesce(input->>'instructions',''),nullif(input->>'requestedDate','')::date,command,coalesce((input->>'copyTemplate')::boolean,true),coalesce((input->>'copyContacts')::boolean,true),coalesce((input->>'copyPersonnel')::boolean,false));
   if transfer_mode then update public.work_orders set request_id=source.request_id,quote_id=source.quote_id,commercial_terms=source.commercial_terms where id=target;end if;
   for line in select value from jsonb_array_elements(input->'tasks') loop
    select * into task from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(line->>'id')::uuid for update;
    if task.id is null then raise exception 'Taak hoort niet bij de bronwerkbon' using errcode='23514';end if;
    amount:=(line->>'quantity')::numeric;
    if amount is null or amount<=0 or amount<>round(amount,3) then raise exception 'Gebruik een positieve hoeveelheid met maximaal drie decimalen' using errcode='23514';end if;
    new_task:=gen_random_uuid();
    if transfer_mode then
     actual:=coalesce(task.executed_quantity,case when task.completed_at is not null then task.quantity else 0 end);
     if amount>task.quantity-actual-task.transferred_quantity-task.withdrawn_quantity then raise exception 'Alleen nog beschikbare resthoeveelheid kan worden overgedragen' using errcode='23514';end if;
     select * into root from public.work_order_tasks where tenant_id=target_tenant and id=task.scope_root_task_id;
     if root.is_extra_work and root.extra_work_status is distinct from 'approved' and not exists(select 1 from public.object_visit_requests r join public.object_request_proposals p on p.tenant_id=r.tenant_id and p.request_id=r.id where r.tenant_id=target_tenant and r.work_order_task_id=root.id and p.accepted_at is not null and not r.needs_review and p.quantity=root.quantity and p.price_cents=root.unit_price_cents and p.task_revision_id=root.task_revision_id)
      and not exists(select 1 from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where l.tenant_id=target_tenant and l.id=root.agreement_line_id and l.extra_work and a.evidence_document_id is not null) then raise exception 'Leg eerst passend akkoord op dit meerwerk vast' using errcode='23514';end if;
     insert into public.work_order_scope_transfers(tenant_id,source_task_id,target_task_id,target_order_id,quantity,reason,created_by) values(target_tenant,task.id,new_task,target,amount,reason,auth.uid());
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,agreement_line_id,commercial_snapshot,scope_root_task_id,instructions,added_by)
     values(new_task,target_tenant,target,root.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,root.unit_price_cents,root.vat_basis_points,root.is_extra_work,case when root.is_extra_work then 'approved' end,root.agreement_line_id,root.commercial_snapshot,root.id,task.instructions,auth.uid());
     update public.work_order_tasks set transferred_quantity=transferred_quantity+amount where id=task.id;
    else
     -- Independent duplication/repair does not copy a financial entitlement.
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by)
     values(new_task,target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,0,task.vat_basis_points,task.instructions,auth.uid());
    end if;
   end loop;
  end if;
  insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,command,reason,auth.uid());
  result:=jsonb_build_object('id',target);
 else raise exception 'Onbekende werkbonactie' using errcode='23514';end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||command,'work_order',source.id,jsonb_build_object('target_id',target,'reason',reason));
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),command,input,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_related_context(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source public.work_orders;can_finance boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_related_context');

 if not private.work_order_lineage_authorized(target_tenant) and not(private.object_session_active() and private.commercial_access(target_tenant)) then raise exception 'Geen toegang tot de gekoppelde werkbonnen' using errcode='42501';end if;
 select * into source from public.work_orders where tenant_id=target_tenant and id=target_order;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 can_finance:=private.commercial_access(target_tenant);
 return jsonb_build_object(
 'order',jsonb_build_object('id',source.id,'number',source.work_order_number,'title',source.title,'version',source.version,'status',source.status,'signatureMode',coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),'employeeSignatureRequired',source.employee_signature_required),
 'canManage',private.work_order_lineage_authorized(target_tenant),'canFinance',can_finance,
 'canSplit',source.status<>'cancelled' and not exists(select 1 from public.work_order_relations where tenant_id=target_tenant and target_order_id=source.id and kind='split'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',task_name,'unit',unit,'planned',quantity,'executed',coalesce(executed_quantity,case when completed_at is not null then quantity else 0 end),'transferred',transferred_quantity,'withdrawn',withdrawn_quantity,'available',greatest(0,quantity-coalesce(executed_quantity,case when completed_at is not null then quantity else 0 end)-transferred_quantity-withdrawn_quantity)) order by created_at,id) from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id),'[]'),
 'relations',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'title',w.title,'kind',r.kind,'reason',r.reason,'direction',case when r.target_order_id=source.id then 'source' else 'child' end) order by r.created_at) from public.work_order_relations r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=case when r.target_order_id=source.id then r.source_order_id else r.target_order_id end where r.tenant_id=target_tenant and(source.id=r.source_order_id or source.id=r.target_order_id)),'[]'),
 'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sourceTask',t.task_name,'targetOrder',w.id,'targetNumber',w.work_order_number,'quantity',x.quantity,'unit',t.unit,'createdAt',x.created_at) order by x.created_at) from public.work_order_scope_transfers x join public.work_order_tasks t on t.tenant_id=x.tenant_id and t.id=x.source_task_id join public.work_orders w on w.tenant_id=x.tenant_id and w.id=x.target_order_id where x.tenant_id=target_tenant and(t.work_order_id=source.id or x.target_order_id=source.id)),'[]'),
 'series',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'version',s.version,'definition',s.definition,'occurrences',coalesce((select jsonb_agg(jsonb_build_object('day',o.occurrence_on,'state',o.state,'reason',o.reason,'orderId',w.id,'number',w.work_order_number) order by o.occurrence_on) from public.work_order_occurrences o left join public.work_orders w on w.tenant_id=o.tenant_id and w.id=o.work_order_id where o.tenant_id=s.tenant_id and o.series_id=s.id),'[]'))) from public.work_order_series s where s.tenant_id=target_tenant and(s.source_order_id=source.id or exists(select 1 from public.work_order_occurrences o where o.tenant_id=s.tenant_id and o.series_id=s.id and o.work_order_id=source.id))),'[]'),
 'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id,'createdAt',m.created_at,'customerVisible',m.customer_visible)||case when can_finance then jsonb_build_object('unitPriceCents',f.unit_price_cents,'costCents',f.cost_cents) else '{}' end order by m.created_at) from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id where m.tenant_id=target_tenant and m.work_order_id=source.id),'[]'),
 'acceptedQuotes',case when can_finance then coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'number',q.quote_number,'title',q.subject)) from public.quotes q where q.tenant_id=target_tenant and q.customer_id=source.customer_id and q.object_id=source.object_id and q.status='accepted' and q.operation_id is null and q.archived_at is null),'[]') else '[]' end
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_report(target_work_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;can_review boolean;can_execute boolean;policy jsonb;
begin
 if not private.is_work_order_assignee((select tenant_id from public.work_orders where id=target_work_order_id),target_work_order_id) then
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.work_orders.read');
 perform private.management_assert((select tenant_id from public.work_orders where id=target_work_order_id),'backoffice.functions.work_order_report');
 end if;

 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.can_access_work_order(w.tenant_id,w.id) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen rapporttoegang' using errcode='42501';end if;
 can_review:=private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) and private.management_allowed(w.tenant_id,'backoffice.reports.write') and private.management_allowed(w.tenant_id,'backoffice.functions.review_work_order_report');
 can_execute:=private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 policy:=private.work_order_signature_policy(w);
 return jsonb_build_object('orderId',w.id,'orderVersion',w.version,'number',w.work_order_number,'state',w.report_state,'policy',policy,'canReview',can_review,
 'canEditPolicy',private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) and private.management_allowed(w.tenant_id,'backoffice.work_orders.write') and private.management_allowed(w.tenant_id,'backoffice.functions.change_work_order_signature_policy') and w.status not in ('cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction'),'configuredMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,
 'canSubmit',can_execute and w.status not in ('completed','cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction') and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'isDeliveryOwner',can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'draftSnapshot',case when can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then private.work_order_report_snapshot(w,'Uitgevoerde werkzaamheden') else null end,
 'activity',private.execution_activity(w.tenant_id,w.id,auth.uid()),
 'canCapture',can_execute and w.status not in ('completed','cancelled','approved','invoice_ready','invoiced') and w.report_state='waiting_signature' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id and (private.report_backoffice(w.tenant_id) or a.updated_by=auth.uid())),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(private.report_delivery(r) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null and (private.report_backoffice(w.tenant_id) or s.captured_by=auth.uid())),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_report_file(target_report_id uuid, asset_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.work_order_report_versions;w public.work_orders;signed_record public.signatures;a public.attachments;allowed boolean;backoffice boolean;staff boolean;
begin
 if not exists(select 1 from public.work_order_report_versions report_row join public.work_orders order_row on order_row.tenant_id=report_row.tenant_id and order_row.id=report_row.work_order_id where report_row.id=target_report_id and (private.is_work_order_assignee(order_row.tenant_id,order_row.id) or (report_row.state='approved' and private.customer_visit_access(order_row.tenant_id,order_row.object_id,order_row.id)))) then
 perform private.management_assert((select tenant_id from public.work_order_report_versions where id=target_report_id),'backoffice.work_orders.read');
 perform private.management_assert((select tenant_id from public.work_order_report_versions where id=target_report_id),'backoffice.functions.work_order_report_file');
 end if;

 select * into r from public.work_order_report_versions where id=target_report_id;
 select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id;
 backoffice:=private.report_backoffice(w.tenant_id);staff:=private.is_work_order_assignee(w.tenant_id,w.id);
 allowed:=backoffice or staff or(r.state='approved'
  and exists(select 1 from public.object_customer_bindings b where b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=auth.uid() and b.active)
  and exists(select 1 from public.customer_portal_accounts ca where ca.tenant_id=w.tenant_id and ca.customer_id=w.customer_id
   and ca.user_id=auth.uid() and private.customer_account_access(w.tenant_id,ca.id)));
 if r.id is null or not private.object_session_active() or not allowed or not private.service_enabled(w.tenant_id,'rapportage') or not exists(select 1 from public.tenants t where t.id=w.tenant_id and t.status='active') then raise exception 'Rapportbestand niet beschikbaar' using errcode='42501';end if;
 if asset_id is not null then
  select * into signed_record from public.signatures where tenant_id=r.tenant_id and report_id=r.id and id=asset_id and revoked_at is null;
  if found then
   if signed_record.signature_kind<>'customer' and not(backoffice or(staff and signed_record.captured_by=auth.uid())) then raise exception 'Ondertekening niet beschikbaar' using errcode='42501';end if;
   return jsonb_build_object('bucket','signatures','path',signed_record.storage_path,'name','handtekening.png','mime','image/png','sha256',signed_record.sha256,'scope',jsonb_build_array(r.tenant_id,w.id));
  end if;
  select * into a from public.attachments where tenant_id=r.tenant_id and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(private.report_snapshot_for_actor(r)->'attachments') x where x->>'id'=a.id::text and x->>'sha256'=a.sha256) then raise exception 'Bijlage niet beschikbaar in deze rapportweergave' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256,
   'scope',case when array_length(string_to_array(a.storage_path,'/'),1)=3 then jsonb_build_array(r.tenant_id,w.id)
     when a.storage_path like r.tenant_id::text||'/'||w.id::text||'/communication/%' then jsonb_build_array(r.tenant_id,w.id,'communication')
     else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end);
 end if;
 return private.report_delivery(r);
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_series_command(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.work_order_related_receipts;series public.work_order_series;source public.work_orders;task public.work_order_tasks;created public.work_orders;
 occurrence public.work_order_occurrences;day date;from_day date;until_day date;tz text;horizon integer;start_at timestamptz;end_at timestamptz;rule jsonb;result jsonb;
 target uuid;count_created integer:=0;count_skipped integer:=0;count_preserved integer:=0;serial_command text:='series.'||command;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_series_command');

 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot terugkerend werk' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie is verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>serial_command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if command='create' then
  select * into source from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
  if source.id is null then raise exception 'Bronwerkbon niet beschikbaar' using errcode='42501';end if;
  if source.version is distinct from(input->>'version')::bigint then raise exception 'De werkbon is gewijzigd' using errcode='40001';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and unit_price_cents>0) and not private.commercial_access(target_tenant) then raise exception 'Laat de financiële afspraken van de reeks door een bevoegde collega bevestigen' using errcode='42501';end if;
  if source.quote_id is not null and not exists(select 1 from public.quotes where tenant_id=target_tenant and id=source.quote_id and status='accepted' and work_kind='recurring') then raise exception 'Een eenmalige offerte wordt geen nieuwe periodieke prijsafspraak. Leg eerst de terugkerende afspraak vast.' using errcode='23514';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and(scope_root_task_id<>id or transferred_quantity>0 or is_extra_work)) then raise exception 'Gebruik oorspronkelijke reguliere werkzaamheden als basis voor een reeks' using errcode='23514';end if;
  rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
  insert into public.work_order_series(tenant_id,source_order_id,title,definition,timezone,created_by) values(target_tenant,source.id,input->>'title',rule,tz,auth.uid()) returning * into series;
  result:=jsonb_build_object('id',series.id);
 else
  select * into series from public.work_order_series where tenant_id=target_tenant and id=(input->>'seriesId')::uuid for update;
  if series.id is null then raise exception 'Reeks niet beschikbaar' using errcode='42501';end if;
  if series.version is distinct from(input->>'version')::bigint then raise exception 'De reeks is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
  select * into source from public.work_orders where tenant_id=target_tenant and id=series.source_order_id;
  tz:=series.timezone;
  if command='update' then
   rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
   update public.work_order_series set title=input->>'title',definition=rule,version=version+1 where id=series.id returning * into series;
   if coalesce((input->>'applyFuture')::boolean,false) then
    for occurrence in select * from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and state='generated' and occurrence_on>=(clock_timestamp() at time zone tz)::date for update loop
     select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
     if created.version=occurrence.generated_order_version and created.status='planned' and created.actual_start_at is null and created.projected_start_at is null
      and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=created.id and completed_at is not null)
      and not exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
     then
      if private.work_order_recurrence_matches(rule,occurrence.occurrence_on) then
       update public.work_orders set title=series.title,required_personnel=(rule->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',rule->>'startsAt','endsAt',rule->>'endsAt','timezone',tz)),version=version+1 where id=created.id returning * into created;
       update public.work_order_occurrences set series_version=series.version,generated_order_version=created.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      else
       update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
       update public.work_order_occurrences set state='skipped',reason='Niet meer in herhaalpatroon',series_version=series.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      end if;
     else count_preserved:=count_preserved+1;end if;
    end loop;
   end if;
   result:=jsonb_build_object('id',series.id,'preserved',count_preserved);
  elsif command='skip' then
   day:=(input->>'day')::date;
   if day is null or length(trim(coalesce(input->>'reason','')))<3 or not private.work_order_recurrence_matches(series.definition,day) then raise exception 'Kies een datum binnen de reeks en leg een reden vast' using errcode='23514';end if;
   select * into occurrence from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day for update;
   if occurrence.work_order_id is not null and occurrence.state<>'skipped' then
    select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
    if created.version<>occurrence.generated_order_version or created.status<>'planned' or created.actual_start_at is not null or created.projected_start_at is not null
     or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
    then raise exception 'Deze bon is gewijzigd of in uitvoering. Behandel de afspraak afzonderlijk via het dossier of planbord.' using errcode='23514';end if;
    update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
   end if;
   insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped',input->>'reason',series.version)
   on conflict(tenant_id,series_id,occurrence_on) do update set state='skipped',reason=excluded.reason;
   result:=jsonb_build_object('id',series.id);
  elsif command='generate' then
   if not series.active then raise exception 'Deze reeks is niet actief' using errcode='23514';end if;
   select least(26,greatest(1,coalesce(nullif(settings#>>'{planning,generation_horizon_weeks}','')::integer,6))) into horizon from public.tenant_settings where tenant_id=target_tenant;
   horizon:=coalesce(horizon,6);from_day:=(clock_timestamp() at time zone tz)::date;until_day:=from_day+horizon*7-1;
   for day in select d::date from generate_series(from_day::timestamp,until_day::timestamp,interval '1 day') d loop
    if not private.work_order_recurrence_matches(series.definition,day) then continue;end if;
    if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day) then continue;end if;
    start_at:=(day+(series.definition->>'startsAt')::time) at time zone tz;
    end_at:=(day+(series.definition->>'endsAt')::time) at time zone tz;
    if start_at at time zone tz<>day+(series.definition->>'startsAt')::time or end_at at time zone tz<>day+(series.definition->>'endsAt')::time then
     insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped','Tijd bestaat niet door overgang naar zomertijd',series.version);
     count_skipped:=count_skipped+1;continue;
    end if;
    if source.quote_id is not null then
     -- The existing conversion retains accepted lines, period prices and evidence.
     target:=public.commercial_next_visit(target_tenant,source.quote_id,day,gen_random_uuid());
     select * into created from public.work_orders where tenant_id=target_tenant and id=target;
     if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and work_order_id=target) then raise exception 'Dit bezoek hoort al bij een andere reeks' using errcode='23514';end if;
    else
     target:=private.work_order_clone(target_tenant,source.id,series.title,source.day_instructions,day,'recurrence',true,true,true);
     -- Snapshot each new occurrence at its own commercial date. A contract task
     -- uses actual occurrence timestamps while it is copied, then awaits planning.
     update public.work_orders set planned_start_at=start_at,planned_end_at=end_at,projected_start_at=start_at,projected_end_at=end_at,commercial_terms=source.commercial_terms where id=target;
     for task in select * from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id order by created_at,id loop
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by)
      values(target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,task.quantity,task.unit,task.unit_price_cents,task.vat_basis_points,task.agreement_line_id,auth.uid());
     end loop;
     update public.work_orders set planned_start_at=null,planned_end_at=null,projected_start_at=null,projected_end_at=null where id=target;
     select * into created from public.work_orders where id=target;
    end if;
    -- Do not rewrite a visit that was previously created or planned manually.
    if created.status='planned' and created.projected_start_at is null and created.actual_start_at is null and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=target) then
     update public.work_orders set required_personnel=(series.definition->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',series.definition->>'startsAt','endsAt',series.definition->>'endsAt','timezone',tz,'start',start_at,'end',end_at)),version=version+1 where id=target returning * into created;
    end if;
    insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,work_order_id,state,series_version,generated_order_version) values(target_tenant,series.id,day,target,'generated',series.version,created.version);
    if target<>source.id then insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,'recurrence',day::text,auth.uid()) on conflict(tenant_id,target_order_id) do nothing;end if;
    count_created:=count_created+1;
   end loop;
   result:=jsonb_build_object('id',series.id,'created',count_created,'skipped',count_skipped,'until',until_day);
  else raise exception 'Onbekende reeksactie' using errcode='23514';end if;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||serial_command,'work_order',source.id,result);
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),serial_command,input,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_signature_settings(target_tenant uuid, target_object uuid DEFAULT NULL::uuid, input jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg jsonb;mode text;employee boolean;waivers boolean;users jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_signature_settings');

 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot ondertekeninstellingen' using errcode='42501';end if;
 if target_object is not null and not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object) then raise exception 'Object niet beschikbaar' using errcode='42501';end if;
 if input is not null then
  perform private.management_assert(target_tenant,case when target_object is null then 'backoffice.settings.write' else 'backoffice.objects.write' end);
  if not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan ondertekeninstellingen wijzigen' using errcode='42501';end if;
  mode:=input->>'mode';employee:=coalesce((input->>'employeeRequired')::boolean,false);waivers:=coalesce((input->>'allowWaivers')::boolean,false);users:=coalesce(input->'waiverUsers','[]');
  if mode is null or mode not in ('none','optional','required','inherit') or(target_object is null and mode='inherit') then raise exception 'Kies een ondertekeninstelling' using errcode='23514';end if;
  if jsonb_typeof(users)<>'array' or exists(select 1 from jsonb_array_elements_text(users)u where not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=u::uuid and m.status='active' and m.roles&&array['tenant_admin','management','finance']::public.app_role[])) then raise exception 'Kies bevoegde gebruikers voor gemotiveerde klantvrijstellingen' using errcode='23514';end if;
  if target_object is not null then update public.objects set signature_mode=mode where tenant_id=target_tenant and id=target_object;
  else update public.tenant_settings set signature_required_default=mode='required',settings=jsonb_set(settings,'{workOrders}',coalesce(settings->'workOrders','{}')||jsonb_build_object('signatureMode',mode,'employeeSignatureRequired',employee,'allowSignatureWaivers',waivers,'signatureWaiverUsers',users)) where tenant_id=target_tenant;end if;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'signature_policy.settings',case when target_object is null then 'tenant' else 'object' end,coalesce(target_object,target_tenant),jsonb_build_object('mode',mode,'employeeRequired',employee,'allowWaivers',waivers));
 end if;
 select s.settings->'workOrders' into cfg from public.tenant_settings s where tenant_id=target_tenant;
 if target_object is not null then select signature_mode into mode from public.objects where tenant_id=target_tenant and id=target_object;
 else select coalesce(cfg->>'signatureMode',case when signature_required_default then 'required' else 'none' end) into mode from public.tenant_settings where tenant_id=target_tenant;end if;
 return jsonb_build_object('mode',mode,'employeeRequired',coalesce((cfg->>'employeeSignatureRequired')::boolean,false),'allowWaivers',coalesce((cfg->>'allowSignatureWaivers')::boolean,false),'waiverUsers',coalesce(cfg->'signatureWaiverUsers','[]'),
 'affectedDrafts',(select count(*) from public.work_orders where tenant_id=target_tenant and status='planned' and signature_policy_snapshot is null and (target_object is null or object_id=target_object)),
 'canManage',private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) and private.management_allowed(target_tenant,case when target_object is null then 'backoffice.settings.write' else 'backoffice.objects.write' end),
 'reviewers',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email,'Beheerder'))) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','finance']::public.app_role[]),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_task_context(target_tenant uuid, target_task uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task public.work_order_tasks;work public.work_orders;
begin
 if not private.is_work_order_assignee(target_tenant,(select work_order_id from public.work_order_tasks where tenant_id=target_tenant and id=target_task)) then
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_task_context');
 end if;

 select * into task from public.work_order_tasks where tenant_id=target_tenant and id=target_task;
 select * into work from public.work_orders where tenant_id=target_tenant and id=task.work_order_id;
 if task.id is null or not private.object_session_active() or not private.object_visit_access(target_tenant,work.object_id,work.id)
 or not((private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.read') and private.management_allowed(target_tenant,'backoffice.functions.work_order_task_context')) or private.is_work_order_assignee(target_tenant,work.id)) then raise exception 'Geen actuele taaktoegang' using errcode='42501';end if;
 return jsonb_build_object('assignedPersonnelId',case when (private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.read') and private.management_allowed(target_tenant,'backoffice.functions.work_order_task_context')) or task.assigned_personnel_id=private.current_personnel_id(target_tenant) then task.assigned_personnel_id end,'canAssign',private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.assign_work_order_task'),
 'crew',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id) from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id where a.tenant_id=target_tenant and a.work_order_id=work.id and a.status not in ('cancelled','returned') and p.status='active' and ((private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.read') and private.management_allowed(target_tenant,'backoffice.functions.work_order_task_context')) or p.user_id=auth.uid())),'[]'),
 'contributions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'actor',coalesce(p.full_name,'Medewerker'),'recordedAt',c.recorded_at,'fromQuantity',c.from_quantity,'toQuantity',c.to_quantity,'result',c.result,'note',c.note) order by c.execution_version desc) from public.work_order_task_contributions c left join public.personnel p on p.user_id=c.actor_id and p.tenant_id=c.tenant_id where c.tenant_id=target_tenant and c.task_id=task.id and ((private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.read') and private.management_allowed(target_tenant,'backoffice.functions.work_order_task_context')) or c.actor_id=auth.uid())),'[]'));
end $function$
;
CREATE OR REPLACE FUNCTION public.work_order_template_command(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.work_order_template_versions;t public.work_order_templates;prior private.work_order_commands;hash text;r jsonb;question jsonb;condition_question jsonb;ids text[]:='{}'::text[]; item jsonb;next_version int;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_template_command');

 if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]) or not private.service_enabled(target_tenant,'planning') then raise exception 'Geen toegang tot werkbontemplates' using errcode='42501';end if;
 if command_id is null or command is null or command not in ('save','publish','archive','copy') or jsonb_typeof(input) is distinct from 'object' then raise exception 'Ongeldige templateactie' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=command_id;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'template:'||command,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into v from public.work_order_template_versions where tenant_id=target_tenant and id=nullif(input->>'revisionId','')::uuid for update;
 if nullif(input->>'revisionId','') is not null and v.id is null then raise exception 'Templateversie niet gevonden' using errcode='42501';end if;
 if v.id is not null and (input->>'editVersion')::bigint is distinct from v.edit_version then raise exception 'Deze template is intussen gewijzigd. Laad de actuele versie opnieuw.' using errcode='40001';end if;
 if command in ('publish','archive') then
   if v.id is null then raise exception 'Templateversie niet gevonden' using errcode='42501';end if;
   if command='publish' and v.state<>'draft' then raise exception 'Alleen een concept kan worden gepubliceerd' using errcode='23514';end if;
   select * into t from public.work_order_templates where id=v.template_id;
   if command='publish' then
    if t.kind='work_order' and jsonb_array_length(coalesce(v.definition->'tasks','[]'))=0 then raise exception 'Voeg minimaal één taak toe' using errcode='23514';end if;
    if t.kind='checklist' and jsonb_array_length(coalesce(v.definition->'questions','[]'))=0 then raise exception 'Voeg minimaal één controlevraag toe' using errcode='23514';end if;
   end if;
   update public.work_order_template_versions set state=case when command='publish' then 'published' else 'archived' end,published_at=case when command='publish' then clock_timestamp() else published_at end,edit_version=edit_version+1 where id=v.id;
 else
   if jsonb_typeof(input->'definition') is distinct from 'object' or length(btrim(coalesce(input->>'name',''))) not between 2 and 180 or coalesce(input->>'kind','') not in ('work_order','checklist') then raise exception 'Controleer naam en templategegevens' using errcode='23514';end if;
   if (input->'definition'->'signatureMode',input->'definition'->'employeeSignatureRequired') is distinct from (v.definition->'signatureMode',v.definition->'employeeSignatureRequired') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt ondertekeninstellingen in templates' using errcode='42501';end if;
   if input->'definition' ? 'signatureMode' and coalesce(input->'definition'->>'signatureMode','') not in ('none','optional','required') or input->'definition' ? 'employeeSignatureRequired' and jsonb_typeof(input->'definition'->'employeeSignatureRequired') is distinct from 'boolean' then raise exception 'Controleer de ondertekeninstellingen van de template' using errcode='23514';end if;
   if jsonb_typeof(coalesce(input->'definition'->'questions','[]')) is distinct from 'array' or jsonb_typeof(coalesce(input->'definition'->'tasks','[]')) is distinct from 'array' or jsonb_typeof(coalesce(input->'definition'->'checklistRevisionIds','[]')) is distinct from 'array' then raise exception 'Templateonderdelen moeten lijsten zijn' using errcode='23514';end if;
   if jsonb_array_length(coalesce(input->'definition'->'questions','[]'))>100 or jsonb_array_length(coalesce(input->'definition'->'tasks','[]'))>100 then raise exception 'Maximaal 100 regels per template' using errcode='23514';end if;
   for question in select * from jsonb_array_elements(coalesce(input->'definition'->'questions','[]')) loop
    if coalesce(question->>'id','')='' or (question->>'id')=any(ids) or length(btrim(coalesce(question->>'label','')))<2 or coalesce(question->>'type','') not in ('check','boolean','choice','text','number','photo') then raise exception 'Controleer de checklistvragen; handtekeningen zijn geen checklistvraag' using errcode='23514';end if;
    if question ? 'condition' then
     if jsonb_typeof(question->'condition') is distinct from 'object' or not(coalesce(question->'condition'->>'questionId','')=any(ids)) or coalesce(jsonb_typeof(question->'condition'->'equals'),'') not in ('string','boolean') then raise exception 'Een voorwaarde bevat een geldig antwoord op een eerdere vraag' using errcode='23514';end if;
     select x into condition_question from jsonb_array_elements(input->'definition'->'questions')x where x->>'id'=question->'condition'->>'questionId';
     if condition_question->>'type' not in ('check','boolean','choice') or condition_question->>'type' in ('check','boolean') and jsonb_typeof(question->'condition'->'equals')<>'boolean' or condition_question->>'type'='choice' and (jsonb_typeof(question->'condition'->'equals')<>'string' or not(condition_question->'options' ? (question->'condition'->>'equals'))) then raise exception 'De voorwaarde past niet bij het eerdere antwoordtype' using errcode='23514';end if;
    end if;
    if question->>'type'='choice' then
     if jsonb_typeof(question->'options') is distinct from 'array' then raise exception 'Voeg antwoordopties toe' using errcode='23514';end if;
     if jsonb_array_length(question->'options') not between 1 and 30 or exists(select 1 from jsonb_array_elements(question->'options')option where jsonb_typeof(option)<>'string' or length(btrim(option#>>'{}')) not between 1 and 200) then raise exception 'Voeg geldige antwoordopties toe' using errcode='23514';end if;
    end if;
    ids:=array_append(ids,question->>'id');
   end loop;
   for item in select * from jsonb_array_elements(coalesce(input->'definition'->'tasks','[]')) loop
    if not exists(select 1 from public.task_revisions r join public.task_catalog c on c.tenant_id=r.tenant_id and c.id=r.task_id where r.tenant_id=target_tenant and r.id=(item->>'revisionId')::uuid and c.active) or (item->>'quantity') is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Een template bevat een ongeldige catalogustaak' using errcode='23514';end if;
   end loop;
   for item in select * from jsonb_array_elements(coalesce(input->'definition'->'checklistRevisionIds','[]')) loop
    if not exists(select 1 from public.work_order_template_versions r join public.work_order_templates c on c.id=r.template_id where r.tenant_id=target_tenant and r.id=(item#>>'{}')::uuid and c.kind='checklist' and r.state='published') then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
   end loop;
   if v.id is not null and v.state='draft' and command<>'copy' then
     select * into t from public.work_order_templates where id=v.template_id;
     if t.kind<>input->>'kind' then raise exception 'Het type template kan niet worden gewijzigd' using errcode='23514';end if;
     update public.work_order_templates set name=btrim(input->>'name') where id=t.id;
     update public.work_order_template_versions set definition=input->'definition',edit_version=edit_version+1 where id=v.id;
   else
     if v.id is not null and command<>'copy' then select * into t from public.work_order_templates where id=v.template_id;
     else insert into public.work_order_templates(tenant_id,name,kind,created_by) values(target_tenant,btrim(input->>'name'),input->>'kind',auth.uid()) returning * into t;end if;
     select coalesce(max(version),0)+1 into next_version from public.work_order_template_versions where template_id=t.id;
     insert into public.work_order_template_versions(tenant_id,template_id,version,definition,created_by) values(target_tenant,t.id,next_version,input->'definition',auth.uid()) returning * into v;
   end if;
 end if;
 r:=jsonb_build_object('ok',true,'id',v.id,'version',v.version);
 insert into private.work_order_commands values(command_id,target_tenant,auth.uid(),'template:'||command,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_template.'||command,'work_order_template',v.id,jsonb_build_object('version',v.version));
 return r;
end $function$
;

create function private.management_table_allowed(t uuid,resource text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare module text;
begin
 if not private.management_is_managed(t,auth.uid()) then return true;end if;
 if not writing and resource in ('task_revisions','work_order_tasks','work_orders','work_order_expenses','work_order_report_versions') and not private.management_allowed(t,'backoffice.finance.read') then return false;end if;
 if not writing and resource in ('object_request_proposals','object_history','customer_agreements','customer_agreement_lines') and not(private.management_allowed(t,'backoffice.finance.read') or private.management_allowed(t,'backoffice.commercial.read')) then return false;end if;
 if resource='dossier_documents' then return not writing;end if;
 if resource='staff_workspace_revisions' then return private.actor_session_active() and private.management_has(t,auth.uid(),'backoffice.access') and not writing;end if;
 if resource='staff_day_reviews' then return private.management_allowed(t,'backoffice.personnel.'||case when writing then 'write' else 'read' end);end if;
 if resource in ('tenant_branding','tenant_settings') and not writing then return private.actor_session_active() and private.management_has(t,auth.uid(),'backoffice.access');end if;
 if resource in ('tenant_memberships','tenant_admin_invitations','permission_grants','audit_events') then return private.actor_session_active() and private.management_has(t,auth.uid(),'management.users.read') and (not writing or private.management_has(t,auth.uid(),'management.users.manage'));end if;
 if resource in ('personnel_contracts','personnel_documents','personnel_notes','dossier_documents','personnel_dossier_items','personnel_dossier_history','personnel_dossier_access','personnel_dossier_deliveries','certificates') and not private.management_allowed(t,'backoffice.personnel.sensitive') then return false;end if;
 if resource like 'ticket%' or resource in ('notifications','push_subscriptions') then return true;end if;
 select v.module into module from (values ('customers','customers'),('customer_contacts','customers'),('customer_documents','customers'),('customer_notes','customers'),('customer_agreements','customers'),('customer_agreement_lines','customers'),('customer_portal_accounts','customers'),('customer_portal_revisions','customers'),('objects','objects'),('object_documents','objects'),('object_history','objects'),('object_records','objects'),('object_nodes','objects'),('object_customer_bindings','objects'),('object_reminder_recipients','objects'),('object_visit_requests','objects'),('object_request_proposals','objects'),('object_request_receipts','objects'),('object_instruction_receipts','objects'),('requests','commercial'),('quotes','commercial'),('commercial_attachments','commercial'),('commercial_events','commercial'),('booking_options','commercial'),('appointment_slots','commercial'),('commercial_billing_periods','finance'),('task_catalog','tasks'),('task_categories','tasks'),('task_revisions','tasks'),('extra_work_rules','tasks'),('personnel','personnel'),('function_catalog','personnel'),('personnel_functions','personnel'),('qualifications','personnel'),('qualification_types','personnel'),('qualification_requirements','personnel'),('certificates','personnel'),('availability','personnel'),('personnel_contracts','personnel'),('personnel_documents','personnel'),('personnel_notes','personnel'),('dossier_documents','personnel'),('personnel_dossier_items','personnel'),('personnel_dossier_history','personnel'),('personnel_dossier_access','personnel'),('personnel_dossier_deliveries','personnel'),('staff_leave_entitlements','personnel'),('staff_leave_requests','personnel'),('staff_time_correction_requests','personnel'),('invoices','finance'),('invoice_lines','finance'),('invoice_sequences','finance'),('invoice_groups','finance'),('invoice_group_items','finance'),('payment_attempts','finance'),('payment_allocations','finance'),('announcements','news'),('announcement_reads','news'),('reminders','followup'),('planning_changes','planning'),('travel_depots','settings'),('personnel_travel_days','planning'),('tenant_settings','settings'),('tenant_branding','settings'),('tenant_message_templates','settings'),('tenant_message_template_revisions','settings'),('tenant_domains','settings'),('tenant_provider_connections','settings'),('work_orders','work_orders'),('work_order_assignments','planning'),('dispatches','planning'),('open_shifts','planning'),('shift_interests','planning'),('time_entries','personnel'),('travel_legs','planning'),('status_events','work_orders'),('report_entries','reports'),('attachments','reports'),('signatures','reports'),('review_decisions','reports'))v(resource,module) where v.resource=management_table_allowed.resource;
 if module is null and resource like 'work_order%' then module:='work_orders';end if;
 if module is null then return false;end if;
 return private.management_allowed(t,'backoffice.'||module||case when writing then '.write' else '.read' end);
end$$;
create function private.management_membership_write(t uuid,member_roles public.app_role[]) returns boolean language sql stable security definer set search_path='' as $$
 select not private.management_is_managed(t,auth.uid()) or (member_roles=array['staff']::public.app_role[] and private.management_allowed(t,'backoffice.personnel.write'))
$$;
revoke all on function private.management_membership_write(uuid,public.app_role[]) from public,anon,service_role;
grant execute on function private.management_membership_write(uuid,public.app_role[]) to authenticated;
do $policies$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped) loop
  if t.relname='tenant_memberships' then
   execute 'create policy management_read on public.tenant_memberships as restrictive for select to authenticated using (user_id=auth.uid() or private.management_table_allowed(tenant_id,''tenant_memberships'',false))';
  else
   execute format('create policy management_read on public.%I as restrictive for select to authenticated using (private.management_table_allowed(tenant_id,%L,false))',t.relname,t.relname);
  end if;
  if t.relname='tenant_memberships' then
   execute 'create policy management_insert on public.tenant_memberships as restrictive for insert to authenticated with check (private.management_membership_write(tenant_id,roles))';
   execute 'create policy management_update on public.tenant_memberships as restrictive for update to authenticated using (private.management_membership_write(tenant_id,roles)) with check (private.management_membership_write(tenant_id,roles))';
   execute 'create policy management_delete on public.tenant_memberships as restrictive for delete to authenticated using (private.management_membership_write(tenant_id,roles))';
   continue;
  end if;
  execute format('create policy management_insert on public.%I as restrictive for insert to authenticated with check (private.management_table_allowed(tenant_id,%L,true))',t.relname,t.relname);
  execute format('create policy management_update on public.%I as restrictive for update to authenticated using (private.management_table_allowed(tenant_id,%L,true)) with check (private.management_table_allowed(tenant_id,%L,true))',t.relname,t.relname,t.relname);
  execute format('create policy management_delete on public.%I as restrictive for delete to authenticated using (private.management_table_allowed(tenant_id,%L,true))',t.relname,t.relname);
 end loop;
end$policies$;
-- Private helpers may be invoked by RLS but tables stay inaccessible.
revoke all on function private.management_seed(uuid),private.management_has(uuid,uuid,text),private.management_is_managed(uuid,uuid),private.management_allowed(uuid,text),private.management_assert(uuid,text),private.management_fresh_owner(uuid),private.management_member_initialize(),private.management_last_owner(),private.management_table_allowed(uuid,text,boolean) from public,anon,service_role;
grant execute on function private.management_allowed(uuid,text),private.management_table_allowed(uuid,text,boolean) to authenticated;
grant execute on function private.management_assert(uuid,text) to authenticated;

-- Storage downloads/uploads are checked separately from page visibility.
CREATE OR REPLACE FUNCTION private.can_access_storage_object(bucket text, object_name text, write_access boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=private.storage_tenant_id(object_name); w uuid:=private.storage_subject_id(object_name);
begin
 if private.management_is_managed(t,auth.uid()) and not(bucket='branding' and not write_access) and not(bucket='personnel-documents' and not write_access and w=private.current_personnel_id(t)) and not(bucket='reports' and private.is_work_order_assignee(t,w) and private.owns_report_path(t,w,object_name)) and not private.management_allowed(t,case bucket when 'branding' then 'backoffice.settings.' when 'invoices' then 'backoffice.finance.' when 'personnel-documents' then 'backoffice.personnel.' when 'reports' then 'backoffice.reports.' when 'signatures' then 'backoffice.reports.' else 'backoffice.objects.' end||case when write_access then 'write' else 'read' end) then return false;end if;

 if t is null then return false;end if;
 if bucket='branding' then
   if write_access then return private.has_role(t,array['tenant_admin','management']::public.app_role[]);end if;
   return private.is_member(t);
 end if;
 if w is null then return false;end if;
 if bucket in ('reports','signatures') then
   if private.has_role(t,array['tenant_admin','management','planner']::public.app_role[]) and private.management_allowed(t,'backoffice.reports.'||case when write_access then 'write' else 'read' end) then return true;end if;
   if bucket<>'reports' or not private.is_work_order_assignee(t,w) or not private.owns_report_path(t,w,object_name) then return false;end if;
   if not write_access then return true;end if;
   return exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.status in ('seen','travelling','in_progress','correction_required'));
 elsif bucket='invoices' then
   return private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]);
 elsif bucket='personnel-documents' then
   if private.has_role(t,array['tenant_admin','management','hr']::public.app_role[]) and private.management_allowed(t,'backoffice.personnel.sensitive') then return true;end if;
   return not write_access and w=private.current_personnel_id(t)
     and exists(select 1 from public.personnel_documents d where d.tenant_id=t
       and d.personnel_id=w and d.storage_path=object_name and d.visible_to_employee and not d.dossier_managed);
 end if;
 return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customer_portal_bind(target_tenant uuid, target_customer uuid, target_user uuid, target_contact uuid, expected_version bigint, can_create boolean, can_edit_objects boolean, can_edit_profile boolean, enabled boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.customer_portal_accounts;
begin
 perform private.management_assert(target_tenant,'backoffice.customers.write');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_portal_bind');

 if not private.customer_portal_manage(target_tenant) then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.customer_portal_manage(target_tenant) then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 if expected_version is null or expected_version<0 then
  raise exception 'Een actuele klantaccountversie is verplicht' using errcode='40001';
 end if;
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status not in ('inactive','archived','draft'))
 or not exists(select 1 from auth.users u where u.id=target_user and u.deleted_at is null and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<clock_timestamp()))
 or not exists(select 1 from public.customer_contacts c where c.tenant_id=target_tenant and c.id=target_contact and c.customer_id=target_customer and c.active)
 then raise exception 'Kies een actief account en een contact van deze klant' using errcode='23514';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and customer_id=target_customer and user_id=target_user for update;
 if (a.id is null and expected_version<>0) or(a.id is not null and a.version<>expected_version)
 then raise exception 'Het klantaccount is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
 if a.id is null then
  insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,can_create_objects,can_edit_objects,can_edit_profile,created_by)
  values(target_tenant,target_customer,target_user,target_contact,enabled,can_create,can_edit_objects,can_edit_profile,auth.uid()) returning * into a;
 else
  update public.customer_portal_accounts set contact_id=target_contact,active=enabled,can_create_objects=can_create,
   can_edit_objects=customer_portal_bind.can_edit_objects,can_edit_profile=customer_portal_bind.can_edit_profile,
   version=version+1,updated_at=clock_timestamp() where id=a.id returning * into a;
 end if;
 if not enabled then
  update public.object_customer_bindings b set active=false,version=b.version+1
  from public.objects o where b.tenant_id=target_tenant and b.user_id=target_user and b.active and o.tenant_id=b.tenant_id and o.id=b.object_id and o.customer_id=target_customer;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
 values(target_tenant,auth.uid(),'customer.portal_binding','customer',target_customer,jsonb_build_object('accountId',a.id,'active',enabled,'canCreateObjects',can_create,'canEditObjects',can_edit_objects,'canEditProfile',can_edit_profile));
 return a.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.customer_portal_management(target_tenant uuid, target_customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_portal_management');

 if not private.customer_portal_manage(target_tenant) or not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer)
 then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'userId',a.user_id,'email',u.email,'contactId',a.contact_id,
  'active',a.active,'canCreateObjects',a.can_create_objects,'canEditObjects',a.can_edit_objects,'canEditProfile',a.can_edit_profile,
  'version',a.version,'onboardingCompletedAt',a.onboarding_completed_at) order by a.created_at,a.id)
  from public.customer_portal_accounts a join auth.users u on u.id=a.user_id
  where a.tenant_id=target_tenant and a.customer_id=target_customer),'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.object_visit_context(target_tenant uuid, target_object uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;ctx jsonb;
begin
 if not private.management_concrete_visit_access(target_tenant,target_object,target_order) then
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_visit_context');
 end if;

 if not (private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.read') and private.management_allowed(target_tenant,'backoffice.functions.object_visit_context'))
 and not exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active) then
  ctx:=private.object_vault_context(target_tenant,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,target_object,target_order,null);
  if ctx is null or not exists(select 1 from private.object_access_grants g
    where g.tenant_id=target_tenant and g.actor_id=auth.uid() and g.session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and g.object_id=target_object and g.order_id=target_order and g.item_id is null
    and g.fingerprint=ctx->>'fingerprint' and g.revoked_at is null and g.expires_at>clock_timestamp()) then
   raise exception 'Bevestig dossierinzage met een e-mailcode' using errcode='42501';
  end if;
 end if;
 v:=private.object_visit_projection(target_tenant,target_object,target_order);
 if not(v->>'manager')::boolean then v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(r-'review_note') from jsonb_array_elements(v->'requests') r),'[]'));end if;
 if not(v->>'customer')::boolean and not (private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]) and (not private.management_is_managed(target_tenant,auth.uid()) or private.management_has(target_tenant,auth.uid(),'backoffice.finance.read') or private.management_has(target_tenant,auth.uid(),'backoffice.commercial.read'))) then
 v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(jsonb_set(r,'{proposals}',coalesce((select jsonb_agg(p-array['price_cents','vat_basis_points','total_cents']) from jsonb_array_elements(coalesce(r->'proposals','[]'))p),'[]'))) from jsonb_array_elements(v->'requests')r),'[]'));
 end if;return v;
end $function$
;
CREATE OR REPLACE FUNCTION public.object_visit_signals(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;c jsonb;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.work_orders where tenant_id=target_tenant and id=target_order),target_order) then
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_visit_signals');
 end if;

 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if w.id is null or not private.object_visit_access(target_tenant,w.object_id,w.id) then return null;end if;
 c:=public.object_visit_context(target_tenant,w.object_id,w.id);
 return jsonb_build_object('instructions',(select count(*) from jsonb_array_elements(c->'instructions') r where not (r->>'read')::boolean),'requests',(select count(*) from jsonb_array_elements(c->'requests') r where not (r->>'read')::boolean),'review',(select count(*) from jsonb_array_elements(c->'requests') r where (r->>'needs_review')::boolean));
end $function$
;
CREATE OR REPLACE FUNCTION public.get_object_document(target_tenant uuid, target_document uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.object_documents;
  manager boolean;
  customer boolean;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.object_documents where tenant_id=target_tenant and id=target_document),target_order) then
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.get_object_document');
 end if;

  if not private.object_session_active() then
    return null;
  end if;

  select * into d
  from public.object_documents
  where tenant_id=target_tenant and id=target_document;

  if d.id is null then
    return null;
  end if;

  manager:=(private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.read') and private.management_allowed(target_tenant,'backoffice.functions.get_object_document'));
  customer:=exists(
    select 1
    from public.object_customer_bindings b
    where b.tenant_id=target_tenant
      and b.object_id=d.object_id
      and b.user_id=auth.uid()
      and b.active
  );

  if d.category='security' then
    if not manager or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) or not private.management_allowed(target_tenant,'backoffice.objects.secrets.read') then
      return null;
    end if;
  elsif not manager then
    if d.work_order_id is not null and d.work_order_id is distinct from target_order then
      return null;
    end if;
    if not private.object_visit_access(target_tenant,d.object_id,target_order) then
      return null;
    end if;
    if customer and (
      d.request_id is null
      or not exists(
        select 1
        from public.object_visit_requests r
        where r.tenant_id=target_tenant
          and r.id=d.request_id
          and r.object_id=d.object_id
          and r.work_order_id=target_order
          and r.created_by=auth.uid()
      )
    ) then
      return null;
    end if;
  end if;

  return jsonb_build_object(
    'path',d.storage_path,
    'name',d.file_name,
    'mime',d.mime_type,
    'title',d.title,
    'scope',jsonb_build_array(d.tenant_id,d.object_id)
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.customer_extra_agreements(target_tenant uuid, target_object uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.customers.read');
 perform private.management_assert(target_tenant,'backoffice.functions.customer_extra_agreements');

 return (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',a.title,'version',a.version,'scope',l.scope,'priceCents',l.price_cents,'limitCents',l.limit_cents,'quantity',l.quantity)), '[]')
 from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id
 where a.tenant_id=target_tenant and l.object_id=target_object and a.state='active' and l.extra_work and l.price_basis='visit' and private.commercial_access(target_tenant));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.customer_object_visits(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

 if not private.object_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'manageSecrets',b.manage_secrets,
  'visits',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) order by w.projected_start_at desc nulls last)
   from public.work_orders w where w.tenant_id=target_tenant and w.object_id=o.id and private.customer_visit_access(target_tenant,o.id,w.id)),'[]')) order by o.name)
  from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id
  where b.tenant_id=target_tenant and b.user_id=auth.uid() and b.active
   and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=target_tenant and a.customer_id=o.customer_id
    and a.user_id=auth.uid() and private.customer_account_access(target_tenant,a.id))),'[]');
end $function$
;
CREATE OR REPLACE FUNCTION public.submit_object_visit_request(target_tenant uuid, target_object uuid, target_order uuid, request_id uuid, input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;r public.object_visit_requests;
begin
 if not private.management_concrete_visit_access(target_tenant,target_object,target_order) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.submit_object_visit_request');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_visit_access(target_tenant,target_object,target_order) or target_order is null or request_id is null then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=target_object for update;
 if w.status not in ('planned','released','seen','travelling','in_progress') then raise exception 'Deze afspraak is afgesloten. Vraag om een nieuwe vervolgafspraak.' using errcode='23514';end if;
 select * into r from public.object_visit_requests where id=request_id;
 if found then
  if r.tenant_id<>target_tenant or r.object_id<>target_object or r.work_order_id<>target_order or r.created_by<>auth.uid() then raise exception 'Ongeldige verzoekreferentie' using errcode='42501';end if;
  return r.id;
 end if;
 insert into public.object_visit_requests(id,tenant_id,object_id,work_order_id,node_id,title,body,kind,priority,feedback)
 values(request_id,target_tenant,target_object,target_order,nullif(input->>'nodeId','')::uuid,input->>'title',input->>'body',input->>'kind',coalesce(input->>'priority','normal'),coalesce(input->>'feedback',''));
 perform private.object_notify(target_tenant,target_object,target_order,'request:'||request_id::text);
 return request_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.update_object_visit_request(target_tenant uuid, target_request uuid, expected_version bigint, input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_visit_requests;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request),(select work_order_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request)) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.update_object_visit_request');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) or (r.created_by<>auth.uid() and not (private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.write') and private.management_allowed(target_tenant,'backoffice.functions.update_object_visit_request'))) then raise exception 'Geen toegang' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Dit verzoek is intussen gewijzigd' using errcode='40001';end if;
 if r.work_order_task_id is not null then raise exception 'Er is al een uitvoeringstaak. Maak een afzonderlijk vervolgverzoek voor gewijzigde scope.' using errcode='23514';end if;
 update public.object_visit_requests set title=input->>'title',body=input->>'body',node_id=nullif(input->>'nodeId','')::uuid,kind=input->>'kind',priority=coalesce(input->>'priority','normal'),feedback=coalesce(input->>'feedback',''),needs_review=true,state='review',review_note='Het verzoek is gewijzigd; beoordeel de nieuwe versie.' where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'request-version:'||r.id::text||':'||(r.version+1)::text);
end $function$
;
CREATE OR REPLACE FUNCTION public.acknowledge_object_instruction(target_tenant uuid, target_order uuid, target_record uuid, expected_version bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_records;w public.work_orders;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.work_orders where tenant_id=target_tenant and id=target_order),target_order) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.acknowledge_object_instruction');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not private.object_visit_access(target_tenant,w.object_id,w.id) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_records where tenant_id=target_tenant and object_id=w.object_id and id=target_record and version=expected_version and kind='instruction' and state='active' and (work_order_id is null or work_order_id=w.id)
 and starts_at<=w.projected_end_at and (ends_at is null or ends_at>=w.projected_start_at) and (service='' or service=w.discipline);
 if r.id is null then raise exception 'De instructie is gewijzigd. Lees de actuele versie.' using errcode='40001';end if;
 insert into public.object_instruction_receipts(tenant_id,object_id,work_order_id,record_id,record_version,user_id,snapshot) values(target_tenant,w.object_id,w.id,r.id,r.version,auth.uid(),to_jsonb(r)) on conflict do nothing;
end $function$
;
CREATE OR REPLACE FUNCTION public.acknowledge_object_request(target_tenant uuid, target_request uuid, expected_version bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_visit_requests;assigned boolean;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request),(select work_order_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request)) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.acknowledge_object_request');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request;
 assigned:=exists(select 1 from public.work_order_assignments a
   join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
   join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
   join public.dispatches d on d.tenant_id=a.tenant_id and d.assignment_id=a.id and d.revoked_at is null
   where a.tenant_id=target_tenant and a.work_order_id=r.work_order_id and p.user_id=auth.uid()
     and p.status='active' and m.status='active' and 'staff'=any(m.roles)
     and a.status not in ('cancelled','returned'));
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id)
   or (r.created_by<>auth.uid() and not (private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.write') and private.management_allowed(target_tenant,'backoffice.functions.acknowledge_object_request')) and not assigned)
 then raise exception 'Geen toegang' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Dit verzoek is gewijzigd. Lees de actuele versie.' using errcode='40001';end if;
 insert into public.object_request_receipts(tenant_id,object_id,request_id,version,user_id)
 values(target_tenant,r.object_id,r.id,r.version,auth.uid()) on conflict do nothing;
end $function$
;
CREATE OR REPLACE FUNCTION public.withdraw_object_request(target_tenant uuid, target_request uuid, expected_version bigint, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_visit_requests;w public.work_orders;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request),(select work_order_id from public.object_visit_requests where tenant_id=target_tenant and id=target_request)) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.withdraw_object_request');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) or r.created_by<>auth.uid() then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Verzoek gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=r.work_order_id;
 if r.work_order_task_id is not null or w.status not in ('planned','released','seen','travelling','in_progress') or length(btrim(coalesce(reason,'')))<2 then raise exception 'Dit verzoek is al in uitvoering of afgesloten. Stem een correctie af.' using errcode='23514';end if;
 update public.object_visit_requests set state='withdrawn',needs_review=false,response=reason where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'withdrawn:'||r.id::text||':'||(r.version+1)::text);
end $function$
;
CREATE OR REPLACE FUNCTION public.register_visit_attachment(target_tenant uuid, target_request uuid, input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.object_visit_requests;id uuid;
begin
 if not private.management_concrete_visit_access(target_tenant,(select object_id from public.object_visit_requests visit_row where visit_row.tenant_id=target_tenant and visit_row.id=target_request),(select work_order_id from public.object_visit_requests visit_row where visit_row.tenant_id=target_tenant and visit_row.id=target_request)) then
 perform private.management_assert(target_tenant,'backoffice.objects.write');
 perform private.management_assert(target_tenant,'backoffice.functions.register_visit_attachment');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and object_visit_requests.id=target_request;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id)
   or (r.created_by<>auth.uid() and not (private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.write') and private.management_allowed(target_tenant,'backoffice.functions.register_visit_attachment')))
   or not exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=r.work_order_id and w.status in ('planned','released','seen','travelling','in_progress'))
 then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 insert into public.object_documents(tenant_id,object_id,work_order_id,request_id,title,category,storage_path,mime_type,file_name,size_bytes)
 values(target_tenant,r.object_id,r.work_order_id,r.id,input->>'title','photo',input->>'path',input->>'mime',input->>'fileName',(input->>'size')::bigint) returning object_documents.id into id;
 return id;
end $function$
;
CREATE OR REPLACE FUNCTION public.file_upload_allowed(target_bucket text, target_path text, visit_request uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parts text[]:=string_to_array(target_path,'/');t uuid;parent uuid;allowed boolean:=false;
begin
 if private.management_is_managed(private.storage_tenant_id(target_path),auth.uid()) and not(
  target_bucket='reports' and private.is_work_order_assignee(private.storage_tenant_id(target_path),private.storage_subject_id(target_path)) and private.owns_report_path(private.storage_tenant_id(target_path),private.storage_subject_id(target_path),target_path)
  or target_bucket='signatures' and exists(select 1 from private.work_order_signature_intents i where i.tenant_id=private.storage_tenant_id(target_path) and i.work_order_id=private.storage_subject_id(target_path) and i.storage_path=target_path and i.actor_id=auth.uid() and i.session_id=nullif(auth.jwt()->>'session_id','')::uuid and i.consumed_at is null and private.work_order_execution_actor(i.tenant_id,i.work_order_id,auth.uid(),i.session_id))
  or target_bucket='object-documents' and visit_request is not null and exists(select 1 from public.object_visit_requests r where r.tenant_id=private.storage_tenant_id(target_path) and r.object_id=private.storage_subject_id(target_path) and r.id=visit_request and r.created_by=auth.uid() and private.management_concrete_visit_access(r.tenant_id,r.object_id,r.work_order_id))
 ) and not private.management_allowed(private.storage_tenant_id(target_path),case target_bucket when 'branding' then 'backoffice.settings.write' when 'invoices' then 'backoffice.finance.write' when 'commercial-documents' then 'backoffice.commercial.write' when 'customer-documents' then 'backoffice.customers.write' when 'personnel-documents' then 'backoffice.personnel.write' when 'reports' then 'backoffice.reports.write' when 'signatures' then 'backoffice.reports.write' else 'backoffice.objects.write' end) then return false;end if;

 if not private.actor_session_active() or array_length(parts,1)<2 or target_path ~ '[%?#[:cntrl:]]' or position(chr(92) in target_path)>0 or exists(select 1 from unnest(parts) p where p in ('','.','..')) then return false;end if;
 t:=private.storage_tenant_id(target_path);if t is null or not exists(select 1 from public.tenants where id=t and status='active') then return false;end if;
 if target_bucket='branding' then return array_length(parts,1)=2 and (private.is_platform_admin() or private.has_role(t,array['tenant_admin','management']::public.app_role[]));end if;
 if target_bucket='commercial-documents' then
   if array_length(parts,1)<>4 or not private.commercial_member(t) then return false;end if;
   begin parent:=parts[3]::uuid;exception when invalid_text_representation then return false;end;
   return (parts[2]='request' and exists(select 1 from public.requests r where r.tenant_id=t and r.id=parent)) or (parts[2]='quote' and exists(select 1 from public.quotes q where q.tenant_id=t and q.id=parent));
 end if;
 parent:=private.storage_subject_id(target_path);if parent is null then return false;end if;
 if target_bucket='object-documents' then
   if array_length(parts,1)<>3 or not exists(select 1 from public.objects o where o.tenant_id=t and o.id=parent) then return false;end if;
   if visit_request is not null then return exists(select 1 from public.object_visit_requests r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
     where r.id=visit_request and r.tenant_id=t and r.object_id=parent and (r.created_by=auth.uid() or private.object_manage(t))
       and private.object_visit_access(t,parent,w.id) and w.status in ('planned','released','seen','travelling','in_progress'));end if;
   return private.object_manage(t);
 elsif target_bucket='customer-documents' then return private.can_manage_customer_document(target_path);
 elsif target_bucket='personnel-documents' then return array_length(parts,1)=3 and private.service_enabled(t,'personeel') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.personnel p where p.tenant_id=t and p.id=parent);
 elsif target_bucket='invoices' then return array_length(parts,1)=3 and private.service_enabled(t,'finance') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.invoices i where i.tenant_id=t and i.id=parent);
 elsif target_bucket='signatures' then return array_length(parts,1)=3 and exists(select 1 from private.work_order_signature_intents i where i.tenant_id=t and i.work_order_id=parent and i.storage_path=target_path and i.actor_id=auth.uid() and i.session_id=nullif(auth.jwt()->>'session_id','')::uuid and i.consumed_at is null and private.work_order_execution_actor(t,parent,auth.uid(),i.session_id));
 elsif target_bucket='reports' then return array_length(parts,1)=4 and private.service_enabled(t,'rapportage') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.work_orders w where w.tenant_id=t and w.id=parent);
 end if;return allowed;
end $function$
;

CREATE OR REPLACE FUNCTION private.dossier_access(t uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select private.management_allowed(t,'backoffice.personnel.sensitive') and auth.uid() is not null and private.has_role(t,array['tenant_admin','management','hr']::public.app_role[])
 and private.service_enabled(t,'personeel');
$function$
;

CREATE OR REPLACE FUNCTION private.notification_access(t uuid, ctx text, actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb:='{}'::jsonb;k text;cap text;ok boolean;
begin
 foreach k in array array['read_own','send_staff','send_customers','send_platform','send_bulk','send_all_tenants','schedule','cancel','sent_read','settings_manage','manage_global','manage_tenant','templates_manage','templates_override','delivery_read','delivery_retry','permissions_manage'] loop
  cap:=case when ctx='platform' then case k when 'read_own' then 'platform.notifications.read' when 'send_platform' then 'platform.notifications.send' when 'sent_read' then 'platform.notifications.read' when 'templates_manage' then 'platform.notifications.templates.manage' when 'delivery_read' then 'platform.notifications.delivery.read' when 'delivery_retry' then 'platform.notifications.delivery.retry' when 'permissions_manage' then 'platform.notifications.permissions' else 'platform.notifications.'||k end
   else case k when 'sent_read' then 'notifications.sent.read' when 'settings_manage' then 'notifications.settings.manage' when 'templates_override' then 'notifications.templates.override' when 'delivery_read' then 'notifications.delivery.read' when 'delivery_retry' then 'notifications.delivery.retry' when 'permissions_manage' then 'notifications.permissions' else 'notifications.'||k end end;
  ok:=private.notification_actor_active(t,ctx,actor) and(case when k='read_own' then ctx in ('customer','platform') or private.notification_cap(t,actor,'notifications.read_own',(select id from public.personnel where tenant_id=t and user_id=actor)) when ctx in ('staff','customer') then false else case when ctx='backoffice' and private.management_is_managed(t,actor) then private.management_has(t,actor,cap) and (not exists(select 1 from public.permission_grants g where g.tenant_id=t and g.user_id=actor and g.capability=cap) or exists(select 1 from public.permission_grants g where g.tenant_id=t and g.user_id=actor and g.capability=cap and g.enabled)) else exists(select 1 from public.permission_grants g where g.user_id=actor and g.enabled and g.capability=cap and g.tenant_id is not distinct from t and (ctx='platform' or exists(select 1 from public.tenant_memberships m where m.id=g.membership_id and m.user_id=actor and m.tenant_id=t and m.status='active'))) end end);
  result:=result||jsonb_build_object(k,ok);
 end loop;
 return jsonb_build_object('allowed',private.notification_actor_active(t,ctx,actor),'permissions',result);
end$function$
;

CREATE OR REPLACE FUNCTION private.notification_delegation_scope(t uuid, ctx text, actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if ctx='backoffice' and private.management_is_managed(t,actor) then
  if not private.notification_actor_active(t,ctx,actor) or not private.management_has(t,actor,'notifications.permissions') then return null;end if;
  if not exists(select 1 from public.permission_grants g where g.tenant_id=t and g.user_id=actor and g.capability='notifications.permissions') then return '{"all":true}'::jsonb;end if;
 end if;
 return (select g.scope from public.permission_grants g where g.user_id=actor and g.enabled and g.capability=case ctx when 'platform' then 'platform.notifications.permissions' when 'backoffice' then 'notifications.permissions' end
 and g.tenant_id is not distinct from t and private.notification_actor_active(t,ctx,actor)
 and (ctx='platform' or exists(select 1 from public.tenant_memberships m where m.id=g.membership_id and m.tenant_id=t and m.user_id=actor and m.status='active')));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.object_vault_context(t uuid, u uuid, s uuid, o uuid, w uuid, i uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.work_order_assignments;ord public.work_orders;item private.object_secret_items;ext private.object_access_extensions;
 mail text;manager boolean;bound boolean;binding_revision bigint;scope_revision bigint;vault_revision bigint;end_at timestamptz;config jsonb;before_minutes integer;otp_minutes integer;view_minutes integer;
begin
 -- Even a cryptographically valid access token is insufficient after logout/revocation.
 perform 1 from public.objects where tenant_id=t and id=o for share; perform 1 from public.tenants where id=t for share; perform 1 from public.tenant_settings where tenant_id=t for share; select au.email into mail from auth.users au join auth.sessions sess on sess.user_id=au.id where au.id=u and sess.id=s and au.deleted_at is null and au.email_confirmed_at is not null and (au.banned_until is null or au.banned_until<clock_timestamp()) and (sess.not_after is null or sess.not_after>clock_timestamp()) for share of au,sess;
 if mail is null or not exists(select 1 from public.tenants x join public.tenant_settings ts on ts.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(ts.enabled_services)) or not exists(select 1 from public.objects x where x.tenant_id=t and x.id=o and x.dossier_status in ('draft','active','paused')) then return null;end if;
 perform 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=u for share; perform 1 from public.personnel p where p.tenant_id=t and p.user_id=u for share; perform 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u for share; select exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=u and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]) into manager;
 if private.management_is_managed(t,u) then manager:=manager and private.management_has(t,u,'backoffice.objects.secrets.read');end if;
 select b.version into binding_revision from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u and b.active and b.manage_secrets;
 bound:=binding_revision is not null;
 select coalesce(settings->'objectVault','{}') into config from public.tenant_settings where tenant_id=t;
 before_minutes:=least(120,greatest(0,coalesce((config->>'beforeMinutes')::integer,60)));
 otp_minutes:=least(2,greatest(1,coalesce((config->>'otpMinutes')::integer,2)));
 view_minutes:=least(5,greatest(1,coalesce((config->>'viewMinutes')::integer,5)));
 select revision into vault_revision from private.object_vault_state where object_id=o;
 if i is not null then
  select * into item from private.object_secret_items where tenant_id=t and object_id=o and id=i and active and (manager or bound or (valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp())));
  if item.id is null then return null;end if;
 
 end if;
 end_at:=clock_timestamp()+make_interval(mins=>view_minutes);
 if not manager and not bound then
  select aa.* into a from public.work_order_assignments aa join public.personnel p on p.tenant_id=aa.tenant_id and p.id=aa.personnel_id join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
  where aa.tenant_id=t and aa.work_order_id=w and p.user_id=u and p.status='active' and m.status='active' and 'staff'=any(m.roles) and aa.status in ('released','seen','travelling','in_progress')
   and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=aa.id and d.revoked_at is null);
  select * into ord from public.work_orders where tenant_id=t and id=w and object_id=o and status in ('released','seen','travelling','in_progress');
  if a.id is null or ord.id is null or a.projected_start_at is null or a.projected_end_at is null then return null;end if;
  select revision into scope_revision from private.object_secret_scopes sc where sc.assignment_id=a.id and sc.item_id=i and sc.active;
  if i is not null and scope_revision is null then return null;end if;
  select * into ext from private.object_access_extensions where assignment_id=a.id;
  end_at:=greatest(a.projected_end_at,coalesce(ext.ends_at,a.projected_end_at));
  if clock_timestamp()<a.projected_start_at-make_interval(mins=>before_minutes) or clock_timestamp()>=end_at then return null;end if;
 end if;
 if not manager and not bound then end_at:=least(end_at,coalesce(item.valid_until,end_at));end if;
 return jsonb_build_object('email',mail,'canManage',(manager and (not private.management_is_managed(t,u) or private.management_has(t,u,'backoffice.objects.secrets.write'))) or bound,'windowEnd',end_at,'otpMinutes',otp_minutes,'viewMinutes',view_minutes,'assignmentId',a.id,
 'fingerprint',md5(concat_ws(':',t,u,s,o,w,i,coalesce(vault_revision,0),item.version,manager,binding_revision,a.id,a.version,ord.version,scope_revision,ext.revision)));
end $function$
;

CREATE OR REPLACE FUNCTION public.object_vault_operation(target_tenant uuid, actor uuid, session_id uuid, target_object uuid, target_order uuid, target_item uuid, operation text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb;ch private.object_otp_challenges;g private.object_access_grants;item private.object_secret_items;pepper text;k uuid;v uuid;cid uuid;gid uuid;expiry timestamptz;n integer;val text;items jsonb;manager boolean;a public.work_order_assignments;dossier_ctx jsonb;saved_claims text;
begin
 -- Service-only. Actor/session originate from verified server auth, not request JSON.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp:'||actor::text,0));
 ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,target_item);
 manager:=(not private.management_is_managed(target_tenant,actor) or private.management_has(target_tenant,actor,'backoffice.objects.secrets.write')) and exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=actor and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]);
 if operation='metadata' and target_item is null and (ctx is null or not (ctx->>'canManage')::boolean) then
  -- Enumerate only items explicitly granted to this concrete current assignment.
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version)),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
  if jsonb_array_length(items)>0 then ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,(items->0->>'id')::uuid);end if; return jsonb_build_object('ok',true,'items',items,'canManage',false,'email',case when ctx is not null then left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2) else null end);
 end if;
 if ctx is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Toegang niet beschikbaar. Controleer je actuele toewijzing of neem contact op met je leidinggevende.');
 end if;
 if operation='metadata' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version,'validFrom',x.valid_from,'validUntil',x.valid_until) order by x.name),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and x.active and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
  return jsonb_build_object('ok',true,'items',items,'canManage',(ctx->>'canManage')::boolean,'email',left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2));
 elsif operation='request' then
  if coalesce(input->>'code','')!~'^[0-9]{6}$' then return jsonb_build_object('ok',false,'error','Verificatie niet beschikbaar.');end if;
  select count(*) into n from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '1 hour';
  if n>=5 or (select count(*) from private.object_access_audit where tenant_id=target_tenant and object_id=target_object and event='requested' and created_at>clock_timestamp()-interval '1 hour')>=100 or exists(select 1 from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '60 seconds') or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then return jsonb_build_object('ok',false,'error','Te veel pogingen. Wacht voordat je opnieuw een code aanvraagt.');end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp-key',0));
  select vault_id into k from private.object_otp_key where id;
  if k is null then
   k:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'fieldgrid_object_otp_pepper','Keyed verification; never expose');
   insert into private.object_otp_key(id,vault_id) values(true,k);
  end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where id=k;
  cid:=gen_random_uuid();expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'otpMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  update private.object_otp_challenges c set consumed_at=clock_timestamp() where c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.object_id=target_object and c.consumed_at is null;
  insert into private.object_otp_challenges(id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,code_hmac,expires_at)
  values(cid,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',extensions.hmac(cid::text||':'||(input->>'code'),pepper,'sha256'),expiry);
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'requested');
  return jsonb_build_object('ok',true,'challengeId',cid,'email',ctx->>'email','expiresAt',expiry);
 elsif operation in ('delivered','delivery_failed') then
  update private.object_otp_challenges c set delivered=operation='delivered',consumed_at=case when operation='delivery_failed' then clock_timestamp() else consumed_at end where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.fingerprint=ctx->>'fingerprint';
  return jsonb_build_object('ok',true);
 elsif operation='verify' then
  select * into ch from private.object_otp_challenges c where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.tenant_id=target_tenant and c.object_id=target_object for update;
  select d.decrypted_secret into pepper from private.object_otp_key k join vault.decrypted_secrets d on d.id=k.vault_id;
  if ch.id is null or not ch.delivered or ch.consumed_at is not null or ch.expires_at<=clock_timestamp() or ch.fingerprint<>ctx->>'fingerprint' or ch.code_hmac<>extensions.hmac(ch.id::text||':'||coalesce(input->>'code',''),pepper,'sha256')
   or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then
   insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verify_failed');
   return jsonb_build_object('ok',false,'error','De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.');
  end if;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where id=ch.id;
  expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'viewMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  insert into private.object_access_grants(challenge_id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,expires_at) values(ch.id,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',expiry) returning id into gid;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verified');
  return jsonb_build_object('ok',true,'grantId',gid,'expiresAt',expiry);
 end if;
 select * into g from private.object_access_grants ag where ag.id=(input->>'grantId')::uuid and ag.tenant_id=target_tenant and ag.actor_id=actor and ag.session_id=object_vault_operation.session_id and ag.object_id=target_object and ag.fingerprint=ctx->>'fingerprint' and ag.revoked_at is null and ag.expires_at>clock_timestamp() for update;
 if g.id is null and target_order is not null and target_item is not null and not (ctx->>'canManage')::boolean then
  dossier_ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,null);
  select * into g from private.object_access_grants ag where ag.id=(input->>'grantId')::uuid
   and ag.tenant_id=target_tenant and ag.actor_id=actor and ag.session_id=object_vault_operation.session_id
   and ag.object_id=target_object and ag.order_id=target_order and ag.item_id is null
   and ag.fingerprint=dossier_ctx->>'fingerprint' and ag.revoked_at is null and ag.expires_at>clock_timestamp() for update;
 end if;
 if g.id is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Bevestig je toegang opnieuw met een e-mailcode.');
 end if;
 if operation='hide' then update private.object_access_grants set revoked_at=clock_timestamp() where id=g.id;return jsonb_build_object('ok',true);
 elsif operation='check' then return jsonb_build_object('ok',true,'expiresAt',g.expires_at);
 elsif operation='dossier' and target_item is null and target_order is not null then
  saved_claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated')::text,true);
  begin
   items:=public.object_visit_context(target_tenant,target_object,target_order);
  exception when others then
   perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);raise;
  end;
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,event)
   values(target_tenant,actor,session_id,target_object,target_order,'read');
  return jsonb_build_object('ok',true,'context',items,'expiresAt',g.expires_at);
 elsif operation='read' and target_item is not null then
  select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object;
  select ds.decrypted_secret into val from private.object_secret_versions sv join vault.decrypted_secrets ds on ds.id=sv.vault_id where sv.item_id=item.id and sv.version=item.version;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'read');
  return jsonb_build_object('ok',true,'value',val,'expiresAt',g.expires_at);
 elsif operation='save' and (ctx->>'canManage')::boolean then
  if length(coalesce(input->>'value','')) not between 1 and 4000 then return jsonb_build_object('ok',false,'error','Vul een geldige beveiligde waarde in.');end if;
  if target_item is not null then
   select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object for update;
   if item.version<>(input->>'version')::bigint or coalesce((input->>'externalChanged')::boolean,false)=false then return jsonb_build_object('ok',false,'error','Controleer de versie en bevestig dat de externe code werkelijk is gewijzigd.');end if;
   update private.object_secret_items set version=version+1,name=input->>'name',kind=input->>'kind',node_id=nullif(input->>'nodeId','')::uuid,valid_from=clock_timestamp(),valid_until=nullif(input->>'validUntil','')::timestamptz where id=item.id returning * into item;
  else
   insert into private.object_secret_items(tenant_id,object_id,node_id,name,kind,owner_user_id,valid_until) values(target_tenant,target_object,nullif(input->>'nodeId','')::uuid,input->>'name',input->>'kind',actor,nullif(input->>'validUntil','')::timestamptz) returning * into item;
  end if;
  v:=vault.create_secret(input->>'value',null,'Fieldgrid private object value');
  insert into private.object_secret_versions values(item.id,item.version,v,actor,coalesce((input->>'externalChanged')::boolean,false),clock_timestamp());
  insert into private.object_vault_state values(target_object,1) on conflict(object_id) do update set revision=private.object_vault_state.revision+1;
  update private.object_access_grants set revoked_at=clock_timestamp() where object_id=target_object;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where object_id=target_object and consumed_at is null;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,item.id,'rotated');
  return jsonb_build_object('ok',true);
 elsif operation='scope' and manager and target_item is not null then
  select aa.* into a from public.work_order_assignments aa join public.work_orders wo on wo.tenant_id=aa.tenant_id and wo.id=aa.work_order_id where aa.tenant_id=target_tenant and aa.id=(input->>'assignmentId')::uuid and wo.object_id=target_object and aa.status not in ('completed','returned','cancelled');
  if a.id is null then return jsonb_build_object('ok',false,'error','Kies een actuele toewijzing bij dit object.');end if;
  insert into private.object_secret_scopes values(a.id,target_item,actor,1,coalesce((input->>'active')::boolean,true)) on conflict(assignment_id,item_id) do update set active=excluded.active,revision=private.object_secret_scopes.revision+1,created_by=actor;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,a.work_order_id,target_item,'scope_changed');
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','Deze actie is niet beschikbaar.');
end $function$
;

CREATE OR REPLACE FUNCTION public.travel_context(t uuid, u uuid, s uuid, d date, p uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare roles public.app_role[];tz text;own uuid;manager boolean; start_at timestamptz;end_at timestamptz;
begin


 if not exists(select 1 from auth.sessions se join auth.users au on au.id=se.user_id where se.id=s and se.user_id=u and (se.not_after is null or se.not_after>clock_timestamp()) and au.deleted_at is null and (au.banned_until is null or au.banned_until<clock_timestamp())) then raise exception 'Geen toegang' using errcode='42501';end if;
 select m.roles,te.timezone into roles,tz from public.tenant_memberships m join public.tenants te on te.id=m.tenant_id join public.tenant_settings st on st.tenant_id=te.id where m.tenant_id=t and m.user_id=u and m.status='active' and te.status='active' and 'planning'=any(st.enabled_services);
 if roles is null then raise exception 'Geen toegang' using errcode='42501';end if;
 manager:=roles&&array['tenant_admin','management','planner','hr']::public.app_role[] and (not private.management_is_managed(t,u) or private.management_has(t,u,'backoffice.planning.read') or private.management_has(t,u,'backoffice.personnel.sensitive'));
 select id into own from public.personnel where tenant_id=t and user_id=u and status='active';
 if not manager and (own is null or not 'staff'=any(roles) or (p is not null and p<>own)) then raise exception 'Geen toegang' using errcode='42501';end if;
 start_at:=d::timestamp at time zone tz;end_at:=(d+1)::timestamp at time zone tz;
 return jsonb_build_object('revision',coalesce((select revision from private.travel_revisions where tenant_id=t),0),'timezone',tz,'day',d,'today',(clock_timestamp() at time zone tz)::date,
 'canManage',roles&&array['tenant_admin','management','planner']::public.app_role[] and (not private.management_is_managed(t,u) or private.management_has(t,u,'backoffice.planning.write')),
 'defaultMargin',(select travel_margin_minutes from public.tenant_settings where tenant_id=t),'vehicleMargins',(select travel_vehicle_margins from public.tenant_settings where tenant_id=t),
 'depots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address,'active',active)) from public.travel_depots where tenant_id=t),'[]'),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',pe.id,'name',pe.full_name,'standard_vehicle',pe.standard_vehicle,'departure_kind',pe.departure_kind,'departure_depot_id',pe.departure_depot_id,'home_address',pe.home_address,'alternate_departure_address',pe.alternate_departure_address,'return_to_departure',pe.return_to_departure,'privateAllowed',coalesce(pe.id=own or (roles&&array['tenant_admin','management','hr']::public.app_role[] and (not private.management_is_managed(t,u) or private.management_has(t,u,'backoffice.personnel.sensitive'))),false), 'override',(select jsonb_strip_nulls(jsonb_build_object('alternate_departure_address',dy.departure_address,'standard_vehicle',dy.standard_vehicle,'departure_kind',dy.departure_kind,'departure_depot_id',dy.departure_depot_id,'return_to_departure',dy.return_to_departure)) from public.personnel_travel_days dy where dy.tenant_id=t and dy.personnel_id=pe.id and dy.day=d))) from public.personnel pe where pe.tenant_id=t and (manager or pe.id=own) and (p is null or pe.id=p)),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'workOrderId',w.id,'personnelId',a.personnel_id,'start',a.planned_start_at,'end',a.planned_end_at,'status',a.status,'orderStatus',w.status,'objectId',o.id,'objectName',o.name,'address',o.address,'arrival',o.arrival_location,'instruction',o.arrival_instruction,'margin',o.travel_margin_minutes,'version',a.version)) from public.work_order_assignments a join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where a.tenant_id=t and a.planned_start_at<end_at and a.planned_end_at>start_at and a.status<>'cancelled' and w.status<>'cancelled' and (p is null or a.personnel_id=p) and (manager or (a.personnel_id=own and exists(select 1 from public.dispatches dp where dp.tenant_id=t and dp.assignment_id=a.id and dp.revoked_at is null)))),'[]'));
end$function$
;

CREATE OR REPLACE FUNCTION public.store_travel_estimates(t uuid, revision bigint, legs jsonb, manual_action text DEFAULT NULL::text, actor uuid DEFAULT NULL::uuid, actor_session uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare leg jsonb; current_context jsonb;
begin
 if manual_action is not null and private.management_is_managed(t,actor) and not private.management_has(t,actor,'backoffice.planning.write') then raise exception 'Je rol geeft geen toegang tot handmatige reistijden.' using errcode='42501';end if;

  if manual_action is not null then
    if manual_action not in ('set','clear') or actor is null or actor_session is null
      or jsonb_typeof(legs) is distinct from 'array' then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if jsonb_array_length(legs)<>1 then
      raise exception 'Ongeldige handmatige rit' using errcode='22023';
    end if;
    -- Hold only the current authorization rows for this short local transaction.
    -- Acquire these before the travel lock (settings writes also take that lock).
    perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
      join public.tenant_memberships m on m.user_id=u.id and m.tenant_id=t
      join public.tenants te on te.id=m.tenant_id
      join public.tenant_settings st on st.tenant_id=te.id
      where u.id=actor and s.id=actor_session and u.deleted_at is null
        and not coalesce(u.is_anonymous,false)
        and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and (s.not_after is null or s.not_after>clock_timestamp())
        and m.status='active' and te.status='active'
        and 'planning'=any(st.enabled_services)
      for share of u,s,m,te,st;
    if not found then raise exception 'Geen toegang' using errcode='42501';end if;
    perform pg_advisory_xact_lock(hashtextextended('travel:'||t::text,0));
    leg:=legs->0;
    current_context:=public.travel_context(t,actor,actor_session,(leg->>'day')::date,null);
    if coalesce((current_context->>'canManage')::boolean,false) is not true then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if not exists(select 1 from jsonb_array_elements(current_context->'assignments') a
      where a->>'id'=leg->>'assignmentId' and a->>'personnelId'=leg->>'personnelId') then
      raise exception 'Geen toegang tot deze rit' using errcode='42501';
    end if;
  end if;
  return private.store_travel_estimates(t,revision,legs,manual_action,actor);
end $function$
;

CREATE OR REPLACE FUNCTION private.work_order_access(t uuid, financial boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (case when financial then private.management_allowed(t,'backoffice.finance.read') else private.management_allowed(t,'backoffice.work_orders.read') or private.management_allowed(t,'backoffice.planning.read') end) and private.object_session_active() and private.service_enabled(t,'planning') and private.has_role(t,case when financial then array['tenant_admin','management','finance']::public.app_role[] else array['tenant_admin','management','planner','finance']::public.app_role[] end)
$function$
;

CREATE OR REPLACE FUNCTION private.commercial_access(t uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.management_allowed(t,'backoffice.commercial.read') and private.object_session_active() and private.has_role(t,array['tenant_admin','management','finance']::public.app_role[])
 and exists(select 1 from public.tenants where id=t and status='active');
$function$
;

-- A compatibility enum does not grant private HR addresses or absence details.
CREATE OR REPLACE FUNCTION private.can_access_personnel(target_tenant_id uuid, target_personnel_id uuid, sensitive boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 select coalesce(private.current_personnel_id(target_tenant_id)=target_personnel_id,false) or
 case when sensitive then
 private.has_role(target_tenant_id,array['tenant_admin','management','hr']::public.app_role[]) and private.management_allowed(target_tenant_id,'backoffice.personnel.sensitive')
 else private.has_role(target_tenant_id,array['tenant_admin','management','planner','hr']::public.app_role[]) and (private.management_allowed(target_tenant_id,'backoffice.personnel.read') or private.management_allowed(target_tenant_id,'backoffice.planning.read')) end;
$function$;

-- The provider may run only while the exact invitation receipt and both live
-- identities are still valid; staff-only membership is not a management invite.
create function public.management_invitation_access(target_tenant uuid,target_member uuid,target_user uuid,delivery_id uuid,recipient text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 perform private.management_fresh_owner(target_tenant);
 return exists(select 1 from private.management_members mm join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id join auth.users u on u.id=m.user_id
 where mm.tenant_id=target_tenant and m.id=target_member and m.user_id=target_user and m.status='active' and mm.revoked_at is null and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(recipient))
 and exists(select 1 from private.management_receipts r where r.tenant_id=target_tenant and r.actor_id=auth.uid() and r.request_id=delivery_id and r.result->>'id'=target_member::text and r.result->>'userId'=target_user::text and r.result->>'deliveryId'=delivery_id::text and lower(r.result->>'email')=lower(recipient));
end$$;
revoke all on function public.management_invitation_access(uuid,uuid,uuid,uuid,text) from public,anon,service_role;
grant execute on function public.management_invitation_access(uuid,uuid,uuid,uuid,text) to authenticated;

create policy management_security_documents_read on public.object_documents as restrictive for select to authenticated using(category<>'security' or private.management_allowed(tenant_id,'backoffice.objects.secrets.read'));
create policy management_security_documents_insert on public.object_documents as restrictive for insert to authenticated with check(category<>'security' or private.management_allowed(tenant_id,'backoffice.objects.secrets.write'));
create policy management_security_documents_update on public.object_documents as restrictive for update to authenticated using(category<>'security' or private.management_allowed(tenant_id,'backoffice.objects.secrets.write')) with check(category<>'security' or private.management_allowed(tenant_id,'backoffice.objects.secrets.write'));
create policy management_security_documents_delete on public.object_documents as restrictive for delete to authenticated using(category<>'security' or private.management_allowed(tenant_id,'backoffice.objects.secrets.write'));

CREATE OR REPLACE FUNCTION public.record_task_execution(target_tenant uuid, target_task uuid, expected_version bigint, result text, actual_quantity numeric, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  task public.work_order_tasks;
  work public.work_orders;
  own_quantity numeric;
  manager_actor boolean;
  staff_actor boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-planning:' || target_tenant::text, 0)
  );
  select * into task
  from public.work_order_tasks candidate
  where candidate.tenant_id = target_tenant and candidate.id = target_task
  for update;
  select * into work
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant and candidate.id = task.work_order_id
  for update;

  manager_actor := task.id is not null and private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.record_task_execution');
  staff_actor := task.id is not null and private.work_order_execution_actor(
    target_tenant,
    task.work_order_id,
    auth.uid(),
    nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
  if task.id is null
    or not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or not (manager_actor or staff_actor)
    or not private.task_execution_allowed(task)
  then
    raise exception 'Geen actuele uitvoeringstoegang' using errcode = '42501';
  end if;
  if task.execution_version <> expected_version then
    raise exception 'De uitvoering is gewijzigd. Vernieuw de werkbon.' using errcode = '40001';
  end if;

  own_quantity := task.quantity - task.transferred_quantity - task.withdrawn_quantity;
  if work.status not in ('in_progress', 'correction_required')
    or result not in ('in_progress', 'completed', 'partial', 'not_done', 'not_applicable')
    or actual_quantity is null
    or actual_quantity < 0
    or actual_quantity > own_quantity
    or (result = 'completed' and actual_quantity <> own_quantity)
    or (result in ('not_done', 'not_applicable') and actual_quantity <> 0)
    or (result = 'partial' and (actual_quantity <= 0 or actual_quantity >= own_quantity))
    or (result not in ('completed', 'in_progress') and length(btrim(coalesce(reason, ''))) < 5)
  then
    raise exception 'Controleer de eigen resterende hoeveelheid, uitvoeringsstatus en toelichting'
      using errcode = '23514';
  end if;

  update public.work_order_tasks updated
  set executed_quantity = actual_quantity,
      execution_state = result,
      completed_at = case when result = 'in_progress' then null else clock_timestamp() end,
      completion_note = reason
  where updated.id = task.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_personnel_checklist(target_tenant uuid, target_personnel uuid, checklist_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare title text;due_date date;count_added integer:=0;affected integer;contract_type text;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.prepare_personnel_checklist');
 if not private.dossier_access(target_tenant) or checklist_type not in ('onboarding','offboarding') or not exists(select 1 from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel) then raise exception 'Access denied' using errcode='42501';end if;
 if checklist_type='offboarding' then select p.end_date into due_date from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;
 else select p.start_date into due_date from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;end if;
 select c.employment_type into contract_type from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel and c.active order by c.starts_on desc limit 1;
 for title in select unnest(case when checklist_type='onboarding' then array[
  case when contract_type='hire' then 'Inhuurovereenkomst controleren' else 'Overeenkomst en noodzakelijk bewijs controleren' end,
  'Contactgegevens controleren','Werkgerelateerde kwalificaties controleren','Introductie en toepasselijke veiligheidsinstructies bevestigen','Noodzakelijke middelen uitgeven','Bestaande portaaluitnodiging controleren']
 else array['Laatste werkdag en overdracht afstemmen','Openstaande afspraken afhandelen','Uitgegeven middelen retourneren','Accounttoegang via het bestaande proces afsluiten','Archivering en toepasselijk bewaarbeleid beoordelen'] end)
 loop
  insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,owner_user_id,due_on,dossier_managed,dossier_status,dossier_data)
  values(target_tenant,target_personnel,'checklist',title,auth.uid(),due_date,true,'open',jsonb_build_object('title',title,'checklistType',checklist_type,'templateKey',checklist_type||':'||title,'ownerId',auth.uid(),'dueOn',due_date,'reminderDays','0')) on conflict do nothing;
  get diagnostics affected=row_count;count_added:=count_added+affected;
 end loop;
 if checklist_type='offboarding' and due_date is not null then
  update public.personnel_dossier_items set dossier_data=dossier_data||jsonb_build_object('dueOn',due_date,'ownerId',auth.uid()),due_on=due_date
  where tenant_id=target_tenant and personnel_id=target_personnel and kind='asset' and dossier_status<>'returned' and due_on is null;
 end if;
 return count_added;
end $function$;

CREATE OR REPLACE FUNCTION private.report_snapshot_for_actor(r work_order_report_versions)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  owners jsonb;
  section text;
  visible jsonb;
begin
  if private.is_delivery_owner(r.tenant_id,r.work_order_id,auth.uid()) and private.work_order_execution_actor(r.tenant_id,r.work_order_id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then return r.snapshot;end if;
  if private.management_is_managed(r.tenant_id,auth.uid()) and not private.management_has(r.tenant_id,auth.uid(),'backoffice.finance.read') and private.report_backoffice(r.tenant_id) then
    result:=r.snapshot-'expenses';
    result:=jsonb_set(result,'{tasks}',coalesce((select jsonb_agg(value-array['extraUnitPriceCents','priceCents','unitPriceCents','vatBasisPoints','commercialSnapshot','totalCents']) from jsonb_array_elements(coalesce(result->'tasks','[]'))),'[]'));
    result:=jsonb_set(result,'{materials}',coalesce((select jsonb_agg(value-array['unitPriceCents','priceCents','vatBasisPoints','totalCents']) from jsonb_array_elements(coalesce(result->'materials','[]'))),'[]'));
    return result;
  end if;
  if private.report_backoffice(r.tenant_id) or private.is_delivery_owner(r.tenant_id,r.work_order_id,auth.uid()) then
    return r.snapshot;
  end if;
  select jsonb_object_agg(key, value)
  into result
  from jsonb_each(r.snapshot)
  where key = any(array[
    'schema','number','title','summary','tenant','customer','object',
    'executionDate','endedAt','timezone','tasks','notes','checklists',
    'materials','expenses','attachments'
  ]);
  if not private.is_work_order_assignee(r.tenant_id, r.work_order_id) then
    return result;
  end if;
  select ownership.owners
  into owners
  from private.work_order_report_ownership ownership
  where ownership.tenant_id = r.tenant_id
    and ownership.report_id = r.id;
  foreach section in array array['notes','attachments','checklists','materials'] loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into visible
    from jsonb_array_elements(coalesce(result -> section, '[]'::jsonb)) with ordinality
    where owners -> section ->> ordinality::text = auth.uid()::text;
    result := jsonb_set(result, array[section], visible);
  end loop;
  -- Expense ownership was not captured for historical report versions. Never
  -- guess it from matching labels or amounts; own live costs remain available
  -- through the bounded staff workspace.
  result := jsonb_set(result, '{expenses}', '[]'::jsonb);
  if r.created_by is distinct from auth.uid() then
    result := jsonb_set(
      result,
      '{summary}',
      '"Gezamenlijk rapport. Je ziet hier de opdrachtresultaten en je eigen bijdrage."'
    );
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.report_backoffice(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 select private.has_role(t,array['tenant_admin','management','planner','finance']::public.app_role[]) and (private.management_allowed(t,'backoffice.work_orders.read') or private.management_allowed(t,'backoffice.reports.read'));
$function$;

CREATE OR REPLACE FUNCTION private.management_concrete_visit_access(t uuid, o uuid, w uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.object_session_active() and exists(select 1 from public.tenants x where x.id=t and x.status='active') and (
  private.customer_visit_access(t,o,w)
  or (w is null and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active and b.manage_secrets)
   and exists(select 1 from public.customer_portal_accounts account join public.objects obj on obj.tenant_id=account.tenant_id and obj.customer_id=account.customer_id
    where account.tenant_id=t and obj.id=o and account.user_id=auth.uid() and private.customer_account_access(t,account.id)))
  or exists(select 1 from public.work_order_assignments a
   join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
   join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id
   join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
   where a.tenant_id=t and wo.object_id=o and wo.id=w and p.user_id=auth.uid() and p.status='active' and m.status='active'
    and 'staff'=any(m.roles) and private.service_enabled(t,'planning')
    and a.status not in('cancelled','returned') and wo.status<>'cancelled'
    and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null))
 ) and(w is null or exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.object_id=o));
$function$;
revoke all on function private.management_concrete_visit_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.object_manage(t uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.object_session_active() and private.has_role(t,array['tenant_admin','management','planner']::public.app_role[])
 and private.management_allowed(t,'backoffice.objects.read')
 and exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(s.enabled_services));
$function$;

CREATE OR REPLACE FUNCTION private.object_visit_projection(target_tenant uuid, target_object uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.objects;w public.work_orders;result jsonb;manager boolean;customer boolean;
begin
 if not private.object_visit_access(target_tenant,target_object,target_order) then raise exception 'Geen toegang tot deze uitvoering' using errcode='42501';end if;
 manager:=private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.read') and private.management_allowed(target_tenant,'backoffice.functions.object_visit_context');
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active);
 select * into o from public.objects where tenant_id=target_tenant and id=target_object;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=o.id;
 result:=jsonb_build_object('object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'instructions',case when customer and not manager then '' else o.access_instructions end,'status',o.dossier_status),
   'order',case when w.id is null then null else jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) end,
   'customer',customer,'manager',manager,'userId',auth.uid());
 return result||jsonb_build_object(
   'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind) order by n.position,n.name) from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=o.id and n.active),'[]'),
   'instructions',case when customer and not manager then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_instruction_receipts rc where rc.record_id=r.id and rc.record_version=r.version and rc.work_order_id=w.id and rc.user_id=auth.uid()))) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id and r.kind='instruction' and r.state='active' and (r.service='' or r.service=w.discipline) and (r.work_order_id is null or r.work_order_id=w.id) and r.starts_at<=coalesce(w.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(w.projected_start_at,clock_timestamp()))),'[]') end,
   'requests',coalesce((select jsonb_agg(
     (case when customer and not manager then jsonb_build_object('id',r.id,'tenant_id',r.tenant_id,'object_id',r.object_id,'work_order_id',r.work_order_id,'node_id',r.node_id,'title',r.title,'body',r.body,'kind',r.kind,'priority',r.priority,'feedback',r.feedback,'state',r.state,'needs_review',r.needs_review,'response',r.response,'work_order_task_id',r.work_order_task_id,'version',r.version,'created_by',r.created_by,'created_at',r.created_at,'updated_at',r.updated_at) else to_jsonb(r) end)
     ||jsonb_build_object('read',exists(select 1 from public.object_request_receipts rc where rc.request_id=r.id and rc.version=r.version and rc.user_id=auth.uid()),
       'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'mime',d.mime_type)) from public.object_documents d where d.request_id=r.id and d.tenant_id=target_tenant and d.category<>'security'),'[]'),
       'proposals',coalesce((select jsonb_agg(case when customer and not manager then jsonb_build_object('id',p.id,'version',p.version,'title',p.title,'scope',p.scope,'quantity',p.quantity,'price_cents',p.price_cents,'vat_basis_points',p.vat_basis_points,'accepted_at',p.accepted_at) else to_jsonb(p) end order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]')))
     from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=o.id
       and (not customer or manager or (w.id is not null and r.work_order_id=w.id and r.created_by=auth.uid()))
       and (customer or w.id is null or r.work_order_id=w.id)),'[]'));
end $function$;

-- Registry entries inherit the exact source RLS. An employee-visible own file
-- remains available through a separate staff relationship after role revocation.
drop policy management_read on public.personnel_documents;
create policy management_read on public.personnel_documents as restrictive for select to authenticated using(
 private.management_table_allowed(tenant_id,'personnel_documents',false) or
 (private.object_session_active() and private.has_role(tenant_id,array['staff']::public.app_role[]) and personnel_id=private.current_personnel_id(tenant_id) and visible_to_employee and not dossier_managed));

-- Price-free invoker inputs: keep dossier_chain's original RLS on every other
-- source while permitting a managed planner to read authorized operations.
create function private.management_dossier_orders(t uuid)
returns table(id uuid,tenant_id uuid,customer_id uuid,object_id uuid,projected_end_at timestamptz)
language sql stable security definer set search_path='' as $$
 select w.id,w.tenant_id,w.customer_id,w.object_id,w.projected_end_at
 from public.work_orders w
 where w.tenant_id=t and private.work_order_access(t,false)
 and private.management_allowed(t,'backoffice.work_orders.read')
 and private.management_allowed(t,'backoffice.functions.work_order_operational_rows');
$$;
create function private.management_dossier_tasks(t uuid)
returns table(id uuid,tenant_id uuid,work_order_id uuid,task_name text,completed_at timestamptz,execution_state text,execution_version bigint)
language sql stable security definer set search_path='' as $$
 select wt.id,wt.tenant_id,wt.work_order_id,wt.task_name,wt.completed_at,wt.execution_state::text,wt.execution_version
 from public.work_order_tasks wt
 where wt.tenant_id=t and private.work_order_access(t,false)
 and private.management_allowed(t,'backoffice.work_orders.read')
 and private.management_allowed(t,'backoffice.functions.work_order_operational_task_data');
$$;
revoke all on function private.management_dossier_orders(uuid),private.management_dossier_tasks(uuid) from public,anon,authenticated,service_role;
grant execute on function private.management_dossier_orders(uuid),private.management_dossier_tasks(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.dossier_chain(target_tenant uuid, target_customer uuid DEFAULT NULL::uuid, target_object uuid DEFAULT NULL::uuid, target_personnel uuid DEFAULT NULL::uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;can_hr boolean;can_ops boolean;
begin
 if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','hr','planner','finance']::public.app_role[]) then raise exception 'Geen dossiertoegang' using errcode='42501';end if;
 can_hr:=private.dossier_access(target_tenant);can_ops:=private.has_role(target_tenant,array['tenant_admin','management','planner','finance']::public.app_role[]) and private.service_enabled(target_tenant,'planning');
 if target_customer is not null and not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer) then raise exception 'Klant niet beschikbaar' using errcode='42501';end if;
 if target_object is not null and not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object and (target_customer is null or customer_id=target_customer)) then raise exception 'Object niet beschikbaar' using errcode='42501';end if;
 if target_personnel is not null and not can_hr then raise exception 'Geen toegang tot personeelsdossier' using errcode='42501';end if;
 if target_order is not null and not exists(select 1 from private.management_dossier_orders(target_tenant) where tenant_id=target_tenant and id=target_order and (target_customer is null or customer_id=target_customer) and (target_object is null or object_id=target_object)) then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 with orders as (
  select w.* from private.management_dossier_orders(target_tenant) w where w.tenant_id=target_tenant and (target_customer is null or w.customer_id=target_customer) and (target_object is null or w.object_id=target_object) and (target_order is null or w.id=target_order)
  and (target_personnel is null or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.personnel_id=target_personnel))
 ),actions as (
  select 'request'::text kind,r.id,r.title,r.state status,r.priority,null::date due_on,null::uuid owner_id,r.version,w.customer_id,r.object_id,null::uuid personnel_id,r.work_order_id,r.needs_review,
   '/app/objecten/'||r.object_id::text||'?tab=instructies#request-'||r.id::text href
  from public.object_visit_requests r join orders w on w.id=r.work_order_id where can_ops
  union all
  select 'execution',t.id,t.task_name,case when t.completed_at is not null and t.execution_state='planned' then 'completed' else t.execution_state end,'normal',(w.projected_end_at at time zone (select timezone from public.tenants where id=target_tenant))::date,null,t.execution_version,w.customer_id,w.object_id,null,w.id,false,'/app/werkbonnen/'||w.id::text||'#uitvoering'
  from private.management_dossier_tasks(target_tenant) t join orders w on w.id=t.work_order_id where can_ops
  union all
  select 'object',r.id,r.title,r.state,'normal',r.due_on,r.owner_user_id,r.version,o.customer_id,r.object_id,null,r.work_order_id,false,'/app/objecten/'||r.object_id::text||'?tab='||case r.kind when 'quality' then 'kwaliteit' when 'material' then 'materialen' else 'instructies' end||'#record-'||r.id::text
  from public.object_records r join public.objects o on o.id=r.object_id and o.tenant_id=r.tenant_id where r.tenant_id=target_tenant and can_ops and r.kind in ('task','quality','material') and target_personnel is null and (target_customer is null or o.customer_id=target_customer) and (target_object is null or o.id=target_object) and (target_order is null or r.work_order_id=target_order)
  union all
  select 'personnel',p.id,p.title,p.dossier_status,'normal',p.due_on,p.owner_user_id,p.dossier_revision,null,null,p.personnel_id,null,false,'/app/personeel/'||p.personnel_id::text||'?tab='||case p.kind when 'task' then 'tijdlijn' else 'overzicht' end||'#record-'||p.id::text
  from public.personnel_dossier_items p where p.tenant_id=target_tenant and can_hr and p.kind in ('task','checklist') and target_customer is null and target_object is null and target_order is null and (target_personnel is null or p.personnel_id=target_personnel)
 ),docs as (
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.version,c.created_at,c.document_on,c.valid_until,'/api/files/dossier-document/'||d.id::text href
  from public.dossier_documents d join public.customer_documents c on c.id=d.source_id and d.source_kind='customer' where d.tenant_id=target_tenant and target_personnel is null and target_order is null and (target_customer is null or d.customer_id=target_customer) and (target_object is null or exists(select 1 from public.customer_agreements a join public.customer_agreement_lines l on l.agreement_id=a.id where a.evidence_document_id=c.id and l.object_id=target_object))
  union all
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.version,c.created_at,null::date,c.valid_until::date,'/api/files/dossier-document/'||d.id::text from public.dossier_documents d join public.object_documents c on c.id=d.source_id and d.source_kind='object' where d.tenant_id=target_tenant and target_personnel is null and (target_customer is null or d.customer_id=target_customer) and (target_object is null or d.object_id=target_object) and (target_order is null or c.work_order_id=target_order)
  union all
  select d.id,d.source_kind,d.source_id,d.classification,c.title,c.dossier_revision,c.created_at,null::date,null::date,'/api/files/dossier-document/'||d.id::text from public.dossier_documents d join public.personnel_documents c on c.id=d.source_id and d.source_kind='personnel' where d.tenant_id=target_tenant and can_hr and target_customer is null and target_object is null and target_order is null and (target_personnel is null or d.personnel_id=target_personnel)
 )
 select jsonb_build_object(
 'actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_on nulls last,a.id) from actions a),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from docs d),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('customer_id',w.customer_id,'proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]'))) from public.object_visit_requests r join orders w on w.id=r.work_order_id where can_ops),'[]'),
 'agreements',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l)) from public.customer_agreement_lines l where l.agreement_id=a.id),'[]'))) from public.customer_agreements a where a.tenant_id=target_tenant and target_personnel is null and target_order is null and (target_customer is null or a.customer_id=target_customer) and (target_object is null or exists(select 1 from public.customer_agreement_lines l where l.agreement_id=a.id and l.object_id=target_object))),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'status',i.status,'total',i.total_cents,'paid',i.paid_cents,'due',i.due_on)) from public.invoices i where i.tenant_id=target_tenant and target_personnel is null and (target_customer is null or i.customer_id=target_customer) and ((target_object is null and target_order is null) or exists(select 1 from public.invoice_lines l join orders w on w.id=l.work_order_id where l.invoice_id=i.id))),'[]'),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'sourceId',h.source_id,'type',h.source_table,'version',h.version,'at',h.created_at,'event',h.event) order by h.created_at desc) from public.object_history h join public.objects o on o.id=h.object_id where h.tenant_id=target_tenant and can_ops and target_personnel is null and (target_customer is null or o.customer_id=target_customer) and (target_object is null or o.id=target_object) and (target_order is null or h.source_id in (select id from public.object_visit_requests where work_order_id=target_order))),'[]')
 ) into result;
 return result;
end $function$;

-- Composite mutation replies obey the live financial permission, including compatibility roles.
create or replace function private.staff_work_order_result(w public.work_orders)
returns public.work_orders language sql stable security definer set search_path='' as $$
 select case when private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) and private.management_allowed(w.tenant_id,'backoffice.finance.read') then w
 else jsonb_populate_record(null::public.work_orders,(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(w)) where key=any(array[
 'id','tenant_id','work_order_number','customer_id','object_id','discipline','title','description','day_instructions','priority',
 'status','version','report_version','report_state','signature_required','signature_mode','employee_signature_required',
 'planned_start_at','planned_end_at','projected_start_at','projected_end_at','actual_start_at','actual_end_at',
 'created_at','updated_at','required_personnel','planning_state','requested_date','duration_minutes','location_label']))) end
$$;
revoke all on function private.staff_work_order_result(public.work_orders) from public,anon,authenticated,service_role;

-- Report review does not require access to unrelated commercial or financial pages.
do $review$declare definition text;begin
 select pg_get_functiondef('private.work_order_review_legacy(uuid,text,text)'::regprocedure) into definition;
 if position('if not private.commercial_access(w.tenant_id) then' in definition)=0 then raise exception 'Unexpected report-review contract';end if;
 execute replace(definition,'if not private.commercial_access(w.tenant_id) then',
 'if not private.has_role(w.tenant_id,array[''tenant_admin'',''management'',''finance'']::public.app_role[]) or not private.management_allowed(w.tenant_id,''backoffice.reports.write'') then');
end$review$;

-- A personnel invitation may append only the portal role, never management powers.
create function public.bind_personnel_account(target_tenant uuid,expected_user uuid,expected_email text)
returns void language plpgsql security definer set search_path='' as $bind$
declare recipient auth.users; membership public.tenant_memberships;
begin
 perform private.management_assert(target_tenant,'backoffice.personnel.write');
 perform private.management_assert(target_tenant,'backoffice.functions.invite_personnel');
 if not private.actor_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','hr']::public.app_role[])
 or not private.service_enabled(target_tenant,'personeel') or not exists(select 1 from public.tenants where id=target_tenant and status='active') then
  raise exception 'Geen toegang tot personeelsuitnodigingen.' using errcode='42501';end if;
 select * into recipient from auth.users where id=expected_user for update;
 if recipient.id is null or recipient.deleted_at is not null or coalesce(recipient.is_anonymous,false)
 or (recipient.banned_until is not null and recipient.banned_until>now())
 or recipient.email is null or lower(recipient.email) is distinct from lower(btrim(expected_email)) then
  raise exception 'Het uitnodigingsaccount kon niet worden gecontroleerd.' using errcode='42501';end if;
 select * into membership from public.tenant_memberships where tenant_id=target_tenant and user_id=expected_user for update;
 if membership.id is null then
  insert into public.tenant_memberships(tenant_id,user_id,roles,status,activated_at) values(target_tenant,expected_user,array['staff']::public.app_role[],'active',now());
 elsif membership.status<>'active' then
  raise exception 'Dit account is niet actief binnen jouw organisatie.' using errcode='42501';
 elsif not 'staff'=any(membership.roles) then
  update public.tenant_memberships set roles=array_append(roles,'staff'::public.app_role) where id=membership.id;
 end if;
end$bind$;
revoke all on function public.bind_personnel_account(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.bind_personnel_account(uuid,uuid,text) to authenticated;

-- A removed backoffice profile does not remove an independently active employee's own inbox.
-- Concrete staff identity, existing grant scope and disabled grants remain authoritative.
create function private.notification_staff_own(t uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $own$
 select exists(select 1 from public.permission_grants g
 join public.tenant_memberships m on m.id=g.membership_id and m.tenant_id=g.tenant_id and m.user_id=g.user_id
 join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id and p.status='active'
 where g.tenant_id=t and g.user_id=actor and g.capability='notifications.read_own' and g.enabled
 and m.status='active' and 'staff'=any(m.roles)
 and (not(g.scope?'tenant_ids') or g.scope->'tenant_ids' ? t::text)
 and (not(g.scope?'personnel_ids') or g.scope->'personnel_ids' ? p.id::text)
 and not(g.scope ?| array['category_ids','object_ids','customer_ids'])
 and not coalesce((g.scope->>'assigned_only')::boolean,false)
 and (g.scope->>'all'='true' or g.scope ?| array['tenant_ids','personnel_ids']));
$own$;
revoke all on function private.notification_staff_own(uuid,uuid) from public,anon,authenticated,service_role;
do $own$declare definition text;begin
 select pg_get_functiondef('private.notification_access(uuid,text,uuid)'::regprocedure) into definition;
 if position('ctx in (''customer'',''platform'') or private.notification_cap' in definition)=0 then raise exception 'Unexpected notification access contract';end if;
 execute replace(replace(definition,'ctx in (''customer'',''platform'') or private.notification_cap','ctx in (''customer'',''platform'') or (ctx=''staff'' and private.notification_staff_own(t,actor)) or (ctx<>''staff'' and private.notification_cap'),'where tenant_id=t and user_id=actor)) when ctx in', 'where tenant_id=t and user_id=actor))) when ctx in');
end$own$;
