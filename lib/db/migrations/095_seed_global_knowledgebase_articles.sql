-- ============================================================================
-- Global Fieldgrid knowledgebase article seed
--
-- Staging/production safe:
-- - Inserts or refreshes tenant-neutral platform_global articles.
-- - Does not delete tenant-specific or manually created content.
-- - Visibility remains enforced through audience and module joins.
-- ============================================================================

CREATE TEMP TABLE fieldgrid_kb_article_seed (
  slug text PRIMARY KEY,
  title text NOT NULL,
  category_slug text NOT NULL,
  module_key text NOT NULL,
  audiences text[] NOT NULL,
  keywords text[] NOT NULL,
  smart_terms text[] NOT NULL,
  sort_order integer NOT NULL,
  featured boolean NOT NULL DEFAULT false,
  summary text NOT NULL,
  what text NOT NULL,
  steps text[] NOT NULL,
  rights text NOT NULL,
  troubleshooting text NOT NULL
) ON COMMIT DROP;

INSERT INTO fieldgrid_kb_article_seed (
  slug, title, category_slug, module_key, audiences, keywords, smart_terms,
  sort_order, featured, summary, what, steps, rights, troubleshooting
)
VALUES
  (
    'platform-dashboard-overzicht',
    'Platform dashboard gebruiken',
    'platformbeheer',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['platform dashboard','platformbeheer','healthchecks','operations'],
    ARRAY['waar zie ik platform status','platform overzicht','tenant gezondheid'],
    10,
    true,
    'Gebruik het platformdashboard voor tenantstatus, operations, meldingen en recente release-informatie.',
    'Het platformdashboard is het centrale startpunt voor platform admins en support. Het toont signalen over onboarding, tenants, subscriptions, operations en recente productinformatie.',
    ARRAY[
      'Open Platformbeheer en controleer eerst de statuskaarten bovenaan.',
      'Gebruik afwijkende of blokkerende statussen als ingang naar de bijbehorende detailpagina.',
      'Open operations of staging smoke wanneer deployment, migratie of healthchecks aandacht vragen.',
      'Gebruik release- en roadmapwidgets om recente platformwijzigingen te volgen.'
    ],
    'Alleen platform admins en supportrollen met platformtoegang mogen deze globale statusinformatie beheren of bekijken.',
    'Wanneer cijfers niet overeenkomen met detailpagina''s, controleer eerst of filters, tenantstatus of module-entitlements verschillen.'
  ),
  (
    'tenant-aanmaken-en-onboarding',
    'Tenant aanmaken en onboarden',
    'tenantbeheer',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['tenant aanmaken','onboarding','owner invite','first-run','provisioning'],
    ARRAY['nieuwe klantomgeving','tenant provisioning','owner opnieuw uitnodigen'],
    20,
    true,
    'Stappen voor een nieuwe tenant, inclusief plan, modules, domein, owner invite en first-run.',
    'Onboarding maakt een tenantrecord, hostcontext, modules, sectoren, regio''s, branding en eigenaarstoegang aan. De flow is ontworpen om herhaalbaar en controleerbaar te zijn.',
    ARRAY[
      'Ga naar Platformbeheer > Onboarding en start een nieuwe tenant met naam, slug, plan en modules.',
      'Controleer de preflight stap voordat tenantgegevens definitief worden aangemaakt.',
      'Stuur de owner invite naar het juiste e-mailadres of pas deze aan wanneer het adres fout is.',
      'Gebruik Retry alleen nadat de getoonde fout is opgelost en controleer daarna tenantstatus en first-run.'
    ],
    'Alleen platform admins beheren onboarding. Tenant admins krijgen toegang nadat de uitnodiging is geaccepteerd en het eerste wachtwoord is gewijzigd.',
    'Bij een provisioningfout: lees de rollbackreden, los de onderliggende configuratie of constraint op en gebruik daarna Retry.'
  ),
  (
    'tenant-domeinen-en-custom-domains',
    'Tenantdomeinen en custom domains beheren',
    'tenantbeheer',
    'knowledgebase',
    ARRAY['platform_admin','support','tenant_admin'],
    ARRAY['custom domain','tenant domein','dns','caddy','enterprise'],
    ARRAY['eigen domein koppelen','wildcard tenant','dns instructies'],
    30,
    true,
    'Koppel tenantdomeinen veilig, met DNS-instructies en Enterprise-goedkeuring.',
    'Fieldgrid gebruikt standaard tenant-slugs onder het platformdomein. Enterprise tenants kunnen via platform support een eigen domein laten koppelen.',
    ARRAY[
      'Controleer in platform admin of de tenant Enterprise-rechten heeft.',
      'Voeg het gewenste domein toe en toon de DNS-instructies aan de tenant.',
      'Controleer of DNS naar de juiste Caddy/VPS ingress wijst voordat verkeer wordt geactiveerd.',
      'Gebruik alleen gevalideerde domeinen in hostcontext en laat oude hosts als legacy alleen tijdelijk bestaan.'
    ],
    'Custom domains worden uitsluitend door platform admin of support beheerd. Tenant admins kunnen instructies ontvangen, maar activeren geen globale routing zelf.',
    'Wanneer TLS of routing faalt, controleer DNS, Caddy ask-domain policy, wildcard certificaten en de tenant-hostkoppeling.'
  ),
  (
    'platform-gebruikers-en-rollen',
    'Platformgebruikers, rollen en toegang',
    'rollen-permissies',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['platform gebruikers','rollen','owner','support','toegang'],
    ARRAY['geen platformtoegang','platform admin toevoegen','support account'],
    40,
    false,
    'Beheer platformrollen, supporttoegang en veilige uitnodigingen.',
    'Platformgebruikers zijn los van tenantgebruikers. Zij beheren globale Fieldgrid-inrichting, support en securitygevoelige processen.',
    ARRAY[
      'Open Platformgebruikers en controleer e-mailadres, rol en status.',
      'Gebruik owner of supportrollen alleen voor gebruikers die platformbreed mogen werken.',
      'Stuur uitnodigingen via Fieldgrid mail met tijdelijk wachtwoord en verplichte wachtwoordwijziging.',
      'Verwijder of deactiveer toegang direct wanneer iemand geen platformwerk meer uitvoert.'
    ],
    'Alleen platform admins beheren platformgebruikers. Supportrollen moeten zo beperkt mogelijk blijven en auditbaar zijn.',
    'Bij de melding Geen platformtoegang: controleer of de gebruiker een actieve platformrol heeft en of de sessie bij het juiste domein hoort.'
  ),
  (
    'platform-instellingen-mail-smtp-api',
    'Platform mail instellen met SMTP of API',
    'instellingen',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['smtp','resend','sendgrid','mail','api key','wachtwoord vergeten'],
    ARRAY['mail komt niet aan','resend api','platform mailtransport'],
    50,
    true,
    'Configureer platformbreed mailtransport voor uitnodigingen, herstelcodes en notificaties.',
    'Fieldgrid verstuurt uitnodigingen, tijdelijke wachtwoorden, herstelcodes en notificaties via de geconfigureerde mailprovider.',
    ARRAY[
      'Open Platformbeheer > Instellingen > Mail.',
      'Kies SMTP of API-provider en vul de vereiste host-, afzender- of API-gegevens in.',
      'Bewaar secrets alleen via beveiligde instellingen of environment secrets.',
      'Verstuur een testmail en controleer delivery logs voordat uitnodigingen opnieuw worden verzonden.'
    ],
    'Alleen platform admins wijzigen globale mailproviders. Tenant mailinstellingen mogen tenantafzenders bepalen maar niet de globale secretstrategie omzeilen.',
    'Als mails niet aankomen: controleer providerstatus, afzenderdomein, SPF/DKIM/DMARC, queue worker en of de juiste tenant/surface URL in de mail staat.'
  ),
  (
    'platform-security-audit-operations',
    'Security, audit en operations controleren',
    'platformbeheer',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['security','auditlog','operations','staging smoke','healthcheck'],
    ARRAY['deployment controleren','audit export','staging smoke rood'],
    60,
    false,
    'Gebruik security, audit en operations om productiegeschiktheid en wijzigingen te bewaken.',
    'De security- en operationsschermen tonen auditlogs, healthchecks, migratiestatus, smoke tests en configuratiesignalen.',
    ARRAY[
      'Controleer operations na elke deploy of migratie.',
      'Gebruik auditlogfilters voor gebruikers-, tenant- of securitygevoelige wijzigingen.',
      'Open staging smoke voor realtime eindpuntcontroles.',
      'Exporteer auditdata alleen wanneer dat voor support of compliance nodig is.'
    ],
    'Platform admins en geautoriseerde supportrollen mogen security- en operationsdata zien. Tenantgebruikers zien deze platformdetails niet.',
    'Bij blokkades: los eerst database-, storage-, mail- of serviceconfiguratie op voordat nieuwe onboarding of releaseacties worden gestart.'
  ),
  (
    'knowledgebase-artikelen-en-tooltips',
    'Knowledgebase artikelen en tooltips beheren',
    'releasebeheer',
    'knowledgebase',
    ARRAY['platform_admin','support'],
    ARRAY['knowledgebase','handleiding','tooltip','TipTap','media','preview'],
    ARRAY['artikel publiceren','tooltip koppelen','preview als audience'],
    70,
    true,
    'Maak globale handleidingen, tooltips en helpkoppelingen met audience-, module- en permissiescope.',
    'De knowledgebase bevat klantvriendelijke uitleg voor platform admin, tenant backoffice, klantportaal en personeelsapp. Tooltips bieden korte hulp in context.',
    ARRAY[
      'Maak of bewerk een artikel met titel, slug, samenvatting, categorie en TipTap-content.',
      'Koppel audiences, modules en permissies zodat alleen relevante gebruikers het artikel zien.',
      'Gebruik preview als tenant, rol of audience voordat je publiceert.',
      'Koppel tooltips aan een primair artikel en controleer mobiel tapgedrag.'
    ],
    'Platform admins beheren globale content. Tenant admins kunnen alleen tenant-eigen artikelen beheren als tenant-authoring expliciet actief is.',
    'Als een artikel niet zichtbaar is: controleer status, archiveerstatus, audience, module-entitlement, permissies en tenantcontext.'
  ),
  (
    'roadmap-featurewensen-triage',
    'Roadmap en featurewensen triageren',
    'roadmap',
    'roadmap',
    ARRAY['platform_admin','support','tenant_admin','tenant_management'],
    ARRAY['roadmap','featurewens','kanban','status','triage'],
    ARRAY['wens indienen','status wijzigen','koppelen aan release'],
    80,
    true,
    'Gebruik de roadmap voor globale productplanning en tenant featurewensen.',
    'Roadmapitems kunnen globaal of tenant-specifiek zijn. Tenantwensen starten als Nieuw en kunnen door platform admin worden beoordeeld, gekoppeld of afgerond.',
    ARRAY[
      'Open Roadmap en bekijk de kolommen Nieuw, In overweging, In ontwikkeling en Afgerond.',
      'Gebruik quick actions of detaildrawer om status, prioriteit, global scope en releasekoppeling te wijzigen.',
      'Laat tenant admins eigen wensen indienen via de tenant backoffice, klantportal of personeelsapp als dit geactiveerd is.',
      'Koppel afgeronde items aan release notes voor traceerbaarheid.'
    ],
    'Platform admins beheren alle roadmapitems. Tenant admins zien relevante globale items en eigen tenantwensen.',
    'Als een wens niet zichtbaar is: controleer public visibility, tenantlink, audience, module en feature-request instelling.'
  ),
  (
    'release-notes-highlights',
    'Release notes en highlights beheren',
    'releasebeheer',
    'releases',
    ARRAY['platform_admin','support','tenant_admin','tenant_management','tenant_personnel','tenant_customer'],
    ARRAY['release notes','versienotes','highlight','gele balk','read receipt'],
    ARRAY['nieuwe release publiceren','release uitlichten','release gelezen'],
    90,
    true,
    'Publiceer release notes per audience en module, inclusief highlights en media.',
    'Releasebeheer maakt productwijzigingen zichtbaar voor de juiste doelgroep. Highlights kunnen tijdelijk bovenaan dashboards of portals worden getoond.',
    ARRAY[
      'Maak een release met versie, titel, categorie, impact en samenvatting.',
      'Koppel audiences en modules zodat gebruikers alleen relevante releases zien.',
      'Voeg screenshots of video toe wanneer uitleg visueel nodig is.',
      'Gebruik highlight met einddatum voor belangrijke wijzigingen en controleer dismissed/read state.'
    ],
    'Alleen platform admins beheren globale releases. Gebruikers kunnen releases bekijken en highlights wegklikken volgens hun rol.',
    'Als een release niet verschijnt: controleer status, publicatiedatum, audience, module-entitlement en highlightperiode.'
  ),
  (
    'tenant-dashboard-en-acties',
    'Tenant dashboard gebruiken',
    'dashboard',
    'knowledgebase',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['dashboard','actie inbox','planning','finance','tickets'],
    ARRAY['waar begin ik','open acties','operationeel overzicht'],
    100,
    true,
    'Gebruik het tenantdashboard als rustig overzicht voor acties, planning, finance en tickets.',
    'Het tenantdashboard toont de belangrijkste signalen eerst: aandacht nodig, open opdrachten, planning, finance, beschikbaarheid en tickets.',
    ARRAY[
      'Begin bovenaan bij Aandacht nodig en open de actie die prioriteit heeft.',
      'Gebruik planning, finance en ticketpanelen om naar de werkbanken te gaan.',
      'Controleer of aantallen overeenkomen met de filters op de detailpagina.',
      'Gebruik de zoekbalk voor snelle navigatie naar klanten, objecten of opdrachten.'
    ],
    'Zichtbaarheid volgt tenantrol en modulepermissies. Een gebruiker zonder finance ziet geen finance-inhoud.',
    'Als dashboardaantallen afwijken: controleer filters, datums, statusdefinities en tenantcontext.'
  ),
  (
    'klanten-aanmaken-en-portaal-uitnodigen',
    'Klanten aanmaken en uitnodigen voor het portaal',
    'klanten',
    'customers',
    ARRAY['tenant_admin','tenant_management','tenant_administration'],
    ARRAY['klant aanmaken','klantportaal uitnodiging','contactpersoon','e-mail'],
    ARRAY['klant uitnodigen','portaal actief maken','waarom mislukt klant aanmaken'],
    110,
    true,
    'Maak klanten aan, beheer contactgegevens en stuur klantportaaluitnodigingen met tijdelijk wachtwoord.',
    'Klanten vormen de basis voor objecten, opdrachten, offertes, facturen, rapportages, documenten en tickets.',
    ARRAY[
      'Open Klanten en kies Nieuwe klant.',
      'Vul naam, sector, type, status en primaire contactgegevens in.',
      'Vink direct uitnodigen alleen aan wanneer een geldig e-mailadres is ingevuld.',
      'Open de klantdetailpagina om contacten, objecten, documenten, facturen en portaalstatus te beheren.'
    ],
    'Gebruikers hebben klantbeheerrechten nodig. Klantportaaltoegang wordt alleen aan het gekoppelde klantcontact verstrekt.',
    'Als aanmaken of uitnodigen mislukt: controleer verplichte velden, e-mailadres, tenant mailprovider en de foutmelding in de toast of serverlogs.'
  ),
  (
    'objecten-locaties-documenten',
    'Objecten, locaties en documenten beheren',
    'objecten',
    'objects',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['objecten','locaties','documenten','servicetype','adres'],
    ARRAY['object aanmaken','document bij object','actieve opdrachten per object'],
    120,
    false,
    'Leg locaties, objectinformatie, documenten en objecthistorie vast.',
    'Objecten koppelen klanten aan locaties, opdrachten, documenten, inventaris en rapportages.',
    ARRAY[
      'Maak een object aan vanuit Objecten of vanuit een klantdetailpagina.',
      'Controleer klantkoppeling, adres, servicetype en status.',
      'Upload documenten alleen wanneer ze bij dit object horen.',
      'Gebruik tabs voor opdrachten, rapportages, documenten, inventaris en historie.'
    ],
    'Objectrechten en documentrechten bepalen wat een gebruiker kan zien of wijzigen.',
    'Als documentaantallen vreemd lijken: controleer of documenten aan klant, object of opdracht gekoppeld zijn en of tenantfiltering klopt.'
  ),
  (
    'opdrachten-werkbonnen-beheren',
    'Opdrachten en werkbonnen beheren',
    'werkbonnen-opdrachten',
    'assignments',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['opdrachten','werkbon','status','uitvoering','taken'],
    ARRAY['nieuwe opdracht','werkbon sluiten','opdracht detail'],
    130,
    true,
    'Maak, plan, volg en sluit opdrachten met klant, object, sector, taken en rapportage.',
    'Opdrachten sturen de operationele flow: aanvraag, planning, uitvoering, rapportage, facturatie en documenten.',
    ARRAY[
      'Maak een nieuwe opdracht met klant, object, sector, datum en prioriteit.',
      'Voeg taakcodes, notities, materiaal of inventaris toe waar relevant.',
      'Plan medewerkers via de planning workbench.',
      'Controleer rapportage en sluit de opdracht pas wanneer uitvoering en administratie kloppen.'
    ],
    'Planning en management zien operationele informatie; administratie ziet financegerelateerde onderdelen volgens permissies.',
    'Als een opdracht niet planbaar is: controleer status, datum, sector, benodigde functies en beschikbaarheid van personeel.'
  ),
  (
    'planning-workbench-matchscores',
    'Planning workbench en matchscores gebruiken',
    'planning',
    'planning',
    ARRAY['tenant_admin','tenant_management','tenant_planning'],
    ARRAY['planning','planbord','matchscore','conflict','beschikbaarheid'],
    ARRAY['open plaatsen','personeel drawer','drag and drop plannen'],
    140,
    true,
    'Plan open werkbonnen met capaciteit, beschikbaarheid, conflicten en matchscores.',
    'De planning workbench combineert open opdrachten, beschikbare medewerkers, sectoren, functies en conflictsignalen.',
    ARRAY[
      'Open Planning en kies bord-, dag- of maandweergave.',
      'Gebruik filters op werkbon, klant, object, regio of sector.',
      'Bekijk matchscores en conflicten voordat je een medewerker plant.',
      'Open de personeeldrawer voor beschikbaarheid, functies en eventuele blokkades.'
    ],
    'Planningrechten zijn nodig om het bord te gebruiken en wijzigingen op planning door te voeren.',
    'Als medewerkers of opdrachten niet kloppen: controleer tenantfiltering, personeelsstatus, beschikbaarheid, sector en opdrachtstatus.'
  ),
  (
    'personeel-beschikbaarheid-verlof',
    'Personeel, beschikbaarheid en verlof beheren',
    'personeel',
    'personnel',
    ARRAY['tenant_admin','tenant_management','tenant_planning'],
    ARRAY['personeel','beschikbaarheid','verlof','ziekmelding','kwalificaties'],
    ARRAY['personeelslid toevoegen','beschikbaarheid instellen','verlof inbox'],
    150,
    false,
    'Beheer personeelsprofielen, portaaltoegang, functies, kwalificaties, beschikbaarheid en verlof.',
    'Personeelsbeheer bepaalt wie ingepland kan worden en welke informatie zichtbaar is in de personeelsapp.',
    ARRAY[
      'Maak een personeelslid aan met naam, e-mail, type, status en functies.',
      'Controleer portaalstatus voordat je een uitnodiging verstuurt.',
      'Beheer beschikbaarheid, verlof en ziekmelding via de detailpagina of verlof-inbox.',
      'Koppel kwalificaties en certificaten waar planning of compliance dit vereist.'
    ],
    'Alleen bevoegde tenantrollen beheren personeel. Personeelsappgebruikers zien hun eigen planning en profielcontext.',
    'Als iemand niet planbaar is: controleer status, beschikbaarheid, verlof, ziekte, functies en kwalificatie-eisen.'
  ),
  (
    'rapportages-controleren',
    'Rapportages controleren en verwerken',
    'rapportages',
    'reporting',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['rapportages','controle','foto','notities','goedkeuren'],
    ARRAY['rapportage review','rapport goedkeuren','klant zichtbaar rapport'],
    160,
    false,
    'Controleer uitvoeringsrapportages voordat ze klantzichtbaar, factureerbaar of administratief verwerkt worden.',
    'Rapportages bevatten uitvoeringsinformatie, foto''s, notities, materiaalverbruik en eventuele afwijkingen.',
    ARRAY[
      'Open Rapporten en filter op status of opdracht.',
      'Controleer notities, foto''s, uren, materiaal en klantzichtbare informatie.',
      'Vraag correctie wanneer informatie ontbreekt of niet klopt.',
      'Keur het rapport pas goed wanneer klantcommunicatie en administratie veilig zijn.'
    ],
    'Planning en management controleren inhoud; administratie gebruikt rapportage voor facturatie wanneer toegestaan.',
    'Als rapportage ontbreekt: controleer opdrachtstatus, personeelsapp synchronisatie en eventuele offline wachtrij.'
  ),
  (
    'facturen-offertes-betalingen',
    'Offertes, facturen en betalingen beheren',
    'facturen',
    'finance',
    ARRAY['tenant_admin','tenant_management','tenant_administration'],
    ARRAY['offertes','facturen','betalingen','verzamelfacturen','mollie'],
    ARRAY['factuur downloaden','offerte versturen','betaling controleren'],
    170,
    true,
    'Beheer financeflows van offerte tot factuur, verzamelfactuur, betaling en download.',
    'Finance verbindt opdrachtinformatie, klantgegevens, rapportages en betalingen tot professionele documenten en opvolging.',
    ARRAY[
      'Maak of controleer offertes voordat ze naar klanten gaan.',
      'Maak facturen of verzamelfacturen vanuit goedgekeurde werkzaamheden.',
      'Controleer betaalstatus en openstaande bedragen.',
      'Download PDF/CSV waar beschikbaar en verstuur e-mails via de tenant mailconfiguratie.'
    ],
    'Alleen rollen met finance- of administratiepermissies mogen bedragen, betaalstatus en documenten beheren.',
    'Als PDF of e-mail faalt: controleer documenttemplate, mailprovider, klant e-mailadres en betalingsconfiguratie.'
  ),
  (
    'tickets-inbox-communicatie',
    'Tickets en communicatie opvolgen',
    'tickets',
    'notifications',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_personnel','tenant_customer'],
    ARRAY['tickets','support','inbox','conversatie','meldingen'],
    ARRAY['ticket openen','antwoord sturen','klantvraag','personeelsvraag'],
    180,
    false,
    'Gebruik tickets als centrale inbox voor klant- en personeelsvragen.',
    'Tickets verzamelen vragen, meldingen en opvolging vanuit backoffice, klantportaal en personeelsapp.',
    ARRAY[
      'Open Tickets en kies de juiste inbox of filter.',
      'Bekijk preview, afdeling, prioriteit, status en laatste bericht.',
      'Open het gesprek om te reageren of status te wijzigen.',
      'Koppel opvolging aan planning, klant, opdracht of administratie wanneer nodig.'
    ],
    'Gebruikers zien alleen tickets die bij hun tenant, rol, klant of personeelsprofiel horen.',
    'Als een ticket verkeerd zichtbaar is: controleer tenant_id, customer/personnel koppeling, tickettype en server-side filters.'
  ),
  (
    'documenten-uploaden-delen',
    'Documenten uploaden en delen',
    'documenten',
    'documents',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_customer'],
    ARRAY['documenten','upload','download','klantzichtbaar','opslag'],
    ARRAY['document toevoegen','document verwijderen','bestand downloaden'],
    190,
    false,
    'Upload en beheer documenten bij klanten, objecten, opdrachten, rapportages en finance.',
    'Documentbeheer zorgt dat bestanden bij de juiste tenant en entiteit blijven en alleen zichtbaar zijn voor de juiste doelgroep.',
    ARRAY[
      'Upload documenten vanuit de relevante detailpagina of documentenlijst.',
      'Controleer entiteitstype, zichtbaarheid en bestandsnaam.',
      'Gebruik bevestigingsdialogen bij verwijderen of archiveren.',
      'Download alleen documenten waarvoor je toegang hebt.'
    ],
    'Documentzichtbaarheid volgt tenant, entiteit, portalinstellingen en permissies.',
    'Als een document niet vindbaar is: controleer of het bij klant, object, opdracht of factuur hoort en of het klantzichtbaar is.'
  ),
  (
    'materialen-beheren',
    'Materialen en voorraad beheren',
    'materiaalbeheer',
    'materials',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_personnel'],
    ARRAY['materialen','voorraad','materiaalverbruik','werkbon','kostprijs'],
    ARRAY['materiaal toevoegen','voorraad corrigeren','materiaal op opdracht'],
    200,
    false,
    'Beheer materiaalcatalogus, voorraad en materiaalverbruik op werkbonnen.',
    'Materiaalbeheer ondersteunt producten, voorraadcorrecties, verbruik tijdens uitvoering en eventuele facturatie.',
    ARRAY[
      'Maak materialen aan met naam, eenheid, voorraad- en prijsinformatie.',
      'Gebruik sheets of dialogs voor create/update in plaats van permanente formulieren.',
      'Registreer materiaalverbruik op opdrachten of via de personeelsapp.',
      'Controleer verbruik tijdens rapportage- of factuurcontrole.'
    ],
    'Materiaalrechten bepalen wie voorraad, kosten, verkoopprijzen en verbruik mag zien of wijzigen.',
    'Als voorraad niet klopt: controleer transacties, correcties, opdrachtverbruik en tenantlocatie.'
  ),
  (
    'inventaris-qr-issues',
    'Inventaris, QR-codes en issues beheren',
    'inventarisbeheer',
    'inventory',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_personnel'],
    ARRAY['inventaris','qr code','bedrijfsmiddel','storing','onderhoud'],
    ARRAY['qr genereren','inventaris koppelen','issue melden'],
    210,
    false,
    'Beheer unieke inventarisitems, locatie, QR-code, toewijzing, onderhoud en issues.',
    'Inventarisbeheer volgt bedrijfsmiddelen die aan objecten, personeel of opdrachten gekoppeld kunnen worden.',
    ARRAY[
      'Maak een inventarisitem aan met type, status, serienummer en locatie.',
      'Genereer een QR-code en controleer welke informatie daarop zichtbaar is.',
      'Koppel inventaris aan object, personeel of opdracht wanneer dit nodig is.',
      'Behandel issues als reviewflow met status, prioriteit en opvolging.'
    ],
    'Inventarisrechten bepalen wie items, kosten, QR-codes, issues en onderhoud mag beheren.',
    'Als een QR-code of issue niet klopt: controleer itemstatus, tenantkoppeling, locatie en gekoppelde entiteit.'
  ),
  (
    'instellingen-rollen-permissies',
    'Instellingen, rollen en permissies beheren',
    'instellingen',
    'knowledgebase',
    ARRAY['tenant_admin','tenant_management'],
    ARRAY['instellingen','rollen','permissies','gebruikers','organisatie'],
    ARRAY['gebruiker uitnodigen','rol wijzigen','permission matrix'],
    220,
    true,
    'Beheer tenantinstellingen, gebruikers, rollen, permissies, organisatie, sectoren en modules.',
    'Instellingen bepalen hoe de tenant werkt: gebruikers, rollen, notificaties, mail, organisatiegegevens, sectoren, klanttypes en slim plannen.',
    ARRAY[
      'Open Instellingen en kies het juiste tabblad.',
      'Gebruik create/edit sheets voor gebruikers, rollen en referentiedata.',
      'Controleer permissies voordat je een rol opslaat.',
      'Gebruik sticky save bars en confirm dialogs om wijzigingen bewust door te voeren.'
    ],
    'Alleen tenant admins of management met instellingenrechten mogen configuratie wijzigen.',
    'Als een gebruiker iets niet ziet: controleer rol, permissies, module-entitlements, status en actieve tenanttoegang.'
  ),
  (
    'mailinstellingen-tenant',
    'Tenant mailinstellingen gebruiken',
    'instellingen',
    'knowledgebase',
    ARRAY['tenant_admin','tenant_management','tenant_administration'],
    ARRAY['mail','smtp','api','resend','afzender','uitnodiging'],
    ARRAY['tenant mail instellen','klant uitnodiging komt niet aan','herstelcode mail'],
    230,
    false,
    'Configureer tenantafzenders en test mail voor uitnodigingen, notificaties en wachtwoordherstel.',
    'Tenant mailinstellingen bepalen welke afzender en templates gebruikt worden binnen de tenant, terwijl platforminstellingen de provider en secrets beheren.',
    ARRAY[
      'Open Instellingen > Mail.',
      'Controleer transportkeuze, afzendernaam, afzenderadres en templates.',
      'Verstuur een testmail voordat je klant- of personeelsuitnodigingen opnieuw verstuurt.',
      'Gebruik platform support voor eigen domeinen of providerwijzigingen op Enterprise niveau.'
    ],
    'Tenant admins mogen tenantmailinstellingen beheren wanneer dit is toegestaan. Platform secrets blijven onder platformbeheer.',
    'Als mail niet aankomt: controleer tenant e-mailadres, providerconfiguratie, DNS, spamfolder en queue/logging.'
  ),
  (
    'taakcodes-sectoren-slim-plannen',
    'Taakcodes, sectoren en slim plannen instellen',
    'instellingen',
    'planning',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration'],
    ARRAY['taakcodes','sectoren','slim plannen','matchscore','prijzen'],
    ARRAY['taakcode toevoegen','sectorregels','planning gewicht'],
    240,
    false,
    'Gebruik referentiedata om planning, opdrachten, prijzen en rapportages consistent te houden.',
    'Taakcodes, sectoren, klanttypes en slim plannen bepalen hoe opdrachten worden opgebouwd, gepland en administratief verwerkt.',
    ARRAY[
      'Beheer taakcodes als compacte referentielijst met create/edit sheets.',
      'Koppel sectoren aan relevante rollen, taken en planningregels.',
      'Stel slim-plannen gewichten zorgvuldig in en documenteer waarom regels bestaan.',
      'Test wijzigingen op een opdracht voordat je ze breed gebruikt.'
    ],
    'Alleen bevoegde tenantrollen beheren referentiedata. Financevelden vereisen administratieve rechten.',
    'Als matchscores vreemd zijn: controleer sector, regio, functie-eisen, beschikbaarheid en ingestelde gewichtregels.'
  ),
  (
    'klantportaal-opdrachten-offertes-akkoord',
    'Klantportaal: opdrachten, offertes en akkoord',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_admin','tenant_management','tenant_customer'],
    ARRAY['klantportaal','opdrachten','offertes','akkoord','aanvraag'],
    ARRAY['klant opdracht aanvragen','offerte accepteren','klant ziet opdracht'],
    250,
    true,
    'Klanten kunnen opdrachten volgen, aanvragen indienen en offertes bekijken of akkoord geven.',
    'Het klantportaal toont alleen klantgebonden informatie en is bedoeld voor rustige selfservice zonder backofficecomplexiteit.',
    ARRAY[
      'Log in via de klantportaalroute van de tenant.',
      'Open Opdrachten voor bestaande werkzaamheden of Aanvragen voor nieuwe verzoeken.',
      'Bekijk offertes en geef akkoord wanneer de offerte klopt.',
      'Gebruik tickets als er vragen of correcties nodig zijn.'
    ],
    'Klantgebruikers zien alleen gegevens van hun gekoppelde klantaccount en toegestane modules.',
    'Als een klant niets ziet: controleer klantkoppeling, portaalstatus, modules, e-mailadres en uitnodigingsstatus.'
  ),
  (
    'klantportaal-facturen-betalingen-documenten',
    'Klantportaal: facturen, betalingen en documenten',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_admin','tenant_administration','tenant_customer'],
    ARRAY['klantportaal','facturen','betalingen','documenten','download'],
    ARRAY['factuur betalen','pdf downloaden','document bekijken'],
    260,
    false,
    'Klanten kunnen facturen, betaalstatus, rapportages en documenten bekijken volgens hun rechten.',
    'Het klantportaal geeft klanten inzicht in openstaande bedragen, factuurdetails, rapportages en relevante documenten.',
    ARRAY[
      'Open Facturen om openstaande of betaalde facturen te bekijken.',
      'Gebruik betalen wanneer online betaling actief is.',
      'Download PDF-documenten alleen via de beveiligde routes.',
      'Open Documenten of Rapporten voor gedeelde bestanden en uitgevoerde werkzaamheden.'
    ],
    'Klantgebruikers hebben alleen toegang tot hun eigen klantgegevens en klantzichtbare documenten.',
    'Als een factuur of document ontbreekt: controleer klantkoppeling, zichtbaarheid, status en finance-module.'
  ),
  (
    'klantportaal-tickets-support',
    'Klantportaal: supporttickets gebruiken',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_admin','tenant_management','tenant_customer'],
    ARRAY['klantportaal','support','tickets','contactverzoek'],
    ARRAY['nieuw contactverzoek','supportstatus','ticket openen'],
    270,
    false,
    'Klanten gebruiken supporttickets voor vragen over objecten, opdrachten, facturen of algemene meldingen.',
    'Support in het klantportaal is een lichte inbox met filters, ticketstatus en een nieuw contactverzoekformulier.',
    ARRAY[
      'Kies eerst het onderwerp of filter bestaande tickets.',
      'Vul afdeling, prioriteit, onderwerp en bericht concreet in.',
      'Open een bestaand ticket om de conversatie te volgen.',
      'Gebruik factuur-, object- of opdrachtcontext wanneer de vraag daarover gaat.'
    ],
    'Klanttickets zijn alleen zichtbaar voor het gekoppelde klantaccount en bevoegde backofficegebruikers.',
    'Als een ticket van een andere tenant of klant zichtbaar is, stop direct en controleer tenant- en customer-scoping.'
  ),
  (
    'personeelsapp-planning-opdrachten-status',
    'Personeelsapp: planning en opdrachtstatus',
    'personeelsportaal',
    'personnel_portal',
    ARRAY['tenant_admin','tenant_planning','tenant_personnel'],
    ARRAY['personeelsapp','planning','opdrachten','status','gereedmelden'],
    ARRAY['mijn planning','opdracht starten','opdracht afronden'],
    280,
    true,
    'Medewerkers bekijken planning, openen opdrachten en werken status veilig bij.',
    'De personeelsapp toont persoonlijke planning en opdrachtinformatie voor uitvoering op locatie.',
    ARRAY[
      'Open Planning of Opdrachten in de personeelsapp.',
      'Bekijk klant, object, tijden, taken en instructies.',
      'Werk status bij volgens de uitvoeringsflow.',
      'Meld gereed wanneer rapportage, notities en materiaal compleet zijn.'
    ],
    'Personeelsgebruikers zien alleen eigen toegewezen opdrachten en toegestane informatie.',
    'Als een opdracht ontbreekt: controleer planning, personeelskoppeling, status, offline sync en tenantcontext.'
  ),
  (
    'personeelsapp-rapportage-fotos-materiaal',
    'Personeelsapp: rapportage, foto''s en materiaal',
    'personeelsportaal',
    'personnel_portal',
    ARRAY['tenant_admin','tenant_planning','tenant_personnel'],
    ARRAY['personeelsapp','rapportage','foto','materiaal','meerwerk'],
    ARRAY['rapportage notitie','materiaal verbruik','foto uploaden'],
    290,
    false,
    'Medewerkers leggen uitvoering vast met rapportagenotities, foto''s, materiaal en meerwerk.',
    'Rapportageinformatie helpt backoffice om werkzaamheden te controleren, klanten te informeren en administratie af te ronden.',
    ARRAY[
      'Open de opdracht en kies rapportage, materiaal of meerwerk.',
      'Voeg concrete notities en foto''s toe waar nodig.',
      'Registreer materiaalverbruik met juiste aantallen.',
      'Controleer offline wachtrij wanneer er geen verbinding was.'
    ],
    'Personeelsgebruikers mogen alleen rapporteren op eigen opdrachten. Backoffice controleert en keurt later goed.',
    'Als uploads ontbreken: controleer verbinding, bestandsformaat, opslagrechten en offline queue.'
  ),
  (
    'personeelsapp-beschikbaarheid-verlof-ziek',
    'Personeelsapp: beschikbaarheid, verlof en ziekmelding',
    'personeelsportaal',
    'personnel_portal',
    ARRAY['tenant_admin','tenant_planning','tenant_personnel'],
    ARRAY['personeelsapp','beschikbaarheid','verlof','ziekmelding'],
    ARRAY['beschikbaarheid doorgeven','verlof aanvragen','ziek melden'],
    300,
    false,
    'Medewerkers beheren beschikbaarheid, verlof en ziekmelding voor betrouwbare planning.',
    'Beschikbaarheid en verlof beinvloeden planning, matchscores en open plaatsen in het planbord.',
    ARRAY[
      'Open Beschikbaarheid of Verlof in de personeelsapp.',
      'Geef dagen, tijden of aanvraagperiode duidelijk door.',
      'Voeg toelichting toe wanneer planning extra context nodig heeft.',
      'Controleer status nadat backoffice de aanvraag heeft behandeld.'
    ],
    'Personeel wijzigt eigen beschikbaarheid. Planning en management behandelen verlof- en ziekmeldingen.',
    'Als planning de wijziging niet ziet: controleer aanvraagstatus, datum, timezone en sync.'
  ),
  (
    'help-roadmap-releases-gebruiken',
    'Help, roadmap en releases gebruiken',
    'releasebeheer',
    'knowledgebase',
    ARRAY['tenant_admin','tenant_management','tenant_planning','tenant_administration','tenant_personnel','tenant_customer'],
    ARRAY['help','knowledgebase','roadmap','release notes','zoekbalk'],
    ARRAY['handleiding zoeken','featurewens indienen','wat is nieuw'],
    310,
    true,
    'Gebruik Help voor uitleg, Roadmap voor wensen en Releases voor productwijzigingen.',
    'Help, Roadmap en Releases zijn beschikbaar in elke relevante omgeving en tonen alleen content die past bij tenant, audience, module en permissies.',
    ARRAY[
      'Gebruik de zoekbalk in Help om artikelen, modules of slimme zoektermen te vinden.',
      'Open Roadmap om zichtbare items te volgen of een wens in te dienen als dit actief is.',
      'Open Releases om nieuwe functies, bugfixes en highlights te bekijken.',
      'Gebruik deeplinks of supportlinks nadat je bent ingelogd; de visibilityregels blijven hetzelfde.'
    ],
    'Iedere gebruiker ziet alleen content voor de eigen rol, tenant en actieve modules.',
    'Als een link geen toegang geeft: controleer login, tenantcode, module-entitlement, audience en artikelstatus.'
  );

