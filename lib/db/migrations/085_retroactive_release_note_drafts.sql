-- Retroactive release note drafts.
-- Creates a first reviewable set of draft release notes based on existing
-- routes, migrations, docs and git history. Drafts are intentionally not
-- published; platform admins review and publish them from /platform/releases.

INSERT INTO release_categories (name, slug, module_key, sort_order, is_active)
VALUES
  ('Materiaalbeheer', 'materiaalbeheer', 'materials', 230, true),
  ('Inventarisbeheer', 'inventarisbeheer', 'inventory', 240, true),
  ('Kennisbank', 'kennisbank', 'knowledgebase', 250, true),
  ('Roadmap', 'roadmap', 'roadmap', 260, true),
  ('Releasebeheer', 'releasebeheer', 'releases', 270, true),
  ('Operations', 'operations', 'releases', 280, true)
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE fieldgrid_retro_release_seed (
  id uuid PRIMARY KEY,
  version varchar(80) NOT NULL,
  title varchar(220) NOT NULL,
  slug varchar(220) NOT NULL,
  summary text NOT NULL,
  content_html text NOT NULL,
  content_text text NOT NULL,
  impact_level varchar(20) NOT NULL,
  audience_keys text[] NOT NULL,
  module_keys text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO fieldgrid_retro_release_seed (
  id,
  version,
  title,
  slug,
  summary,
  content_html,
  content_text,
  impact_level,
  audience_keys,
  module_keys
)
VALUES
  (
    '85000000-0000-4000-8000-000000000001',
    'retro-2026-07-platform-foundation',
    'Platformbasis en tenantfundament',
    'retro-platformbasis-en-tenantfundament',
    'Conceptrelease voor het multi-tenant fundament, tenant context, modulecatalogus en basisbeveiliging.',
    '<h2>Platformbasis en tenantfundament</h2><p>Deze retroactieve conceptrelease beschrijft het fundament van Fieldgrid als multi-tenant platform.</p><p>Bronnen: tenant context routes, RBAC-documentatie, module-entitlements en tenant hardening migrations.</p>',
    'Deze retroactieve conceptrelease beschrijft het fundament van Fieldgrid als multi-tenant platform. Bronnen: tenant context routes, RBAC-documentatie, module-entitlements en tenant hardening migrations.',
    'high',
    ARRAY['platform_admin','support','tenant_admin','tenant_management'],
    ARRAY['releases']
  ),
  (
    '85000000-0000-4000-8000-000000000002',
    'retro-2026-07-tenant-provisioning-onboarding',
    'Tenant provisioning en onboarding',
    'retro-tenant-provisioning-en-onboarding',
    'Conceptrelease voor tenant onboarding, owner invites, first-run, domeinen, modules, sectoren en regio configuratie.',
    '<h2>Tenant provisioning en onboarding</h2><p>Platform admins kunnen tenantaanmaak en onboarding vanuit de platform backoffice beheren.</p><p>De conceptrelease bundelt tenantgegevens, hostcontext, plan, modules, sectoren, regio&apos;s, branding, owner invite en retry/rollbackstatus.</p>',
    'Platform admins kunnen tenantaanmaak en onboarding vanuit de platform backoffice beheren. De conceptrelease bundelt tenantgegevens, hostcontext, plan, modules, sectoren, regios, branding, owner invite en retry/rollbackstatus.',
    'high',
    ARRAY['platform_admin','support'],
    ARRAY['releases']
  ),
  (
    '85000000-0000-4000-8000-000000000003',
    'retro-2026-07-platform-admin-command-center',
    'Platform admin command center',
    'retro-platform-admin-command-center',
    'Conceptrelease voor platformbeheer met tenants, subscriptions, tickets, meldingen, operations, staging smoke, users en instellingen.',
    '<h2>Platform admin command center</h2><p>De platform backoffice bevat het centrale beheer voor tenants, subscriptions, support, security, operations en platforminstellingen.</p><p>Deze conceptrelease is bedoeld voor platform admins en support.</p>',
    'De platform backoffice bevat het centrale beheer voor tenants, subscriptions, support, security, operations en platforminstellingen. Deze conceptrelease is bedoeld voor platform admins en support.',
    'medium',
    ARRAY['platform_admin','support'],
    ARRAY['releases','notifications']
  ),
  (
    '85000000-0000-4000-8000-000000000004',
    'retro-2026-07-tenant-backoffice-core',
    'Tenant backoffice basis',
    'retro-tenant-backoffice-basis',
    'Conceptrelease voor het tenantdashboard, gedeelde UI-primitives, lijsten, details, settings en operationele basisflows.',
    '<h2>Tenant backoffice basis</h2><p>De tenant backoffice is opgebouwd rond een rustiger dashboard, gedeelde page shell, headers, toolbars, filterdrawers, datatables en action menus.</p><p>Deze release is relevant voor tenant admins, management, planning en administratie.</p>',
    'De tenant backoffice is opgebouwd rond een rustiger dashboard, gedeelde page shell, headers, toolbars, filterdrawers, datatables en action menus. Deze release is relevant voor tenant admins, management, planning en administratie.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['customers','objects','assignments','planning','personnel','reporting','finance','documents']
  ),
  (
    '85000000-0000-4000-8000-000000000005',
    'retro-2026-07-customers',
    'Klantenbeheer',
    'retro-klantenbeheer',
    'Conceptrelease voor klantlijsten, klantdetails, klanttypes, contactgegevens en klantportaal-koppelingen.',
    '<h2>Klantenbeheer</h2><p>Klantenbeheer ondersteunt overzicht, detailinformatie, contactgegevens, klanttypes en koppeling met klantportaalgebruikers.</p>',
    'Klantenbeheer ondersteunt overzicht, detailinformatie, contactgegevens, klanttypes en koppeling met klantportaalgebruikers.',
    'medium',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['customers','customer_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000006',
    'retro-2026-07-objects',
    'Objectbeheer',
    'retro-objectbeheer',
    'Conceptrelease voor objectlijsten, objectdetails, klantkoppeling, objectinformatie en customer-facing objectflows.',
    '<h2>Objectbeheer</h2><p>Objectbeheer bundelt locaties, objectinformatie, klantkoppelingen en detailtabbladen voor operationele context.</p>',
    'Objectbeheer bundelt locaties, objectinformatie, klantkoppelingen en detailtabbladen voor operationele context.',
    'medium',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_customer'],
    ARRAY['objects','customers','customer_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000007',
    'retro-2026-07-assignments-work-orders',
    'Opdrachten en werkbonnen',
    'retro-opdrachten-en-werkbonnen',
    'Conceptrelease voor opdrachten, werkbonstatussen, opdrachtdetails, klantaanvragen en personeelsuitvoering.',
    '<h2>Opdrachten en werkbonnen</h2><p>Opdrachten vormen de kernflow tussen tenant backoffice, klantportaal en personeelsapp.</p><p>De retrorelease dekt lijsten, detailpagina&apos;s, statusflow, rapportage, klantaanvragen en uitvoering.</p>',
    'Opdrachten vormen de kernflow tussen tenant backoffice, klantportaal en personeelsapp. De retrorelease dekt lijsten, detailpaginas, statusflow, rapportage, klantaanvragen en uitvoering.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_personnel','tenant_customer'],
    ARRAY['assignments','customer_portal','personnel_portal','reporting']
  ),
  (
    '85000000-0000-4000-8000-000000000008',
    'retro-2026-07-planning-smart-planning',
    'Planning en smart planning',
    'retro-planning-en-smart-planning',
    'Conceptrelease voor planning, capaciteit, beschikbaarheid, interessepeilingen en smart planning signalen.',
    '<h2>Planning en smart planning</h2><p>Planning combineert opdrachten, personeel, beschikbaarheid, sectorcontext en slimme signalen.</p><p>Deze conceptrelease is bedoeld voor planners, management en tenant admins.</p>',
    'Planning combineert opdrachten, personeel, beschikbaarheid, sectorcontext en slimme signalen. Deze conceptrelease is bedoeld voor planners, management en tenant admins.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_planning'],
    ARRAY['planning','smart_planning','personnel','assignments']
  ),
  (
    '85000000-0000-4000-8000-000000000009',
    'retro-2026-07-personnel-app',
    'Personeelsapp',
    'retro-personeelsapp',
    'Conceptrelease voor planning, open diensten, uren, berichten, documenten, nieuws, materiaal, inventaris en offline-ready personeelsflows.',
    '<h2>Personeelsapp</h2><p>De personeelsapp bevat planning, open diensten, uren, berichten, meldingen, nieuws, documenten, profiel, beschikbaarheid, verlof, materiaal en inventarisflows.</p>',
    'De personeelsapp bevat planning, open diensten, uren, berichten, meldingen, nieuws, documenten, profiel, beschikbaarheid, verlof, materiaal en inventarisflows.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_personnel'],
    ARRAY['personnel_portal','personnel','assignments','documents','notifications','materials','inventory']
  ),
  (
    '85000000-0000-4000-8000-000000000010',
    'retro-2026-07-customer-portal',
    'Klantportaal',
    'retro-klantportaal',
    'Conceptrelease voor klantdashboard, opdrachten, objecten, rapporten, facturen, betalingen, offertes, tickets, documenten en instellingen.',
    '<h2>Klantportaal</h2><p>Het klantportaal geeft klanten inzicht in opdrachten, objecten, rapportages, finance, tickets, documenten, profiel en beveiliging.</p>',
    'Het klantportaal geeft klanten inzicht in opdrachten, objecten, rapportages, finance, tickets, documenten, profiel en beveiliging.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_customer'],
    ARRAY['customer_portal','customers','objects','assignments','reporting','finance','documents','notifications']
  ),
  (
    '85000000-0000-4000-8000-000000000011',
    'retro-2026-07-reporting-review',
    'Rapportages en controle',
    'retro-rapportages-en-controle',
    'Conceptrelease voor rapportageoverzichten, rapportagedetails, reviewflows, klantzichtbaarheid en personeelsrapportage.',
    '<h2>Rapportages en controle</h2><p>Rapportages verbinden uitvoering, controle en klantcommunicatie.</p><p>Deze conceptrelease dekt rapportagecontrole, notities, status en visibility richting klantportaal.</p>',
    'Rapportages verbinden uitvoering, controle en klantcommunicatie. Deze conceptrelease dekt rapportagecontrole, notities, status en visibility richting klantportaal.',
    'medium',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_personnel','tenant_customer'],
    ARRAY['reporting','assignments','customer_portal','personnel_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000012',
    'retro-2026-07-finance-invoices-payments',
    'Finance, facturen en betalingen',
    'retro-finance-facturen-en-betalingen',
    'Conceptrelease voor facturen, verzamelfacturen, betalingen, offertes, PDF/CSV downloads en klantportaal finance.',
    '<h2>Finance, facturen en betalingen</h2><p>Finance ondersteunt facturen, verzamelfacturen, betalingen, offertes, exportdownloads en klantportaalbetalingen.</p>',
    'Finance ondersteunt facturen, verzamelfacturen, betalingen, offertes, exportdownloads en klantportaalbetalingen.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_administration','tenant_customer'],
    ARRAY['finance','customer_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000013',
    'retro-2026-07-tickets-notifications',
    'Tickets, meldingen en notificaties',
    'retro-tickets-meldingen-en-notificaties',
    'Conceptrelease voor tenant tickets, klanttickets, personeelsberichten, notificatiecentrum en push/email signalen.',
    '<h2>Tickets, meldingen en notificaties</h2><p>Fieldgrid bevat ticket- en notificatieflows voor tenant backoffice, klantportaal en personeelsapp.</p>',
    'Fieldgrid bevat ticket- en notificatieflows voor tenant backoffice, klantportaal en personeelsapp.',
    'medium',
    ARRAY['tenant_admin','tenant_management','tenant_personnel','tenant_customer'],
    ARRAY['notifications','customer_portal','personnel_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000014',
    'retro-2026-07-documents-storage',
    'Documenten en storage',
    'retro-documenten-en-storage',
    'Conceptrelease voor tenant-scoped documenten, upload hardening, portals en storage security.',
    '<h2>Documenten en storage</h2><p>Documenten zijn tenant-scoped beschikbaar in backoffice, klantportaal en personeelsapp.</p><p>Storage policies en upload hardening beschermen bestanden per tenant en doelgroep.</p>',
    'Documenten zijn tenant-scoped beschikbaar in backoffice, klantportaal en personeelsapp. Storage policies en upload hardening beschermen bestanden per tenant en doelgroep.',
    'medium',
    ARRAY['tenant_admin','tenant_management','tenant_personnel','tenant_customer'],
    ARRAY['documents','customer_portal','personnel_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000015',
    'retro-2026-07-material-inventory',
    'Materiaal- en inventarisbeheer',
    'retro-materiaal-en-inventarisbeheer',
    'Conceptrelease voor materialen, voorraad, inventaris, QR-codes, issues en koppelingen met opdrachten, objecten en personeel.',
    '<h2>Materiaal- en inventarisbeheer</h2><p>Materiaal- en inventarisbeheer ondersteunt voorraad, inventarislijsten, QR-codes, issues en toewijzingen aan opdrachten, objecten en personeel.</p>',
    'Materiaal- en inventarisbeheer ondersteunt voorraad, inventarislijsten, QR-codes, issues en toewijzingen aan opdrachten, objecten en personeel.',
    'high',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_personnel'],
    ARRAY['materials','inventory','assignments','objects','personnel','personnel_portal']
  ),
  (
    '85000000-0000-4000-8000-000000000016',
    'retro-2026-07-rbac-audit-security',
    'Rollen, permissies, audit en security',
    'retro-rollen-permissies-audit-en-security',
    'Conceptrelease voor tenant RBAC, platformgebruikers, supportmodus, auditlog, securitydashboard en runtime hardening.',
    '<h2>Rollen, permissies, audit en security</h2><p>RBAC, auditlog, supportmodus, platformgebruikers, tenantrollen en securitydashboards vormen de beheersbare veiligheidslaag.</p>',
    'RBAC, auditlog, supportmodus, platformgebruikers, tenantrollen en securitydashboards vormen de beheersbare veiligheidslaag.',
    'critical',
    ARRAY['platform_admin','support','tenant_admin','tenant_management'],
    ARRAY['releases']
  ),
  (
    '85000000-0000-4000-8000-000000000017',
    'retro-2026-07-kb-roadmap-releases',
    'Knowledgebase, roadmap en releasebeheer',
    'retro-knowledgebase-roadmap-en-releasebeheer',
    'Conceptrelease voor handleidingen, tooltips, roadmap/featurewensen, release notes, highlights en audience-scoped communicatie.',
    '<h2>Knowledgebase, roadmap en releasebeheer</h2><p>Fieldgrid heeft een vaste kennisbank, help-tooltips, roadmapbord, featurewensen, releasebeheer, release views en dismissbare highlights.</p>',
    'Fieldgrid heeft een vaste kennisbank, help-tooltips, roadmapbord, featurewensen, releasebeheer, release views en dismissbare highlights.',
    'high',
    ARRAY['platform_admin','support','tenant_admin','tenant_management','tenant_personnel','tenant_customer'],
    ARRAY['knowledgebase','roadmap','releases','customer_portal','personnel_portal']
  );

INSERT INTO releases (
  id,
  version,
  title,
  slug,
  summary,
  content_html,
  content_text,
  status,
  impact_level,
  featured,
  published_at,
  created_by,
  updated_by,
  archived_at
)
SELECT
  id,
  version,
  title,
  slug,
  summary,
  content_html,
  content_text,
  'draft',
  impact_level,
  false,
  NULL,
  NULL,
  NULL,
  NULL
FROM fieldgrid_retro_release_seed
ON CONFLICT (version) DO NOTHING;

INSERT INTO release_audiences (release_id, audience_key)
SELECT seeded.id, audience.audience_key
FROM fieldgrid_retro_release_seed seeded
JOIN releases ON releases.id = seeded.id
CROSS JOIN LATERAL unnest(seeded.audience_keys) AS audience(audience_key)
ON CONFLICT DO NOTHING;

INSERT INTO release_modules (release_id, module_key)
SELECT seeded.id, module.module_key
FROM fieldgrid_retro_release_seed seeded
JOIN releases ON releases.id = seeded.id
CROSS JOIN LATERAL unnest(seeded.module_keys) AS module(module_key)
JOIN modules ON modules.key = module.module_key
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE fieldgrid_retro_release_item_seed (
  id uuid PRIMARY KEY,
  release_version varchar(80) NOT NULL,
  title varchar(220) NOT NULL,
  description text NOT NULL,
  category_slug varchar(180) NOT NULL,
  module_key varchar(80),
  impact_level varchar(20) NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO fieldgrid_retro_release_item_seed (
  id,
  release_version,
  title,
  description,
  category_slug,
  module_key,
  impact_level,
  sort_order
)
VALUES
  ('85100000-0000-4000-8000-000000000001','retro-2026-07-platform-foundation','Multi-tenant tenant context','Tenant resolution, tenant-aware routes and tenant-scoped access patterns are documented as the platform foundation.','platform','releases','high',1),
  ('85100000-0000-4000-8000-000000000002','retro-2026-07-platform-foundation','Module entitlements','Tenant modules and plan entitlements determine which functionality is visible and usable.','platform','releases','high',2),
  ('85100000-0000-4000-8000-000000000003','retro-2026-07-platform-foundation','Baseline hardening','Tenant scope, storage scope and support boundaries are part of the baseline release story.','security','releases','critical',3),
  ('85100000-0000-4000-8000-000000000004','retro-2026-07-tenant-provisioning-onboarding','Onboarding wizard','Platform admins can capture tenant identity, plan, domain, modules, sectors and regions.','platform','releases','high',1),
  ('85100000-0000-4000-8000-000000000005','retro-2026-07-tenant-provisioning-onboarding','Owner invite status','Provisioning tracks owner email, invite state and first-run status for review.','platform','releases','high',2),
  ('85100000-0000-4000-8000-000000000006','retro-2026-07-tenant-provisioning-onboarding','Retry and rollback visibility','Failed provisioning runs expose retry state and rollback path to platform admins.','operations','releases','high',3),
  ('85100000-0000-4000-8000-000000000007','retro-2026-07-platform-admin-command-center','Tenants and subscriptions','Platform admins can inspect tenant list, tenant details, subscriptions and plan state.','platform','releases','medium',1),
  ('85100000-0000-4000-8000-000000000008','retro-2026-07-platform-admin-command-center','Operations and smoke checks','Operations and staging smoke pages expose deployment, healthchecks and release gates.','platform','releases','medium',2),
  ('85100000-0000-4000-8000-000000000009','retro-2026-07-platform-admin-command-center','Platform users and settings','Platform users, SMTP settings, support policy and platform configuration are centralized.','platform','releases','medium',3),
  ('85100000-0000-4000-8000-000000000010','retro-2026-07-tenant-backoffice-core','Dashboard command center','Tenant dashboard is reorganized around summary, inbox and focus panels.','backoffice','assignments','high',1),
  ('85100000-0000-4000-8000-000000000011','retro-2026-07-tenant-backoffice-core','Shared UI primitives','Tenant page shell, headers, toolbars, action menus, confirm dialogs and responsive tables standardize the UI.','ui-ux','releases','medium',2),
  ('85100000-0000-4000-8000-000000000012','retro-2026-07-tenant-backoffice-core','Settings shell','Tenant settings include users, roles, auditlog, notifications, qualifications, mail, organization, sectors and planning.','backoffice','releases','medium',3),
  ('85100000-0000-4000-8000-000000000013','retro-2026-07-customers','Customer list and detail','Customers have list and detail flows with consistent actions and filtering.','klanten','customers','medium',1),
  ('85100000-0000-4000-8000-000000000014','retro-2026-07-customers','Customer portal linkage','Customer users and portal-facing customer data are part of the tenant workflow.','klantportaal','customer_portal','medium',2),
  ('85100000-0000-4000-8000-000000000015','retro-2026-07-customers','Customer types','Customer type settings support tenant-specific customer classification.','klanten','customers','low',3),
  ('85100000-0000-4000-8000-000000000016','retro-2026-07-objects','Object list and detail','Objects are available in tenant backoffice with consistent list and detail flows.','objecten','objects','medium',1),
  ('85100000-0000-4000-8000-000000000017','retro-2026-07-objects','Customer-facing objects','Customer portal exposes objects where relevant for customer users.','klantportaal','customer_portal','medium',2),
  ('85100000-0000-4000-8000-000000000018','retro-2026-07-objects','Object operation context','Objects can connect operational context, personnel/material/inventory tabs and assignments.','objecten','objects','medium',3),
  ('85100000-0000-4000-8000-000000000019','retro-2026-07-assignments-work-orders','Assignment workbench','Assignments have list, detail, status and execution flows in tenant backoffice.','werkbonnen','assignments','high',1),
  ('85100000-0000-4000-8000-000000000020','retro-2026-07-assignments-work-orders','Personnel execution','Personnel app supports assignment detail, material, inventory, extra work and closeout flows.','personeelsapp','personnel_portal','high',2),
  ('85100000-0000-4000-8000-000000000021','retro-2026-07-assignments-work-orders','Customer request flow','Customer portal supports assignment overview, details and new request flow.','klantportaal','customer_portal','medium',3),
  ('85100000-0000-4000-8000-000000000022','retro-2026-07-planning-smart-planning','Planning board','Planning routes provide command bar, filters and operational assignment scheduling.','planning','planning','high',1),
  ('85100000-0000-4000-8000-000000000023','retro-2026-07-planning-smart-planning','Availability and leave','Personnel availability, leave and capacity signals feed planning decisions.','personeel','personnel','medium',2),
  ('85100000-0000-4000-8000-000000000024','retro-2026-07-planning-smart-planning','Smart planning controls','Smart planning settings and interest round controls support smarter assignment matching.','planning','smart_planning','medium',3),
  ('85100000-0000-4000-8000-000000000025','retro-2026-07-personnel-app','Planning and open services','Personnel can view assigned work, open services and operational details.','personeelsapp','personnel_portal','high',1),
  ('85100000-0000-4000-8000-000000000026','retro-2026-07-personnel-app','Hours, messages and notifications','Personnel app includes hours, messages, notifications and notification settings.','personeelsapp','personnel_portal','medium',2),
  ('85100000-0000-4000-8000-000000000027','retro-2026-07-personnel-app','Documents, news and profile','Personnel can access documents, news, profile, security and settings.','personeelsapp','personnel_portal','medium',3),
  ('85100000-0000-4000-8000-000000000028','retro-2026-07-customer-portal','Customer portal workspace','Customer portal contains home, assignments, objects, support, finance, documents, help and releases.','klantportaal','customer_portal','high',1),
  ('85100000-0000-4000-8000-000000000029','retro-2026-07-customer-portal','Customer finance access','Customers can access invoices, payments and quotes where modules and permissions allow it.','facturatie','finance','high',2),
  ('85100000-0000-4000-8000-000000000030','retro-2026-07-customer-portal','Customer account controls','Customer profile, security and notification preferences are available in the portal.','klantportaal','customer_portal','medium',3),
  ('85100000-0000-4000-8000-000000000031','retro-2026-07-reporting-review','Report review layout','Tenant backoffice supports report overview, detail and review-oriented workflows.','rapportages','reporting','medium',1),
  ('85100000-0000-4000-8000-000000000032','retro-2026-07-reporting-review','Portal-visible reports','Customer portal exposes relevant approved reports.','klantportaal','customer_portal','medium',2),
  ('85100000-0000-4000-8000-000000000033','retro-2026-07-reporting-review','Personnel report context','Personnel execution flows provide input for reporting and closeout.','personeelsapp','personnel_portal','medium',3),
  ('85100000-0000-4000-8000-000000000034','retro-2026-07-finance-invoices-payments','Invoices and collective invoices','Tenant finance includes invoice and collective invoice workflows.','facturatie','finance','high',1),
  ('85100000-0000-4000-8000-000000000035','retro-2026-07-finance-invoices-payments','Payments and quotes','Payments and quotes are available for tenant admins and customer portal users.','betalingen','finance','high',2),
  ('85100000-0000-4000-8000-000000000036','retro-2026-07-finance-invoices-payments','PDF and CSV downloads','Finance exports include PDF and CSV download coverage for relevant pages.','facturatie','finance','medium',3),
  ('85100000-0000-4000-8000-000000000037','retro-2026-07-tickets-notifications','Ticket inboxes','Tenant, customer and personnel ticket/message routes are available.','tickets','notifications','medium',1),
  ('85100000-0000-4000-8000-000000000038','retro-2026-07-tickets-notifications','Notification center','Notification center and push/email settings support role-specific signals.','tickets','notifications','medium',2),
  ('85100000-0000-4000-8000-000000000039','retro-2026-07-tickets-notifications','Workflow notifications','Assignment, interest, ticket and portal events have notification hooks.','tickets','notifications','medium',3),
  ('85100000-0000-4000-8000-000000000040','retro-2026-07-documents-storage','Tenant-scoped documents','Documents are tenant-scoped across backoffice and portals.','documenten','documents','medium',1),
  ('85100000-0000-4000-8000-000000000041','retro-2026-07-documents-storage','Storage upload hardening','Storage policies and upload checks protect assignment, media, news and document files.','security','documents','high',2),
  ('85100000-0000-4000-8000-000000000042','retro-2026-07-documents-storage','Portal document access','Customer and personnel portals expose documents when the module is active.','documenten','documents','medium',3),
  ('85100000-0000-4000-8000-000000000043','retro-2026-07-material-inventory','Material catalog and stock','Material management includes catalog, stock balances and dashboard signals.','materiaalbeheer','materials','high',1),
  ('85100000-0000-4000-8000-000000000044','retro-2026-07-material-inventory','Inventory registry and QR','Inventory management includes detail pages, QR routes and issue review.','inventarisbeheer','inventory','high',2),
  ('85100000-0000-4000-8000-000000000045','retro-2026-07-material-inventory','Assignment, object and personnel links','Materials and inventory connect to assignments, objects and personnel workflows.','inventarisbeheer','inventory','medium',3),
  ('85100000-0000-4000-8000-000000000046','retro-2026-07-rbac-audit-security','Tenant RBAC','Tenant users, roles and permissions are managed from tenant settings.','security','releases','critical',1),
  ('85100000-0000-4000-8000-000000000047','retro-2026-07-rbac-audit-security','Platform support access','Platform users, support grants and support mode are part of operational security.','security','releases','critical',2),
  ('85100000-0000-4000-8000-000000000048','retro-2026-07-rbac-audit-security','Audit and final gates','Audit logs, security dashboard, staging smoke and final gates support release readiness.','security','releases','high',3),
  ('85100000-0000-4000-8000-000000000049','retro-2026-07-kb-roadmap-releases','Knowledgebase and tooltips','Knowledgebase articles, categories, media, search, feedback and help tooltips are available.','kennisbank','knowledgebase','high',1),
  ('85100000-0000-4000-8000-000000000050','retro-2026-07-kb-roadmap-releases','Roadmap and feature wishes','Platform roadmap and tenant feature wishes are modeled with Kanban status flow.','roadmap','roadmap','high',2),
  ('85100000-0000-4000-8000-000000000051','retro-2026-07-kb-roadmap-releases','Release management and highlights','Release editor, scoped release views, highlights and dismiss state are available.','releasebeheer','releases','high',3);

INSERT INTO release_items (
  id,
  release_id,
  category_id,
  title,
  description,
  module_key,
  impact_level,
  sort_order
)
SELECT
  item.id,
  releases.id,
  release_categories.id,
  item.title,
  item.description,
  item.module_key,
  item.impact_level,
  item.sort_order
FROM fieldgrid_retro_release_item_seed item
JOIN releases ON releases.version = item.release_version
JOIN fieldgrid_retro_release_seed seeded ON seeded.id = releases.id AND seeded.version = item.release_version
LEFT JOIN release_categories ON release_categories.slug = item.category_slug
LEFT JOIN modules ON modules.key = item.module_key
WHERE item.module_key IS NULL OR modules.key IS NOT NULL
ON CONFLICT (id) DO NOTHING;
