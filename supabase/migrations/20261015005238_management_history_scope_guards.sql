-- Metadata follows the same historical classification as the underlying
-- content, including a former personnel requirement without an attached file.
create function private.cockpit_history_scope(t uuid,scope text,kind text,record uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.cockpit_scope(t,scope) and private.cockpit_source(t,kind,record) and(kind<>'personnel' or private.cockpit_scope(t,'personnel')),false)
$$;
revoke all on function private.cockpit_history_scope(uuid,text,text,uuid) from public,anon,authenticated,service_role;
create or replace function private.cockpit_decision_dto(d private.cockpit_decisions,detail boolean default false,history_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('followup',(select jsonb_build_object('id',a.id,'state',a.state,'revision',a.revision,'canModify',private.cockpit_access(d.tenant_id,'backoffice.followup.write') and private.cockpit_access(d.tenant_id,'backoffice.functions.cockpit_followup_command')) from private.cockpit_actions a where a.id=d.followup_action_id and private.cockpit_action_visible(a)),
 'versions',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'snapshot',v.snapshot,'createdAt',v.created_at) order by v.version desc),'[]') from(select * from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_history_scope(d.tenant_id,v.scope,v.source_kind,v.source_id) order by version desc limit 20 offset(history_page-1)*20)v) else '[]'::jsonb end,
 'versionTotal',(select count(*) from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_history_scope(d.tenant_id,v.scope,v.source_kind,v.source_id)),
 'history',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('event',e.event,'details',e.details,'createdAt',e.created_at) order by e.created_at desc,e.id),'[]') from(select * from private.cockpit_events e where e.tenant_id=d.tenant_id and e.record_kind='decision' and e.record_id=d.id and private.cockpit_history_scope(d.tenant_id,e.details->>'scope',d.source_kind,d.source_id) order by e.created_at desc,e.id limit 100)e) else '[]'::jsonb end)
$$;
create or replace function private.cockpit_requirement_dto(r private.cockpit_requirements,detail boolean default false,history_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$
 with versions as materialized(select * from private.cockpit_requirement_versions v where v.requirement_id=r.id and private.cockpit_history_scope(r.tenant_id,case v.snapshot->>'source_kind' when 'personnel' then 'personnel' else 'quality' end,v.snapshot->>'source_kind',(v.snapshot->>'source_id')::uuid)
 and(v.snapshot->>'evidence_id' is null or private.cockpit_evidence(r.tenant_id,v.snapshot->>'source_kind',(v.snapshot->>'source_id')::uuid,(v.snapshot->>'evidence_id')::uuid) is not null))
 select to_jsonb(r)||jsonb_build_object('status',private.cockpit_requirement_status(r),'evidence',private.cockpit_evidence(r.tenant_id,r.source_kind,r.source_id,r.evidence_id),
 'history',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('event',v.event,'snapshot',v.snapshot,'createdAt',v.created_at) order by v.revision desc),'[]') from(select * from versions order by revision desc limit 20 offset(history_page-1)*20)v) else '[]'::jsonb end,'versionTotal',(select count(*) from versions))
$$;
drop function public.cockpit_evidence_options(uuid,text,uuid,text);
create function public.cockpit_evidence_options(target_tenant uuid,source_kind text,source_id uuid,search text default '',selected_evidence uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;begin
 perform private.cockpit_governance_assert(target_tenant,'compliance');
 if not private.cockpit_source(target_tenant,source_kind,source_id) or length(coalesce(search,''))>160 then raise exception 'Geen toegankelijk dossier.' using errcode='42501';end if;
 with choices as materialized(select private.cockpit_evidence(target_tenant,cockpit_evidence_options.source_kind,cockpit_evidence_options.source_id,d.id) item from public.dossier_documents d where d.tenant_id=target_tenant),
 visible as materialized(select item from choices where item is not null and(coalesce(search,'')='' or position(lower(search) in lower(item->>'name'))>0))
 select coalesce((select jsonb_agg(item order by item->>'name',item->>'id') from(select item from visible order by item->>'name',item->>'id' limit 50)page),'[]'),(select count(*) from visible) into rows,n;
 return jsonb_build_object('rows',rows,'selected',private.cockpit_evidence(target_tenant,source_kind,source_id,selected_evidence),'total',n,'canUpload',private.cockpit_can_upload(target_tenant,source_kind,source_id));
end$$;
revoke all on function public.cockpit_evidence_options(uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_evidence_options(uuid,text,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
