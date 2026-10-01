-- Query-first correction after the module-boundary review. Keep the shared
-- planning row usable, but never query a disabled module to derive its status.
do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('private.work_order_row(uuid,boolean)'::regprocedure);
 if position('-- module-scoped work-order summaries' in definition)=0 then
  needle:='''billingState'',case when not fin then null';
  if position(needle in definition)=0 then raise exception 'Review invoice summary boundary';end if;
  definition:=replace(definition,needle,needle||' when not private.service_enabled(w.tenant_id,''finance'') then ''unavailable''');
  needle:='''signatureState'',case when exists';
  if position(needle in definition)=0 then raise exception 'Review signature summary boundary';end if;
  definition:=replace(definition,needle,'''signatureState'',case when not private.service_enabled(w.tenant_id,''rapportage'') then ''unavailable'' when exists');
  definition:=replace(definition,' select jsonb_build_object',' -- module-scoped work-order summaries'||chr(10)||' select jsonb_build_object');
  execute definition;
 end if;
 notify pgrst,'reload schema';
end $patch$;
