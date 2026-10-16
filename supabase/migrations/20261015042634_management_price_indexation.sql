SET local check_function_bodies = off;

CREATE TABLE "private"."cockpit_indexation_lines" (
  "tenant_id"     uuid NOT NULL,
  "indexation_id" uuid NOT NULL,
  "old_line_id"   uuid NOT NULL,
  "new_line_id"   uuid NOT NULL,
  "effective_on"  date NOT NULL,
  CONSTRAINT "cockpit_indexation_lines_pkey" PRIMARY KEY (tenant_id, old_line_id),
  CONSTRAINT "cockpit_indexation_lines_tenant_id_new_line_id_key" UNIQUE (tenant_id, new_line_id)
);

ALTER TABLE "private"."cockpit_indexation_lines"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_indexation_lines"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."cockpit_indexation_versions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "indexation_id" uuid                     NOT NULL,
  "version"       integer                  NOT NULL,
  "snapshot"      jsonb                    NOT NULL,
  "created_by"    uuid                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "cockpit_indexation_versions_indexation_id_version_key" UNIQUE (indexation_id, VERSION),
  CONSTRAINT "cockpit_indexation_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "cockpit_indexation_versions_version_check" CHECK ((version > 0))
);

ALTER TABLE "private"."cockpit_indexation_versions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_indexation_versions"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "private"."cockpit_indexations" (
  "id"                     uuid                     NOT NULL,
  "tenant_id"              uuid                     NOT NULL,
  "agreement_id"           uuid                     NOT NULL,
  "customer_id"            uuid                     NOT NULL,
  "state"                  text                     NOT NULL DEFAULT 'Concept'::text,
  "revision"               bigint                   NOT NULL DEFAULT 1,
  "version"                integer                  NOT NULL DEFAULT 1,
  "percent_basis_points"   integer                  NOT NULL,
  "effective_on"           date                     NOT NULL,
  "source_snapshot"        jsonb                    NOT NULL,
  "source_fingerprint"     text                     NOT NULL,
  "approved_by"            uuid,
  "approved_at"            timestamp with time zone,
  "processed_agreement_id" uuid,
  "created_by"             uuid                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "cockpit_indexations_percent_basis_points_check" CHECK (((percent_basis_points >= 0) AND (percent_basis_points <= 2500))),
  CONSTRAINT "cockpit_indexations_pkey" PRIMARY KEY (id),
  CONSTRAINT "cockpit_indexations_revision_check" CHECK ((revision > 0)),
  CONSTRAINT "cockpit_indexations_source_fingerprint_check" CHECK ((source_fingerprint ~ '^[a-f0-9]{64}$'::text)),
  CONSTRAINT "cockpit_indexations_state_check" CHECK ((state = ANY (ARRAY['Concept'::text, 'Ter goedkeuring'::text, 'Goedgekeurd'::text, 'Verwerkt'::text]))),
  CONSTRAINT "cockpit_indexations_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "cockpit_indexations_version_check" CHECK ((version > 0))
);

ALTER TABLE "private"."cockpit_indexations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."cockpit_indexations"
  FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.agreement_scope_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare l public.customer_agreement_lines; a public.customer_agreements; o uuid; w public.work_orders; business_day date; candidates uuid[];
