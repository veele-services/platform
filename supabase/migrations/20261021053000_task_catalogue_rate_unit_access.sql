-- Changing an existing catalogue unit also changes the rate basis.
-- Preserve the existing tariff boundary for direct RPCs and short edits.
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
    if coalesce(input->>'unit',r.unit) is distinct from r.unit then raise exception 'De eenheid bepaalt de tariefgrondslag en vereist tariefbeheer' using errcode='42501';end if;
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
   if (coalesce(input->'executionConfig',r.execution_config)->>'mode'='once' and coalesce(input->>'unit',r.unit,'task')<>'task') or (coalesce(input->'executionConfig',r.execution_config)->>'mode'='items' and coalesce(input->>'unit',r.unit,'task')<>'item') or (coalesce(input->'executionConfig',r.execution_config)->>'mode'='rooms' and coalesce(input->>'unit',r.unit,'task') not in ('room','square_metre')) then raise exception 'Kies een passende eenheid bij de toepassingsvorm' using errcode='23514';end if;
   perform private.task_execution_config(target_tenant,coalesce(input->'executionConfig',r.execution_config,'{}'::jsonb));
   insert into public.task_revisions(tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit,requires_photo,requires_customer_signature,execution_config)
   values(target_tenant,t.id,coalesce(r.revision,0)+1,(input->>'duration')::integer,price,vat,coalesce(input->>'unit',r.unit,'task'),coalesce((input->>'requiresPhoto')::boolean,false),coalesce((input->>'requiresSignature')::boolean,false),coalesce(input->'executionConfig',r.execution_config,'{}'::jsonb)) returning * into new_revision;
   insert into public.qualification_requirements(tenant_id,code,scope,subject_id,hard_requirement,active) select target_tenant,code,'task_revision',new_revision.id,true,true from jsonb_array_elements_text(coalesce(new_revision.execution_config->'qualifications','[]')) code;
   if coalesce((input->>'extraWork')::boolean,false) then insert into public.extra_work_rules(tenant_id,task_revision_id,requires_photo,requires_review) values(target_tenant,new_revision.id,new_revision.requires_photo,true);end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',t.id,'version',t.version,'code',t.code);
 end if;
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'catalogue:'||action,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'catalogue.'||action,case when action like 'category_%' then 'task_category' else 'task' end,(result->>'id')::uuid,result);
 return result;
end $function$;

-- Catalogue revisions are created and closed by the reviewed native command.
-- Reject direct table writes before row triggers can inspect hidden tariffs.
revoke insert,update,delete on public.task_revisions from authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns
 from pg_attribute where attrelid='public.task_revisions'::regclass and attnum>0 and not attisdropped;
 execute 'revoke insert ('||columns||'), update ('||columns||') on public.task_revisions from authenticated';
end$$;
