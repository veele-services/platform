-- A deferred mail job is not authority over an arbitrary Storage path. Resolve
-- the frozen attachment against its current source and intended recipient.
create or replace function public.notification_mail_attachment(target_tenant uuid,target_mail_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.mail_deliveries;i public.invoices;q public.quotes;path text;scope text[];bucket text;digest text;code text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into m from public.mail_deliveries where tenant_id=target_tenant and id=target_mail_id;
 code:=case m.template when 'invoice' then 'invoice.available' when 'quote' then 'quote.available' when 'quote_reminder' then 'quote.reminder' end;
 if code is null or not private.notification_mail_source_allowed(m.id,m.recipient,code) then raise exception 'Maildocument niet beschikbaar' using errcode='42501';end if;
 path:=m.render_snapshot#>>'{delivery,attachmentPath}';
 if m.template='invoice' then
  select * into i from public.invoices where tenant_id=m.tenant_id and id=(m.render_snapshot->>'invoice_id')::uuid;
  if i.id is null or path is distinct from i.pdf_storage_path or i.pdf_sha256 is null then raise exception 'Vast factuurdocument niet beschikbaar' using errcode='42501';end if;
  scope:=array[m.tenant_id::text,i.id::text];bucket:='invoices';digest:=i.pdf_sha256;
 else
  select * into q from public.quotes where tenant_id=m.tenant_id and id=(m.render_snapshot->>'quote_id')::uuid;
  if q.id is null or path is distinct from q.pdf_path then raise exception 'Vast offertedocument niet beschikbaar' using errcode='42501';end if;
  scope:=array[m.tenant_id::text,'quote',q.id::text];bucket:='commercial-documents';
 end if;
 if not coalesce(private.document_path_matches(path,scope),false) then raise exception 'Document valt buiten de bronregistratie' using errcode='42501';end if;
 return jsonb_build_object('bucket',bucket,'path',path,'scope',to_jsonb(scope),'sha256',digest,'mime','application/pdf','name',coalesce(m.render_snapshot#>>'{delivery,attachmentFilename}','document.pdf'));
end $$;
revoke all on function public.notification_mail_attachment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_mail_attachment(uuid,uuid) to service_role;
