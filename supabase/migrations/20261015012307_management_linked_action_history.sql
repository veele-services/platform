-- Keep the single shared action attached to its current decision/requirement.
-- Each new audit entry captures its own source/classification at insertion.
-- Historical notes never inherit a later, less restrictive classification.
alter table private.cockpit_events add column history_scope text,add column history_source_kind text,add column history_source_id uuid;
create function private.cockpit_event_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.record_kind='action:manual' then
  select a.scope,a.source_kind,a.source_id into new.history_scope,new.history_source_kind,new.history_source_id from private.cockpit_actions a where a.tenant_id=new.tenant_id and a.id=new.record_id;
 elsif new.record_kind='decision' then
  select d.scope,d.source_kind,d.source_id into new.history_scope,new.history_source_kind,new.history_source_id from private.cockpit_decisions d where d.tenant_id=new.tenant_id and d.id=new.record_id;
 end if;
 return new;
end$$;
revoke all on function private.cockpit_event_context() from public,anon,authenticated,service_role;
create trigger cockpit_event_context before insert on private.cockpit_events for each row execute function private.cockpit_event_context();
-- Standalone action sources/classifications are immutable under the command API.
-- Linked governance history without recorded provenance remains retained, but
-- is not exposed by guessing its historic source from the latest revision.
update private.cockpit_events e set history_scope=a.scope,history_source_kind=a.source_kind,history_source_id=a.source_id from private.cockpit_actions a where e.record_kind='action:manual' and e.tenant_id=a.tenant_id and e.record_id=a.id and(a.trigger_key is null or a.trigger_key not like 'decision:%' and a.trigger_key not like 'requirement:%');
create or replace function private.cockpit_governance_assert(t uuid,module text,writing boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if module is null or module not in('decisions','compliance') then raise exception 'Onbekend managementregister.' using errcode='22023';end if;
 perform private.cockpit_assert(t,'backoffice.'||module||'.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 if writing then perform private.cockpit_assert(t,'backoffice.'||module||'.write');perform private.cockpit_assert(t,'backoffice.followup.write');perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup_command');end if;
 if module='compliance' and not private.cockpit_scope(t,'quality') then raise exception 'Geen toegang tot kwaliteitsbeheer.' using errcode='42501';end if;
end$$;
create or replace function public.cockpit_governance_command(target_tenant uuid,module text,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<cockpit_governance_command>>
declare d private.cockpit_decisions;r private.cockpit_requirements;receipt private.cockpit_receipts;fingerprint text;result jsonb;actor uuid:=auth.uid();record uuid:=nullif(input->>'id','')::uuid;owner uuid:=nullif(input->>'owner','')::uuid;evidence jsonb;event text;begin
 perform private.cockpit_governance_assert(target_tenant,module,true);
 if not private.cockpit_owner(target_tenant,owner) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;
 if request_id is null or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>40000 or command is null then raise exception 'Ongeldige opdracht.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));
 perform private.cockpit_governance_assert(target_tenant,module,true);
 if not private.cockpit_owner(target_tenant,owner) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;
 fingerprint:=encode(extensions.digest(module||command||input::text,'sha256'),'hex');
 if module='decisions' then select * into d from private.cockpit_decisions where tenant_id=target_tenant and id=record;
  if d.id is not null and not private.cockpit_decision_visible(d) then raise exception 'Geen toegang tot de huidige besluitbron.' using errcode='42501';end if;
 else select * into r from private.cockpit_requirements where tenant_id=target_tenant and id=record;
  if r.id is not null and not private.cockpit_requirement_visible(r) then raise exception 'Geen toegang tot de huidige bewijsbron.' using errcode='42501';end if;
 end if;
 select * into receipt from private.cockpit_receipts c where c.tenant_id=target_tenant and c.actor_id=actor and c.request_id=cockpit_governance_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 if record is null or not private.cockpit_owner(target_tenant,owner) then raise exception 'Kies een geldige registratie en verantwoordelijke.' using errcode='22023';end if;
 if module='decisions' then
  if command not in('save','publish','revise','save_revision','publish_revision') or exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','title','reason','motivation','scope','owner','sourceKind','sourceId','followup','due')) then raise exception 'Ongeldige beslisnotitie.' using errcode='22023';end if;
  select * into d from private.cockpit_decisions where tenant_id=target_tenant and id=record for update;
  perform private.cockpit_governance_assert(target_tenant,module,true);
 if not private.cockpit_owner(target_tenant,owner) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;
  if d.id is not null and(not private.cockpit_decision_visible(d) or d.revision is distinct from (input->>'revision')::bigint) then raise exception 'De notitie is niet beschikbaar of intussen gewijzigd.' using errcode='40001';end if;
  if command in('save_revision','publish_revision') then
   if d.id is null or d.state<>'final' then raise exception 'Start een revisie vanuit de actuele vastgestelde versie.' using errcode='23514';end if;
   update private.cockpit_decisions set state='draft',version=version+1,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into d;
   insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'decision',d.id,actor,'revised',d.revision,jsonb_build_object('version',d.version,'scope',d.scope));
   command:=case command when 'publish_revision' then 'publish' else 'save' end;
  end if;
  if command='revise' then
   if d.id is null or d.state<>'final' then raise exception 'Alleen een vastgesteld besluit kan worden herzien.' using errcode='23514';end if;
   update private.cockpit_decisions set state='draft',version=version+1,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into d;event:='revised';
  else
   if d.id is not null and d.state<>'draft' then raise exception 'Maak eerst een nieuwe revisie; een vastgesteld besluit blijft bewaard.' using errcode='23514';end if;
   if owner is null or not private.cockpit_source(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid) or not private.cockpit_scope(target_tenant,input->>'scope') or(input->>'sourceKind'='personnel' and input->>'scope'<>'personnel') then raise exception 'Kies een toegankelijke bron, classificatie en verantwoordelijke.' using errcode='42501';end if;
   if d.id is null then insert into private.cockpit_decisions(id,tenant_id,title,reason,motivation,scope,owner_id,source_kind,source_id,wants_followup,created_by) values(record,target_tenant,btrim(input->>'title'),btrim(input->>'reason'),btrim(input->>'motivation'),input->>'scope',owner,input->>'sourceKind',(input->>'sourceId')::uuid,coalesce((input->>'followup')::boolean,false),actor) returning * into d;
   else update private.cockpit_decisions set title=btrim(input->>'title'),reason=btrim(input->>'reason'),motivation=btrim(input->>'motivation'),scope=input->>'scope',owner_id=owner,source_kind=input->>'sourceKind',source_id=(input->>'sourceId')::uuid,wants_followup=coalesce((input->>'followup')::boolean,false),revision=revision+1,updated_at=clock_timestamp() where id=record returning * into d;end if;
   event:='saved';
   if command='publish' then
    if d.wants_followup and d.followup_action_id is null then
     if not private.cockpit_access(target_tenant,'backoffice.followup.write') or not private.cockpit_access(target_tenant,'backoffice.functions.cockpit_followup_command') or nullif(input->>'due','') is null then raise exception 'Een vervolgactie vereist wijzigingsrecht en een deadline.' using errcode='42501';end if;
     insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,trigger_key,created_by)
     values(target_tenant,d.source_kind,d.source_id,'Besluit uitvoeren: '||left(d.title,160),d.scope,(input->>'due')::date,(input->>'due')::date,owner,'decision:'||d.id,actor) returning id into d.followup_action_id;
     insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'action:manual',d.followup_action_id,actor,'create',1,jsonb_build_object('decisionId',d.id,'note','Vervolgactie bij vastgesteld besluit'));
    end if;
    if d.followup_action_id is not null then
     perform 1 from private.cockpit_actions where id=d.followup_action_id for update;
     perform private.cockpit_governance_assert(target_tenant,module,true);
     if not private.cockpit_decision_visible(d) then raise exception 'De bron- of classificatierechten zijn intussen gewijzigd.' using errcode='42501';end if;
     if not private.cockpit_owner(target_tenant,d.owner_id) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;
     update private.cockpit_actions set title='Besluit uitvoeren: '||left(d.title,160),scope=d.scope,owner_id=d.owner_id,note=concat_ws(E'\n',case when(source_kind,source_id,scope)=(d.source_kind,d.source_id,d.scope) then nullif(note,'') end,'Vastgestelde besluitversie '||d.version),source_kind=d.source_kind,source_id=d.source_id,revision=revision+1,updated_at=clock_timestamp() where id=d.followup_action_id;
     insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) select target_tenant,'action:manual',a.id,actor,'updated',a.revision,jsonb_build_object('decisionId',d.id,'note','Opvolging bijgewerkt vanuit vastgestelde besluitversie '||d.version) from private.cockpit_actions a where a.id=d.followup_action_id;
    end if;
    update private.cockpit_decisions set state='final',followup_action_id=d.followup_action_id where id=record returning * into d;
    insert into private.cockpit_decision_versions(tenant_id,decision_id,version,snapshot,scope,source_kind,source_id,actor_id) values(target_tenant,d.id,d.version,to_jsonb(d),d.scope,d.source_kind,d.source_id,actor);event:='published';
   end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',d.id,'revision',d.revision);
  insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'decision',d.id,actor,event,d.revision,jsonb_build_object('version',d.version,'scope',d.scope));
 else
  if command not in('save','approve') or exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','title','subject','owner','sourceKind','sourceId','expiresOn','evidenceId')) then raise exception 'Ongeldige compliance-eis.' using errcode='22023';end if;
  select * into r from private.cockpit_requirements where tenant_id=target_tenant and id=record for update;perform private.cockpit_governance_assert(target_tenant,module,true);
 if not private.cockpit_owner(target_tenant,owner) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;
  if r.id is not null and(not private.cockpit_requirement_visible(r) or r.revision is distinct from (input->>'revision')::bigint) then raise exception 'De eis is niet beschikbaar of intussen gewijzigd.' using errcode='40001';end if;
  if command='save' then
   if not private.cockpit_source(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid) or(input->>'sourceKind'='personnel' and not private.cockpit_scope(target_tenant,'personnel')) then raise exception 'Kies een toegankelijk dossier.' using errcode='42501';end if;
   evidence:=private.cockpit_evidence(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid,nullif(input->>'evidenceId','')::uuid);
   if nullif(input->>'evidenceId','') is not null and evidence is null then raise exception 'Het bewijs is niet toegankelijk, niet gekoppeld aan dit dossier of nog niet veilig opgeslagen.' using errcode='42501';end if;
   if r.id is null then insert into private.cockpit_requirements(id,tenant_id,title,subject,source_kind,source_id,owner_id,expires_on,evidence_id,created_by) values(record,target_tenant,btrim(input->>'title'),btrim(input->>'subject'),input->>'sourceKind',(input->>'sourceId')::uuid,owner,nullif(input->>'expiresOn','')::date,nullif(input->>'evidenceId','')::uuid,actor) returning * into r;
   else update private.cockpit_requirements set title=btrim(input->>'title'),subject=btrim(input->>'subject'),source_kind=input->>'sourceKind',source_id=(input->>'sourceId')::uuid,owner_id=owner,expires_on=nullif(input->>'expiresOn','')::date,evidence_id=nullif(input->>'evidenceId','')::uuid,approved_fingerprint=null,approved_at=null,approved_by=null,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into r;end if;event:='saved';
  else
   if r.id is null then raise exception 'Eis niet beschikbaar.' using errcode='42501';end if;
   evidence:=private.cockpit_evidence(target_tenant,r.source_kind,r.source_id,r.evidence_id);
   if evidence is null or r.owner_id is null or not private.cockpit_owner(target_tenant,r.owner_id) or r.expires_on is null or r.expires_on<(now() at time zone(select timezone from public.tenants where id=target_tenant))::date then raise exception 'Goedkeuring vereist toegankelijk, gecontroleerd bewijs met een geldige vervaldatum.' using errcode='23514';end if;
   update private.cockpit_requirements set approved_fingerprint=evidence->>'fingerprint',approved_at=clock_timestamp(),approved_by=actor,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into r;event:='approved';
  end if;
  insert into private.cockpit_requirement_versions(tenant_id,requirement_id,revision,snapshot,actor_id,event) values(target_tenant,r.id,r.revision,to_jsonb(r)||jsonb_build_object('evidence',evidence),actor,event);
  perform private.cockpit_requirement_sync(r,actor,true);
  result:=jsonb_build_object('ok',true,'id',r.id,'revision',r.revision);
 end if;
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$$;

