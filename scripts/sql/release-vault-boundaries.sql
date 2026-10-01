-- Query-first: retain the existing OTP/grant lifecycle, repair resource eligibility.
begin;
do $$
declare original text; revised text; signature regprocedure;
begin
 foreach signature in array array[
   'private.object_vault_context(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
   'private.object_visit_access(uuid,uuid,uuid)'::regprocedure
 ] loop
   select pg_get_functiondef(signature) into original;
   revised:=replace(original,'p.status=''active'' and m.status=''active''',
     'p.status=''active'' and m.status=''active'' and ''staff''=any(m.roles)');
   if position('and ''staff''=any(m.roles)' in original)>0 then continue;end if;
   if revised=original then raise exception 'Object assignment source changed; review authorization';end if;
   execute revised;
 end loop;
 select pg_get_functiondef('public.object_vault_operation(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) into original;
 revised:=replace(original,
   'where x.tenant_id=target_tenant and x.object_id=target_object and x.active;',
   'where x.tenant_id=target_tenant and x.object_id=target_object and x.active and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;');
 if revised=original and position('x.active and private.object_vault_context' in original)=0 then
   raise exception 'Vault metadata source changed; review item authorization';
 end if;
 execute revised;
end;
$$;
commit;