begin
 if tg_table_name='work_order_tasks' then
  if new.scope_root_task_id is not null and new.scope_root_task_id<>new.id and exists(select 1 from public.work_order_scope_transfers x where x.tenant_id=new.tenant_id and x.target_task_id=new.id) then return new;end if;
 end if;
 if tg_table_name='work_order_tasks' then
  if new.commercial_snapshot ? 'quote_id' then return new;end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_table_name='work_order_tasks' then
  if tg_op='UPDATE' then
   if old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  else new.commercial_snapshot:='{}'::jsonb;end if;
 end if;
 if tg_table_name='work_order_tasks' then
 if tg_op='INSERT' and new.agreement_line_id is null and not new.is_extra_work and new.unit_price_cents>0 then
  select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select array_agg(distinct l1.id) into candidates from public.object_records r join public.customer_agreement_lines l1 on l1.id=private.cockpit_indexation_line(new.tenant_id,r.agreement_line_id,(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date) join public.customer_agreements a1 on a1.id=l1.agreement_id
  where a1.state='active' and l1.price_basis='visit' and not l1.extra_work and r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id
  and a1.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date and (a1.ends_on is null or a1.ends_on>=((w.projected_end_at - interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  and not exists(select 1 from public.customer_agreements next_a where next_a.previous_id=a1.id and next_a.state='active' and next_a.starts_on<=(w.projected_start_at at time zone (select timezone from public.tenants where id=new.tenant_id))::date)
  ;
  if cardinality(candidates)>1 then raise exception 'Meerdere contractregels zijn van toepassing. Kies de concrete contractregel voor deze uitvoering' using errcode='23514';end if;
  select * into l from public.customer_agreement_lines where id=candidates[1];
  if l.id is null and exists(select 1 from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='programme' and r.state='active' and r.task_revision_id=new.task_revision_id and r.agreement_line_id is not null) then raise exception 'Het werkprogramma heeft geen geldige contractversie voor dit bezoek. Werk eerst de klantafspraak bij' using errcode='23514';end if;
  if l.id is not null then new.agreement_line_id:=l.id;new.unit_price_cents:=l.price_cents;end if;
 end if;
 end if;
 if new.agreement_line_id is null then return new;end if;
 select * into l from public.customer_agreement_lines where tenant_id=new.tenant_id and id=new.agreement_line_id;
 select * into a from public.customer_agreements where tenant_id=new.tenant_id and id=l.agreement_id;
 if tg_table_name='object_records' then o:=new.object_id;else select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;o:=w.object_id;end if;
 if a.state<>'active' or l.price_basis<>'visit' or (tg_table_name='object_records' and l.extra_work) or l.id is null or l.object_id<>o or l.task_revision_id is distinct from new.task_revision_id or not exists(select 1 from public.objects where tenant_id=new.tenant_id and id=o and customer_id=a.customer_id) then raise exception 'De afspraak hoort niet bij dit object of deze catalogustaak' using errcode='23514';end if;
 if tg_table_name='work_order_tasks' then
  if l.extra_work is distinct from new.is_extra_work then raise exception 'De contractregel is niet bestemd voor dit type werk' using errcode='23514';end if;
  if tg_op='UPDATE' and (old.agreement_line_id is distinct from new.agreement_line_id or old.commercial_snapshot is distinct from new.commercial_snapshot) then raise exception 'De vastgelegde commerciële bron is onveranderlijk' using errcode='23514';end if;
  if new.unit_price_cents<>l.price_cents or new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0)>l.quantity or round((new.quantity+coalesce((select sum(t.quantity) from public.work_order_tasks t where t.tenant_id=new.tenant_id and t.work_order_id=new.work_order_id and t.agreement_line_id=l.id and t.id<>new.id),0))*new.unit_price_cents)>l.limit_cents then raise exception 'De gezamenlijke uitvoering overschrijdt de afgesproken hoeveelheid of prijs per bezoek' using errcode='23514';end if;
  if tg_op='INSERT' then
   if l.vat_basis_points is not null then new.vat_basis_points:=l.vat_basis_points;end if;
   business_day:=(coalesce(w.projected_start_at,clock_timestamp()) at time zone (select timezone from public.tenants where id=new.tenant_id))::date;
   if a.state<>'active' or a.starts_on>business_day or a.ends_on<((coalesce(w.projected_end_at,w.projected_start_at,clock_timestamp())-interval '1 microsecond') at time zone (select timezone from public.tenants where id=new.tenant_id))::date or exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active' and n.starts_on<=business_day) then raise exception 'Kies de geldige contractversie voor deze uitvoering' using errcode='23514';end if;
   if new.quantity>l.quantity or new.unit_price_cents<>l.price_cents or round(new.quantity*new.unit_price_cents)>l.limit_cents then raise exception 'Deze uitvoering overschrijdt de contractafspraak' using errcode='23514';end if;
   new.commercial_snapshot:=jsonb_build_object('agreementId',a.id,'version',a.version,'lineId',l.id,'scope',l.scope,'quantity',l.quantity,'limitCents',l.limit_cents,'priceCents',l.price_cents,'acceptedBy',a.accepted_by_name,'acceptedOn',a.accepted_on,'evidenceDocumentId',a.evidence_document_id);
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_assert (
  t       uuid,
  writing boolean DEFAULT false
)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$begin
 perform private.management_assert(t,'backoffice.finance.read');perform private.management_assert(t,'backoffice.customers.read');perform private.management_assert(t,'backoffice.functions.cockpit_indexation_query');
 if not private.object_session_active() or not private.commercial_access(t) or not private.customer_manage(t) or not private.service_enabled(t,'finance') then raise exception 'Actuele financiële en klantdossiertoegang vereist.' using errcode='42501';end if;
 if writing then perform private.management_assert(t,'backoffice.finance.write');perform private.management_assert(t,'backoffice.functions.cockpit_indexation_command');end if;
end$function$;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_line (
  t            uuid,
  original     uuid,
  business_day date
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare selected uuid:=original;next_line uuid;depth integer:=0;begin
 loop
  select m.new_line_id into next_line from private.cockpit_indexation_lines m join private.cockpit_indexations i on i.tenant_id=m.tenant_id and i.id=m.indexation_id and i.state='Verwerkt' join public.customer_agreement_lines l on l.tenant_id=m.tenant_id and l.id=m.new_line_id join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id and a.state='active' where m.tenant_id=t and m.old_line_id=selected and m.effective_on<=business_day;
  if next_line is null then return selected;end if;selected:=next_line;depth:=depth+1;if depth>50 then raise exception 'Contractversieketen is te diep; controleer de bron.' using errcode='23514';end if;
 end loop;
end$function$;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_owner (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.actor_session_active() and exists(select 1 from private.management_members mm join private.management_roles r on r.tenant_id=mm.tenant_id and r.id=mm.role_id join public.tenant_memberships m on m.id=mm.membership_id and m.tenant_id=mm.tenant_id where mm.tenant_id=t and m.user_id=auth.uid() and m.status='active' and mm.revoked_at is null and r.code='owner')
$function$;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_row (
  r private.cockpit_indexations
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('id',r.id,'agreementId',r.agreement_id,'customerId',r.customer_id,'customer',r.source_snapshot->>'customer','contract',(r.source_snapshot#>>'{agreement,title}')||' · v'||(r.source_snapshot#>>'{agreement,version}'),
 'baseCents',(select sum(round((l->>'quantity')::numeric*(l->>'price_cents')::numeric)) from jsonb_array_elements(r.source_snapshot->'lines')l),
 'newCents',(select sum(round((l->>'quantity')::numeric*round((l->>'price_cents')::numeric*(10000+r.percent_basis_points)/10000))) from jsonb_array_elements(r.source_snapshot->'lines')l),
 'percent',r.percent_basis_points/100.0,'effective',r.effective_on,'status',r.state,'revision',r.revision,'version',r.version,'sourceFingerprint',r.source_fingerprint,'processedAgreementId',r.processed_agreement_id,
 'sourceChanged',r.source_fingerprint is distinct from encode(extensions.digest(private.cockpit_indexation_source(r.tenant_id,r.agreement_id)::text,'sha256'),'hex'),
 'history',(select coalesce(jsonb_agg(x.entry order by x.created_at),'[]') from(select e.created_at,jsonb_build_object('event',e.event,'createdAt',e.created_at,'version',e.details->'version','actor',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),'Financieel beheer')) entry from private.cockpit_events e left join auth.users u on u.id=e.actor_id where e.tenant_id=r.tenant_id and e.record_kind='indexation' and e.record_id=r.id order by e.created_at desc,e.id desc limit 50)x),
 'historyTotal',(select count(*) from private.cockpit_events e where e.tenant_id=r.tenant_id and e.record_kind='indexation' and e.record_id=r.id))
$function$;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_source (
  t      uuid,
  source uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select jsonb_build_object('agreement',to_jsonb(a),'customer',c.name,'successors',(select coalesce(jsonb_agg(n.id order by n.id),'[]') from public.customer_agreements n where n.tenant_id=t and n.previous_id=a.id),'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.customer_agreement_lines l where l.tenant_id=t and l.agreement_id=a.id))
 from public.customer_agreements a join public.customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id where a.tenant_id=t and a.id=source
$function$;

CREATE OR REPLACE FUNCTION public.cockpit_indexation_command (
  target_tenant uuid,
  command       text,
  input         jsonb,
  request_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_variable
declare actor uuid:=auth.uid();r private.cockpit_indexations;source jsonb;source_id uuid;fingerprint text;receipt private.cockpit_receipts;result jsonb;today date;bp integer;effective date;doc public.dossier_documents;e jsonb;native_input jsonb;new_agreement uuid;line jsonb;native_key uuid;action private.cockpit_actions;ver integer;native_result jsonb;begin
 perform private.cockpit_indexation_assert(target_tenant,true);
 if request_id is null or input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>12000 or command is null or command not in('save','submit','return','approve','process') or nullif(input->>'id','') is null then raise exception 'Controleer het indexatievoorstel.' using errcode='23514';end if;
 if exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','agreementId','fingerprint','percent','effective','evidenceId','acceptedBy','acceptedOn','confirmed')) then raise exception 'Deze opdracht bevat onbekende invoer.' using errcode='23514';end if;
 if command not in('save','process') and exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision')) or command='save' and exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','agreementId','fingerprint','percent','effective')) or command='process' and exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','evidenceId','acceptedBy','acceptedOn','confirmed')) then raise exception 'De invoer past niet bij deze opdracht.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));
 -- Native customer commands take this lock before any programme trigger takes
 -- the planning lock. Preserve that order in this adapter as well.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-customer:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from private.cockpit_indexations where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
 source_id:=case when command='save' then (input->>'agreementId')::uuid else r.agreement_id end;
 perform 1 from public.customer_agreements where tenant_id=target_tenant and id=source_id for update;
 perform 1 from public.customer_agreement_lines where tenant_id=target_tenant and agreement_id=source_id order by id for update;
 perform private.cockpit_indexation_assert(target_tenant,true);
 if command='approve' and not private.cockpit_indexation_owner(target_tenant) then raise exception 'Alleen de huidige eigenaar keurt een indexatie goed.' using errcode='42501';end if;
 if command='process' then perform private.management_assert(target_tenant,'backoffice.customers.write');perform private.management_assert(target_tenant,'backoffice.functions.customer_command');end if;
 fingerprint:=encode(extensions.digest(('indexation:'||command||':'||input::text),'sha256'),'hex');
 select * into receipt from private.cockpit_receipts x where x.tenant_id=target_tenant and x.actor_id=actor and x.request_id=cockpit_indexation_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Deze herhaalsleutel heeft andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 today:=(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date;
 if r.id is not null and r.revision is distinct from (input->>'revision')::bigint or r.id is null and command<>'save' then raise exception 'Het voorstel is gewijzigd. Laad de nieuwste versie.' using errcode='40001';end if;
 if r.id is not null and source_id is distinct from r.agreement_id then raise exception 'Een voorstel blijft aan zijn oorspronkelijke contract gebonden.' using errcode='23514';end if;
 source:=private.cockpit_indexation_source(target_tenant,source_id);
 if source is null or source#>>'{agreement,state}'<>'active' or source->>'customer' is null or jsonb_array_length(source->'lines') not between 1 and 100 or(command<>'return' and exists(select 1 from public.customer_agreements n where n.tenant_id=target_tenant and n.previous_id=source_id)) then raise exception 'Gebruik de actuele vastgelegde contractversie.' using errcode='40001';end if;
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=(source#>>'{agreement,customer_id}')::uuid and status='active') then raise exception 'De klant is niet beschikbaar.' using errcode='42501';end if;
 if command='save' then
  if r.id is not null and r.state<>'Concept' then raise exception 'Alleen een concept kan worden gewijzigd.' using errcode='23514';end if;
  bp:=round((input->>'percent')::numeric*100);effective:=(input->>'effective')::date;
  if bp is null or bp not between 0 and 2500 or (input->>'percent')::numeric<>bp/100.0 or effective is null or effective<today or effective<=(source#>>'{agreement,starts_on}')::date or effective>coalesce((source#>>'{agreement,ends_on}')::date,'infinity'::date) then raise exception 'Controleer percentage en ingangsdatum binnen de bestaande contractperiode.' using errcode='23514';end if;
  if input->>'fingerprint' is distinct from encode(extensions.digest(source::text,'sha256'),'hex') then raise exception 'De contractversie of regels zijn gewijzigd. Beoordeel de actuele bron.' using errcode='40001';end if;
  if(select sum(round((l->>'quantity')::numeric*(l->>'price_cents')::numeric)) from jsonb_array_elements(source->'lines')l)<=0 then raise exception 'Het contract heeft geen positief tarief.' using errcode='23514';end if;
  if r.id is null then insert into private.cockpit_indexations(id,tenant_id,agreement_id,customer_id,percent_basis_points,effective_on,source_snapshot,source_fingerprint,created_by) values((input->>'id')::uuid,target_tenant,source_id,(source#>>'{agreement,customer_id}')::uuid,bp,effective,source,encode(extensions.digest(source::text,'sha256'),'hex'),actor) returning * into r;
  else update private.cockpit_indexations set percent_basis_points=bp,effective_on=effective,source_snapshot=source,source_fingerprint=encode(extensions.digest(source::text,'sha256'),'hex'),revision=revision+1,version=version+1,approved_by=null,approved_at=null,updated_at=clock_timestamp() where id=r.id returning * into r;end if;
 else
  if command<>'return' and r.source_fingerprint is distinct from encode(extensions.digest(source::text,'sha256'),'hex') then raise exception 'De oorspronkelijke bron is gewijzigd. Werk het concept eerst bewust bij.' using errcode='40001';end if;
  if command='submit' and r.state<>'Concept' or command='approve' and r.state<>'Ter goedkeuring' or command='return' and r.state not in('Ter goedkeuring','Goedgekeurd') or command='process' and r.state<>'Goedgekeurd' then raise exception 'Deze overgang past niet bij de actuele status.' using errcode='23514';end if;
  if command<>'return' and r.effective_on<today then raise exception 'De ingangsdatum ligt in het verleden. Gebruik een actueel voorstel.' using errcode='23514';end if;
  if command='process' then
   if r.approved_by is null or input->'confirmed' is distinct from 'true'::jsonb or length(btrim(coalesce(input->>'acceptedBy',''))) not between 2 and 160 or nullif(input->>'acceptedOn','') is null or(input->>'acceptedOn')::date>today then raise exception 'Leg het daadwerkelijke klantakkoord afzonderlijk vast.' using errcode='23514';end if;
   e:=private.cockpit_evidence(target_tenant,'customer',r.customer_id,nullif(input->>'evidenceId','')::uuid);
   select * into doc from public.dossier_documents where tenant_id=target_tenant and id=(e->>'id')::uuid and source_kind='customer' and customer_id=r.customer_id;
   if e is null or doc.id is null or not exists(select 1 from public.customer_documents where tenant_id=target_tenant and id=doc.source_id and not archived) then raise exception 'Koppel een beschikbaar, gescand klantdocument als akkoordbewijs.' using errcode='23514';end if;
   new_agreement:=gen_random_uuid();native_key:=gen_random_uuid();
   native_input:=jsonb_build_object('id',new_agreement,'version',0,'customerId',r.customer_id,'previousId',r.agreement_id,'state','active','title',source#>>'{agreement,title}','type',source#>>'{agreement,agreement_type}',
    'startsOn',r.effective_on,'endsOn',coalesce(source#>>'{agreement,ends_on}',''),'ownerId',coalesce(source#>>'{agreement,owner_user_id}',''),'documentId',doc.source_id,'acceptedBy',btrim(input->>'acceptedBy'),'acceptedOn',input->>'acceptedOn',
    'reviewOn',coalesce(source#>>'{agreement,review_on}',''),'noticeOn',coalesce(source#>>'{agreement,notice_on}',''),'renewalOn',coalesce(source#>>'{agreement,renewal_on}',''),
    'lines',(select jsonb_agg(jsonb_build_object('objectId',l->>'object_id','taskRevisionId',l->>'task_revision_id','scope',l->>'scope','quantity',l->'quantity','priceCents',round((l->>'price_cents')::numeric*(10000+r.percent_basis_points)/10000),'limitCents',round((l->>'limit_cents')::numeric*(10000+r.percent_basis_points)/10000),
      'unit',l->>'unit','vatBasisPoints',l->'vat_basis_points','priceBasis',l->>'price_basis','frequency',l->>'frequency','window',l->>'time_window','durationMinutes',coalesce(l->>'duration_minutes',''),'extraWork',l->'extra_work') order by l->>'id') from jsonb_array_elements(source->'lines')l))
    ||(select jsonb_object_agg(k,coalesce(source#>array['agreement','details',k],'""'::jsonb)) from unnest(array['scope','exclusions','quality','frequency','window','billingFrequency','paymentTerms','reference','costCenter','materials','surcharges','indexation','noticePeriod','changeReason'])k);
   native_result:=public.customer_command(target_tenant,native_key,'agreement_save',native_input);
   perform private.cockpit_indexation_assert(target_tenant,true);perform private.management_assert(target_tenant,'backoffice.customers.write');perform private.management_assert(target_tenant,'backoffice.functions.customer_command');
   if private.cockpit_evidence(target_tenant,'customer',r.customer_id,doc.id)->>'fingerprint' is distinct from e->>'fingerprint' or not exists(select 1 from public.customers where tenant_id=target_tenant and id=r.customer_id and status='active') then raise exception 'Het klantdossier of akkoordbewijs is tijdens verwerking gewijzigd.' using errcode='42501';end if;
   -- Pair the complete transformed native line attributes. Equal duplicate
   -- lines are paired bijectively; physical tuple order is never a contract.
   with old_values as(select l.id,(to_jsonb(l)-array['id','agreement_id','tenant_id'])||jsonb_build_object('price_cents',round(l.price_cents::numeric*(10000+r.percent_basis_points)/10000),'limit_cents',round(l.limit_cents::numeric*(10000+r.percent_basis_points)/10000)) attrs from public.customer_agreement_lines l where l.tenant_id=target_tenant and l.agreement_id=r.agreement_id),
   new_values as(select l.id,to_jsonb(l)-array['id','agreement_id','tenant_id'] attrs from public.customer_agreement_lines l where l.tenant_id=target_tenant and l.agreement_id=new_agreement),
   old_lines as(select *,row_number() over(partition by attrs order by id) n from old_values),new_lines as(select *,row_number() over(partition by attrs order by id) n from new_values)
   insert into private.cockpit_indexation_lines(tenant_id,indexation_id,old_line_id,new_line_id,effective_on)
   select target_tenant,r.id,old_lines.id,new_lines.id,r.effective_on from old_lines join new_lines using(attrs,n);
   if(select count(*) from private.cockpit_indexation_lines where indexation_id=r.id)<>jsonb_array_length(source->'lines') then raise exception 'De nieuwe contractregels wijken af van het goedgekeurde voorstel.' using errcode='23514';end if;
   update private.cockpit_indexations set processed_agreement_id=new_agreement where id=r.id;
  end if;
  update private.cockpit_indexations set state=case command when 'submit' then 'Ter goedkeuring' when 'return' then 'Concept' when 'approve' then 'Goedgekeurd' else 'Verwerkt' end,
   approved_by=case when command='approve' then actor when command='return' then null else approved_by end,approved_at=case when command='approve' then clock_timestamp() when command='return' then null else approved_at end,revision=revision+1,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 end if;
 if command in('submit','return','approve') then
  select * into action from private.cockpit_actions where tenant_id=target_tenant and trigger_key='indexation:'||r.id::text for update;
  if action.id is null and command='submit' then
   insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,automatic,trigger_key,created_by,note)
   values(target_tenant,'agreement',r.agreement_id,'Indexatie '||(source->>'customer')||' beoordelen','finance',today,today,true,'indexation:'||r.id::text,actor,'Het indexatievoorstel vereist een expliciet eigenaarsbesluit.') returning * into action;
  elsif action.id is not null then
   update private.cockpit_actions set state=case when command='approve' then 'done' else 'open' end,note=case command when 'approve' then 'De eigenaar heeft dit voorstel expliciet goedgekeurd. Klantakkoord en verwerking blijven afzonderlijke stappen.' when 'return' then 'Het voorstel is teruggezet naar concept voor aanpassing.' else 'Het actuele voorstel vereist een expliciet eigenaarsbesluit.' end,revision=revision+1,updated_at=clock_timestamp() where id=action.id returning * into action;
  end if;
  if action.id is not null then insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'action:manual',action.id,actor,case when command='approve' then 'complete' else 'updated' end,action.revision,jsonb_build_object('indexationId',r.id,'state',r.state,'originalDue',action.original_due_on));end if;
 end if;
 insert into private.cockpit_indexation_versions(tenant_id,indexation_id,version,snapshot,created_by) values(target_tenant,r.id,r.version,to_jsonb(r),actor);
 insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'indexation',r.id,actor,command,r.revision,jsonb_build_object('version',r.version,'agreementId',r.agreement_id,'processedAgreementId',r.processed_agreement_id,'state',r.state));
 result:=jsonb_build_object('ok',true,'id',r.id,'revision',r.revision,'status',r.state,'agreementId',r.processed_agreement_id);
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_indexation_evidence (
  target_tenant     uuid,
  target_customer   uuid,
  selected_evidence uuid DEFAULT NULL::uuid,
  search            text DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;begin
 perform private.cockpit_indexation_assert(target_tenant);
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status='active') or length(coalesce(search,''))>160 then raise exception 'Geen toegang tot dit klantdossier.' using errcode='42501';end if;
 with files as materialized(select e from public.dossier_documents d cross join lateral(select private.cockpit_evidence(target_tenant,'customer',target_customer,d.id)e)x where d.tenant_id=target_tenant and d.customer_id=target_customer and d.source_kind='customer' and x.e is not null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(e-'fingerprint' order by e->>'name') from(select e from files where position(lower(coalesce(search,'')) in lower(e->>'name'))>0 order by e->>'name',e->>'id' limit 50)x),'[]'),'selected',(select e-'fingerprint' from files where e->>'id'=selected_evidence::text),'total',(select count(*) from files where position(lower(coalesce(search,'')) in lower(e->>'name'))>0)) into result;return result;
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_indexation_query (
  target_tenant uuid,
  payload       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;filter_state text:=coalesce(payload->>'filter','Alle voorstellen');pg integer:=coalesce((payload->>'page')::integer,1);size integer:=coalesce((payload->>'pageSize')::integer,20);selected uuid:=nullif(payload->>'record','')::uuid;total integer;begin
 perform private.cockpit_indexation_assert(target_tenant);
 if payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload)k where k not in('filter','page','pageSize','record','contractSearch','contractId')) or length(coalesce(payload->>'contractSearch',''))>160 or filter_state not in('Alle voorstellen','Concept','Ter goedkeuring','Goedgekeurd','Verwerkt') or pg not between 1 and 100000 or size not between 5 and 100 then raise exception 'Ongeldige registerselectie.' using errcode='23514';end if;
 select count(*) into total from private.cockpit_indexations r where r.tenant_id=target_tenant and(filter_state='Alle voorstellen' or r.state=filter_state);pg:=least(pg,greatest(1,ceil(total::numeric/size)::int));
 select jsonb_build_object('rows',coalesce((select jsonb_agg(private.cockpit_indexation_row(x) order by x.created_at desc,x.id) from(select r.* from private.cockpit_indexations r where r.tenant_id=target_tenant and(filter_state='Alle voorstellen' or r.state=filter_state) order by r.created_at desc,r.id limit size offset(pg-1)*size)x),'[]'),
 'selected',(select private.cockpit_indexation_row(r) from private.cockpit_indexations r where r.tenant_id=target_tenant and r.id=selected),'total',total,'page',pg,'pageSize',size,
 'canWrite',private.management_allowed(target_tenant,'backoffice.finance.write') and private.management_allowed(target_tenant,'backoffice.functions.cockpit_indexation_command'),'isOwner',private.cockpit_indexation_owner(target_tenant),
 'canProcess',private.management_allowed(target_tenant,'backoffice.customers.write') and private.management_allowed(target_tenant,'backoffice.functions.customer_command'),
 'today',(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date,'timezone',(select timezone from public.tenants where id=target_tenant),
 'contractsTotal',(select count(*) from public.customer_agreements a where a.tenant_id=target_tenant and a.state='active' and a.starts_on is not null and a.accepted_by_name is not null and exists(select 1 from public.customers c where c.tenant_id=a.tenant_id and c.id=a.customer_id and c.status='active') and not exists(select 1 from public.customer_agreements n where n.tenant_id=target_tenant and n.previous_id=a.id) and(select sum(round(l.quantity*l.price_cents)) from public.customer_agreement_lines l where l.tenant_id=a.tenant_id and l.agreement_id=a.id)>0),
 'contracts',coalesce((select jsonb_agg(x.entry order by x.label,x.id) from(select a.id,a.title label,jsonb_build_object('id',a.id,'customerId',a.customer_id,'customer',c.name,'label',a.title||' · v'||a.version,'baseCents',sum(round(l.quantity*l.price_cents)),'lines',jsonb_agg(jsonb_build_object('quantity',l.quantity,'priceCents',l.price_cents) order by l.id),'fingerprint',encode(extensions.digest(private.cockpit_indexation_source(target_tenant,a.id)::text,'sha256'),'hex')) entry from public.customer_agreements a join public.customers c on c.tenant_id=a.tenant_id and c.id=a.customer_id join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id where a.tenant_id=target_tenant and a.state='active' and a.starts_on is not null and a.accepted_by_name is not null and c.status='active' and(a.id=nullif(payload->>'contractId','')::uuid or position(lower(coalesce(payload->>'contractSearch','')) in lower(a.title||' '||c.name))>0) and not exists(select 1 from public.customer_agreements n where n.tenant_id=target_tenant and n.previous_id=a.id) group by a.id,c.name having sum(round(l.quantity*l.price_cents))>0 order by(a.id=nullif(payload->>'contractId','')::uuid) desc nulls last,a.title,a.id limit 100)x),'[]')) into result;return result;
end$function$;

ALTER TABLE "private"."cockpit_indexation_lines"
  ADD CONSTRAINT "cockpit_indexation_lines_tenant_id_new_line_id_fkey" FOREIGN KEY (tenant_id, new_line_id) REFERENCES public.customer_agreement_lines(tenant_id, id);

ALTER TABLE "private"."cockpit_indexation_lines"
  ADD CONSTRAINT "cockpit_indexation_lines_tenant_id_old_line_id_fkey" FOREIGN KEY (tenant_id, old_line_id) REFERENCES public.customer_agreement_lines(tenant_id, id);

ALTER TABLE "private"."cockpit_indexation_versions"
  ADD CONSTRAINT "cockpit_indexation_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_tenant_id_agreement_id_fkey" FOREIGN KEY (tenant_id, agreement_id) REFERENCES public.customer_agreements(tenant_id, id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_tenant_id_customer_id_fkey" FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE "private"."cockpit_indexation_lines"
  ADD CONSTRAINT "cockpit_indexation_lines_tenant_id_indexation_id_fkey" FOREIGN KEY (tenant_id, indexation_id) REFERENCES private.cockpit_indexations(tenant_id, id);

ALTER TABLE "private"."cockpit_indexation_versions"
  ADD CONSTRAINT "cockpit_indexation_versions_tenant_id_indexation_id_fkey" FOREIGN KEY (tenant_id, indexation_id) REFERENCES private.cockpit_indexations(tenant_id, id);

ALTER TABLE "private"."cockpit_indexations"
  ADD CONSTRAINT "cockpit_indexations_tenant_id_processed_agreement_id_fkey" FOREIGN KEY (tenant_id, processed_agreement_id) REFERENCES public.customer_agreements(tenant_id, id);

CREATE INDEX cockpit_indexation_tenant ON private.cockpit_indexations USING btree (tenant_id, created_at DESC, id);

CREATE TRIGGER cockpit_indexation_lines_immutable
  BEFORE DELETE OR UPDATE ON private.cockpit_indexation_lines
  FOR EACH ROW
  EXECUTE FUNCTION private.cockpit_service_version_guard();

CREATE TRIGGER cockpit_indexation_versions_immutable
  BEFORE DELETE OR UPDATE ON private.cockpit_indexation_versions
  FOR EACH ROW
  EXECUTE FUNCTION private.cockpit_service_version_guard();

REVOKE ALL ON FUNCTION "private"."cockpit_indexation_assert"(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_indexation_assert"(uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."cockpit_indexation_line"(uuid, uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_indexation_line"(uuid, uuid, date) TO "postgres";

REVOKE ALL ON FUNCTION "private"."cockpit_indexation_owner"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_indexation_owner"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."cockpit_indexation_row"(private.cockpit_indexations) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_indexation_row"(private.cockpit_indexations) TO "postgres";

REVOKE ALL ON FUNCTION "private"."cockpit_indexation_source"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_indexation_source"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_indexation_command"(uuid, text, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_indexation_command"(uuid, text, jsonb, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_indexation_evidence"(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_indexation_evidence"(uuid, uuid, uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_indexation_query"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_indexation_query"(uuid, jsonb) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_indexation_lines" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_indexation_versions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."cockpit_indexations" TO "postgres";