create or replace function private.cockpit_requirement_sync(r private.cockpit_requirements,actor uuid default null,sync_owner boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare a private.cockpit_actions;status text:=private.cockpit_requirement_measure(r);version bigint;event text;today date:=(now() at time zone(select timezone from public.tenants where id=r.tenant_id))::date;begin
 select * into a from private.cockpit_actions where tenant_id=r.tenant_id and id=r.followup_action_id for update;
 if actor is not null then perform private.cockpit_governance_assert(r.tenant_id,'compliance',true);if not private.cockpit_requirement_visible(r) then raise exception 'De bewijsbron is niet meer toegankelijk.' using errcode='42501';end if;if not private.cockpit_owner(r.tenant_id,r.owner_id) then raise exception 'De verantwoordelijke is niet meer actief.' using errcode='22023';end if;end if;
 if a.id is not null and not(a.state='done' and status<>'Geldig') and(a.title,a.source_kind,a.source_id,a.scope) is distinct from('Bewijs controleren: '||left(r.title,160),r.source_kind,r.source_id,case when r.source_kind='personnel' then 'personnel' else 'quality' end) then
  update private.cockpit_actions set title='Bewijs controleren: '||left(r.title,160),note=case when(source_kind,source_id,scope)=(r.source_kind,r.source_id,case when r.source_kind='personnel' then 'personnel' else 'quality' end) then note else '' end,source_kind=r.source_kind,source_id=r.source_id,scope=case when r.source_kind='personnel' then 'personnel' else 'quality' end,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning * into a;
  insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(r.tenant_id,'action:manual',a.id,actor,'updated',a.revision,jsonb_build_object('requirementId',r.id,'note','Actie gekoppeld aan de actuele bewijsbron'));
 end if;
 if status<>'Geldig' and(a.id is null or a.state='done') then
  insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,automatic,trigger_key,created_by)
  values(r.tenant_id,r.source_kind,r.source_id,'Bewijs controleren: '||left(r.title,160),case when r.source_kind='personnel' then 'personnel' else 'quality' end,coalesce(r.expires_on,today),coalesce(r.expires_on,today),r.owner_id,true,'requirement:'||r.id||':'||r.revision,actor)
  on conflict(tenant_id,source_kind,source_id,trigger_key) do nothing returning * into a;
  if a.id is not null then update private.cockpit_requirements set followup_action_id=a.id where id=r.id;event:='create';version:=a.revision;end if;
 elsif status='Geldig' and a.id is not null and a.state<>'done' then
  update private.cockpit_actions set state='done',snoozed_until=null,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning revision into version;event:='complete';
 end if;
 if event is not null then insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(r.tenant_id,'action:manual',a.id,actor,event,version,jsonb_build_object('requirementId',r.id,'note',case event when 'complete' then 'Actueel bewijs is beoordeeld en geldig.' else 'Bewijs vraagt aandacht: '||status end));end if;
 if sync_owner and a.id is not null and a.owner_id is distinct from r.owner_id then update private.cockpit_actions set owner_id=r.owner_id,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning revision into version;insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(r.tenant_id,'action:manual',a.id,actor,'assign',version,jsonb_build_object('owner',r.owner_id,'note','Verantwoordelijke bijgewerkt vanuit de compliance-eis'));end if;
 update private.cockpit_requirements set checked_at=clock_timestamp() where id=r.id;
