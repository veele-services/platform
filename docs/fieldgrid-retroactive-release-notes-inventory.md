# Fieldgrid retroactive release notes inventory

## Doel

Fase 6 van `research-knowledgebase-roadmap-release-notes.md` vraagt om een eerste set retroactieve release notes op basis van routes, migrations, docs en git history. Deze inventaris onderbouwt de concepten die via migratie `085_retroactive_release_note_drafts.sql` worden aangemaakt.

Alle release notes blijven globale platformcontent, maar zijn audience- en module-scoped. Ze worden als `draft` aangemaakt zodat platform admins ze kunnen reviewen, aanpassen en publiceren vanuit `/platform/releases`.

## Bronnen

Route-inventaris:

- Platform admin: `/platform`, onboarding, tenants, subscriptions, tickets, notifications, knowledgebase, roadmap, releases, security, operations, staging smoke, platform users en settings.
- Tenant backoffice: dashboard, customers, objects, assignments, planning, personnel, reports, quotes, invoices, tickets, documents, materials, inventory, help, roadmap, releases en settings.
- Customer PWA: home, opdrachten, objecten, rapporten, facturen, betalingen, offertes, tickets, documenten, help, releases, profiel, beveiliging en instellingen.
- Personnel PWA: home, planning/opdrachten, open diensten, uren, berichten, meldingen, nieuws, documenten, help, releases, beschikbaarheid, verlof, materiaal en inventaris flows.

Migratie-inventaris:

- Tenant context, RBAC, module entitlements en tenant lifecycle zijn opgebouwd in de vroege sprintmigraties en tenant-scoped hardening.
- Customer/object/assignment/reporting/finance/document storage zijn in opvolgende migrations toegevoegd en gehard.
- Materialen en inventaris zijn toegevoegd in `066_material_inventory_foundation.sql` en daarna uitgebreid met assignment usage, indexes en readiness/hardening.
- Platform admin, subscriptions, custom domains, ticketing, notifications, knowledgebase, roadmap en releases zijn in `073` t/m `084` toegevoegd.

Docs-inventaris:

- `fieldgrid-saas-masterplan.md`
- `fieldgrid-platform-admin-roadmap.md`
- `fieldgrid-customer-personnel-portal-roadmap.md`
- `research-tenant-backoffice-ui-cleanup.md`
- `research-material-inventory-management.md`
- `research-knowledgebase-roadmap-release-notes.md`
- Sprint- en fase-documenten voor tenant context, module enforcement, storage, support security, operations en final gates.

Git-history-inventaris:

- `1974c52 Add knowledgebase roadmap release foundation`
- `87329fb Implement knowledgebase basics`
- `1b6c958 Implement knowledgebase search feedback tooltips`
- `071bd38 Implement roadmap board and feature requests`
- `8271c1d Implement release management phase`
- Daarnaast recente commits voor managed password resets, PDF/CSV downloads, platform SMTP settings, tenant admin management en material/inventory modules.

## Concept release notes

De seed maakt de volgende concepten aan:

1. Platformbasis en tenantfundament
2. Tenant provisioning en onboarding
3. Platform admin command center
4. Tenant backoffice basis
5. Klantenbeheer
6. Objectbeheer
7. Opdrachten en werkbonnen
8. Planning en smart planning
9. Personeelsapp
10. Klantportaal
11. Rapportages en controle
12. Finance, facturen en betalingen
13. Tickets, meldingen en notificaties
14. Documenten en storage
15. Materiaal- en inventarisbeheer
16. Rollen, permissies, audit en security
17. Knowledgebase, roadmap en releasebeheer

## Reviewproces

Platform admin reviewt deze concepten in `/platform/releases`:

1. Open een conceptrelease.
2. Controleer titel, samenvatting, modules, audiences en items.
3. Pas tekst of scope aan indien nodig.
4. Publiceer pas nadat de conceptrelease klopt voor de bedoelde doelgroep.
5. Maak eventueel per release een highlight voor de juiste surface en audience.

Deze migratie publiceert niets automatisch en verstuurt geen notificaties.
