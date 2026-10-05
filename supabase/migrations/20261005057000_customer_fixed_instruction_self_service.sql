-- One new append-only ordinary instruction command. It neither updates vault
-- fields nor borrows object-form contact/address defaults from another source.
create function public.customer_portal_instruction_add(target_tenant uuid,target_account uuid,target_object uuid,expected_version bigint,input_body text,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;o public.objects;receipt private.customer_portal_commands;h text;result jsonb;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot deze instructie' using errcode='42501';end if;
 if input_body is null or length(btrim(input_body)) not between 2 and 10000 or expected_version is null or expected_version<1
 then raise exception 'Vul een geldige gewone instructie in' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 if not private.customer_account_access(target_tenant,target_account) or not a.can_edit_objects or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen recht om objectinstructies toe te voegen' using errcode='42501';end if;
 select * into o from public.objects where tenant_id=target_tenant and id=target_object and customer_id=a.customer_id and dossier_status='active' for update;
 if o.id is null or not exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=o.id and b.user_id=auth.uid() and b.active)
 then raise exception 'Geen exacte toegang tot dit object' using errcode='42501';end if;
 h:=encode(extensions.digest(jsonb_build_object('objectId',target_object,'version',expected_version,'body',btrim(input_body))::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'instruction_add' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if o.version<>expected_version then raise exception 'Het object is gewijzigd. Controleer je instructie opnieuw.' using errcode='40001';end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
 then raise exception 'Te veel wijzigingen. Probeer het later opnieuw.' using errcode='54000';end if;
 insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,customer_visible,details,created_by,updated_by)
 values(target_tenant,o.id,'instruction','Vaste instructie van klant',btrim(input_body),'active','fixed',clock_timestamp(),true,'{"customer_portal_author":true}',auth.uid(),auth.uid());
 update public.objects set updated_at=clock_timestamp() where tenant_id=target_tenant and id=o.id returning version into o.version;
 update public.customer_portal_accounts set version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=a.id returning version into a.version;
 result:=jsonb_build_object('objectVersion',o.version,'accountVersion',a.version);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result) values(request_id,target_tenant,target_account,auth.uid(),'instruction_add',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_instruction_add(uuid,uuid,uuid,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_instruction_add(uuid,uuid,uuid,bigint,text,uuid) to authenticated;
