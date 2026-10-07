-- Extend the existing lead/contact intake; no auth account, object or booking.
do $patch$
declare definition text; original text; replacement text;
begin
 select pg_get_functiondef('private.commercial_intake(uuid,uuid,jsonb,text,uuid,uuid,uuid)'::regprocedure) into definition;
 original:='if length(trim(coalesce(input->>''name'',''''))) not between 2 and 180 or coalesce(input->>''email'','''') !~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'' or length(input->>''email'')>254 or length(coalesce(input->>''phone'',''''))>40 then raise exception ''Vul je naam en een geldig e-mailadres in'' using errcode=''23514'';end if;';
 replacement:='if length(trim(coalesce(input->>''name'',''''))) not between 1 and 180 or length(coalesce(input->>''email'',''''))>254 or length(coalesce(input->>''phone'',''''))>40 or (nullif(trim(input->>''email''),'''') is not null and input->>''email'' !~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'') or (nullif(trim(input->>''email''),'''') is null and (input->>''phone'' is null or input->>''phone'' !~ ''^\+?[0-9][0-9 ()-]{5,23}[0-9]$'' or length(regexp_replace(input->>''phone'',''[^0-9]'','''',''g'')) not between 7 and 15)) or (input ? ''contact_name'' and length(trim(coalesce(input->>''contact_name'',''''))) not between 1 and 120) then raise exception ''Vul je naam en een geldig e-mailadres of telefoonnummer in'' using errcode=''23514'';end if;';
 if position(original in definition)=0 then raise exception 'Review current intake contact validation before extending it';end if;
 definition:=replace(definition,original,replacement);
 definition:=replace(definition,'trim(input->>''email'')','nullif(trim(input->>''email''),'''')');
 original:='values(t,c,trim(input->>''name''),nullif(trim(input->>''email''),''''),nullif(input->>''phone'',''''),true)';
 replacement:='values(t,c,trim(coalesce(nullif(input->>''contact_name'',''''),input->>''name'')),nullif(trim(input->>''email''),''''),nullif(input->>''phone'',''''),true)';
 if position(original in definition)=0 then raise exception 'Review current contact creation before extending it';end if;
 execute replace(definition,original,replacement);
 select pg_get_functiondef('public.commercial_public_intake(uuid,uuid,jsonb,text)'::regprocedure) into definition;
 original:='''email:''||encode(extensions.digest(lower(coalesce(input->>''email'','''')),''sha256''),''hex'')';
 replacement:='case when nullif(trim(input->>''email''),'''') is not null then ''email:''||encode(extensions.digest(lower(input->>''email''),''sha256''),''hex'') else ''phone:''||encode(extensions.digest(regexp_replace(coalesce(input->>''phone'',''''),''[^0-9]'','''',''g''),''sha256''),''hex'') end';
 if position(original in definition)=0 then raise exception 'Review current public rate limit before extending it';end if;
 execute replace(definition,original,replacement);
 select pg_get_functiondef('private.commercial_rows(uuid)'::regprocedure) into definition;
 original:='''work_kind'',r.work_kind,''source'',r.source';
 replacement:='''work_kind'',r.work_kind,''planning_pending'',(r.version<=2 and r.preferences#>>''{website_submission,planning_type}''=''discuss''),''source'',r.source';
 if position(original in definition)=0 then raise exception 'Review current request list before adding undecided website planning';end if;
 execute replace(definition,original,replacement);
end $patch$;

create function public.commercial_website_intake(target_tenant uuid, request_id uuid, input jsonb, additional_notes text, submission_metadata jsonb, client_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.requests; i integer; part integer:=0;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role'
 or not exists(select 1 from public.tenants where id=target_tenant and slug='veele-services' and status='active')
 or not private.public_commercial_enabled(target_tenant) then raise exception 'Website intake unavailable' using errcode='42501';end if;
 if coalesce(client_hash,'')!~'^[a-f0-9]{64}$' or coalesce(submission_metadata->>'content_hash','')!~'^[a-f0-9]{64}$'
 or submission_metadata->>'envelopeVersion' is distinct from '1.0.0'
 or length(coalesce(additional_notes,'')) not between 3 and 50000 then raise exception 'Invalid website request' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-intake:'||target_tenant::text||request_id::text,0));
 select * into r from public.requests where id=request_id;
 if found then
  if r.tenant_id<>target_tenant or r.source<>'website' or r.preferences#>>'{website_submission,content_hash}' is distinct from submission_metadata->>'content_hash' then raise exception 'Website reference conflict' using errcode='23514';end if;
  return jsonb_build_object('ok',true,'reference',r.request_number);
 end if;
 if length(additional_notes)<=10000 and input->>'description' is distinct from additional_notes then raise exception 'Incomplete website notes' using errcode='23514';end if;
 perform public.commercial_public_intake(target_tenant,request_id,input,client_hash);
 update public.requests set preferences=preferences||jsonb_build_object('website_submission',submission_metadata),
 next_action=case when submission_metadata->>'planning_type'='discuss' then 'Inzet en object bespreken' else next_action end
 where id=request_id and tenant_id=target_tenant returning * into r;
 if length(additional_notes)>10000 then
  for i in 1..length(additional_notes) by 5000 loop
   part:=part+1;
   insert into public.commercial_events(tenant_id,request_id,kind,body,visibility,details)
   values(target_tenant,request_id,'request.note',substring(additional_notes from i for 5000),'internal',jsonb_build_object('website_notes_part',part));
  end loop;
 end if;
 return jsonb_build_object('ok',true,'reference',r.request_number);
end $$;
revoke all on function public.commercial_website_intake(uuid,uuid,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.commercial_website_intake(uuid,uuid,jsonb,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