end$$;

create or replace function public.cockpit_action_history(target_tenant uuid,kind text,record_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source_kind text;a private.cockpit_actions;begin
 perform private.cockpit_assert(target_tenant,'backoffice.followup.read');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup');
 if kind='manual' then
  select * into a from private.cockpit_actions where tenant_id=target_tenant and id=record_id;
  if not found or not private.cockpit_action_visible(a) then raise exception 'Actie niet beschikbaar.' using errcode='42501';end if;
 else
  source_kind:=case kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' when 'request' then 'request' when 'execution' then 'execution' end;
  if source_kind is null or not private.cockpit_source(target_tenant,source_kind,record_id) then raise exception 'Bron niet beschikbaar.' using errcode='42501';end if;
 end if;
 return coalesce((select jsonb_agg(row order by row->>'createdAt' desc,row->>'id') from(
  select jsonb_build_object('id',e.id,'event',e.event,'revision',e.revision,'details',e.details,'createdAt',e.created_at,
   'actor',case when e.actor_id is null then 'Automatische controle' else coalesce(nullif(mm.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker') end) row
  from private.cockpit_events e left join auth.users u on u.id=e.actor_id left join public.tenant_memberships m on m.tenant_id=e.tenant_id and m.user_id=e.actor_id
  left join private.management_members mm on mm.membership_id=m.id and mm.tenant_id=e.tenant_id
  where e.tenant_id=target_tenant and e.record_kind='action:'||kind and e.record_id=cockpit_action_history.record_id and(kind<>'manual' or private.cockpit_history_scope(target_tenant,e.history_scope,e.history_source_kind,e.history_source_id)) order by e.created_at desc,e.id limit 100
 )events),'[]');
end$$;

create or replace function private.cockpit_decision_dto(d private.cockpit_decisions,detail boolean default false,history_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('followup',(select jsonb_build_object('id',a.id,'state',a.state,'revision',a.revision,'canModify',private.cockpit_access(d.tenant_id,'backoffice.followup.write') and private.cockpit_access(d.tenant_id,'backoffice.functions.cockpit_followup_command')) from private.cockpit_actions a where a.id=d.followup_action_id and private.cockpit_action_visible(a)),
 'versions',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'snapshot',v.snapshot,'createdAt',v.created_at) order by v.version desc),'[]') from(select * from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_history_scope(d.tenant_id,v.scope,v.source_kind,v.source_id) order by version desc limit 20 offset(history_page-1)*20)v) else '[]'::jsonb end,
 'versionTotal',(select count(*) from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_history_scope(d.tenant_id,v.scope,v.source_kind,v.source_id)),
 'history',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('event',e.event,'details',e.details,'createdAt',e.created_at) order by e.created_at desc,e.id),'[]') from(select * from private.cockpit_events e where e.tenant_id=d.tenant_id and e.record_kind='decision' and e.record_id=d.id and private.cockpit_history_scope(d.tenant_id,e.history_scope,e.history_source_kind,e.history_source_id) order by e.created_at desc,e.id limit 100)e) else '[]'::jsonb end)
$$;
notify pgrst,'reload schema';