WITH rendered AS (
  SELECT
    seed.*,
    categories.id AS category_id,
    '<h2>Wat doet dit?</h2><p>' || seed.what || '</p>' ||
    '<h2>Stappen</h2><ol>' ||
    array_to_string(ARRAY(SELECT '<li>' || step_text || '</li>' FROM unnest(seed.steps) AS step_item(step_text)), '') ||
    '</ol><h2>Rechten en zichtbaarheid</h2><p>' || seed.rights || '</p>' ||
    '<h2>Veelvoorkomende problemen</h2><p>' || seed.troubleshooting || '</p>' AS content_html,
    seed.what || E'\n\nStappen:\n- ' ||
    array_to_string(seed.steps, E'\n- ') ||
    E'\n\nRechten en zichtbaarheid:\n' || seed.rights ||
    E'\n\nVeelvoorkomende problemen:\n' || seed.troubleshooting AS content_text
  FROM fieldgrid_kb_article_seed seed
  LEFT JOIN kb_categories categories
    ON categories.scope = 'platform_global'
   AND categories.tenant_id IS NULL
   AND categories.slug = seed.category_slug
   AND categories.language = 'nl'
)
UPDATE kb_articles article
SET
  category_id = rendered.category_id,
  title = rendered.title,
  summary = rendered.summary,
  content_json = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2), 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Wat doet dit?'))),
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', rendered.what)))
    )
  ),
  content_html = rendered.content_html,
  content_text = rendered.content_text,
  keywords = to_jsonb(rendered.keywords),
  smart_terms = to_jsonb(rendered.smart_terms),
  status = 'published',
  featured = rendered.featured,
  sort_order = rendered.sort_order,
  published_at = COALESCE(article.published_at, now()),
  updated_at = now(),
  archived_at = NULL
