-- Publish a new inherited instruction for future messages. Retain existing
-- immutable template versions and queued/sent message snapshots unchanged.
do $$
declare r private.notification_templates;definition jsonb;new_version uuid;
begin
 for r in select * from private.notification_templates where tenant_id is null
  and type_code='personnel.invitation' and context='staff' and channel='email' for update
 loop
  select v.definition into definition from private.notification_template_versions v where v.id=r.active_version_id;
  if definition is null then definition:=r.draft;end if;
  if position('Je hebt al een account. Open het personeelsportaal met de knop hieronder en log in met je bestaande inloggegevens. Je wachtwoord blijft ongewijzigd.' in definition->>'body')=0 then continue;end if;
  definition:=jsonb_set(definition,'{body}',to_jsonb(replace(definition->>'body',
   'Je hebt al een account. Open het personeelsportaal met de knop hieronder en log in met je bestaande inloggegevens. Je wachtwoord blijft ongewijzigd.',
   'Je hebt al een account. Open het personeelsportaal met de knop hieronder en vraag een eenmalige inlogcode aan op je e-mailadres. Een wachtwoord is niet nodig.')));
  insert into private.notification_template_versions(template_id,revision,definition) values(r.id,r.revision+1,definition) returning id into new_version;
  update private.notification_templates set revision=r.revision+1,active_version_id=new_version,draft=definition,updated_at=clock_timestamp() where id=r.id;
 end loop;
end $$;
