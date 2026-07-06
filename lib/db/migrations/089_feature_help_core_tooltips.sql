WITH tooltip_seed(stable_key, title, description, module_key) AS (
  VALUES
    ('platform.tenants', 'Tenants beheren', 'Bekijk tenants, status, domeinen en toegang. Gebruik dit overzicht voor tenantbeheer en supportchecks.', 'knowledgebase'),
    ('platform.onboarding', 'Tenant onboarding', 'Volg provisioning, owner invite, first-run en rollbackinformatie voor nieuwe tenants.', 'knowledgebase'),
    ('platform.releases', 'Releasebeheer', 'Publiceer release notes, highlights en doelgroepgerichte updates voor Fieldgrid.', 'releases'),
    ('platform.roadmap', 'Roadmap beheren', 'Beoordeel featurewensen, wijzig statussen en koppel afgeronde items aan releases.', 'roadmap'),
    ('platform.knowledgebase', 'Knowledgebase beheren', 'Maak handleidingen, categorieen en tooltips voor de juiste modules en doelgroepen.', 'knowledgebase'),
    ('platform.settings', 'Platforminstellingen', 'Beheer globale instellingen zoals SMTP, domeinen, supportregels en platformdefaults.', 'knowledgebase'),
    ('tenant.dashboard', 'Dashboard', 'Gebruik het dashboard voor prioriteiten, acties, planning, finance en open meldingen.', 'knowledgebase'),
    ('tenant.customers', 'Klanten', 'Beheer klantgegevens, contactpersonen, objecten, opdrachten, documenten en financiële context.', 'customers'),
    ('tenant.objects', 'Objecten', 'Beheer locaties, objectdetails, contacten, opdrachten en objectgebonden documenten.', 'objects'),
    ('tenant.assignments', 'Opdrachten', 'Maak en volg werkbonnen, planning, uitvoering, rapportage en afronding.', 'assignments'),
    ('tenant.planning', 'Planning', 'Plan opdrachten, controleer conflicten en gebruik personeelsdetails voor beschikbaarheid.', 'planning'),
    ('tenant.personnel', 'Personeel', 'Beheer medewerkers, rollen, beschikbaarheid, verlof, kwalificaties en portaaltoegang.', 'personnel'),
    ('tenant.invoices', 'Facturen', 'Volg facturen, verzamelfacturen, betalingen, herinneringen en PDF-downloads.', 'finance'),
    ('tenant.tickets', 'Tickets', 'Behandel klant- en personeelsvragen vanuit de inbox en houd reacties traceerbaar.', 'notifications'),
    ('tenant.documents', 'Documenten', 'Upload, deel en beheer documenten per klant, object, opdracht of algemene context.', 'documents'),
    ('tenant.materials_inventory', 'Materiaal en inventaris', 'Beheer materiaalvoorraad, verbruik, inventarisitems, QR-codes en issues.', 'materials'),
    ('tenant.roles_permissions', 'Rollen en permissies', 'Stel rollen, gebruikers en permissies zorgvuldig in per functie en module.', 'knowledgebase'),
    ('customer.assignments', 'Opdrachten', 'Bekijk lopende opdrachten, details, rapportages en acties die van u worden verwacht.', 'customer_portal'),
    ('customer.tickets', 'Tickets', 'Stel vragen, meld problemen en volg reacties vanuit het klantportaal.', 'customer_portal'),
    ('customer.invoices', 'Facturen', 'Bekijk facturen, betaalstatussen, PDF-downloads en eventuele betaalacties.', 'finance'),
    ('customer.objects', 'Objecten', 'Bekijk en beheer de objecten en locaties die aan uw account gekoppeld zijn.', 'objects'),
    ('customer.documents', 'Documenten', 'Download gedeelde documenten en controleer de context van elk bestand.', 'documents'),
    ('personnel.planning', 'Planning', 'Bekijk uw planning, openstaande opdrachten en wijzigingen in uw werkvoorraad.', 'personnel_portal'),
    ('personnel.assignment_status', 'Opdrachtstatus', 'Gebruik statussen om aan te geven wanneer u start, afrondt of hulp nodig heeft.', 'assignments'),
    ('personnel.reporting', 'Rapportage', 'Leg rapportagenotities, foto’s, meerwerk en afrondinformatie zorgvuldig vast.', 'reporting'),
    ('personnel.material_usage', 'Materiaalverbruik', 'Registreer materiaalverbruik en inventarisgebruik tijdens de uitvoering.', 'materials'),
    ('personnel.availability', 'Beschikbaarheid', 'Werk beschikbaarheid, verlof en afwezigheid bij zodat planning actueel blijft.', 'personnel')
)
INSERT INTO kb_tooltips (stable_key, title, description, module_key, status, placement, metadata)
SELECT stable_key, title, description, module_key, 'published', 'top', '{"seeded": true, "phase": "feature-help-core"}'::jsonb
FROM tooltip_seed
ON CONFLICT (stable_key) DO NOTHING;

WITH audience_seed(stable_key, audience_key) AS (
  VALUES
    ('platform.tenants', 'platform_admin'),
    ('platform.tenants', 'support'),
    ('platform.onboarding', 'platform_admin'),
    ('platform.onboarding', 'support'),
    ('platform.releases', 'platform_admin'),
    ('platform.releases', 'support'),
    ('platform.roadmap', 'platform_admin'),
    ('platform.roadmap', 'support'),
    ('platform.knowledgebase', 'platform_admin'),
    ('platform.knowledgebase', 'support'),
    ('platform.settings', 'platform_admin'),
    ('platform.settings', 'support'),
    ('tenant.dashboard', 'tenant_admin'),
    ('tenant.dashboard', 'tenant_management'),
    ('tenant.customers', 'tenant_admin'),
    ('tenant.customers', 'tenant_management'),
    ('tenant.objects', 'tenant_admin'),
    ('tenant.objects', 'tenant_planning'),
    ('tenant.assignments', 'tenant_admin'),
    ('tenant.assignments', 'tenant_planning'),
    ('tenant.planning', 'tenant_admin'),
    ('tenant.planning', 'tenant_planning'),
    ('tenant.personnel', 'tenant_admin'),
    ('tenant.personnel', 'tenant_management'),
    ('tenant.invoices', 'tenant_admin'),
    ('tenant.invoices', 'tenant_administration'),
    ('tenant.tickets', 'tenant_admin'),
    ('tenant.tickets', 'tenant_management'),
    ('tenant.documents', 'tenant_admin'),
    ('tenant.documents', 'tenant_management'),
    ('tenant.materials_inventory', 'tenant_admin'),
    ('tenant.materials_inventory', 'tenant_planning'),
    ('tenant.roles_permissions', 'tenant_admin'),
    ('customer.assignments', 'tenant_customer'),
    ('customer.tickets', 'tenant_customer'),
    ('customer.invoices', 'tenant_customer'),
    ('customer.objects', 'tenant_customer'),
    ('customer.documents', 'tenant_customer'),
    ('personnel.planning', 'tenant_personnel'),
    ('personnel.assignment_status', 'tenant_personnel'),
    ('personnel.reporting', 'tenant_personnel'),
    ('personnel.material_usage', 'tenant_personnel'),
    ('personnel.availability', 'tenant_personnel')
)
INSERT INTO kb_tooltip_audiences (tooltip_id, audience_key)
SELECT kb_tooltips.id, audience_seed.audience_key
FROM audience_seed
JOIN kb_tooltips ON kb_tooltips.stable_key = audience_seed.stable_key
ON CONFLICT (tooltip_id, audience_key) DO NOTHING;