FROM rendered
WHERE article.scope = 'platform_global'
  AND article.tenant_id IS NULL
  AND article.language = 'nl'
  AND article.slug = rendered.slug;

WITH rendered AS (
  SELECT
    seed.*,
    categories.id AS category_id,
    '<h2>Wat doet dit?</h2><p>' || seed.what || '</p>' ||
    '<h2>Stappen</h2><ol>' ||
    array_to_string(ARRAY(SELECT '<li>' || step_text || '</li>' FROM unnest(seed.steps) AS step_item(step_text)), '') ||
    '</ol><h2>Rechten en zichtbaarheid</h2><p>' || seed.rights || '</p>' ||
    '<h2>Veelvoorkomende problemen</h2><p>' || seed.troubleshooting || '</p>' AS content_html,
    seed.what || E'\n\nStappen:\n- ' ||
    array_to_string(seed.steps, E'\n- ') ||
    E'\n\nRechten en zichtbaarheid:\n' || seed.rights ||
    E'\n\nVeelvoorkomende problemen:\n' || seed.troubleshooting AS content_text
  FROM fieldgrid_kb_article_seed seed
  LEFT JOIN kb_categories categories
    ON categories.scope = 'platform_global'
   AND categories.tenant_id IS NULL
   AND categories.slug = seed.category_slug
   AND categories.language = 'nl'
)
INSERT INTO kb_articles (
  scope,
  tenant_id,
  category_id,
  title,
  slug,
  summary,
  content_json,
  content_html,
  content_text,
  keywords,
  smart_terms,
  status,
  featured,
  language,
  sort_order,
  published_at
)
SELECT
  'platform_global',
  NULL,
  rendered.category_id,
  rendered.title,
  rendered.slug,
  rendered.summary,
  jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2), 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Wat doet dit?'))),
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', rendered.what)))
    )
  ),
  rendered.content_html,
  rendered.content_text,
  to_jsonb(rendered.keywords),
  to_jsonb(rendered.smart_terms),
  'published',
  rendered.featured,
  'nl',
  rendered.sort_order,
  now()
FROM rendered
WHERE NOT EXISTS (
  SELECT 1
  FROM kb_articles existing
  WHERE existing.scope = 'platform_global'
    AND existing.tenant_id IS NULL
    AND existing.language = 'nl'
    AND existing.slug = rendered.slug
);

WITH scoped_articles AS (
  SELECT article.id, seed.audiences, seed.module_key
  FROM fieldgrid_kb_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
)
INSERT INTO kb_article_audiences (article_id, audience_key)
SELECT scoped_articles.id, audience_key
FROM scoped_articles
CROSS JOIN LATERAL unnest(scoped_articles.audiences) AS audience_key
ON CONFLICT DO NOTHING;

WITH scoped_articles AS (
  SELECT article.id, seed.module_key
  FROM fieldgrid_kb_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
  JOIN modules module_catalog
    ON module_catalog.key = seed.module_key
)
INSERT INTO kb_article_modules (article_id, module_key, is_required)
SELECT scoped_articles.id, scoped_articles.module_key, true
FROM scoped_articles
ON CONFLICT DO NOTHING;

WITH scoped_articles AS (
  SELECT article.id, seed.keywords, seed.smart_terms
  FROM fieldgrid_kb_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
),
terms AS (
  SELECT id AS article_id, unnest(keywords || smart_terms) AS term
  FROM scoped_articles
)
INSERT INTO kb_search_terms (article_id, term, weight, language)
SELECT article_id, term, 1, 'nl'
FROM terms
WHERE length(trim(term)) > 1
ON CONFLICT DO NOTHING;
