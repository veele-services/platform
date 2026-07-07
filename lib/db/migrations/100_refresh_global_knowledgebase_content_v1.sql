-- ============================================================================
-- Refresh global Fieldgrid knowledgebase article content v1
--
-- Source: fieldgrid-complete-knowledgebase-content-v1.md supplied on 2026-07-07.
--
-- Staging/production safe:
-- - Upserts tenant-neutral platform_global article content from the supplied copy.
-- - Refreshes audiences, module links and search terms for those seeded articles.
-- - Archives only the known legacy platform_global seed slugs from migration 095
--   that are no longer part of this v1 content set.
-- - Does not delete tenant-specific or manually created tenant content.
-- ============================================================================

CREATE TEMP TABLE fieldgrid_kb_content_v1_category_seed (
  name text NOT NULL,
  slug text PRIMARY KEY,
  description text NOT NULL,
  module_key text NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO fieldgrid_kb_content_v1_category_seed (name, slug, description, module_key, sort_order)
VALUES
  ('Starten met Fieldgrid', 'starten-met-fieldgrid', 'Basisuitleg voor gebruikers die Fieldgrid voor het eerst gebruiken.', 'knowledgebase', 5),
  ('Backoffice', 'backoffice', 'Handleidingen voor beheer, planning, administratie en dagelijkse backofficeprocessen.', 'knowledgebase', 15),
  ('Personeelsapp', 'personeelsapp', 'Handleidingen voor medewerkers die werken met planning, werkbonnen, rapportage en beschikbaarheid.', 'personnel_portal', 25),
  ('Klantenportaal', 'klantenportaal', 'Handleidingen voor klanten die aanvragen, offertes, rapporten, facturen en tickets gebruiken.', 'customer_portal', 35),
  ('Fieldgrid beheer en support', 'fieldgrid-beheer-en-support', 'Handleidingen voor Fieldgrid beheerders en support rond organisatieomgevingen en platforminstellingen.', 'knowledgebase', 45),
  ('E-mail en notificaties', 'e-mail-en-notificaties', 'Uitleg over e-mail, pushmeldingen en meldingsinstellingen.', 'notifications', 55),
  ('Veelgestelde vragen', 'veelgestelde-vragen', 'Korte antwoorden op veelgestelde vragen over Fieldgrid.', 'knowledgebase', 65);

INSERT INTO kb_categories (scope, tenant_id, name, slug, description, module_key, sort_order, is_active, language)
SELECT 'platform_global', NULL, seed.name, seed.slug, seed.description, seed.module_key, seed.sort_order, true, 'nl'
FROM fieldgrid_kb_content_v1_category_seed seed
WHERE NOT EXISTS (
  SELECT 1
  FROM kb_categories existing
  WHERE existing.scope = 'platform_global'
    AND existing.tenant_id IS NULL
    AND existing.slug = seed.slug
    AND existing.language = 'nl'
);

UPDATE kb_categories category
SET
  name = seed.name,
  description = seed.description,
  module_key = seed.module_key,
  sort_order = seed.sort_order,
  is_active = true,
  updated_at = now(),
  archived_at = NULL
FROM fieldgrid_kb_content_v1_category_seed seed
WHERE category.scope = 'platform_global'
  AND category.tenant_id IS NULL
  AND category.slug = seed.slug
  AND category.language = 'nl';

CREATE TEMP TABLE fieldgrid_kb_content_v1_article_seed (
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
  content_html text NOT NULL,
  content_text text NOT NULL
) ON COMMIT DROP;

INSERT INTO fieldgrid_kb_content_v1_article_seed (
  slug, title, category_slug, module_key, audiences, keywords, smart_terms,
  sort_order, featured, summary, content_html, content_text
)
VALUES
  (
    'wat-is-fieldgrid',
    'Wat is Fieldgrid?',
    'starten-met-fieldgrid',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel', 'tenant_customer'],
    ARRAY['start', 'uitleg', 'wat is fieldgrid', 'overzicht', 'wat is fieldgrid?', 'starten met fieldgrid', 'wat', 'fieldgrid'],
    ARRAY['hoe wat is fieldgrid?', 'waar vind ik wat is fieldgrid?', 'Is Fieldgrid alleen voor één branche?', 'Waarom zie ik sommige onderdelen niet?'],
    10,
    true,
    'Fieldgrid is de centrale werkomgeving voor servicebedrijven: klanten, locaties, planning, werkbonnen, rapportages, facturen en communicatie staan op één plek.',
    $fgkb$<h2>Uitleg</h2><p>Fieldgrid helpt servicebedrijven om overzicht te houden over het hele werkproces. Een opdracht begint vaak met een aanvraag van een klant. Daarna volgt eventueel een offerte, de planning, uitvoering door een medewerker, rapportage, facturatie en betaling.</p><p>In plaats van losse WhatsApp-berichten, Excel-lijsten, papieren werkbonnen en losse documenten werkt iedereen vanuit dezelfde omgeving. De backoffice ziet wat er gepland, uitgevoerd en gefactureerd moet worden. Medewerkers zien hun eigen werkbonnen in de personeelsapp. Klanten kunnen in het klantenportaal aanvragen, offertes, rapporten, facturen en tickets bekijken.</p><h2>Stappen</h2><ol><li>Gebruik de backoffice voor beheer, planning en administratie.</li><li>Gebruik de personeelsapp voor werkbonnen, rapportage, beschikbaarheid en verlof.</li><li>Gebruik het klantenportaal voor aanvragen, offertes, rapporten, facturen en tickets.</li><li>Werk zoveel mogelijk vanuit de opdracht of werkbon; dat is het centrale punt in Fieldgrid.</li></ol><h2>Let op</h2><ul><li>De opdracht/werkbon is het hart van Fieldgrid. Vanuit daar ontstaan planning, rapportage, facturatie en historie.</li><li>Niet iedereen ziet hetzelfde. Wat je ziet, hangt af van je rol en rechten.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Is Fieldgrid alleen voor één branche?</strong><br />Nee. Fieldgrid is geschikt voor servicebedrijven met klanten, locaties, opdrachten, medewerkers en rapportages. Denk aan schoonmaak, facilitaire dienstverlening, beveiliging, onderhoud, vastgoedservice en servicediensten aan huis.</p><p><strong>Waarom zie ik sommige onderdelen niet?</strong><br />Waarschijnlijk heeft je rol geen toegang tot dat onderdeel of is het onderdeel niet actief voor jouw organisatie.</p>$fgkb$,
    $fgkb$Uitleg

Fieldgrid helpt servicebedrijven om overzicht te houden over het hele werkproces. Een opdracht begint vaak met een aanvraag van een klant. Daarna volgt eventueel een offerte, de planning, uitvoering door een medewerker, rapportage, facturatie en betaling.

In plaats van losse WhatsApp-berichten, Excel-lijsten, papieren werkbonnen en losse documenten werkt iedereen vanuit dezelfde omgeving. De backoffice ziet wat er gepland, uitgevoerd en gefactureerd moet worden. Medewerkers zien hun eigen werkbonnen in de personeelsapp. Klanten kunnen in het klantenportaal aanvragen, offertes, rapporten, facturen en tickets bekijken.

Stappen

1. Gebruik de backoffice voor beheer, planning en administratie.
2. Gebruik de personeelsapp voor werkbonnen, rapportage, beschikbaarheid en verlof.
3. Gebruik het klantenportaal voor aanvragen, offertes, rapporten, facturen en tickets.
4. Werk zoveel mogelijk vanuit de opdracht of werkbon; dat is het centrale punt in Fieldgrid.

Let op

- De opdracht/werkbon is het hart van Fieldgrid. Vanuit daar ontstaan planning, rapportage, facturatie en historie.
- Niet iedereen ziet hetzelfde. Wat je ziet, hangt af van je rol en rechten.

Veelgestelde vragen

Is Fieldgrid alleen voor één branche?
Nee. Fieldgrid is geschikt voor servicebedrijven met klanten, locaties, opdrachten, medewerkers en rapportages. Denk aan schoonmaak, facilitaire dienstverlening, beveiliging, onderhoud, vastgoedservice en servicediensten aan huis.

Waarom zie ik sommige onderdelen niet?
Waarschijnlijk heeft je rol geen toegang tot dat onderdeel of is het onderdeel niet actief voor jouw organisatie.$fgkb$
  ),
  (
    'welke-omgeving-moet-ik-gebruiken',
    'Welke omgeving moet ik gebruiken?',
    'starten-met-fieldgrid',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel', 'tenant_customer'],
    ARRAY['welke omgeving moet ik gebruiken?', 'starten met fieldgrid', 'welke', 'omgeving', 'moet', 'gebruiken'],
    ARRAY['hoe welke omgeving moet ik gebruiken?', 'waar vind ik welke omgeving moet ik gebruiken?', 'Kan iemand toegang hebben tot meerdere omgevingen?'],
    20,
    true,
    'Fieldgrid bestaat uit drie gebruiksomgevingen: backoffice, personeelsapp en klantenportaal.',
    $fgkb$<h2>Uitleg</h2><p>Fieldgrid heeft verschillende omgevingen voor verschillende gebruikers. Zo ziet iedereen alleen wat nodig is voor zijn of haar werk.</p><p><strong>Backoffice</strong> is bedoeld voor beheerders, management, planning en administratie. Hier worden klanten, objecten, opdrachten, personeel, planning, offertes, rapportages, facturen, documenten en instellingen beheerd.</p><p><strong>Personeelsapp</strong> is bedoeld voor medewerkers op locatie. Zij zien hun planning, werkbonnen, taken, rapportage, beschikbaarheid, verlof, uren, documenten, meldingen en tickets.</p><p><strong>Klantenportaal</strong> is bedoeld voor klanten. Zij kunnen objecten bekijken, nieuwe opdrachten aanvragen, offertes goedkeuren, rapporten bekijken, facturen betalen, documenten raadplegen en tickets aanmaken.</p><h2>Stappen</h2><ol><li>Gebruik de backoffice als je klanten, planning, administratie of instellingen beheert.</li><li>Gebruik de personeelsapp als je werkzaamheden uitvoert of je beschikbaarheid/verlof doorgeeft.</li><li>Gebruik het klantenportaal als je klant bent en aanvragen, offertes, rapporten of facturen wilt bekijken.</li><li>Neem contact op met je beheerder als je denkt dat je in de verkeerde omgeving zit.</li></ol><h2>Let op</h2><ul><li>Gebruik nooit gedeelde accounts. Iedere gebruiker hoort met een eigen account in te loggen.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan iemand toegang hebben tot meerdere omgevingen?</strong><br />Ja, dat kan. Bijvoorbeeld een manager kan de backoffice gebruiken en soms ook als klant meekijken, afhankelijk van de inrichting en rechten.</p>$fgkb$,
    $fgkb$Uitleg

Fieldgrid heeft verschillende omgevingen voor verschillende gebruikers. Zo ziet iedereen alleen wat nodig is voor zijn of haar werk.

Backoffice is bedoeld voor beheerders, management, planning en administratie. Hier worden klanten, objecten, opdrachten, personeel, planning, offertes, rapportages, facturen, documenten en instellingen beheerd.

Personeelsapp is bedoeld voor medewerkers op locatie. Zij zien hun planning, werkbonnen, taken, rapportage, beschikbaarheid, verlof, uren, documenten, meldingen en tickets.

Klantenportaal is bedoeld voor klanten. Zij kunnen objecten bekijken, nieuwe opdrachten aanvragen, offertes goedkeuren, rapporten bekijken, facturen betalen, documenten raadplegen en tickets aanmaken.

Stappen

1. Gebruik de backoffice als je klanten, planning, administratie of instellingen beheert.
2. Gebruik de personeelsapp als je werkzaamheden uitvoert of je beschikbaarheid/verlof doorgeeft.
3. Gebruik het klantenportaal als je klant bent en aanvragen, offertes, rapporten of facturen wilt bekijken.
4. Neem contact op met je beheerder als je denkt dat je in de verkeerde omgeving zit.

Let op

- Gebruik nooit gedeelde accounts. Iedere gebruiker hoort met een eigen account in te loggen.

Veelgestelde vragen

Kan iemand toegang hebben tot meerdere omgevingen?
Ja, dat kan. Bijvoorbeeld een manager kan de backoffice gebruiken en soms ook als klant meekijken, afhankelijk van de inrichting en rechten.$fgkb$
  ),
  (
    'inloggen-en-wachtwoord-wijzigen',
    'Inloggen en wachtwoord wijzigen',
    'starten-met-fieldgrid',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel', 'tenant_customer'],
    ARRAY['inloggen en wachtwoord wijzigen', 'starten met fieldgrid', 'inloggen', 'wachtwoord', 'wijzigen'],
    ARRAY['hoe inloggen en wachtwoord wijzigen', 'waar vind ik inloggen en wachtwoord wijzigen', 'Ik krijg geen e-mail, wat nu?', 'Kan support mijn wachtwoord zien?'],
    30,
    true,
    'Gebruik je eigen e-mailadres en wachtwoord om in te loggen. Bij een tijdelijk wachtwoord kies je na de eerste login zelf een nieuw wachtwoord.',
    $fgkb$<h2>Uitleg</h2><p>Je ontvangt normaal gesproken een uitnodiging per e-mail. In die e-mail staat waar je kunt inloggen. Soms ontvang je een tijdelijk wachtwoord. Dat wachtwoord is alleen bedoeld voor de eerste keer inloggen.</p><p>Na het inloggen kun je via je profiel of beveiligingsinstellingen je wachtwoord wijzigen. Kies altijd een sterk wachtwoord en deel je gegevens niet met anderen.</p><h2>Stappen</h2><ol><li>Open de link uit je uitnodiging of ga naar de juiste Fieldgrid-omgeving.</li><li>Log in met je e-mailadres en wachtwoord.</li><li>Gebruik je een tijdelijk wachtwoord? Kies direct een nieuw wachtwoord zodra daarom wordt gevraagd.</li><li>Ben je je wachtwoord kwijt? Gebruik “Wachtwoord vergeten” op de inlogpagina.</li><li>Vul de herstelcode uit de e-mail in en kies daarna een nieuw wachtwoord.</li></ol><h2>Let op</h2><ul><li>Controleer je spammap als je geen uitnodiging of herstelcode ontvangt.</li><li>Een herstelcode is tijdelijk geldig. Vraag een nieuwe code aan als de oude verlopen is.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Ik krijg geen e-mail, wat nu?</strong><br />Controleer eerst het juiste e-mailadres en je spammap. Vraag daarna je beheerder om de uitnodiging opnieuw te versturen.</p><p><strong>Kan support mijn wachtwoord zien?</strong><br />Nee. Wachtwoorden zijn niet zichtbaar. Je kunt alleen een nieuw wachtwoord instellen.</p>$fgkb$,
    $fgkb$Uitleg

Je ontvangt normaal gesproken een uitnodiging per e-mail. In die e-mail staat waar je kunt inloggen. Soms ontvang je een tijdelijk wachtwoord. Dat wachtwoord is alleen bedoeld voor de eerste keer inloggen.

Na het inloggen kun je via je profiel of beveiligingsinstellingen je wachtwoord wijzigen. Kies altijd een sterk wachtwoord en deel je gegevens niet met anderen.

Stappen

1. Open de link uit je uitnodiging of ga naar de juiste Fieldgrid-omgeving.
2. Log in met je e-mailadres en wachtwoord.
3. Gebruik je een tijdelijk wachtwoord? Kies direct een nieuw wachtwoord zodra daarom wordt gevraagd.
4. Ben je je wachtwoord kwijt? Gebruik “Wachtwoord vergeten” op de inlogpagina.
5. Vul de herstelcode uit de e-mail in en kies daarna een nieuw wachtwoord.

Let op

- Controleer je spammap als je geen uitnodiging of herstelcode ontvangt.
- Een herstelcode is tijdelijk geldig. Vraag een nieuwe code aan als de oude verlopen is.

Veelgestelde vragen

Ik krijg geen e-mail, wat nu?
Controleer eerst het juiste e-mailadres en je spammap. Vraag daarna je beheerder om de uitnodiging opnieuw te versturen.

Kan support mijn wachtwoord zien?
Nee. Wachtwoorden zijn niet zichtbaar. Je kunt alleen een nieuw wachtwoord instellen.$fgkb$
  ),
  (
    'meldingen-e-mail-en-pushmeldingen-begrijpen',
    'Meldingen, e-mail en pushmeldingen begrijpen',
    'starten-met-fieldgrid',
    'notifications',
    ARRAY['platform_admin', 'support', 'tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel', 'tenant_customer'],
    ARRAY['meldingen, e-mail en pushmeldingen begrijpen', 'starten met fieldgrid', 'meldingen', 'mail', 'pushmeldingen', 'begrijpen'],
    ARRAY['hoe meldingen, e-mail en pushmeldingen begrijpen', 'waar vind ik meldingen, e-mail en pushmeldingen begrijpen'],
    40,
    false,
    'Fieldgrid kan updates tonen in het platform, per e-mail en via pushmeldingen op je apparaat.',
    $fgkb$<h2>Uitleg</h2><p>Meldingen helpen je om belangrijke updates niet te missen. Er zijn drie soorten meldingen.</p><p><strong>In-app meldingen</strong> staan binnen Fieldgrid zelf, bijvoorbeeld in de backoffice, personeelsapp of het klantenportaal.</p><p><strong>E-mailmeldingen</strong> komen in je mailbox. Deze worden gebruikt voor belangrijke acties zoals uitnodigingen, wachtwoordherstel, offertes, facturen, rapportages of release-updates.</p><p><strong>Pushmeldingen</strong> verschijnen op je apparaat, bijvoorbeeld als je de personeelsapp als PWA gebruikt en pushmeldingen hebt toegestaan.</p><h2>Stappen</h2><ol><li>Open je profiel of voorkeuren.</li><li>Controleer welke meldingen actief zijn.</li><li>Zet pushmeldingen aan als je snelle updates op je apparaat wilt ontvangen.</li><li>Controleer je browser- of telefooninstellingen als pushmeldingen niet verschijnen.</li></ol><h2>Let op</h2><ul><li>Niet elke melding wordt per e-mail verstuurd. Sommige updates verschijnen alleen in Fieldgrid.</li><li>Pushmeldingen werken alleen als je browser of apparaat toestemming geeft.</li></ul>$fgkb$,
    $fgkb$Uitleg

Meldingen helpen je om belangrijke updates niet te missen. Er zijn drie soorten meldingen.

In-app meldingen staan binnen Fieldgrid zelf, bijvoorbeeld in de backoffice, personeelsapp of het klantenportaal.

E-mailmeldingen komen in je mailbox. Deze worden gebruikt voor belangrijke acties zoals uitnodigingen, wachtwoordherstel, offertes, facturen, rapportages of release-updates.

Pushmeldingen verschijnen op je apparaat, bijvoorbeeld als je de personeelsapp als PWA gebruikt en pushmeldingen hebt toegestaan.

Stappen

1. Open je profiel of voorkeuren.
2. Controleer welke meldingen actief zijn.
3. Zet pushmeldingen aan als je snelle updates op je apparaat wilt ontvangen.
4. Controleer je browser- of telefooninstellingen als pushmeldingen niet verschijnen.

Let op

- Niet elke melding wordt per e-mail verstuurd. Sommige updates verschijnen alleen in Fieldgrid.
- Pushmeldingen werken alleen als je browser of apparaat toestemming geeft.$fgkb$
  ),
  (
    'dashboard-gebruiken',
    'Dashboard gebruiken',
    'backoffice',
    'knowledgebase',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['dashboard gebruiken', 'backoffice', 'dashboard', 'gebruiken'],
    ARRAY['hoe dashboard gebruiken', 'waar vind ik dashboard gebruiken', 'Waarom zie ik geen finance-blokken?'],
    50,
    true,
    'Het dashboard is het startpunt van de dag. Je ziet hier de belangrijkste acties, open opdrachten, planning, facturen en meldingen.',
    $fgkb$<h2>Uitleg</h2><p>Het dashboard geeft een samenvatting van wat aandacht nodig heeft. Gebruik het als eerste controlepunt wanneer je de dag begint. Planning kijkt vooral naar nieuwe aanvragen, planbare opdrachten en opdrachten in uitvoering. Administratie kijkt naar openstaande facturen, betalingen en factureerbare opdrachten. Management kijkt naar omzet, activiteit en risico’s.</p><h2>Stappen</h2><ol><li>Open de backoffice en ga naar Dashboard.</li><li>Bekijk eerst de blokken met “Aandacht nodig”.</li><li>Open nieuwe aanvragen of planbare opdrachten direct vanuit het dashboard.</li><li>Controleer openstaande en achterstallige facturen als je administratie doet.</li><li>Gebruik recente activiteit om te zien wat er net is gewijzigd.</li></ol><h2>Let op</h2><ul><li>Zie je aantallen die niet lijken te kloppen? Controleer dan de filters op datum, status en rol.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Waarom zie ik geen finance-blokken?</strong><br />Je rol heeft waarschijnlijk geen toegang tot facturen of betalingen.</p>$fgkb$,
    $fgkb$Uitleg

Het dashboard geeft een samenvatting van wat aandacht nodig heeft. Gebruik het als eerste controlepunt wanneer je de dag begint. Planning kijkt vooral naar nieuwe aanvragen, planbare opdrachten en opdrachten in uitvoering. Administratie kijkt naar openstaande facturen, betalingen en factureerbare opdrachten. Management kijkt naar omzet, activiteit en risico’s.

Stappen

1. Open de backoffice en ga naar Dashboard.
2. Bekijk eerst de blokken met “Aandacht nodig”.
3. Open nieuwe aanvragen of planbare opdrachten direct vanuit het dashboard.
4. Controleer openstaande en achterstallige facturen als je administratie doet.
5. Gebruik recente activiteit om te zien wat er net is gewijzigd.

Let op

- Zie je aantallen die niet lijken te kloppen? Controleer dan de filters op datum, status en rol.

Veelgestelde vragen

Waarom zie ik geen finance-blokken?
Je rol heeft waarschijnlijk geen toegang tot facturen of betalingen.$fgkb$
  ),
  (
    'klant-aanmaken',
    'Klant aanmaken',
    'backoffice',
    'customers',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_administration'],
    ARRAY['klant aanmaken', 'nieuwe klant', 'crm', 'backoffice', 'klant', 'aanmaken'],
    ARRAY['hoe klant aanmaken', 'waar vind ik klant aanmaken', 'Kan ik later gegevens aanpassen?', 'Waarom kan ik geen klant opslaan?'],
    60,
    true,
    'Maak een klant aan voordat je objecten, opdrachten, offertes, facturen of documenten aan die klant koppelt.',
    $fgkb$<h2>Uitleg</h2><p>Een klant is de basis voor veel andere onderdelen in Fieldgrid. Onder een klant vallen onder andere contactpersonen, objecten, opdrachten, rapportages, facturen, betalingen, documenten en tickets.</p><p>Vul klantgegevens zo volledig mogelijk in. Dat voorkomt later zoekwerk bij planning, administratie en communicatie.</p><h2>Stappen</h2><ol><li>Ga in de backoffice naar Klanten.</li><li>Klik op “Nieuwe klant”.</li><li>Vul de bedrijfsnaam of klantnaam in.</li><li>Kies eventueel het klanttype, bijvoorbeeld VvE, horeca, particulier of vastgoedbeheer.</li><li>Vul e-mailadres, telefoonnummer, adres, KvK-nummer en btw-nummer in als die beschikbaar zijn.</li><li>Kies de juiste status, bijvoorbeeld actief of concept.</li><li>Sla de klant op.</li><li>Open daarna de klantdetailpagina om contactpersonen, objecten, documenten of portaaltoegang toe te voegen.</li></ol><h2>Let op</h2><ul><li>Gebruik interne notities alleen voor informatie die klanten niet mogen zien.</li><li>Controleer het e-mailadres goed voordat je portaaltoegang verstuurt.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan ik later gegevens aanpassen?</strong><br />Ja, je kunt de klant later openen en gegevens wijzigen als je daar rechten voor hebt.</p><p><strong>Waarom kan ik geen klant opslaan?</strong><br />Controleer of alle verplichte velden zijn ingevuld en of je rechten hebt om klanten te beheren.</p>$fgkb$,
    $fgkb$Uitleg

Een klant is de basis voor veel andere onderdelen in Fieldgrid. Onder een klant vallen onder andere contactpersonen, objecten, opdrachten, rapportages, facturen, betalingen, documenten en tickets.

Vul klantgegevens zo volledig mogelijk in. Dat voorkomt later zoekwerk bij planning, administratie en communicatie.

Stappen

1. Ga in de backoffice naar Klanten.
2. Klik op “Nieuwe klant”.
3. Vul de bedrijfsnaam of klantnaam in.
4. Kies eventueel het klanttype, bijvoorbeeld VvE, horeca, particulier of vastgoedbeheer.
5. Vul e-mailadres, telefoonnummer, adres, KvK-nummer en btw-nummer in als die beschikbaar zijn.
6. Kies de juiste status, bijvoorbeeld actief of concept.
7. Sla de klant op.
8. Open daarna de klantdetailpagina om contactpersonen, objecten, documenten of portaaltoegang toe te voegen.

Let op

- Gebruik interne notities alleen voor informatie die klanten niet mogen zien.
- Controleer het e-mailadres goed voordat je portaaltoegang verstuurt.

Veelgestelde vragen

Kan ik later gegevens aanpassen?
Ja, je kunt de klant later openen en gegevens wijzigen als je daar rechten voor hebt.

Waarom kan ik geen klant opslaan?
Controleer of alle verplichte velden zijn ingevuld en of je rechten hebt om klanten te beheren.$fgkb$
  ),
  (
    'klant-uitnodigen-voor-het-klantenportaal',
    'Klant uitnodigen voor het klantenportaal',
    'backoffice',
    'customers',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_administration'],
    ARRAY['klant uitnodigen voor het klantenportaal', 'backoffice', 'klant', 'uitnodigen', 'voor', 'het', 'klantenportaal'],
    ARRAY['hoe klant uitnodigen voor het klantenportaal', 'waar vind ik klant uitnodigen voor het klantenportaal', 'Kan een klant meerdere gebruikers hebben?'],
    70,
    false,
    'Geef een klant toegang tot het klantenportaal zodat hij aanvragen, offertes, rapporten, facturen, documenten en tickets kan bekijken.',
    $fgkb$<h2>Uitleg</h2><p>Het klantenportaal is bedoeld voor klanten die zelf informatie willen bekijken of acties willen uitvoeren. Denk aan een opdracht aanvragen, een offerte goedkeuren, een rapport bekijken of een factuur betalen.</p><p>Een uitnodiging wordt per e-mail verstuurd. De klant ontvangt een inloglink en eventueel een tijdelijk wachtwoord of herstelstap, afhankelijk van de inrichting.</p><h2>Stappen</h2><ol><li>Open de klant in de backoffice.</li><li>Controleer het primaire e-mailadres of voeg een contactpersoon toe.</li><li>Ga naar Portaaltoegang of Gebruikers bij de klant.</li><li>Klik op “Uitnodigen” of “Portaaltoegang aanmaken”.</li><li>Controleer de naam en het e-mailadres.</li><li>Verstuur de uitnodiging.</li><li>Controleer de portaalstatus nadat de klant heeft ingelogd.</li></ol><h2>Let op</h2><ul><li>Verstuur geen uitnodiging naar een algemeen adres als meerdere personen toegang nodig hebben. Maak liever aparte gebruikers aan.</li><li>Als de klant de e-mail niet ontvangt, controleer dan mailinstellingen en spammap.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan een klant meerdere gebruikers hebben?</strong><br />Ja, als de inrichting dat toestaat kunnen meerdere klantgebruikers aan dezelfde klant gekoppeld worden.</p>$fgkb$,
    $fgkb$Uitleg

Het klantenportaal is bedoeld voor klanten die zelf informatie willen bekijken of acties willen uitvoeren. Denk aan een opdracht aanvragen, een offerte goedkeuren, een rapport bekijken of een factuur betalen.

Een uitnodiging wordt per e-mail verstuurd. De klant ontvangt een inloglink en eventueel een tijdelijk wachtwoord of herstelstap, afhankelijk van de inrichting.

Stappen

1. Open de klant in de backoffice.
2. Controleer het primaire e-mailadres of voeg een contactpersoon toe.
3. Ga naar Portaaltoegang of Gebruikers bij de klant.
4. Klik op “Uitnodigen” of “Portaaltoegang aanmaken”.
5. Controleer de naam en het e-mailadres.
6. Verstuur de uitnodiging.
7. Controleer de portaalstatus nadat de klant heeft ingelogd.

Let op

- Verstuur geen uitnodiging naar een algemeen adres als meerdere personen toegang nodig hebben. Maak liever aparte gebruikers aan.
- Als de klant de e-mail niet ontvangt, controleer dan mailinstellingen en spammap.

Veelgestelde vragen

Kan een klant meerdere gebruikers hebben?
Ja, als de inrichting dat toestaat kunnen meerdere klantgebruikers aan dezelfde klant gekoppeld worden.$fgkb$
  ),
  (
    'object-of-locatie-aanmaken',
    'Object of locatie aanmaken',
    'backoffice',
    'objects',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['object of locatie aanmaken', 'backoffice', 'object', 'locatie', 'aanmaken'],
    ARRAY['hoe object of locatie aanmaken', 'waar vind ik object of locatie aanmaken', 'Kan een klant zelf een object aanmaken?'],
    80,
    false,
    'Een object is de plek waar werk wordt uitgevoerd, zoals een pand, woning, terrein, parkeergarage, kantoor of locatie.',
    $fgkb$<h2>Uitleg</h2><p>Objecten helpen de backoffice en medewerkers om precies te weten waar werkzaamheden plaatsvinden. Een object hoort altijd bij een klant. Onder een object kun je adresgegevens, contactpersonen, toegangsinformatie, sleutelinformatie, sectoren, documenten, opdrachten en rapportages vastleggen.</p><h2>Stappen</h2><ol><li>Ga naar Objecten of open de klant en kies “Object toevoegen”.</li><li>Vul de objectnaam in, bijvoorbeeld “Hoofdkantoor”, “Appartementencomplex A” of “Parkeergarage”.</li><li>Koppel het object aan de juiste klant.</li><li>Vul adres, postcode, plaats en regio in.</li><li>Kies de sectoren die bij dit object horen.</li><li>Voeg contactpersoon, telefoonnummer en eventuele toegangsinformatie toe.</li><li>Sla het object op.</li><li>Voeg documenten of instructies toe als medewerkers die nodig hebben op locatie.</li></ol><h2>Let op</h2><ul><li>Zet toegangscodes, sleutelinformatie en gevoelige instructies alleen op plekken die voor de juiste gebruikers zichtbaar zijn.</li><li>Hoe vollediger het object, hoe minder vragen medewerkers op locatie hebben.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan een klant zelf een object aanmaken?</strong><br />Ja, via het klantenportaal kan een klant objecten toevoegen als dat is toegestaan.</p>$fgkb$,
    $fgkb$Uitleg

Objecten helpen de backoffice en medewerkers om precies te weten waar werkzaamheden plaatsvinden. Een object hoort altijd bij een klant. Onder een object kun je adresgegevens, contactpersonen, toegangsinformatie, sleutelinformatie, sectoren, documenten, opdrachten en rapportages vastleggen.

Stappen

1. Ga naar Objecten of open de klant en kies “Object toevoegen”.
2. Vul de objectnaam in, bijvoorbeeld “Hoofdkantoor”, “Appartementencomplex A” of “Parkeergarage”.
3. Koppel het object aan de juiste klant.
4. Vul adres, postcode, plaats en regio in.
5. Kies de sectoren die bij dit object horen.
6. Voeg contactpersoon, telefoonnummer en eventuele toegangsinformatie toe.
7. Sla het object op.
8. Voeg documenten of instructies toe als medewerkers die nodig hebben op locatie.

Let op

- Zet toegangscodes, sleutelinformatie en gevoelige instructies alleen op plekken die voor de juiste gebruikers zichtbaar zijn.
- Hoe vollediger het object, hoe minder vragen medewerkers op locatie hebben.

Veelgestelde vragen

Kan een klant zelf een object aanmaken?
Ja, via het klantenportaal kan een klant objecten toevoegen als dat is toegestaan.$fgkb$
  ),
  (
    'sectoren-en-taakcodes-gebruiken',
    'Sectoren en taakcodes gebruiken',
    'backoffice',
    'planning',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['sectoren en taakcodes gebruiken', 'backoffice', 'sectoren', 'taakcodes', 'gebruiken'],
    ARRAY['hoe sectoren en taakcodes gebruiken', 'waar vind ik sectoren en taakcodes gebruiken'],
    90,
    false,
    'Sectoren en taakcodes zorgen voor vaste keuzes bij opdrachten, planning, offertes, rapportages en facturatie.',
    $fgkb$<h2>Uitleg</h2><p>Sectoren zijn dienstgebieden zoals Schoonmaak, Beveiliging, Facilitair, Onderhoud of Glasbewassing. Taakcodes zijn standaardwerkzaamheden binnen zo’n sector.</p><p>Een taakcode kan een omschrijving, prijs, duur, benodigde rol, certificaat, fotoverplichting, rapportageverplichting en facturatie-instelling bevatten. Door taakcodes goed in te richten, werkt iedereen met dezelfde basisinformatie.</p><h2>Stappen</h2><ol><li>Ga naar Instellingen en open Sectoren of Taakcodes.</li><li>Maak alleen sectoren aan die echt worden gebruikt in de operatie.</li><li>Maak taakcodes aan voor terugkerende werkzaamheden.</li><li>Vul bij taakcodes prijs, duur en eventuele eisen zo compleet mogelijk in.</li><li>Geef aan of foto’s of rapportage verplicht zijn.</li><li>Controleer of de taakcode factureerbaar is wanneer deze op offertes of facturen moet komen.</li></ol><h2>Let op</h2><ul><li>Wijzig taakcodes zorgvuldig. Een wijziging kan invloed hebben op planning, offertes, uitvoering en facturatie.</li></ul>$fgkb$,
    $fgkb$Uitleg

Sectoren zijn dienstgebieden zoals Schoonmaak, Beveiliging, Facilitair, Onderhoud of Glasbewassing. Taakcodes zijn standaardwerkzaamheden binnen zo’n sector.

Een taakcode kan een omschrijving, prijs, duur, benodigde rol, certificaat, fotoverplichting, rapportageverplichting en facturatie-instelling bevatten. Door taakcodes goed in te richten, werkt iedereen met dezelfde basisinformatie.

Stappen

1. Ga naar Instellingen en open Sectoren of Taakcodes.
2. Maak alleen sectoren aan die echt worden gebruikt in de operatie.
3. Maak taakcodes aan voor terugkerende werkzaamheden.
4. Vul bij taakcodes prijs, duur en eventuele eisen zo compleet mogelijk in.
5. Geef aan of foto’s of rapportage verplicht zijn.
6. Controleer of de taakcode factureerbaar is wanneer deze op offertes of facturen moet komen.

Let op

- Wijzig taakcodes zorgvuldig. Een wijziging kan invloed hebben op planning, offertes, uitvoering en facturatie.$fgkb$
  ),
  (
    'opdracht-of-werkbon-aanmaken',
    'Opdracht of werkbon aanmaken',
    'backoffice',
    'assignments',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['opdracht of werkbon aanmaken', 'backoffice', 'opdracht', 'werkbon', 'aanmaken'],
    ARRAY['hoe opdracht of werkbon aanmaken', 'waar vind ik opdracht of werkbon aanmaken', 'Wat is het verschil tussen opdracht en werkbon?', 'Waarom kan ik de opdracht niet plannen?'],
    100,
    true,
    'Een opdracht of werkbon bevat het werk dat uitgevoerd moet worden voor een klant op een object.',
    $fgkb$<h2>Uitleg</h2><p>De opdracht is het centrale onderdeel van Fieldgrid. Vanuit de opdracht worden planning, uitvoering, rapportage en facturatie aangestuurd.</p><p>Een opdracht kan starten als klantaanvraag, maar kan ook direct vanuit de backoffice worden aangemaakt.</p><h2>Stappen</h2><ol><li>Ga naar Opdrachten of open een klant/object en kies “Nieuwe opdracht”.</li><li>Kies de klant en het object.</li><li>Kies de sector en gewenste datum/tijd.</li><li>Vul een duidelijke omschrijving in.</li><li>Voeg taakcodes toe als de werkzaamheden standaard zijn.</li><li>Vul het aantal benodigde medewerkers in.</li><li>Geef aan of een offerte nodig is of dat de opdracht direct intern goedgekeurd kan worden.</li><li>Sla de opdracht op en controleer de status.</li></ol><h2>Let op</h2><ul><li>Zet alle informatie die de medewerker nodig heeft in de opdracht of bij het object.</li><li>Gebruik taakcodes voor werk dat vaker terugkomt. Dat houdt planning en facturatie consistenter.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Wat is het verschil tussen opdracht en werkbon?</strong><br />Een opdracht is het volledige proces. De werkbon is de uitvoerbare opdracht die de medewerker op locatie ziet.</p><p><strong>Waarom kan ik de opdracht niet plannen?</strong><br />Controleer of de opdracht de juiste status heeft en of datum, sector, klant, object en benodigde medewerkers zijn ingevuld.</p>$fgkb$,
    $fgkb$Uitleg

De opdracht is het centrale onderdeel van Fieldgrid. Vanuit de opdracht worden planning, uitvoering, rapportage en facturatie aangestuurd.

Een opdracht kan starten als klantaanvraag, maar kan ook direct vanuit de backoffice worden aangemaakt.

Stappen

1. Ga naar Opdrachten of open een klant/object en kies “Nieuwe opdracht”.
2. Kies de klant en het object.
3. Kies de sector en gewenste datum/tijd.
4. Vul een duidelijke omschrijving in.
5. Voeg taakcodes toe als de werkzaamheden standaard zijn.
6. Vul het aantal benodigde medewerkers in.
7. Geef aan of een offerte nodig is of dat de opdracht direct intern goedgekeurd kan worden.
8. Sla de opdracht op en controleer de status.

Let op

- Zet alle informatie die de medewerker nodig heeft in de opdracht of bij het object.
- Gebruik taakcodes voor werk dat vaker terugkomt. Dat houdt planning en facturatie consistenter.

Veelgestelde vragen

Wat is het verschil tussen opdracht en werkbon?
Een opdracht is het volledige proces. De werkbon is de uitvoerbare opdracht die de medewerker op locatie ziet.

Waarom kan ik de opdracht niet plannen?
Controleer of de opdracht de juiste status heeft en of datum, sector, klant, object en benodigde medewerkers zijn ingevuld.$fgkb$
  ),
  (
    'opdrachtstatussen-begrijpen',
    'Opdrachtstatussen begrijpen',
    'backoffice',
    'assignments',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['opdrachtstatussen begrijpen', 'backoffice', 'opdrachtstatussen', 'begrijpen'],
    ARRAY['hoe opdrachtstatussen begrijpen', 'waar vind ik opdrachtstatussen begrijpen'],
    110,
    false,
    'De status laat zien waar een opdracht zich bevindt: aanvraag, offerte, planning, uitvoering, rapportage, factuur, betaling of afsluiting.',
    $fgkb$<h2>Uitleg</h2><p>Niet elke opdracht doorloopt alle stappen. Een kleine opdracht kan direct planbaar zijn. Een grotere opdracht kan eerst een offerte nodig hebben.</p><p>Statussen helpen iedereen om te zien wat de volgende actie is. Planning ziet wat ingepland moet worden. Medewerkers zien wat uitgevoerd moet worden. Administratie ziet wat factureerbaar is. Klanten zien een eenvoudige klantvriendelijke status in het portaal.</p><h2>Stappen</h2><ol><li>Open de opdrachtdetailpagina.</li><li>Bekijk de status bovenaan of in de statuslijn.</li><li>Controleer welke acties beschikbaar zijn bij deze status.</li><li>Voer de volgende actie uit, bijvoorbeeld offerte maken, plannen, rapport controleren of factuur maken.</li><li>Controleer na elke actie of de status is bijgewerkt.</li></ol><h2>Let op</h2><ul><li>Wijzig statussen niet zomaar handmatig als er een logische procesactie beschikbaar is.</li><li>Een status kan voor klanten anders worden weergegeven dan intern in de backoffice.</li></ul>$fgkb$,
    $fgkb$Uitleg

Niet elke opdracht doorloopt alle stappen. Een kleine opdracht kan direct planbaar zijn. Een grotere opdracht kan eerst een offerte nodig hebben.

Statussen helpen iedereen om te zien wat de volgende actie is. Planning ziet wat ingepland moet worden. Medewerkers zien wat uitgevoerd moet worden. Administratie ziet wat factureerbaar is. Klanten zien een eenvoudige klantvriendelijke status in het portaal.

Stappen

1. Open de opdrachtdetailpagina.
2. Bekijk de status bovenaan of in de statuslijn.
3. Controleer welke acties beschikbaar zijn bij deze status.
4. Voer de volgende actie uit, bijvoorbeeld offerte maken, plannen, rapport controleren of factuur maken.
5. Controleer na elke actie of de status is bijgewerkt.

Let op

- Wijzig statussen niet zomaar handmatig als er een logische procesactie beschikbaar is.
- Een status kan voor klanten anders worden weergegeven dan intern in de backoffice.$fgkb$
  ),
  (
    'capaciteitscheck-en-matchscore-gebruiken',
    'Capaciteitscheck en matchscore gebruiken',
    'backoffice',
    'planning',
    ARRAY['tenant_management', 'tenant_planning'],
    ARRAY['capaciteitscheck en matchscore gebruiken', 'backoffice', 'capaciteitscheck', 'matchscore', 'gebruiken'],
    ARRAY['hoe capaciteitscheck en matchscore gebruiken', 'waar vind ik capaciteitscheck en matchscore gebruiken', 'Waarom staat een medewerker niet in de lijst?'],
    120,
    true,
    'De capaciteitscheck helpt planning om te bepalen of er genoeg geschikte en beschikbare medewerkers zijn.',
    $fgkb$<h2>Uitleg</h2><p>Bij een opdracht kijkt Fieldgrid naar de eisen van de opdracht en naar de beschikbare medewerkers. Het systeem geeft een advieskleur en toont kandidaten met uitleg.</p><p>De capaciteitscheck plant niemand automatisch. Planning blijft altijd verantwoordelijk voor de definitieve keuze.</p><h2>Stappen</h2><ol><li>Open de opdracht.</li><li>Ga naar het blok “Capaciteit en matching”.</li><li>Klik eventueel op “Capaciteit herberekenen”.</li><li>Bekijk de advieskleur: groen, oranje of rood.</li><li>Open de kandidatenlijst en controleer waarom iemand wel of niet geschikt is.</li><li>Gebruik topmatches als startpunt, maar controleer altijd de context.</li><li>Plan een medewerker pas definitief als tijd, rol, sector en beschikbaarheid kloppen.</li></ol><h2>Let op</h2><ul><li>Groen betekent dat er waarschijnlijk genoeg capaciteit is, niet dat je niets meer hoeft te controleren.</li><li>Rood betekent niet altijd onmogelijk. Soms ontbreekt informatie, bijvoorbeeld beschikbaarheid of certificaten.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Waarom staat een medewerker niet in de lijst?</strong><br />Controleer of de medewerker actief is, beschikbaar is, geen verlof/ziekte heeft, de juiste sector/rol heeft en geen conflict in de planning heeft.</p>$fgkb$,
    $fgkb$Uitleg

Bij een opdracht kijkt Fieldgrid naar de eisen van de opdracht en naar de beschikbare medewerkers. Het systeem geeft een advieskleur en toont kandidaten met uitleg.

De capaciteitscheck plant niemand automatisch. Planning blijft altijd verantwoordelijk voor de definitieve keuze.

Stappen

1. Open de opdracht.
2. Ga naar het blok “Capaciteit en matching”.
3. Klik eventueel op “Capaciteit herberekenen”.
4. Bekijk de advieskleur: groen, oranje of rood.
5. Open de kandidatenlijst en controleer waarom iemand wel of niet geschikt is.
6. Gebruik topmatches als startpunt, maar controleer altijd de context.
7. Plan een medewerker pas definitief als tijd, rol, sector en beschikbaarheid kloppen.

Let op

- Groen betekent dat er waarschijnlijk genoeg capaciteit is, niet dat je niets meer hoeft te controleren.
- Rood betekent niet altijd onmogelijk. Soms ontbreekt informatie, bijvoorbeeld beschikbaarheid of certificaten.

Veelgestelde vragen

Waarom staat een medewerker niet in de lijst?
Controleer of de medewerker actief is, beschikbaar is, geen verlof/ziekte heeft, de juiste sector/rol heeft en geen conflict in de planning heeft.$fgkb$
  ),
  (
    'planning-en-planbord-gebruiken',
    'Planning en planbord gebruiken',
    'backoffice',
    'planning',
    ARRAY['tenant_management', 'tenant_planning'],
    ARRAY['planning en planbord gebruiken', 'backoffice', 'planning', 'planbord', 'gebruiken'],
    ARRAY['hoe planning en planbord gebruiken', 'waar vind ik planning en planbord gebruiken'],
    130,
    true,
    'Het planbord geeft overzicht over open werkbonnen, ingeplande opdrachten, medewerkers, tijden en beschikbaarheid.',
    $fgkb$<h2>Uitleg</h2><p>De planning is bedoeld om opdrachten op de juiste medewerker en het juiste moment te plaatsen. Gebruik filters om te werken per datum, status, klant, object, regio of sector.</p><p>Fieldgrid kan geschikte medewerkers hoger tonen, maar planning beslist altijd zelf wie definitief wordt ingepland.</p><h2>Stappen</h2><ol><li>Open Planning in de backoffice.</li><li>Kies de gewenste dag-, week-, bord- of lijstweergave.</li><li>Gebruik filters om alleen relevante opdrachten en medewerkers te tonen.</li><li>Selecteer een open opdracht of werkbon.</li><li>Controleer geschikte medewerkers, beschikbaarheid en eventuele conflicten.</li><li>Plaats de opdracht bij de juiste medewerker.</li><li>Controleer daarna of de opdrachtstatus en planning kloppen.</li></ol><h2>Let op</h2><ul><li>Let op verlof, ziekte, sector, regio en dubbele planning.</li><li>Gebruik reserve alleen als iemand achter de hand staat en nog niet definitief is ingepland.</li></ul>$fgkb$,
    $fgkb$Uitleg

De planning is bedoeld om opdrachten op de juiste medewerker en het juiste moment te plaatsen. Gebruik filters om te werken per datum, status, klant, object, regio of sector.

Fieldgrid kan geschikte medewerkers hoger tonen, maar planning beslist altijd zelf wie definitief wordt ingepland.

Stappen

1. Open Planning in de backoffice.
2. Kies de gewenste dag-, week-, bord- of lijstweergave.
3. Gebruik filters om alleen relevante opdrachten en medewerkers te tonen.
4. Selecteer een open opdracht of werkbon.
5. Controleer geschikte medewerkers, beschikbaarheid en eventuele conflicten.
6. Plaats de opdracht bij de juiste medewerker.
7. Controleer daarna of de opdrachtstatus en planning kloppen.

Let op

- Let op verlof, ziekte, sector, regio en dubbele planning.
- Gebruik reserve alleen als iemand achter de hand staat en nog niet definitief is ingepland.$fgkb$
  ),
  (
    'interessepeiling-starten-voor-open-opdrachten',
    'Interessepeiling starten voor open opdrachten',
    'backoffice',
    'planning',
    ARRAY['tenant_management', 'tenant_planning'],
    ARRAY['interessepeiling starten voor open opdrachten', 'backoffice', 'interessepeiling', 'starten', 'voor', 'open', 'opdrachten'],
    ARRAY['hoe interessepeiling starten voor open opdrachten', 'waar vind ik interessepeiling starten voor open opdrachten', 'Kan een medewerker een vraag stellen?'],
    140,
    false,
    'Met een interessepeiling vraag je medewerkers of zij beschikbaar en geïnteresseerd zijn voor een open opdracht.',
    $fgkb$<h2>Uitleg</h2><p>Een interessepeiling is handig als planning nog niet direct weet wie geplaatst moet worden. Medewerkers ontvangen een melding en kunnen interesse tonen, aangeven dat ze niet beschikbaar zijn of een vraag stellen.</p><p>Interesse betekent nog geen definitieve planning. Planning kiest daarna zelf wie wordt geplaatst.</p><h2>Stappen</h2><ol><li>Open de opdracht.</li><li>Controleer de capaciteitscheck en kandidatenlijst.</li><li>Kies “Topmatches uitnodigen” of start een nieuwe ronde.</li><li>Kies hoeveel medewerkers je wilt benaderen.</li><li>Verstuur de interessepeiling.</li><li>Bekijk reacties van medewerkers.</li><li>Selecteer een medewerker of markeer iemand als reserve.</li><li>Bevestig de definitieve planning.</li></ol><h2>Let op</h2><ul><li>Stuur niet te veel rondes naar dezelfde medewerkers. Dat voorkomt meldingsmoeheid.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan een medewerker een vraag stellen?</strong><br />Ja, als dit is ingericht kan de medewerker een vraag stellen. Deze moet door planning worden opgevolgd.</p>$fgkb$,
    $fgkb$Uitleg

Een interessepeiling is handig als planning nog niet direct weet wie geplaatst moet worden. Medewerkers ontvangen een melding en kunnen interesse tonen, aangeven dat ze niet beschikbaar zijn of een vraag stellen.

Interesse betekent nog geen definitieve planning. Planning kiest daarna zelf wie wordt geplaatst.

Stappen

1. Open de opdracht.
2. Controleer de capaciteitscheck en kandidatenlijst.
3. Kies “Topmatches uitnodigen” of start een nieuwe ronde.
4. Kies hoeveel medewerkers je wilt benaderen.
5. Verstuur de interessepeiling.
6. Bekijk reacties van medewerkers.
7. Selecteer een medewerker of markeer iemand als reserve.
8. Bevestig de definitieve planning.

Let op

- Stuur niet te veel rondes naar dezelfde medewerkers. Dat voorkomt meldingsmoeheid.

Veelgestelde vragen

Kan een medewerker een vraag stellen?
Ja, als dit is ingericht kan de medewerker een vraag stellen. Deze moet door planning worden opgevolgd.$fgkb$
  ),
  (
    'personeelslid-aanmaken-en-uitnodigen',
    'Personeelslid aanmaken en uitnodigen',
    'backoffice',
    'personnel',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning'],
    ARRAY['personeelslid aanmaken en uitnodigen', 'backoffice', 'personeelslid', 'aanmaken', 'uitnodigen'],
    ARRAY['hoe personeelslid aanmaken en uitnodigen', 'waar vind ik personeelslid aanmaken en uitnodigen', 'Wat als iemand uit dienst gaat?'],
    150,
    false,
    'Maak medewerkers aan zodat zij ingepland kunnen worden en toegang krijgen tot de personeelsapp.',
    $fgkb$<h2>Uitleg</h2><p>Een personeelsprofiel bevat de gegevens die nodig zijn voor planning en uitvoering. Denk aan naam, e-mailadres, telefoonnummer, rol/functie, sectoren, status, beschikbaarheid, contractinformatie, kwalificaties en portaaltoegang.</p><h2>Stappen</h2><ol><li>Ga naar Personeel.</li><li>Klik op “Nieuw personeelslid”.</li><li>Vul naam, e-mailadres, telefoonnummer en eventuele adresgegevens in.</li><li>Kies type medewerker, functie/rol en sectoren.</li><li>Zet de status op actief als de medewerker ingepland mag worden.</li><li>Koppel eventueel kwalificaties of certificaten.</li><li>Sla het profiel op.</li><li>Verstuur portaaltoegang wanneer de medewerker de personeelsapp mag gebruiken.</li></ol><h2>Let op</h2><ul><li>Een medewerker zonder actief profiel of zonder juiste sector/rol kan ontbreken in de planning.</li><li>Controleer het e-mailadres voordat je de uitnodiging verstuurt.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Wat als iemand uit dienst gaat?</strong><br />Zet het profiel op inactief en controleer openstaande planning, toegang, documenten en materialen.</p>$fgkb$,
    $fgkb$Uitleg

Een personeelsprofiel bevat de gegevens die nodig zijn voor planning en uitvoering. Denk aan naam, e-mailadres, telefoonnummer, rol/functie, sectoren, status, beschikbaarheid, contractinformatie, kwalificaties en portaaltoegang.

Stappen

1. Ga naar Personeel.
2. Klik op “Nieuw personeelslid”.
3. Vul naam, e-mailadres, telefoonnummer en eventuele adresgegevens in.
4. Kies type medewerker, functie/rol en sectoren.
5. Zet de status op actief als de medewerker ingepland mag worden.
6. Koppel eventueel kwalificaties of certificaten.
7. Sla het profiel op.
8. Verstuur portaaltoegang wanneer de medewerker de personeelsapp mag gebruiken.

Let op

- Een medewerker zonder actief profiel of zonder juiste sector/rol kan ontbreken in de planning.
- Controleer het e-mailadres voordat je de uitnodiging verstuurt.

Veelgestelde vragen

Wat als iemand uit dienst gaat?
Zet het profiel op inactief en controleer openstaande planning, toegang, documenten en materialen.$fgkb$
  ),
  (
    'beschikbaarheid-verlof-en-ziekte-beheren',
    'Beschikbaarheid, verlof en ziekte beheren',
    'backoffice',
    'personnel',
    ARRAY['tenant_management', 'tenant_planning'],
    ARRAY['beschikbaarheid, verlof en ziekte beheren', 'backoffice', 'beschikbaarheid', 'verlof', 'ziekte', 'beheren'],
    ARRAY['hoe beschikbaarheid, verlof en ziekte beheren', 'waar vind ik beschikbaarheid, verlof en ziekte beheren'],
    160,
    false,
    'Beschikbaarheid, verlof en ziekte bepalen of een medewerker ingepland kan worden.',
    $fgkb$<h2>Uitleg</h2><p>Beschikbaarheid betekent dat iemand in principe kan werken. Verlof betekent dat iemand niet ingepland mag worden. Ziekte betekent ook dat iemand niet ingepland mag worden.</p><p>Planning gebruikt deze informatie bij het planbord en bij matchscores.</p><h2>Stappen</h2><ol><li>Open Personeel of de verlof-inbox.</li><li>Bekijk nieuwe verlofaanvragen.</li><li>Controleer periode, type verlof en eventuele toelichting.</li><li>Keur de aanvraag goed of wijs deze af.</li><li>Controleer of goedgekeurd verlof zichtbaar is in de planning.</li><li>Zet een medewerker op ziek of niet planbaar wanneer dat nodig is.</li></ol><h2>Let op</h2><ul><li>Goedgekeurd verlof hoort planning te blokkeren.</li><li>Laat medewerkers hun beschikbaarheid tijdig invullen om last-minute planning te voorkomen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Beschikbaarheid betekent dat iemand in principe kan werken. Verlof betekent dat iemand niet ingepland mag worden. Ziekte betekent ook dat iemand niet ingepland mag worden.

Planning gebruikt deze informatie bij het planbord en bij matchscores.

Stappen

1. Open Personeel of de verlof-inbox.
2. Bekijk nieuwe verlofaanvragen.
3. Controleer periode, type verlof en eventuele toelichting.
4. Keur de aanvraag goed of wijs deze af.
5. Controleer of goedgekeurd verlof zichtbaar is in de planning.
6. Zet een medewerker op ziek of niet planbaar wanneer dat nodig is.

Let op

- Goedgekeurd verlof hoort planning te blokkeren.
- Laat medewerkers hun beschikbaarheid tijdig invullen om last-minute planning te voorkomen.$fgkb$
  ),
  (
    'offerte-maken-en-versturen',
    'Offerte maken en versturen',
    'backoffice',
    'finance',
    ARRAY['tenant_management', 'tenant_administration'],
    ARRAY['offerte maken en versturen', 'backoffice', 'offerte', 'maken', 'versturen'],
    ARRAY['hoe offerte maken en versturen', 'waar vind ik offerte maken en versturen', 'Kan een klant een offerte afwijzen met reden?'],
    170,
    true,
    'Maak een offerte wanneer een klant eerst akkoord moet geven op prijs of werkzaamheden.',
    $fgkb$<h2>Uitleg</h2><p>Een offerte hoort bij een klant en meestal bij een opdracht. De klant kan de offerte in het klantenportaal bekijken en goedkeuren of afwijzen. Na akkoord kan de opdracht verder worden gepland of uitgevoerd.</p><h2>Stappen</h2><ol><li>Open de opdracht of ga naar Offertes.</li><li>Maak een nieuwe offerte aan.</li><li>Controleer klant, object, werkzaamheden, prijzen en geldigheid.</li><li>Voeg regels toe op basis van taakcodes of handmatige omschrijvingen.</li><li>Controleer het totaalbedrag.</li><li>Verstuur de offerte naar de klant.</li><li>Wacht op akkoord of afwijzing via het klantenportaal.</li><li>Verwerk de uitkomst in de opdracht.</li></ol><h2>Let op</h2><ul><li>Gebruik duidelijke omschrijvingen. De klant moet zonder extra uitleg begrijpen waarvoor akkoord wordt gegeven.</li><li>Controleer de geldigheidsdatum. Verlopen offertes kunnen automatisch gemarkeerd worden als verlopen.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Kan een klant een offerte afwijzen met reden?</strong><br />Ja, de klant kan de offerte afwijzen en een reden meegeven als dat in het portaal beschikbaar is.</p>$fgkb$,
    $fgkb$Uitleg

Een offerte hoort bij een klant en meestal bij een opdracht. De klant kan de offerte in het klantenportaal bekijken en goedkeuren of afwijzen. Na akkoord kan de opdracht verder worden gepland of uitgevoerd.

Stappen

1. Open de opdracht of ga naar Offertes.
2. Maak een nieuwe offerte aan.
3. Controleer klant, object, werkzaamheden, prijzen en geldigheid.
4. Voeg regels toe op basis van taakcodes of handmatige omschrijvingen.
5. Controleer het totaalbedrag.
6. Verstuur de offerte naar de klant.
7. Wacht op akkoord of afwijzing via het klantenportaal.
8. Verwerk de uitkomst in de opdracht.

Let op

- Gebruik duidelijke omschrijvingen. De klant moet zonder extra uitleg begrijpen waarvoor akkoord wordt gegeven.
- Controleer de geldigheidsdatum. Verlopen offertes kunnen automatisch gemarkeerd worden als verlopen.

Veelgestelde vragen

Kan een klant een offerte afwijzen met reden?
Ja, de klant kan de offerte afwijzen en een reden meegeven als dat in het portaal beschikbaar is.$fgkb$
  ),
  (
    'rapportage-controleren-en-goedkeuren',
    'Rapportage controleren en goedkeuren',
    'backoffice',
    'reporting',
    ARRAY['tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['rapportage controleren en goedkeuren', 'backoffice', 'rapportage', 'controleren', 'goedkeuren'],
    ARRAY['hoe rapportage controleren en goedkeuren', 'waar vind ik rapportage controleren en goedkeuren'],
    180,
    false,
    'Controleer rapportages voordat ze klantzichtbaar worden of gebruikt worden voor facturatie.',
    $fgkb$<h2>Uitleg</h2><p>Rapportages komen voort uit uitgevoerde werkbonnen. Een rapportage kan notities, foto’s, video’s, materiaalverbruik, meerwerk en opmerkingen bevatten.</p><p>Backoffice controleert of de rapportage duidelijk, compleet en klantvriendelijk is. Interne notities of personeelsinformatie mogen niet per ongeluk zichtbaar worden voor de klant.</p><h2>Stappen</h2><ol><li>Ga naar Rapporten.</li><li>Filter op rapporten die wachten op controle.</li><li>Open het rapport.</li><li>Controleer notities, bijlagen, foto’s, meerwerk en materiaal.</li><li>Controleer of de informatie geschikt is om met de klant te delen.</li><li>Keur het rapport goed als alles klopt.</li><li>Wijs het rapport af met een duidelijke reden als informatie ontbreekt of aangepast moet worden.</li><li>Controleer daarna of de opdracht factureerbaar wordt wanneer dat de bedoeling is.</li></ol><h2>Let op</h2><ul><li>Geef bij afwijzing altijd een concrete reden. Dan weet de medewerker wat gecorrigeerd moet worden.</li><li>Gebruik rapportages ook als bewijs richting klant en administratie.</li></ul>$fgkb$,
    $fgkb$Uitleg

Rapportages komen voort uit uitgevoerde werkbonnen. Een rapportage kan notities, foto’s, video’s, materiaalverbruik, meerwerk en opmerkingen bevatten.

Backoffice controleert of de rapportage duidelijk, compleet en klantvriendelijk is. Interne notities of personeelsinformatie mogen niet per ongeluk zichtbaar worden voor de klant.

Stappen

1. Ga naar Rapporten.
2. Filter op rapporten die wachten op controle.
3. Open het rapport.
4. Controleer notities, bijlagen, foto’s, meerwerk en materiaal.
5. Controleer of de informatie geschikt is om met de klant te delen.
6. Keur het rapport goed als alles klopt.
7. Wijs het rapport af met een duidelijke reden als informatie ontbreekt of aangepast moet worden.
8. Controleer daarna of de opdracht factureerbaar wordt wanneer dat de bedoeling is.

Let op

- Geef bij afwijzing altijd een concrete reden. Dan weet de medewerker wat gecorrigeerd moet worden.
- Gebruik rapportages ook als bewijs richting klant en administratie.$fgkb$
  ),
  (
    'factuur-maken-versturen-en-betaling-controleren',
    'Factuur maken, versturen en betaling controleren',
    'backoffice',
    'finance',
    ARRAY['tenant_management', 'tenant_administration'],
    ARRAY['factuur maken, versturen en betaling controleren', 'backoffice', 'factuur', 'maken', 'versturen', 'betaling', 'controleren'],
    ARRAY['hoe factuur maken, versturen en betaling controleren', 'waar vind ik factuur maken, versturen en betaling controleren'],
    190,
    true,
    'Maak facturen vanuit uitgevoerde of goedgekeurde werkzaamheden en laat klanten online betalen wanneer Mollie actief is.',
    $fgkb$<h2>Uitleg</h2><p>Facturen sluiten de operationele workflow af. Een factuur kan voortkomen uit een opdracht, rapportage, offerte of verzameling werkzaamheden.</p><p>Klanten kunnen facturen in het klantenportaal bekijken en betalen. Administratie kan de betaalstatus volgen en betalingsherinneringen versturen of automatisch laten verwerken.</p><h2>Stappen</h2><ol><li>Ga naar Facturen of open een factureerbare opdracht.</li><li>Maak een conceptfactuur of controleer de voorgestelde factuur.</li><li>Controleer klant, regels, bedragen, btw, vervaldatum en betaalmogelijkheid.</li><li>Maak eventueel een PDF.</li><li>Verstuur de factuur naar de klant.</li><li>Controleer de betaalstatus in Fieldgrid.</li><li>Gebruik betalingsherinneringen als een factuur te lang openstaat.</li><li>Sluit de opdracht wanneer uitvoering, rapportage en betaling afgerond zijn.</li></ol><h2>Let op</h2><ul><li>Controleer rapportage en meerwerk voordat je factureert.</li><li>Als online betalen niet beschikbaar is, controleer dan de betaalinstellingen en Mollie-configuratie.</li></ul>$fgkb$,
    $fgkb$Uitleg

Facturen sluiten de operationele workflow af. Een factuur kan voortkomen uit een opdracht, rapportage, offerte of verzameling werkzaamheden.

Klanten kunnen facturen in het klantenportaal bekijken en betalen. Administratie kan de betaalstatus volgen en betalingsherinneringen versturen of automatisch laten verwerken.

Stappen

1. Ga naar Facturen of open een factureerbare opdracht.
2. Maak een conceptfactuur of controleer de voorgestelde factuur.
3. Controleer klant, regels, bedragen, btw, vervaldatum en betaalmogelijkheid.
4. Maak eventueel een PDF.
5. Verstuur de factuur naar de klant.
6. Controleer de betaalstatus in Fieldgrid.
7. Gebruik betalingsherinneringen als een factuur te lang openstaat.
8. Sluit de opdracht wanneer uitvoering, rapportage en betaling afgerond zijn.

Let op

- Controleer rapportage en meerwerk voordat je factureert.
- Als online betalen niet beschikbaar is, controleer dan de betaalinstellingen en Mollie-configuratie.$fgkb$
  ),
  (
    'documenten-uploaden-en-delen',
    'Documenten uploaden en delen',
    'backoffice',
    'documents',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['documenten uploaden en delen', 'backoffice', 'documenten', 'uploaden', 'delen'],
    ARRAY['hoe documenten uploaden en delen', 'waar vind ik documenten uploaden en delen'],
    200,
    false,
    'Koppel documenten aan de juiste klant, locatie, opdracht, rapportage, factuur of medewerker.',
    $fgkb$<h2>Uitleg</h2><p>Documenten kunnen contracten, instructies, foto’s, rapporten, facturen, certificaten of toegangsinformatie zijn. Niet elk document is automatisch voor iedereen zichtbaar.</p><p>Kies daarom zorgvuldig waar een document aan gekoppeld wordt en wie het mag zien.</p><h2>Stappen</h2><ol><li>Open de juiste klant, locatie, opdracht, rapportage, factuur of medewerker.</li><li>Ga naar Documenten.</li><li>Klik op Uploaden.</li><li>Kies het bestand.</li><li>Vul een duidelijke naam en eventueel omschrijving in.</li><li>Controleer de zichtbaarheid.</li><li>Sla het document op.</li><li>Controleer eventueel vanuit portaalweergave of het document zichtbaar is voor de juiste doelgroep.</li></ol><h2>Let op</h2><ul><li>Zet privacygevoelige documenten niet op klantzichtbaar zonder controle.</li><li>Gebruik duidelijke bestandsnamen, bijvoorbeeld “Contract 2026 - klantnaam.pdf”.</li></ul>$fgkb$,
    $fgkb$Uitleg

Documenten kunnen contracten, instructies, foto’s, rapporten, facturen, certificaten of toegangsinformatie zijn. Niet elk document is automatisch voor iedereen zichtbaar.

Kies daarom zorgvuldig waar een document aan gekoppeld wordt en wie het mag zien.

Stappen

1. Open de juiste klant, locatie, opdracht, rapportage, factuur of medewerker.
2. Ga naar Documenten.
3. Klik op Uploaden.
4. Kies het bestand.
5. Vul een duidelijke naam en eventueel omschrijving in.
6. Controleer de zichtbaarheid.
7. Sla het document op.
8. Controleer eventueel vanuit portaalweergave of het document zichtbaar is voor de juiste doelgroep.

Let op

- Zet privacygevoelige documenten niet op klantzichtbaar zonder controle.
- Gebruik duidelijke bestandsnamen, bijvoorbeeld “Contract 2026 - klantnaam.pdf”.$fgkb$
  ),
  (
    'tickets-behandelen',
    'Tickets behandelen',
    'backoffice',
    'notifications',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration'],
    ARRAY['tickets behandelen', 'backoffice', 'tickets', 'behandelen'],
    ARRAY['hoe tickets behandelen', 'waar vind ik tickets behandelen'],
    210,
    false,
    'Tickets zijn bedoeld voor vragen, meldingen, klachten en opvolging vanuit klanten of medewerkers.',
    $fgkb$<h2>Uitleg</h2><p>Tickets zijn geen losse chat, maar opvolgbare communicatie. Een ticket heeft een onderwerp, status, prioriteit, berichten en eventueel koppelingen aan klant, object, opdracht of factuur.</p><p>Gebruik tickets om vragen en meldingen niet kwijt te raken.</p><h2>Stappen</h2><ol><li>Ga naar Tickets.</li><li>Filter op open tickets of jouw afdeling.</li><li>Open het ticket.</li><li>Lees de vraag of melding zorgvuldig.</li><li>Reageer duidelijk en koppel waar nodig een klant, object, opdracht of factuur.</li><li>Wijzig status of prioriteit als dat nodig is.</li><li>Sluit het ticket pas wanneer de vraag of melding echt is afgehandeld.</li></ol><h2>Let op</h2><ul><li>Gebruik interne notities alleen voor interne afstemming.</li><li>Geef bij klachten altijd een duidelijke vervolgstap.</li></ul>$fgkb$,
    $fgkb$Uitleg

Tickets zijn geen losse chat, maar opvolgbare communicatie. Een ticket heeft een onderwerp, status, prioriteit, berichten en eventueel koppelingen aan klant, object, opdracht of factuur.

Gebruik tickets om vragen en meldingen niet kwijt te raken.

Stappen

1. Ga naar Tickets.
2. Filter op open tickets of jouw afdeling.
3. Open het ticket.
4. Lees de vraag of melding zorgvuldig.
5. Reageer duidelijk en koppel waar nodig een klant, object, opdracht of factuur.
6. Wijzig status of prioriteit als dat nodig is.
7. Sluit het ticket pas wanneer de vraag of melding echt is afgehandeld.

Let op

- Gebruik interne notities alleen voor interne afstemming.
- Geef bij klachten altijd een duidelijke vervolgstap.$fgkb$
  ),
  (
    'nieuwsbericht-plaatsen',
    'Nieuwsbericht plaatsen',
    'backoffice',
    'notifications',
    ARRAY['tenant_admin', 'tenant_management'],
    ARRAY['nieuwsbericht plaatsen', 'backoffice', 'nieuwsbericht', 'plaatsen'],
    ARRAY['hoe nieuwsbericht plaatsen', 'waar vind ik nieuwsbericht plaatsen'],
    220,
    false,
    'Gebruik nieuwsberichten voor belangrijke updates aan medewerkers, klanten of specifieke doelgroepen.',
    $fgkb$<h2>Uitleg</h2><p>Nieuwsberichten zijn bedoeld voor updates die gebruikers moeten kunnen teruglezen. Denk aan werkinstructies, wijzigingen in processen, geplande werkzaamheden, interne berichten of klantinformatie.</p><h2>Stappen</h2><ol><li>Ga naar Nieuws.</li><li>Klik op “Nieuw bericht”.</li><li>Vul titel, inhoud en eventueel afbeelding in.</li><li>Kies de juiste doelgroep.</li><li>Controleer de preview.</li><li>Publiceer het bericht.</li><li>Controleer of het bericht zichtbaar is in de juiste omgeving.</li></ol><h2>Let op</h2><ul><li>Gebruik nieuws niet voor persoonlijke of gevoelige informatie. Gebruik daarvoor tickets of directe communicatie.</li></ul>$fgkb$,
    $fgkb$Uitleg

Nieuwsberichten zijn bedoeld voor updates die gebruikers moeten kunnen teruglezen. Denk aan werkinstructies, wijzigingen in processen, geplande werkzaamheden, interne berichten of klantinformatie.

Stappen

1. Ga naar Nieuws.
2. Klik op “Nieuw bericht”.
3. Vul titel, inhoud en eventueel afbeelding in.
4. Kies de juiste doelgroep.
5. Controleer de preview.
6. Publiceer het bericht.
7. Controleer of het bericht zichtbaar is in de juiste omgeving.

Let op

- Gebruik nieuws niet voor persoonlijke of gevoelige informatie. Gebruik daarvoor tickets of directe communicatie.$fgkb$
  ),
  (
    'rollen-en-rechten-beheren',
    'Rollen en rechten beheren',
    'backoffice',
    'knowledgebase',
    ARRAY['tenant_admin', 'tenant_management'],
    ARRAY['rollen en rechten beheren', 'backoffice', 'rollen', 'rechten', 'beheren'],
    ARRAY['hoe rollen en rechten beheren', 'waar vind ik rollen en rechten beheren', 'Waarom ziet iemand een pagina niet?'],
    230,
    false,
    'Rollen en rechten bepalen welke onderdelen gebruikers mogen zien en wijzigen.',
    $fgkb$<h2>Uitleg</h2><p>Niet iedere gebruiker heeft dezelfde toegang nodig. Planning hoeft bijvoorbeeld niet altijd facturen te beheren. Administratie hoeft niet altijd personeelsinstellingen te wijzigen. Klanten en medewerkers mogen alleen hun eigen relevante gegevens zien.</p><p>Richt rollen zorgvuldig in en test altijd met een gebruikersaccount of preview voordat je wijzigingen breed toepast.</p><h2>Stappen</h2><ol><li>Ga naar Instellingen &gt; Rollen en rechten.</li><li>Open een bestaande rol of maak een nieuwe rol.</li><li>Kies welke onderdelen zichtbaar zijn.</li><li>Kies welke acties zijn toegestaan, zoals bekijken, aanmaken, wijzigen of verwijderen.</li><li>Sla de rol op.</li><li>Koppel de rol aan de juiste gebruiker.</li><li>Controleer met preview of de gebruiker alleen ziet wat bedoeld is.</li></ol><h2>Let op</h2><ul><li>Geef niet standaard iedereen beheerdersrechten.</li><li>Beperk toegang tot facturen, personeelsgegevens, instellingen en interne notities.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Waarom ziet iemand een pagina niet?</strong><br />Controleer de rol, rechten en of het onderdeel actief is voor de organisatie.</p>$fgkb$,
    $fgkb$Uitleg

Niet iedere gebruiker heeft dezelfde toegang nodig. Planning hoeft bijvoorbeeld niet altijd facturen te beheren. Administratie hoeft niet altijd personeelsinstellingen te wijzigen. Klanten en medewerkers mogen alleen hun eigen relevante gegevens zien.

Richt rollen zorgvuldig in en test altijd met een gebruikersaccount of preview voordat je wijzigingen breed toepast.

Stappen

1. Ga naar Instellingen > Rollen en rechten.
2. Open een bestaande rol of maak een nieuwe rol.
3. Kies welke onderdelen zichtbaar zijn.
4. Kies welke acties zijn toegestaan, zoals bekijken, aanmaken, wijzigen of verwijderen.
5. Sla de rol op.
6. Koppel de rol aan de juiste gebruiker.
7. Controleer met preview of de gebruiker alleen ziet wat bedoeld is.

Let op

- Geef niet standaard iedereen beheerdersrechten.
- Beperk toegang tot facturen, personeelsgegevens, instellingen en interne notities.

Veelgestelde vragen

Waarom ziet iemand een pagina niet?
Controleer de rol, rechten en of het onderdeel actief is voor de organisatie.$fgkb$
  ),
  (
    'mailinstellingen-beheren',
    'Mailinstellingen beheren',
    'backoffice',
    'notifications',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_administration'],
    ARRAY['mailinstellingen beheren', 'backoffice', 'mailinstellingen', 'beheren'],
    ARRAY['hoe mailinstellingen beheren', 'waar vind ik mailinstellingen beheren', 'Waarom komt mail in spam?'],
    240,
    false,
    'Stel in vanaf welk e-mailadres Fieldgrid uitnodigingen, offertes, facturen en meldingen verstuurt.',
    $fgkb$<h2>Uitleg</h2><p>E-mail is belangrijk voor uitnodigingen, wachtwoordherstel, offertes, facturen, betalingsherinneringen en andere meldingen. Afhankelijk van de inrichting gebruikt je organisatie de centrale Fieldgrid-mailinstelling, een eigen SMTP-mailserver of een API-provider zoals Resend.</p><p>Wijzig mailinstellingen zorgvuldig. Een fout kan ervoor zorgen dat gebruikers geen uitnodigingen of klanten geen facturen ontvangen.</p><h2>Stappen</h2><ol><li>Ga naar Instellingen &gt; Mail.</li><li>Controleer afzendernaam en afzenderadres.</li><li>Kies het gewenste mailtransport als dit beschikbaar is.</li><li>Vul SMTP- of API-gegevens alleen in als je zeker weet dat ze kloppen.</li><li>Sla de instellingen op.</li><li>Verstuur altijd een testmail.</li><li>Controleer de afleverlog als de testmail niet aankomt.</li></ol><h2>Let op</h2><ul><li>Gebruik bij voorkeur een professioneel afzenderdomein met correcte DNS-instellingen.</li><li>API keys en wachtwoorden mogen nooit in gewone notities of tickets worden geplakt.</li></ul><h2>Veelgestelde vragen</h2><p><strong>Waarom komt mail in spam?</strong><br />Vaak komt dit door DNS-instellingen zoals SPF, DKIM of DMARC. Vraag support om dit te controleren.</p>$fgkb$,
    $fgkb$Uitleg

E-mail is belangrijk voor uitnodigingen, wachtwoordherstel, offertes, facturen, betalingsherinneringen en andere meldingen. Afhankelijk van de inrichting gebruikt je organisatie de centrale Fieldgrid-mailinstelling, een eigen SMTP-mailserver of een API-provider zoals Resend.

Wijzig mailinstellingen zorgvuldig. Een fout kan ervoor zorgen dat gebruikers geen uitnodigingen of klanten geen facturen ontvangen.

Stappen

1. Ga naar Instellingen > Mail.
2. Controleer afzendernaam en afzenderadres.
3. Kies het gewenste mailtransport als dit beschikbaar is.
4. Vul SMTP- of API-gegevens alleen in als je zeker weet dat ze kloppen.
5. Sla de instellingen op.
6. Verstuur altijd een testmail.
7. Controleer de afleverlog als de testmail niet aankomt.

Let op

- Gebruik bij voorkeur een professioneel afzenderdomein met correcte DNS-instellingen.
- API keys en wachtwoorden mogen nooit in gewone notities of tickets worden geplakt.

Veelgestelde vragen

Waarom komt mail in spam?
Vaak komt dit door DNS-instellingen zoals SPF, DKIM of DMARC. Vraag support om dit te controleren.$fgkb$
  ),
  (
    'notificatie-instellingen-beheren',
    'Notificatie-instellingen beheren',
    'backoffice',
    'notifications',
    ARRAY['tenant_admin', 'tenant_management', 'tenant_administration'],
    ARRAY['notificatie-instellingen beheren', 'backoffice', 'notificatie', 'instellingen', 'beheren'],
    ARRAY['hoe notificatie-instellingen beheren', 'waar vind ik notificatie-instellingen beheren'],
    250,
    false,
    'Bepaal welke automatische meldingen actief zijn en wanneer herinneringen worden verstuurd.',
    $fgkb$<h2>Uitleg</h2><p>Fieldgrid kan automatische meldingen sturen bij belangrijke momenten, zoals rapporten, offertes, verlopen offertes, facturen en betalingsherinneringen.</p><p>De instellingen bepalen of een melding wordt verstuurd en soms ook wanneer. Denk aan het aantal dagen voordat of nadat een herinnering wordt gestuurd.</p><h2>Stappen</h2><ol><li>Ga naar Instellingen &gt; Notificaties.</li><li>Bekijk de beschikbare meldingstypes.</li><li>Zet alleen meldingen aan die je organisatie echt wil gebruiken.</li><li>Controleer bij betalingsherinneringen het aantal dagen.</li><li>Sla wijzigingen op.</li><li>Test de belangrijkste flows, zoals offerte versturen en factuurherinnering.</li></ol><h2>Let op</h2><ul><li>Zet meldingen niet zomaar uit. Gebruikers kunnen daardoor belangrijke updates missen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Fieldgrid kan automatische meldingen sturen bij belangrijke momenten, zoals rapporten, offertes, verlopen offertes, facturen en betalingsherinneringen.

De instellingen bepalen of een melding wordt verstuurd en soms ook wanneer. Denk aan het aantal dagen voordat of nadat een herinnering wordt gestuurd.

Stappen

1. Ga naar Instellingen > Notificaties.
2. Bekijk de beschikbare meldingstypes.
3. Zet alleen meldingen aan die je organisatie echt wil gebruiken.
4. Controleer bij betalingsherinneringen het aantal dagen.
5. Sla wijzigingen op.
6. Test de belangrijkste flows, zoals offerte versturen en factuurherinnering.

Let op

- Zet meldingen niet zomaar uit. Gebruikers kunnen daardoor belangrijke updates missen.$fgkb$
  ),
  (
    'materialen-en-voorraad-beheren',
    'Materialen en voorraad beheren',
    'backoffice',
    'materials',
    ARRAY['tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel'],
    ARRAY['materialen en voorraad beheren', 'backoffice', 'materialen', 'voorraad', 'beheren'],
    ARRAY['hoe materialen en voorraad beheren', 'waar vind ik materialen en voorraad beheren'],
    260,
    false,
    'Gebruik materialen voor verbruik op werkbonnen, kosten, verkoopprijzen en voorraadcontrole.',
    $fgkb$<h2>Uitleg</h2><p>Materialen zijn producten of middelen die tijdens werk worden gebruikt. Denk aan schoonmaakmiddelen, onderdelen, verbruiksmateriaal of hulpmiddelen.</p><p>Medewerkers kunnen materiaalverbruik registreren op een werkbon. Backoffice kan dit later controleren voor rapportage, voorraad en eventueel facturatie.</p><h2>Stappen</h2><ol><li>Ga naar Materialen.</li><li>Maak een nieuw materiaal aan met naam, eenheid en eventueel prijsinformatie.</li><li>Vul voorraadgegevens in als voorraad wordt bijgehouden.</li><li>Laat medewerkers materiaalverbruik registreren op de werkbon.</li><li>Controleer materiaalverbruik bij rapportage of facturatie.</li><li>Corrigeer voorraad alleen met een duidelijke reden.</li></ol><h2>Let op</h2><ul><li>Zorg dat materiaaleenheden duidelijk zijn, bijvoorbeeld stuk, liter, doos of uur.</li></ul>$fgkb$,
    $fgkb$Uitleg

Materialen zijn producten of middelen die tijdens werk worden gebruikt. Denk aan schoonmaakmiddelen, onderdelen, verbruiksmateriaal of hulpmiddelen.

Medewerkers kunnen materiaalverbruik registreren op een werkbon. Backoffice kan dit later controleren voor rapportage, voorraad en eventueel facturatie.

Stappen

1. Ga naar Materialen.
2. Maak een nieuw materiaal aan met naam, eenheid en eventueel prijsinformatie.
3. Vul voorraadgegevens in als voorraad wordt bijgehouden.
4. Laat medewerkers materiaalverbruik registreren op de werkbon.
5. Controleer materiaalverbruik bij rapportage of facturatie.
6. Corrigeer voorraad alleen met een duidelijke reden.

Let op

- Zorg dat materiaaleenheden duidelijk zijn, bijvoorbeeld stuk, liter, doos of uur.$fgkb$
  ),
  (
    'inventaris-qr-codes-en-issues-beheren',
    'Inventaris, QR-codes en issues beheren',
    'backoffice',
    'inventory',
    ARRAY['tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel'],
    ARRAY['inventaris, qr-codes en issues beheren', 'backoffice', 'inventaris', 'codes', 'issues', 'beheren'],
    ARRAY['hoe inventaris, qr-codes en issues beheren', 'waar vind ik inventaris, qr-codes en issues beheren'],
    270,
    false,
    'Gebruik inventaris voor unieke bedrijfsmiddelen, QR-codes, locaties, onderhoud en meldingen.',
    $fgkb$<h2>Uitleg</h2><p>Inventaris gaat over unieke items die je wilt volgen. Denk aan machines, gereedschap, sleutels, apparaten, voertuigen of middelen op een locatie.</p><p>Een item kan gekoppeld zijn aan een object, medewerker of opdracht. Met QR-codes kunnen items sneller gevonden of gemeld worden.</p><h2>Stappen</h2><ol><li>Ga naar Inventaris.</li><li>Maak een item aan met naam, type, status en eventueel serienummer.</li><li>Koppel het item aan een locatie, medewerker of opdracht als dat nodig is.</li><li>Genereer een QR-code wanneer het item scanbaar moet zijn.</li><li>Registreer onderhoud, storing of issue wanneer er iets mee aan de hand is.</li><li>Volg issues op totdat ze zijn opgelost.</li></ol><h2>Let op</h2><ul><li>Gebruik QR-codes alleen voor informatie die veilig zichtbaar mag zijn na scannen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Inventaris gaat over unieke items die je wilt volgen. Denk aan machines, gereedschap, sleutels, apparaten, voertuigen of middelen op een locatie.

Een item kan gekoppeld zijn aan een object, medewerker of opdracht. Met QR-codes kunnen items sneller gevonden of gemeld worden.

Stappen

1. Ga naar Inventaris.
2. Maak een item aan met naam, type, status en eventueel serienummer.
3. Koppel het item aan een locatie, medewerker of opdracht als dat nodig is.
4. Genereer een QR-code wanneer het item scanbaar moet zijn.
5. Registreer onderhoud, storing of issue wanneer er iets mee aan de hand is.
6. Volg issues op totdat ze zijn opgelost.

Let op

- Gebruik QR-codes alleen voor informatie die veilig zichtbaar mag zijn na scannen.$fgkb$
  ),
  (
    'starten-met-de-personeelsapp',
    'Starten met de personeelsapp',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['starten met de personeelsapp', 'personeelsapp', 'starten', 'met'],
    ARRAY['hoe starten met de personeelsapp', 'waar vind ik starten met de personeelsapp'],
    280,
    true,
    'De personeelsapp is jouw mobiele omgeving voor planning, werkbonnen, rapportage, beschikbaarheid, verlof, uren, documenten en meldingen.',
    $fgkb$<h2>Uitleg</h2><p>In de personeelsapp zie je wat je moet doen, waar je moet zijn en welke informatie belangrijk is voor de opdracht. Je kunt een werkbon openen, starten, werkzaamheden afvinken, rapportage toevoegen en de opdracht afronden of afmelden.</p><h2>Stappen</h2><ol><li>Log in met je eigen account.</li><li>Open Home voor je eerstvolgende opdracht en snelle acties.</li><li>Open Planning voor je werkbonnen.</li><li>Open Meldingen om belangrijke updates te bekijken.</li><li>Gebruik Profiel voor je gegevens, wachtwoord en voorkeuren.</li></ol><h2>Let op</h2><ul><li>Gebruik de app op tijd. Planning kan zien of een werkbon is bekeken.</li><li>Zet pushmeldingen aan als je snel updates wilt ontvangen.</li></ul>$fgkb$,
    $fgkb$Uitleg

In de personeelsapp zie je wat je moet doen, waar je moet zijn en welke informatie belangrijk is voor de opdracht. Je kunt een werkbon openen, starten, werkzaamheden afvinken, rapportage toevoegen en de opdracht afronden of afmelden.

Stappen

1. Log in met je eigen account.
2. Open Home voor je eerstvolgende opdracht en snelle acties.
3. Open Planning voor je werkbonnen.
4. Open Meldingen om belangrijke updates te bekijken.
5. Gebruik Profiel voor je gegevens, wachtwoord en voorkeuren.

Let op

- Gebruik de app op tijd. Planning kan zien of een werkbon is bekeken.
- Zet pushmeldingen aan als je snel updates wilt ontvangen.$fgkb$
  ),
  (
    'mijn-planning-bekijken',
    'Mijn planning bekijken',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['mijn planning bekijken', 'personeelsapp', 'mijn', 'planning', 'bekijken'],
    ARRAY['hoe mijn planning bekijken', 'waar vind ik mijn planning bekijken'],
    290,
    true,
    'In Planning zie je jouw ingeplande werkbonnen met datum, tijd, locatie en status.',
    $fgkb$<h2>Uitleg</h2><p>De planning toont alleen opdrachten die voor jou relevant zijn. Bij een werkbon zie je onder andere het opdrachtnummer, datum, tijd, objectnaam, plaats, status en belangrijke contactinformatie.</p><h2>Stappen</h2><ol><li>Open de personeelsapp.</li><li>Ga naar Planning of Opdrachten.</li><li>Bekijk je geplande werkbonnen.</li><li>Open een werkbon om details te bekijken.</li><li>Controleer locatie, tijd, taken en eventuele instructies voordat je vertrekt.</li></ol><h2>Let op</h2><ul><li>Neem contact op via ticket of planning als informatie ontbreekt of niet klopt.</li></ul>$fgkb$,
    $fgkb$Uitleg

De planning toont alleen opdrachten die voor jou relevant zijn. Bij een werkbon zie je onder andere het opdrachtnummer, datum, tijd, objectnaam, plaats, status en belangrijke contactinformatie.

Stappen

1. Open de personeelsapp.
2. Ga naar Planning of Opdrachten.
3. Bekijk je geplande werkbonnen.
4. Open een werkbon om details te bekijken.
5. Controleer locatie, tijd, taken en eventuele instructies voordat je vertrekt.

Let op

- Neem contact op via ticket of planning als informatie ontbreekt of niet klopt.$fgkb$
  ),
  (
    'werkbon-openen-gezien-zetten-en-starten',
    'Werkbon openen, gezien zetten en starten',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['werkbon openen, gezien zetten en starten', 'personeelsapp', 'werkbon', 'openen', 'gezien', 'zetten', 'starten'],
    ARRAY['hoe werkbon openen, gezien zetten en starten', 'waar vind ik werkbon openen, gezien zetten en starten'],
    300,
    true,
    'Open je werkbon op tijd. Bij openen wordt zichtbaar dat je de opdracht hebt gezien. Start de werkbon pas wanneer je echt begint.',
    $fgkb$<h2>Uitleg</h2><p>Een werkbon heeft een statuslijn. Eerst bekijk je de bon. Daarna start je de werkzaamheden. Pas na het starten kun je de bon afronden of afmelden.</p><p>Start een werkbon alleen wanneer je daadwerkelijk aan de opdracht begint. Fieldgrid legt het startmoment vast.</p><h2>Stappen</h2><ol><li>Open je planning.</li><li>Tik op de juiste werkbon.</li><li>Controleer klant, object, adres, tijd, taken en instructies.</li><li>Tik op “Starten” wanneer je echt begint met de werkzaamheden.</li><li>Bevestig dat je wilt starten.</li><li>Voer de werkzaamheden uit en werk de taken/rapportage bij.</li></ol><h2>Let op</h2><ul><li>Start geen werkbon als je nog onderweg bent of nog niet zeker weet of je kunt beginnen.</li><li>Meld onduidelijke informatie direct via een ticket of bij planning.</li></ul>$fgkb$,
    $fgkb$Uitleg

Een werkbon heeft een statuslijn. Eerst bekijk je de bon. Daarna start je de werkzaamheden. Pas na het starten kun je de bon afronden of afmelden.

Start een werkbon alleen wanneer je daadwerkelijk aan de opdracht begint. Fieldgrid legt het startmoment vast.

Stappen

1. Open je planning.
2. Tik op de juiste werkbon.
3. Controleer klant, object, adres, tijd, taken en instructies.
4. Tik op “Starten” wanneer je echt begint met de werkzaamheden.
5. Bevestig dat je wilt starten.
6. Voer de werkzaamheden uit en werk de taken/rapportage bij.

Let op

- Start geen werkbon als je nog onderweg bent of nog niet zeker weet of je kunt beginnen.
- Meld onduidelijke informatie direct via een ticket of bij planning.$fgkb$
  ),
  (
    'taken-en-checklist-afvinken',
    'Taken en checklist afvinken',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['taken en checklist afvinken', 'personeelsapp', 'taken', 'checklist', 'afvinken'],
    ARRAY['hoe taken en checklist afvinken', 'waar vind ik taken en checklist afvinken'],
    310,
    false,
    'Op de werkbon zie je welke werkzaamheden moeten worden uitgevoerd.',
    $fgkb$<h2>Uitleg</h2><p>De werkzaamheden-tab toont taken, checklistpunten, meerwerk en materiaal. Vink taken af wanneer ze klaar zijn. Sommige taken kunnen extra rapportage of foto’s vragen.</p><h2>Stappen</h2><ol><li>Open de werkbon.</li><li>Ga naar Werkzaamheden.</li><li>Lees de taken en instructies.</li><li>Vink een taak pas af wanneer deze echt is uitgevoerd.</li><li>Voeg een notitie of foto toe als dat verplicht of nodig is.</li><li>Controleer alle taken voordat je de werkbon afrondt.</li></ol><h2>Let op</h2><ul><li>Kun je een taak niet uitvoeren? Rond de opdracht dan niet zomaar af, maar gebruik afmelden of voeg duidelijke rapportage toe.</li></ul>$fgkb$,
    $fgkb$Uitleg

De werkzaamheden-tab toont taken, checklistpunten, meerwerk en materiaal. Vink taken af wanneer ze klaar zijn. Sommige taken kunnen extra rapportage of foto’s vragen.

Stappen

1. Open de werkbon.
2. Ga naar Werkzaamheden.
3. Lees de taken en instructies.
4. Vink een taak pas af wanneer deze echt is uitgevoerd.
5. Voeg een notitie of foto toe als dat verplicht of nodig is.
6. Controleer alle taken voordat je de werkbon afrondt.

Let op

- Kun je een taak niet uitvoeren? Rond de opdracht dan niet zomaar af, maar gebruik afmelden of voeg duidelijke rapportage toe.$fgkb$
  ),
  (
    'rapportage-fotos-en-bijlagen-toevoegen',
    'Rapportage, foto’s en bijlagen toevoegen',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['rapportage, foto’s en bijlagen toevoegen', 'personeelsapp', 'rapportage', 'fotos', 'bijlagen', 'toevoegen'],
    ARRAY['hoe rapportage, foto’s en bijlagen toevoegen', 'waar vind ik rapportage, foto’s en bijlagen toevoegen'],
    320,
    false,
    'Gebruik rapportage om vast te leggen wat je hebt gedaan, wat is opgevallen en welke foto’s of bijlagen erbij horen.',
    $fgkb$<h2>Uitleg</h2><p>Rapportage bestaat uit notities in een tijdlijn. Een notitie kan tekst, foto’s of video’s bevatten. Backoffice gebruikt rapportage om het werk te controleren, klanten te informeren en administratie af te ronden.</p><h2>Stappen</h2><ol><li>Open de werkbon.</li><li>Ga naar Rapportage.</li><li>Klik op “Notitie toevoegen”.</li><li>Schrijf kort en duidelijk wat je wilt vastleggen.</li><li>Voeg foto’s of video’s toe als bewijs of verduidelijking.</li><li>Sla de notitie op.</li><li>Controleer of je notitie zichtbaar is in de tijdlijn.</li></ol><h2>Let op</h2><ul><li>Schrijf zakelijk en duidelijk. Klantzichtbare rapportage kan met klanten gedeeld worden.</li><li>Upload geen privéfoto’s of informatie die niets met de opdracht te maken heeft.</li></ul>$fgkb$,
    $fgkb$Uitleg

Rapportage bestaat uit notities in een tijdlijn. Een notitie kan tekst, foto’s of video’s bevatten. Backoffice gebruikt rapportage om het werk te controleren, klanten te informeren en administratie af te ronden.

Stappen

1. Open de werkbon.
2. Ga naar Rapportage.
3. Klik op “Notitie toevoegen”.
4. Schrijf kort en duidelijk wat je wilt vastleggen.
5. Voeg foto’s of video’s toe als bewijs of verduidelijking.
6. Sla de notitie op.
7. Controleer of je notitie zichtbaar is in de tijdlijn.

Let op

- Schrijf zakelijk en duidelijk. Klantzichtbare rapportage kan met klanten gedeeld worden.
- Upload geen privéfoto’s of informatie die niets met de opdracht te maken heeft.$fgkb$
  ),
  (
    'meerwerk-en-materiaal-registreren',
    'Meerwerk en materiaal registreren',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['meerwerk en materiaal registreren', 'personeelsapp', 'meerwerk', 'materiaal', 'registreren'],
    ARRAY['hoe meerwerk en materiaal registreren', 'waar vind ik meerwerk en materiaal registreren'],
    330,
    false,
    'Registreer extra werkzaamheden en gebruikt materiaal zodat backoffice dit kan controleren en verwerken.',
    $fgkb$<h2>Uitleg</h2><p>Meerwerk is werk dat niet oorspronkelijk op de opdracht stond, maar op locatie wel nodig blijkt. Materiaal is verbruik of gebruik van producten, onderdelen of middelen.</p><p>Door dit direct te registreren voorkom je dat informatie later ontbreekt.</p><h2>Stappen</h2><ol><li>Open de werkbon.</li><li>Ga naar Werkzaamheden.</li><li>Kies Meerwerk of Materiaal.</li><li>Selecteer de juiste taakcode of het juiste materiaal.</li><li>Vul aantal, tijd of toelichting in.</li><li>Voeg eventueel een foto of notitie toe.</li><li>Sla op en controleer het overzicht voordat je afrondt.</li></ol><h2>Let op</h2><ul><li>Bij twijfel over meerwerk: leg het vast en vermeld duidelijk wat is afgesproken op locatie.</li></ul>$fgkb$,
    $fgkb$Uitleg

Meerwerk is werk dat niet oorspronkelijk op de opdracht stond, maar op locatie wel nodig blijkt. Materiaal is verbruik of gebruik van producten, onderdelen of middelen.

Door dit direct te registreren voorkom je dat informatie later ontbreekt.

Stappen

1. Open de werkbon.
2. Ga naar Werkzaamheden.
3. Kies Meerwerk of Materiaal.
4. Selecteer de juiste taakcode of het juiste materiaal.
5. Vul aantal, tijd of toelichting in.
6. Voeg eventueel een foto of notitie toe.
7. Sla op en controleer het overzicht voordat je afrondt.

Let op

- Bij twijfel over meerwerk: leg het vast en vermeld duidelijk wat is afgesproken op locatie.$fgkb$
  ),
  (
    'werkbon-afronden',
    'Werkbon afronden',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['werkbon afronden', 'personeelsapp', 'werkbon', 'afronden'],
    ARRAY['hoe werkbon afronden', 'waar vind ik werkbon afronden'],
    340,
    true,
    'Rond een werkbon pas af als alle werkzaamheden, rapportage, meerwerk en materiaal compleet zijn.',
    $fgkb$<h2>Uitleg</h2><p>Als het werk klaar is, kies je voor afronden. De app toont een samenvatting. Controleer deze goed voordat je definitief bevestigt.</p><p>Als een handtekening verplicht is, moet de klant tekenen voordat de werkbon definitief afgerond kan worden.</p><h2>Stappen</h2><ol><li>Open de werkbon.</li><li>Controleer taken, rapportage, meerwerk en materiaal.</li><li>Tik op “Afronden”.</li><li>Bevestig dat alle werkzaamheden zijn afgerond.</li><li>Controleer het overzicht.</li><li>Laat de klant tekenen als dat verplicht is.</li><li>Tik op de bevestigknop om de werkbon definitief af te ronden.</li></ol><h2>Let op</h2><ul><li>Rond niet af als het werk niet klaar is. Gebruik dan afmelden/niet afgerond.</li><li>Controleer bij slechte verbinding of de opdracht later alsnog synchroniseert.</li></ul>$fgkb$,
    $fgkb$Uitleg

Als het werk klaar is, kies je voor afronden. De app toont een samenvatting. Controleer deze goed voordat je definitief bevestigt.

Als een handtekening verplicht is, moet de klant tekenen voordat de werkbon definitief afgerond kan worden.

Stappen

1. Open de werkbon.
2. Controleer taken, rapportage, meerwerk en materiaal.
3. Tik op “Afronden”.
4. Bevestig dat alle werkzaamheden zijn afgerond.
5. Controleer het overzicht.
6. Laat de klant tekenen als dat verplicht is.
7. Tik op de bevestigknop om de werkbon definitief af te ronden.

Let op

- Rond niet af als het werk niet klaar is. Gebruik dan afmelden/niet afgerond.
- Controleer bij slechte verbinding of de opdracht later alsnog synchroniseert.$fgkb$
  ),
  (
    'werkbon-afmelden-als-het-werk-niet-klaar-is',
    'Werkbon afmelden als het werk niet klaar is',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['werkbon afmelden als het werk niet klaar is', 'personeelsapp', 'werkbon', 'afmelden', 'als', 'het', 'werk', 'niet', 'klaar'],
    ARRAY['hoe werkbon afmelden als het werk niet klaar is', 'waar vind ik werkbon afmelden als het werk niet klaar is'],
    350,
    false,
    'Gebruik afmelden wanneer je de opdracht niet volledig kunt afronden.',
    $fgkb$<h2>Uitleg</h2><p>Soms kan werk niet worden uitgevoerd of niet worden afgemaakt. Bijvoorbeeld omdat de klant niet aanwezig is, er geen toegang is, materiaal ontbreekt, de situatie onveilig is of er meerwerk nodig is.</p><p>Kies dan niet voor afronden, maar meld de werkbon af met een duidelijke reden.</p><h2>Stappen</h2><ol><li>Open de werkbon.</li><li>Kies bij afronden dat niet alle werkzaamheden zijn afgerond.</li><li>Selecteer de juiste reden.</li><li>Voeg een duidelijke toelichting toe.</li><li>Voeg eventueel foto’s toe als bewijs.</li><li>Bevestig de afmelding.</li><li>Neem bij spoed contact op met planning.</li></ol><h2>Let op</h2><ul><li>Kies “Overig” alleen als geen van de standaardredenen past.</li><li>Een goede toelichting helpt planning om snel een vervolgactie te nemen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Soms kan werk niet worden uitgevoerd of niet worden afgemaakt. Bijvoorbeeld omdat de klant niet aanwezig is, er geen toegang is, materiaal ontbreekt, de situatie onveilig is of er meerwerk nodig is.

Kies dan niet voor afronden, maar meld de werkbon af met een duidelijke reden.

Stappen

1. Open de werkbon.
2. Kies bij afronden dat niet alle werkzaamheden zijn afgerond.
3. Selecteer de juiste reden.
4. Voeg een duidelijke toelichting toe.
5. Voeg eventueel foto’s toe als bewijs.
6. Bevestig de afmelding.
7. Neem bij spoed contact op met planning.

Let op

- Kies “Overig” alleen als geen van de standaardredenen past.
- Een goede toelichting helpt planning om snel een vervolgactie te nemen.$fgkb$
  ),
  (
    'open-opdrachten-en-interesse-tonen',
    'Open opdrachten en interesse tonen',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['open opdrachten en interesse tonen', 'personeelsapp', 'open', 'opdrachten', 'interesse', 'tonen'],
    ARRAY['hoe open opdrachten en interesse tonen', 'waar vind ik open opdrachten en interesse tonen'],
    360,
    false,
    'Bij open opdrachten kun je aangeven of je geïnteresseerd en beschikbaar bent.',
    $fgkb$<h2>Uitleg</h2><p>Open opdrachten zijn nog niet definitief aan jou toegewezen. Planning gebruikt interessepeilingen om te bepalen wie beschikbaar is.</p><p>Als je interesse toont, betekent dat nog niet dat je definitief bent ingepland. Wacht op bevestiging van planning.</p><h2>Stappen</h2><ol><li>Open Open opdrachten of de melding die je hebt ontvangen.</li><li>Lees datum, tijd, locatie en werkzaamheden.</li><li>Kies “Interesse” als je beschikbaar bent en de opdracht wilt doen.</li><li>Kies “Niet beschikbaar” als je niet kunt.</li><li>Stel een vraag als iets onduidelijk is en die optie beschikbaar is.</li><li>Wacht op definitieve bevestiging van planning.</li></ol><h2>Let op</h2><ul><li>Toon alleen interesse als je de opdracht echt kunt uitvoeren.</li></ul>$fgkb$,
    $fgkb$Uitleg

Open opdrachten zijn nog niet definitief aan jou toegewezen. Planning gebruikt interessepeilingen om te bepalen wie beschikbaar is.

Als je interesse toont, betekent dat nog niet dat je definitief bent ingepland. Wacht op bevestiging van planning.

Stappen

1. Open Open opdrachten of de melding die je hebt ontvangen.
2. Lees datum, tijd, locatie en werkzaamheden.
3. Kies “Interesse” als je beschikbaar bent en de opdracht wilt doen.
4. Kies “Niet beschikbaar” als je niet kunt.
5. Stel een vraag als iets onduidelijk is en die optie beschikbaar is.
6. Wacht op definitieve bevestiging van planning.

Let op

- Toon alleen interesse als je de opdracht echt kunt uitvoeren.$fgkb$
  ),
  (
    'beschikbaarheid-invullen',
    'Beschikbaarheid invullen',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['beschikbaarheid invullen', 'personeelsapp', 'beschikbaarheid', 'invullen'],
    ARRAY['hoe beschikbaarheid invullen', 'waar vind ik beschikbaarheid invullen'],
    370,
    false,
    'Vul je beschikbaarheid in zodat planning weet wanneer je kunt werken.',
    $fgkb$<h2>Uitleg</h2><p>Beschikbaarheid helpt planning om geschikte medewerkers te vinden. Je kunt per dag aangeven wanneer je beschikbaar bent en of je eventueel spoedbeschikbaar bent.</p><h2>Stappen</h2><ol><li>Open Beschikbaarheid.</li><li>Kies de juiste dag of periode.</li><li>Vul vanaf- en tot-tijd in.</li><li>Geef aan of de beschikbaarheid herhaald moet worden als dat mogelijk is.</li><li>Zet spoedbeschikbaar aan als je ook voor spoedopdrachten beschikbaar bent.</li><li>Sla je beschikbaarheid op.</li></ol><h2>Let op</h2><ul><li>Vul beschikbaarheid op tijd in. Onvolledige beschikbaarheid kan ervoor zorgen dat je niet wordt meegenomen in de planning.</li></ul>$fgkb$,
    $fgkb$Uitleg

Beschikbaarheid helpt planning om geschikte medewerkers te vinden. Je kunt per dag aangeven wanneer je beschikbaar bent en of je eventueel spoedbeschikbaar bent.

Stappen

1. Open Beschikbaarheid.
2. Kies de juiste dag of periode.
3. Vul vanaf- en tot-tijd in.
4. Geef aan of de beschikbaarheid herhaald moet worden als dat mogelijk is.
5. Zet spoedbeschikbaar aan als je ook voor spoedopdrachten beschikbaar bent.
6. Sla je beschikbaarheid op.

Let op

- Vul beschikbaarheid op tijd in. Onvolledige beschikbaarheid kan ervoor zorgen dat je niet wordt meegenomen in de planning.$fgkb$
  ),
  (
    'verlof-aanvragen',
    'Verlof aanvragen',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['verlof aanvragen', 'personeelsapp', 'verlof', 'aanvragen'],
    ARRAY['hoe verlof aanvragen', 'waar vind ik verlof aanvragen'],
    380,
    false,
    'Vraag verlof aan via de personeelsapp. Goedgekeurd verlof blokkeert planning.',
    $fgkb$<h2>Uitleg</h2><p>Met een verlofaanvraag geef je aan dat je op bepaalde dagen niet beschikbaar bent. Backoffice beoordeelt de aanvraag. Pas na goedkeuring is het verlof definitief verwerkt.</p><h2>Stappen</h2><ol><li>Open Verlof.</li><li>Klik op “Nieuwe verlofaanvraag”.</li><li>Kies het type verlof.</li><li>Vul startdatum en eventueel einddatum in.</li><li>Voeg een toelichting toe als dat nodig is.</li><li>Dien de aanvraag in.</li><li>Controleer later of de aanvraag is goedgekeurd of afgewezen.</li></ol><h2>Let op</h2><ul><li>Dien verlof zo vroeg mogelijk in, vooral bij drukke planningsperiodes.</li></ul>$fgkb$,
    $fgkb$Uitleg

Met een verlofaanvraag geef je aan dat je op bepaalde dagen niet beschikbaar bent. Backoffice beoordeelt de aanvraag. Pas na goedkeuring is het verlof definitief verwerkt.

Stappen

1. Open Verlof.
2. Klik op “Nieuwe verlofaanvraag”.
3. Kies het type verlof.
4. Vul startdatum en eventueel einddatum in.
5. Voeg een toelichting toe als dat nodig is.
6. Dien de aanvraag in.
7. Controleer later of de aanvraag is goedgekeurd of afgewezen.

Let op

- Dien verlof zo vroeg mogelijk in, vooral bij drukke planningsperiodes.$fgkb$
  ),
  (
    'urenoverzicht-bekijken',
    'Urenoverzicht bekijken',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['urenoverzicht bekijken', 'personeelsapp', 'urenoverzicht', 'bekijken'],
    ARRAY['hoe urenoverzicht bekijken', 'waar vind ik urenoverzicht bekijken'],
    390,
    false,
    'In Uren zie je per week welke opdrachten je hebt gewerkt en hoeveel tijd is geregistreerd.',
    $fgkb$<h2>Uitleg</h2><p>Het urenoverzicht is bedoeld om inzicht te geven in je gewerkte opdrachten. Per dag kun je vaak de onderliggende werkbonnen bekijken.</p><h2>Stappen</h2><ol><li>Open Uren.</li><li>Kies de gewenste week.</li><li>Bekijk het totaal per dag.</li><li>Open een dag om de onderliggende werkbonnen te bekijken.</li><li>Meld ontbrekende of onjuiste uren via ticket of bij je leidinggevende.</li></ol><h2>Let op</h2><ul><li>Uren komen meestal voort uit werkbonnen en statusmomenten. Controleer dus ook of werkbonnen correct zijn gestart en afgerond.</li></ul>$fgkb$,
    $fgkb$Uitleg

Het urenoverzicht is bedoeld om inzicht te geven in je gewerkte opdrachten. Per dag kun je vaak de onderliggende werkbonnen bekijken.

Stappen

1. Open Uren.
2. Kies de gewenste week.
3. Bekijk het totaal per dag.
4. Open een dag om de onderliggende werkbonnen te bekijken.
5. Meld ontbrekende of onjuiste uren via ticket of bij je leidinggevende.

Let op

- Uren komen meestal voort uit werkbonnen en statusmomenten. Controleer dus ook of werkbonnen correct zijn gestart en afgerond.$fgkb$
  ),
  (
    'offline-werken-en-synchronisatie',
    'Offline werken en synchronisatie',
    'personeelsapp',
    'personnel_portal',
    ARRAY['tenant_personnel'],
    ARRAY['offline werken en synchronisatie', 'personeelsapp', 'offline', 'werken', 'synchronisatie'],
    ARRAY['hoe offline werken en synchronisatie', 'waar vind ik offline werken en synchronisatie'],
    400,
    false,
    'Bij slechte verbinding kan informatie tijdelijk lokaal worden bewaard en later worden gesynchroniseerd.',
    $fgkb$<h2>Uitleg</h2><p>Soms heb je op locatie slechte of geen internetverbinding. Fieldgrid kan bepaalde acties tijdelijk in een wachtrij plaatsen. Zodra er weer verbinding is, probeert de app de gegevens te synchroniseren.</p><p>Let op: niet alles werkt volledig offline. Controleer na slechte verbinding altijd of belangrijke rapportage, foto’s en statuswijzigingen goed zijn verwerkt.</p><h2>Stappen</h2><ol><li>Werk zoveel mogelijk online wanneer dat kan.</li><li>Zie je een offline-melding? Rond belangrijke acties rustig af en sluit de app niet direct.</li><li>Wacht tot de verbinding terug is.</li><li>Open de app opnieuw en controleer of de wachtrij leegloopt.</li><li>Controleer de werkbon of rapportage op ontbrekende informatie.</li><li>Meld problemen via ticket als synchronisatie blijft hangen.</li></ol><h2>Let op</h2><ul><li>Maak bij belangrijke foto’s of notities eventueel zelf tijdelijk een back-up totdat je zeker weet dat upload is gelukt.</li></ul>$fgkb$,
    $fgkb$Uitleg

Soms heb je op locatie slechte of geen internetverbinding. Fieldgrid kan bepaalde acties tijdelijk in een wachtrij plaatsen. Zodra er weer verbinding is, probeert de app de gegevens te synchroniseren.

Let op: niet alles werkt volledig offline. Controleer na slechte verbinding altijd of belangrijke rapportage, foto’s en statuswijzigingen goed zijn verwerkt.

Stappen

1. Werk zoveel mogelijk online wanneer dat kan.
2. Zie je een offline-melding? Rond belangrijke acties rustig af en sluit de app niet direct.
3. Wacht tot de verbinding terug is.
4. Open de app opnieuw en controleer of de wachtrij leegloopt.
5. Controleer de werkbon of rapportage op ontbrekende informatie.
6. Meld problemen via ticket als synchronisatie blijft hangen.

Let op

- Maak bij belangrijke foto’s of notities eventueel zelf tijdelijk een back-up totdat je zeker weet dat upload is gelukt.$fgkb$
  ),
  (
    'starten-met-het-klantenportaal',
    'Starten met het klantenportaal',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['starten met het klantenportaal', 'klantenportaal', 'starten', 'met', 'het'],
    ARRAY['hoe starten met het klantenportaal', 'waar vind ik starten met het klantenportaal'],
    410,
    true,
    'In het klantenportaal kun je objecten, aanvragen, offertes, rapporten, facturen, betalingen, documenten en tickets bekijken.',
    $fgkb$<h2>Uitleg</h2><p>Het klantenportaal geeft overzicht over de werkzaamheden en administratie die voor jouw organisatie relevant zijn. Je ziet alleen gegevens die bij jouw klantaccount horen.</p><h2>Stappen</h2><ol><li>Log in via de link die je van je servicebedrijf hebt ontvangen.</li><li>Open Dashboard voor een snel overzicht.</li><li>Gebruik Objecten om locaties te bekijken of toe te voegen.</li><li>Gebruik Aanvragen of Opdrachten om werk aan te vragen of status te volgen.</li><li>Gebruik Offertes, Rapporten en Facturen voor akkoord, bewijs en betaling.</li><li>Gebruik Tickets voor vragen of meldingen.</li></ol><h2>Let op</h2><ul><li>Zie je iets niet? Dan is het mogelijk nog niet gedeeld, nog niet goedgekeurd of niet gekoppeld aan jouw account.</li></ul>$fgkb$,
    $fgkb$Uitleg

Het klantenportaal geeft overzicht over de werkzaamheden en administratie die voor jouw organisatie relevant zijn. Je ziet alleen gegevens die bij jouw klantaccount horen.

Stappen

1. Log in via de link die je van je servicebedrijf hebt ontvangen.
2. Open Dashboard voor een snel overzicht.
3. Gebruik Objecten om locaties te bekijken of toe te voegen.
4. Gebruik Aanvragen of Opdrachten om werk aan te vragen of status te volgen.
5. Gebruik Offertes, Rapporten en Facturen voor akkoord, bewijs en betaling.
6. Gebruik Tickets voor vragen of meldingen.

Let op

- Zie je iets niet? Dan is het mogelijk nog niet gedeeld, nog niet goedgekeurd of niet gekoppeld aan jouw account.$fgkb$
  ),
  (
    'object-bekijken-of-aanmaken',
    'Object bekijken of aanmaken',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['object bekijken of aanmaken', 'klantenportaal', 'object', 'bekijken', 'aanmaken'],
    ARRAY['hoe object bekijken of aanmaken', 'waar vind ik object bekijken of aanmaken'],
    420,
    false,
    'Een object is een locatie waar werkzaamheden kunnen worden uitgevoerd.',
    $fgkb$<h2>Uitleg</h2><p>Onder Objecten staan jouw locaties, panden, woningen, terreinen of andere plekken waar werk kan worden uitgevoerd. Goede objectinformatie helpt het servicebedrijf om sneller en beter te plannen.</p><h2>Stappen</h2><ol><li>Open Objecten.</li><li>Klik op een bestaand object om details te bekijken.</li><li>Klik op “Object toevoegen” als je een nieuwe locatie wilt aanmaken.</li><li>Vul naam, adres, contactpersoon en telefoonnummer in.</li><li>Vul toegangsinformatie of opmerkingen in als die nodig zijn voor uitvoering.</li><li>Sla het object op.</li><li>Controleer of de informatie klopt voordat je een opdracht aanvraagt.</li></ol><h2>Let op</h2><ul><li>Vul geen onnodig gevoelige informatie in. Geef alleen toegangsinformatie die nodig is voor de werkzaamheden.</li></ul>$fgkb$,
    $fgkb$Uitleg

Onder Objecten staan jouw locaties, panden, woningen, terreinen of andere plekken waar werk kan worden uitgevoerd. Goede objectinformatie helpt het servicebedrijf om sneller en beter te plannen.

Stappen

1. Open Objecten.
2. Klik op een bestaand object om details te bekijken.
3. Klik op “Object toevoegen” als je een nieuwe locatie wilt aanmaken.
4. Vul naam, adres, contactpersoon en telefoonnummer in.
5. Vul toegangsinformatie of opmerkingen in als die nodig zijn voor uitvoering.
6. Sla het object op.
7. Controleer of de informatie klopt voordat je een opdracht aanvraagt.

Let op

- Vul geen onnodig gevoelige informatie in. Geef alleen toegangsinformatie die nodig is voor de werkzaamheden.$fgkb$
  ),
  (
    'nieuwe-opdracht-aanvragen',
    'Nieuwe opdracht aanvragen',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['nieuwe opdracht aanvragen', 'klantenportaal', 'nieuwe', 'opdracht', 'aanvragen'],
    ARRAY['hoe nieuwe opdracht aanvragen', 'waar vind ik nieuwe opdracht aanvragen'],
    430,
    true,
    'Vraag eenvoudig werkzaamheden aan voor één van je objecten.',
    $fgkb$<h2>Uitleg</h2><p>Een aanvraag komt binnen bij de backoffice van het servicebedrijf. Zij beoordelen de aanvraag, controleren capaciteit en maken eventueel een offerte of planning.</p><h2>Stappen</h2><ol><li>Open Aanvragen of Opdrachten.</li><li>Klik op “Nieuwe aanvraag”.</li><li>Kies het object waar de werkzaamheden moeten plaatsvinden.</li><li>Kies de sector of het soort werk.</li><li>Vul gewenste datum en tijd in.</li><li>Beschrijf duidelijk wat er moet gebeuren.</li><li>Voeg bijlagen of foto’s toe als die helpen.</li><li>Verstuur de aanvraag.</li><li>Volg de status in het portaal.</li></ol><h2>Let op</h2><ul><li>Hoe duidelijker de omschrijving, hoe sneller je aanvraag beoordeeld kan worden.</li><li>Spoed? Geef dat duidelijk aan en gebruik eventueel ook de afgesproken spoedroute buiten Fieldgrid.</li></ul>$fgkb$,
    $fgkb$Uitleg

Een aanvraag komt binnen bij de backoffice van het servicebedrijf. Zij beoordelen de aanvraag, controleren capaciteit en maken eventueel een offerte of planning.

Stappen

1. Open Aanvragen of Opdrachten.
2. Klik op “Nieuwe aanvraag”.
3. Kies het object waar de werkzaamheden moeten plaatsvinden.
4. Kies de sector of het soort werk.
5. Vul gewenste datum en tijd in.
6. Beschrijf duidelijk wat er moet gebeuren.
7. Voeg bijlagen of foto’s toe als die helpen.
8. Verstuur de aanvraag.
9. Volg de status in het portaal.

Let op

- Hoe duidelijker de omschrijving, hoe sneller je aanvraag beoordeeld kan worden.
- Spoed? Geef dat duidelijk aan en gebruik eventueel ook de afgesproken spoedroute buiten Fieldgrid.$fgkb$
  ),
  (
    'opdrachtstatus-volgen',
    'Opdrachtstatus volgen',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['opdrachtstatus volgen', 'klantenportaal', 'opdrachtstatus', 'volgen'],
    ARRAY['hoe opdrachtstatus volgen', 'waar vind ik opdrachtstatus volgen'],
    440,
    false,
    'Volg in het portaal wat de status is van je aanvraag of opdracht.',
    $fgkb$<h2>Uitleg</h2><p>De status laat zien waar je aanvraag of opdracht staat. Voor klanten wordt dit bewust eenvoudig weergegeven, bijvoorbeeld: aanvraag ontvangen, in behandeling, offerte beschikbaar, akkoord, ingepland, uitgevoerd, rapport beschikbaar, gefactureerd of betaald.</p><h2>Stappen</h2><ol><li>Open Opdrachten of Aanvragen.</li><li>Klik op de opdracht die je wilt bekijken.</li><li>Bekijk de actuele status.</li><li>Controleer eventuele acties, zoals offerte goedkeuren of factuur betalen.</li><li>Maak een ticket aan als je een vraag hebt over de status.</li></ol><h2>Let op</h2><ul><li>Niet alle interne stappen zijn zichtbaar in het klantenportaal. Je ziet vooral de stappen die voor jou relevant zijn.</li></ul>$fgkb$,
    $fgkb$Uitleg

De status laat zien waar je aanvraag of opdracht staat. Voor klanten wordt dit bewust eenvoudig weergegeven, bijvoorbeeld: aanvraag ontvangen, in behandeling, offerte beschikbaar, akkoord, ingepland, uitgevoerd, rapport beschikbaar, gefactureerd of betaald.

Stappen

1. Open Opdrachten of Aanvragen.
2. Klik op de opdracht die je wilt bekijken.
3. Bekijk de actuele status.
4. Controleer eventuele acties, zoals offerte goedkeuren of factuur betalen.
5. Maak een ticket aan als je een vraag hebt over de status.

Let op

- Niet alle interne stappen zijn zichtbaar in het klantenportaal. Je ziet vooral de stappen die voor jou relevant zijn.$fgkb$
  ),
  (
    'offerte-bekijken-goedkeuren-of-afwijzen',
    'Offerte bekijken, goedkeuren of afwijzen',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['offerte bekijken, goedkeuren of afwijzen', 'klantenportaal', 'offerte', 'bekijken', 'goedkeuren', 'afwijzen'],
    ARRAY['hoe offerte bekijken, goedkeuren of afwijzen', 'waar vind ik offerte bekijken, goedkeuren of afwijzen'],
    450,
    true,
    'Bekijk offertes in het portaal en geef akkoord of wijs de offerte af met reden.',
    $fgkb$<h2>Uitleg</h2><p>Als een opdracht eerst akkoord nodig heeft, ontvang je een offerte in het klantenportaal. Controleer werkzaamheden, bedrag, geldigheid en eventuele opmerkingen voordat je akkoord geeft.</p><h2>Stappen</h2><ol><li>Open Offertes.</li><li>Klik op de offerte die je wilt bekijken.</li><li>Controleer offertenummer, werkzaamheden, bedrag en geldigheidsdatum.</li><li>Klik op “Akkoord” als alles klopt.</li><li>Klik op “Afwijzen” als je niet akkoord bent.</li><li>Vul bij afwijzen een duidelijke reden in.</li><li>Controleer daarna de nieuwe status.</li></ol><h2>Let op</h2><ul><li>Na akkoord kan de opdracht verder worden gepland. Geef alleen akkoord als de offerte klopt.</li></ul>$fgkb$,
    $fgkb$Uitleg

Als een opdracht eerst akkoord nodig heeft, ontvang je een offerte in het klantenportaal. Controleer werkzaamheden, bedrag, geldigheid en eventuele opmerkingen voordat je akkoord geeft.

Stappen

1. Open Offertes.
2. Klik op de offerte die je wilt bekijken.
3. Controleer offertenummer, werkzaamheden, bedrag en geldigheidsdatum.
4. Klik op “Akkoord” als alles klopt.
5. Klik op “Afwijzen” als je niet akkoord bent.
6. Vul bij afwijzen een duidelijke reden in.
7. Controleer daarna de nieuwe status.

Let op

- Na akkoord kan de opdracht verder worden gepland. Geef alleen akkoord als de offerte klopt.$fgkb$
  ),
  (
    'rapport-bekijken',
    'Rapport bekijken',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['rapport bekijken', 'klantenportaal', 'rapport', 'bekijken'],
    ARRAY['hoe rapport bekijken', 'waar vind ik rapport bekijken'],
    460,
    false,
    'Bekijk goedgekeurde rapporten van uitgevoerde werkzaamheden.',
    $fgkb$<h2>Uitleg</h2><p>Rapporten geven inzicht in uitgevoerd werk. Een rapport kan bestaan uit werkzaamheden, notities, foto’s, bijlagen, datum, object en status.</p><p>Je ziet alleen rapporten die door het servicebedrijf zijn goedgekeurd en klantzichtbaar zijn gemaakt.</p><h2>Stappen</h2><ol><li>Open Rapporten.</li><li>Klik op het rapport dat je wilt bekijken.</li><li>Controleer datum, object, werkzaamheden en bijlagen.</li><li>Download eventueel de PDF of bijlagen als dat beschikbaar is.</li><li>Maak een ticket aan als je een vraag hebt over het rapport.</li></ol><h2>Let op</h2><ul><li>Interne notities of personeelsinformatie zijn niet zichtbaar in het klantenportaal.</li></ul>$fgkb$,
    $fgkb$Uitleg

Rapporten geven inzicht in uitgevoerd werk. Een rapport kan bestaan uit werkzaamheden, notities, foto’s, bijlagen, datum, object en status.

Je ziet alleen rapporten die door het servicebedrijf zijn goedgekeurd en klantzichtbaar zijn gemaakt.

Stappen

1. Open Rapporten.
2. Klik op het rapport dat je wilt bekijken.
3. Controleer datum, object, werkzaamheden en bijlagen.
4. Download eventueel de PDF of bijlagen als dat beschikbaar is.
5. Maak een ticket aan als je een vraag hebt over het rapport.

Let op

- Interne notities of personeelsinformatie zijn niet zichtbaar in het klantenportaal.$fgkb$
  ),
  (
    'factuur-bekijken-en-online-betalen',
    'Factuur bekijken en online betalen',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['factuur bekijken en online betalen', 'klantenportaal', 'factuur', 'bekijken', 'online', 'betalen'],
    ARRAY['hoe factuur bekijken en online betalen', 'waar vind ik factuur bekijken en online betalen'],
    470,
    true,
    'Bekijk openstaande en betaalde facturen en betaal online wanneer de betaalmogelijkheid actief is.',
    $fgkb$<h2>Uitleg</h2><p>In Facturen zie je factuurnummer, datum, bedrag, status, vervaldatum en betaalmogelijkheid. Online betalingen verlopen via de betaalprovider van het servicebedrijf.</p><h2>Stappen</h2><ol><li>Open Facturen.</li><li>Klik op de factuur die je wilt bekijken.</li><li>Controleer factuurnummer, bedrag en vervaldatum.</li><li>Klik op “Betalen” als online betaling beschikbaar is.</li><li>Rond de betaling af via de betaalpagina.</li><li>Keer terug naar het portaal en controleer de betaalstatus.</li></ol><h2>Let op</h2><ul><li>Heb je al betaald via bankoverschrijving? Dan kan het even duren voordat de status is bijgewerkt.</li><li>Neem bij vragen over bedragen of factuurregels contact op via een ticket.</li></ul>$fgkb$,
    $fgkb$Uitleg

In Facturen zie je factuurnummer, datum, bedrag, status, vervaldatum en betaalmogelijkheid. Online betalingen verlopen via de betaalprovider van het servicebedrijf.

Stappen

1. Open Facturen.
2. Klik op de factuur die je wilt bekijken.
3. Controleer factuurnummer, bedrag en vervaldatum.
4. Klik op “Betalen” als online betaling beschikbaar is.
5. Rond de betaling af via de betaalpagina.
6. Keer terug naar het portaal en controleer de betaalstatus.

Let op

- Heb je al betaald via bankoverschrijving? Dan kan het even duren voordat de status is bijgewerkt.
- Neem bij vragen over bedragen of factuurregels contact op via een ticket.$fgkb$
  ),
  (
    'meerdere-facturen-tegelijk-betalen',
    'Meerdere facturen tegelijk betalen',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['meerdere facturen tegelijk betalen', 'klantenportaal', 'meerdere', 'facturen', 'tegelijk', 'betalen'],
    ARRAY['hoe meerdere facturen tegelijk betalen', 'waar vind ik meerdere facturen tegelijk betalen'],
    480,
    false,
    'Als betaalbatches actief zijn, kun je meerdere open facturen in één keer betalen.',
    $fgkb$<h2>Uitleg</h2><p>Een betaalbatch bundelt meerdere facturen in één betaling. Dit is handig als je meerdere openstaande facturen tegelijk wilt voldoen.</p><h2>Stappen</h2><ol><li>Open Facturen.</li><li>Selecteer de openstaande facturen die je wilt betalen.</li><li>Controleer het totaalbedrag.</li><li>Klik op “Geselecteerde facturen betalen”.</li><li>Rond de betaling af via de betaalpagina.</li><li>Controleer daarna de betaalstatussen in het portaal.</li></ol><h2>Let op</h2><ul><li>Controleer altijd of je de juiste facturen hebt geselecteerd voordat je betaalt.</li></ul>$fgkb$,
    $fgkb$Uitleg

Een betaalbatch bundelt meerdere facturen in één betaling. Dit is handig als je meerdere openstaande facturen tegelijk wilt voldoen.

Stappen

1. Open Facturen.
2. Selecteer de openstaande facturen die je wilt betalen.
3. Controleer het totaalbedrag.
4. Klik op “Geselecteerde facturen betalen”.
5. Rond de betaling af via de betaalpagina.
6. Controleer daarna de betaalstatussen in het portaal.

Let op

- Controleer altijd of je de juiste facturen hebt geselecteerd voordat je betaalt.$fgkb$
  ),
  (
    'ticket-aanmaken-als-klant',
    'Ticket aanmaken als klant',
    'klantenportaal',
    'customer_portal',
    ARRAY['tenant_customer'],
    ARRAY['ticket aanmaken als klant', 'klantenportaal', 'ticket', 'aanmaken', 'als', 'klant'],
    ARRAY['hoe ticket aanmaken als klant', 'waar vind ik ticket aanmaken als klant'],
    490,
    false,
    'Gebruik tickets voor vragen, meldingen, klachten of opmerkingen over objecten, opdrachten, facturen of planning.',
    $fgkb$<h2>Uitleg</h2><p>Een ticket is een opvolgbaar bericht. Het servicebedrijf kan reageren en de status bijhouden. Gebruik tickets voor communicatie die later teruggevonden moet worden.</p><h2>Stappen</h2><ol><li>Open Tickets of Support.</li><li>Klik op “Nieuw ticket”.</li><li>Kies het onderwerp of de afdeling.</li><li>Vul een duidelijke titel in.</li><li>Beschrijf je vraag of melding zo concreet mogelijk.</li><li>Koppel eventueel een object, opdracht of factuur als dat kan.</li><li>Voeg bijlagen toe als die helpen.</li><li>Verstuur het ticket.</li><li>Volg reacties in het portaal.</li></ol><h2>Let op</h2><ul><li>Gebruik bij spoed ook de afgesproken spoedroute van je servicebedrijf. Een ticket is niet altijd bedoeld voor directe noodmeldingen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Een ticket is een opvolgbaar bericht. Het servicebedrijf kan reageren en de status bijhouden. Gebruik tickets voor communicatie die later teruggevonden moet worden.

Stappen

1. Open Tickets of Support.
2. Klik op “Nieuw ticket”.
3. Kies het onderwerp of de afdeling.
4. Vul een duidelijke titel in.
5. Beschrijf je vraag of melding zo concreet mogelijk.
6. Koppel eventueel een object, opdracht of factuur als dat kan.
7. Voeg bijlagen toe als die helpen.
8. Verstuur het ticket.
9. Volg reacties in het portaal.

Let op

- Gebruik bij spoed ook de afgesproken spoedroute van je servicebedrijf. Een ticket is niet altijd bedoeld voor directe noodmeldingen.$fgkb$
  ),
  (
    'organisatieomgeving-aanmaken',
    'Organisatieomgeving aanmaken',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['organisatieomgeving aanmaken', 'fieldgrid beheer en support', 'organisatieomgeving', 'aanmaken'],
    ARRAY['hoe organisatieomgeving aanmaken', 'waar vind ik organisatieomgeving aanmaken'],
    500,
    true,
    'Maak een nieuwe organisatieomgeving aan voor een klant die Fieldgrid gaat gebruiken.',
    $fgkb$<h2>Uitleg</h2><p>Een organisatieomgeving is de eigen werkruimte van een klant binnen Fieldgrid. Hierin staan de eigen gebruikers, klanten, objecten, opdrachten, instellingen, modules, documenten en meldingen van die organisatie.</p><p>Gebruik in klantgerichte communicatie niet het woord “tenant”. Zeg “organisatieomgeving” of “klantomgeving”.</p><h2>Stappen</h2><ol><li>Open Platformbeheer.</li><li>Ga naar Organisaties of Onboarding.</li><li>Start een nieuwe organisatieomgeving.</li><li>Vul naam, korte webadresnaam, pakket en actieve onderdelen in.</li><li>Controleer de controle vooraf voordat je de omgeving definitief aanmaakt.</li><li>Maak de eerste beheerder aan en verstuur de uitnodiging.</li><li>Controleer na aanmaken of de omgeving bereikbaar is.</li><li>Laat de beheerder de eerste inrichting afronden.</li></ol><h2>Let op</h2><ul><li>Gebruik “controle vooraf” in plaats van “preflight” in de interface.</li><li>Gebruik “omgeving klaarzetten” in plaats van “provisioning”.</li></ul>$fgkb$,
    $fgkb$Uitleg

Een organisatieomgeving is de eigen werkruimte van een klant binnen Fieldgrid. Hierin staan de eigen gebruikers, klanten, objecten, opdrachten, instellingen, modules, documenten en meldingen van die organisatie.

Gebruik in klantgerichte communicatie niet het woord “tenant”. Zeg “organisatieomgeving” of “klantomgeving”.

Stappen

1. Open Platformbeheer.
2. Ga naar Organisaties of Onboarding.
3. Start een nieuwe organisatieomgeving.
4. Vul naam, korte webadresnaam, pakket en actieve onderdelen in.
5. Controleer de controle vooraf voordat je de omgeving definitief aanmaakt.
6. Maak de eerste beheerder aan en verstuur de uitnodiging.
7. Controleer na aanmaken of de omgeving bereikbaar is.
8. Laat de beheerder de eerste inrichting afronden.

Let op

- Gebruik “controle vooraf” in plaats van “preflight” in de interface.
- Gebruik “omgeving klaarzetten” in plaats van “provisioning”.$fgkb$
  ),
  (
    'eigen-webadres-koppelen',
    'Eigen webadres koppelen',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['eigen webadres koppelen', 'fieldgrid beheer en support', 'eigen', 'webadres', 'koppelen'],
    ARRAY['hoe eigen webadres koppelen', 'waar vind ik eigen webadres koppelen'],
    510,
    true,
    'Koppel een eigen webadres aan een organisatieomgeving wanneer dit is inbegrepen of afgesproken.',
    $fgkb$<h2>Uitleg</h2><p>Standaard gebruikt een organisatie een Fieldgrid-webadres. Voor sommige pakketten kan een eigen webadres worden gekoppeld. Hiervoor zijn DNS-instellingen nodig.</p><p>De beheerder van de organisatie kan de instructies ontvangen, maar Fieldgrid beheer of support activeert de koppeling.</p><h2>Stappen</h2><ol><li>Controleer of het pakket of de afspraak een eigen webadres toestaat.</li><li>Voeg het gewenste webadres toe in Platformbeheer.</li><li>Deel de DNS-instructies met de organisatie.</li><li>Controleer of de DNS correct is ingesteld.</li><li>Activeer het webadres pas wanneer de controle groen is.</li><li>Test login, backoffice, klantenportaal en personeelsapp via het nieuwe webadres.</li></ol><h2>Let op</h2><ul><li>Leg technische termen zoals Caddy, ingress of hostcontext niet uit aan klanten tenzij zij daar expliciet om vragen.</li></ul>$fgkb$,
    $fgkb$Uitleg

Standaard gebruikt een organisatie een Fieldgrid-webadres. Voor sommige pakketten kan een eigen webadres worden gekoppeld. Hiervoor zijn DNS-instellingen nodig.

De beheerder van de organisatie kan de instructies ontvangen, maar Fieldgrid beheer of support activeert de koppeling.

Stappen

1. Controleer of het pakket of de afspraak een eigen webadres toestaat.
2. Voeg het gewenste webadres toe in Platformbeheer.
3. Deel de DNS-instructies met de organisatie.
4. Controleer of de DNS correct is ingesteld.
5. Activeer het webadres pas wanneer de controle groen is.
6. Test login, backoffice, klantenportaal en personeelsapp via het nieuwe webadres.

Let op

- Leg technische termen zoals Caddy, ingress of hostcontext niet uit aan klanten tenzij zij daar expliciet om vragen.$fgkb$
  ),
  (
    'pakketten-en-onderdelen-beheren',
    'Pakketten en onderdelen beheren',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['pakketten en onderdelen beheren', 'fieldgrid beheer en support', 'pakketten', 'onderdelen', 'beheren'],
    ARRAY['hoe pakketten en onderdelen beheren', 'waar vind ik pakketten en onderdelen beheren'],
    520,
    false,
    'Bepaal welke onderdelen beschikbaar zijn voor een organisatie, zoals planning, finance, klantportaal, personeelsapp, documenten, notificaties en voorraad.',
    $fgkb$<h2>Uitleg</h2><p>Fieldgrid werkt met pakketten en losse onderdelen. Een organisatie ziet alleen onderdelen die actief zijn en waarvoor gebruikers rechten hebben.</p><p>Gebruik richting klanten woorden als “pakket”, “onderdeel” en “functie”. Vermijd “module key” en “entitlement”.</p><h2>Stappen</h2><ol><li>Open de organisatie in Platformbeheer.</li><li>Controleer pakket en actieve onderdelen.</li><li>Schakel onderdelen alleen in als ze verkocht, getest en ingericht zijn.</li><li>Controleer daarna rollen en rechten binnen de organisatie.</li><li>Test of de juiste pagina’s zichtbaar zijn in backoffice, personeelsapp en klantenportaal.</li></ol><h2>Let op</h2><ul><li>Een actief onderdeel betekent niet automatisch dat elke gebruiker het ziet. Rollen en rechten bepalen de uiteindelijke toegang.</li></ul>$fgkb$,
    $fgkb$Uitleg

Fieldgrid werkt met pakketten en losse onderdelen. Een organisatie ziet alleen onderdelen die actief zijn en waarvoor gebruikers rechten hebben.

Gebruik richting klanten woorden als “pakket”, “onderdeel” en “functie”. Vermijd “module key” en “entitlement”.

Stappen

1. Open de organisatie in Platformbeheer.
2. Controleer pakket en actieve onderdelen.
3. Schakel onderdelen alleen in als ze verkocht, getest en ingericht zijn.
4. Controleer daarna rollen en rechten binnen de organisatie.
5. Test of de juiste pagina’s zichtbaar zijn in backoffice, personeelsapp en klantenportaal.

Let op

- Een actief onderdeel betekent niet automatisch dat elke gebruiker het ziet. Rollen en rechten bepalen de uiteindelijke toegang.$fgkb$
  ),
  (
    'supporttoegang-gebruiken',
    'Supporttoegang gebruiken',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['supporttoegang gebruiken', 'fieldgrid beheer en support', 'supporttoegang', 'gebruiken'],
    ARRAY['hoe supporttoegang gebruiken', 'waar vind ik supporttoegang gebruiken'],
    530,
    false,
    'Gebruik supporttoegang alleen wanneer dat nodig is en leg vast waarom je meekijkt.',
    $fgkb$<h2>Uitleg</h2><p>Supporttoegang is bedoeld om problemen op te lossen, niet om onnodig mee te kijken. Toegang tot klantgegevens moet beperkt, tijdelijk en uitlegbaar zijn.</p><p>Gebruik bij voorkeur een goedkeurings- of toegangsverzoek wanneer gevoelige gegevens zichtbaar kunnen zijn.</p><h2>Stappen</h2><ol><li>Controleer de supportvraag en bepaal of meekijken nodig is.</li><li>Vraag waar nodig toestemming of interne goedkeuring.</li><li>Activeer supporttoegang alleen voor de benodigde omgeving en periode.</li><li>Los het probleem op met zo min mogelijk toegang tot gevoelige gegevens.</li><li>Leg acties vast in het logboek of ticket.</li><li>Sluit supporttoegang zodra het probleem is opgelost.</li></ol><h2>Let op</h2><ul><li>Gebruik geen persoonlijke klantgegevens in screenshots of tickets als dat niet nodig is.</li></ul>$fgkb$,
    $fgkb$Uitleg

Supporttoegang is bedoeld om problemen op te lossen, niet om onnodig mee te kijken. Toegang tot klantgegevens moet beperkt, tijdelijk en uitlegbaar zijn.

Gebruik bij voorkeur een goedkeurings- of toegangsverzoek wanneer gevoelige gegevens zichtbaar kunnen zijn.

Stappen

1. Controleer de supportvraag en bepaal of meekijken nodig is.
2. Vraag waar nodig toestemming of interne goedkeuring.
3. Activeer supporttoegang alleen voor de benodigde omgeving en periode.
4. Los het probleem op met zo min mogelijk toegang tot gevoelige gegevens.
5. Leg acties vast in het logboek of ticket.
6. Sluit supporttoegang zodra het probleem is opgelost.

Let op

- Gebruik geen persoonlijke klantgegevens in screenshots of tickets als dat niet nodig is.$fgkb$
  ),
  (
    'platform-e-mailprovider-instellen',
    'Platform e-mailprovider instellen',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['platform e-mailprovider instellen', 'fieldgrid beheer en support', 'platform', 'mailprovider', 'instellen'],
    ARRAY['hoe platform e-mailprovider instellen', 'waar vind ik platform e-mailprovider instellen'],
    540,
    false,
    'Stel centraal in hoe Fieldgrid e-mails verstuurt via Resend API of SMTP.',
    $fgkb$<h2>Uitleg</h2><p>Fieldgrid kan e-mails versturen via een centrale e-mailprovider, een eigen provider per organisatie of een oudere SMTP-instelling. Nieuwe instellingen moeten veilig worden opgeslagen en getest.</p><p>API keys en SMTP-wachtwoorden zijn geheimen. Ze horen niet in gewone documentatie, tickets of chatberichten te staan.</p><h2>Stappen</h2><ol><li>Open Platformbeheer &gt; Mailproviders.</li><li>Kies Resend API of SMTP.</li><li>Vul afzendernaam, afzenderadres en antwoordadres in.</li><li>Vul de API key of SMTP-gegevens in.</li><li>Sla de provider op.</li><li>Zet de provider actief als deze gebruikt moet worden.</li><li>Verstuur een testmail.</li><li>Controleer de afleverlog en eventuele foutmelding.</li></ol><h2>Let op</h2><ul><li>Controleer DNS-instellingen van het afzenderdomein voordat je live gaat.</li><li>Gebruik versleutelde opslag voor secrets en toon keys nooit volledig terug in de interface.</li></ul>$fgkb$,
    $fgkb$Uitleg

Fieldgrid kan e-mails versturen via een centrale e-mailprovider, een eigen provider per organisatie of een oudere SMTP-instelling. Nieuwe instellingen moeten veilig worden opgeslagen en getest.

API keys en SMTP-wachtwoorden zijn geheimen. Ze horen niet in gewone documentatie, tickets of chatberichten te staan.

Stappen

1. Open Platformbeheer > Mailproviders.
2. Kies Resend API of SMTP.
3. Vul afzendernaam, afzenderadres en antwoordadres in.
4. Vul de API key of SMTP-gegevens in.
5. Sla de provider op.
6. Zet de provider actief als deze gebruikt moet worden.
7. Verstuur een testmail.
8. Controleer de afleverlog en eventuele foutmelding.

Let op

- Controleer DNS-instellingen van het afzenderdomein voordat je live gaat.
- Gebruik versleutelde opslag voor secrets en toon keys nooit volledig terug in de interface.$fgkb$
  ),
  (
    'help-roadmap-en-releases-beheren',
    'Help, roadmap en releases beheren',
    'fieldgrid-beheer-en-support',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin'],
    ARRAY['help, roadmap en releases beheren', 'fieldgrid beheer en support', 'help', 'roadmap', 'releases', 'beheren'],
    ARRAY['hoe help, roadmap en releases beheren', 'waar vind ik help, roadmap en releases beheren'],
    550,
    true,
    'Beheer handleidingen, tooltips, productwensen en releaseberichten voor de juiste doelgroepen.',
    $fgkb$<h2>Uitleg</h2><p>De kennisbank, roadmap en releases helpen gebruikers om Fieldgrid te begrijpen en productwijzigingen te volgen. Content kan gericht worden op specifieke doelgroepen en onderdelen.</p><p>Schrijf altijd vanuit de lezer: wat wil hij doen, wat moet hij invullen en wat gebeurt er daarna?</p><h2>Stappen</h2><ol><li>Maak een artikel met duidelijke titel en samenvatting.</li><li>Kies de juiste categorie en doelgroep.</li><li>Schrijf in eenvoudige taal en vermijd technische termen.</li><li>Koppel relevante onderdelen en rechten zodat het artikel op de juiste plek verschijnt.</li><li>Voeg screenshots of korte video’s toe als dat helpt.</li><li>Controleer de preview als backofficegebruiker, medewerker en klant.</li><li>Publiceer pas als de tekst helder en actueel is.</li></ol><h2>Let op</h2><ul><li>Een goede helptekst beantwoordt meestal: wat is dit, wanneer gebruik ik dit, hoe doe ik het, wat als het niet lukt?</li></ul>$fgkb$,
    $fgkb$Uitleg

De kennisbank, roadmap en releases helpen gebruikers om Fieldgrid te begrijpen en productwijzigingen te volgen. Content kan gericht worden op specifieke doelgroepen en onderdelen.

Schrijf altijd vanuit de lezer: wat wil hij doen, wat moet hij invullen en wat gebeurt er daarna?

Stappen

1. Maak een artikel met duidelijke titel en samenvatting.
2. Kies de juiste categorie en doelgroep.
3. Schrijf in eenvoudige taal en vermijd technische termen.
4. Koppel relevante onderdelen en rechten zodat het artikel op de juiste plek verschijnt.
5. Voeg screenshots of korte video’s toe als dat helpt.
6. Controleer de preview als backofficegebruiker, medewerker en klant.
7. Publiceer pas als de tekst helder en actueel is.

Let op

- Een goede helptekst beantwoordt meestal: wat is dit, wanneer gebruik ik dit, hoe doe ik het, wat als het niet lukt?

---$fgkb$
  ),
  (
    'veelgestelde-vragen',
    'Veelgestelde vragen',
    'veelgestelde-vragen',
    'knowledgebase',
    ARRAY['platform_admin', 'support', 'tenant_admin', 'tenant_management', 'tenant_planning', 'tenant_administration', 'tenant_personnel', 'tenant_customer'],
    ARRAY['veelgestelde vragen', 'faq', 'help', 'support', 'fieldgrid', 'waarom zie ik een onderdeel niet?', 'wat betekent “object”?', 'wat is het verschil tussen aanvraag, opdracht en werkbon?', 'hoe maak ik een klant aan?', 'waarom kan ik een opdracht niet plannen?', 'waarom krijgt een klant geen uitnodiging?', 'waarom staat een factuur nog open terwijl de klant heeft betaald?', 'waarom zie ik mijn opdracht niet?', 'wat moet ik doen als ik geen toegang krijg tot een locatie?', 'wat als mijn foto niet uploadt?', 'waarom zie ik mijn rapport nog niet?', 'hoe keur ik een offerte goed?', 'kan ik meerdere facturen tegelijk betalen?', 'wat zeg ik tegen klanten in plaats van tenant?'],
    ARRAY['Waarom zie ik een onderdeel niet?', 'Wat betekent “object”?', 'Wat is het verschil tussen aanvraag, opdracht en werkbon?', 'Hoe maak ik een klant aan?', 'Waarom kan ik een opdracht niet plannen?', 'Waarom krijgt een klant geen uitnodiging?', 'Waarom staat een factuur nog open terwijl de klant heeft betaald?', 'Waarom zie ik mijn opdracht niet?', 'Wat moet ik doen als ik geen toegang krijg tot een locatie?', 'Wat als mijn foto niet uploadt?', 'Waarom zie ik mijn rapport nog niet?', 'Hoe keur ik een offerte goed?', 'Kan ik meerdere facturen tegelijk betalen?', 'Wat zeg ik tegen klanten in plaats van tenant?'],
    560,
    false,
    'Korte antwoorden op veelgestelde vragen over Fieldgrid, rollen, opdrachten, planning, rapporten, offertes, facturen en support.',
    $fgkb$<h2>Algemeen</h2><h3>Waarom zie ik een onderdeel niet?</h3><p>Je ziet alleen onderdelen die voor jouw rol beschikbaar zijn en die actief zijn voor je organisatie. Vraag je beheerder om je rechten te controleren.</p><h3>Wat betekent “object”?</h3><p>Een object is de locatie waar werk wordt uitgevoerd, zoals een pand, woning, terrein, kantoor, parkeergarage of installatie.</p><h3>Wat is het verschil tussen aanvraag, opdracht en werkbon?</h3><p>Een aanvraag is een verzoek om werk uit te voeren. Een opdracht is het volledige werkproces in Fieldgrid. De werkbon is de uitvoerbare opdracht voor de medewerker op locatie.</p><h2>Backoffice</h2><h3>Hoe maak ik een klant aan?</h3><p>Ga naar Klanten, klik op Nieuwe klant, vul de gegevens in en sla op. Voeg daarna contactpersonen, objecten en eventueel portaaltoegang toe.</p><h3>Waarom kan ik een opdracht niet plannen?</h3><p>Controleer status, datum, sector, benodigde medewerkers, beschikbaarheid, verlof, ziekte, rol, certificaten en bestaande conflicten.</p><h3>Waarom krijgt een klant geen uitnodiging?</h3><p>Controleer het e-mailadres, mailinstellingen, afleverlog, spammap en of de uitnodiging echt is verstuurd.</p><h3>Waarom staat een factuur nog open terwijl de klant heeft betaald?</h3><p>Controleer of betaling via Mollie is binnengekomen, of de klant via bankoverschrijving heeft betaald en of de betaalstatus handmatig bijgewerkt moet worden.</p><h2>Personeelsapp</h2><h3>Waarom zie ik mijn opdracht niet?</h3><p>Controleer of je definitief bent ingepland, of je met het juiste account bent ingelogd en of de planning al is gepubliceerd.</p><h3>Wat moet ik doen als ik geen toegang krijg tot een locatie?</h3><p>Meld de werkbon af met de juiste reden, voeg een toelichting toe en neem bij spoed contact op met planning.</p><h3>Wat als mijn foto niet uploadt?</h3><p>Controleer je internetverbinding en open de app opnieuw zodra je verbinding hebt. Kijk of de offline wachtrij nog items bevat.</p><h2>Klantenportaal</h2><h3>Waarom zie ik mijn rapport nog niet?</h3><p>Rapporten worden pas zichtbaar nadat ze door het servicebedrijf zijn gecontroleerd en gedeeld.</p><h3>Hoe keur ik een offerte goed?</h3><p>Open Offertes, klik op de offerte, controleer de inhoud en klik op Akkoord als alles klopt.</p><h3>Kan ik meerdere facturen tegelijk betalen?</h3><p>Ja, als betaalbatches actief zijn kun je meerdere openstaande facturen selecteren en in één betaling voldoen.</p><h2>Support</h2><h3>Wat zeg ik tegen klanten in plaats van tenant?</h3><p>Gebruik “organisatie”, “omgeving”, “klantomgeving” of “organisatieomgeving”, afhankelijk van de context.</p>$fgkb$,
    $fgkb$Algemeen

Waarom zie ik een onderdeel niet?
Je ziet alleen onderdelen die voor jouw rol beschikbaar zijn en die actief zijn voor je organisatie. Vraag je beheerder om je rechten te controleren.

Wat betekent “object”?
Een object is de locatie waar werk wordt uitgevoerd, zoals een pand, woning, terrein, kantoor, parkeergarage of installatie.

Wat is het verschil tussen aanvraag, opdracht en werkbon?
Een aanvraag is een verzoek om werk uit te voeren. Een opdracht is het volledige werkproces in Fieldgrid. De werkbon is de uitvoerbare opdracht voor de medewerker op locatie.

Backoffice

Hoe maak ik een klant aan?
Ga naar Klanten, klik op Nieuwe klant, vul de gegevens in en sla op. Voeg daarna contactpersonen, objecten en eventueel portaaltoegang toe.

Waarom kan ik een opdracht niet plannen?
Controleer status, datum, sector, benodigde medewerkers, beschikbaarheid, verlof, ziekte, rol, certificaten en bestaande conflicten.

Waarom krijgt een klant geen uitnodiging?
Controleer het e-mailadres, mailinstellingen, afleverlog, spammap en of de uitnodiging echt is verstuurd.

Waarom staat een factuur nog open terwijl de klant heeft betaald?
Controleer of betaling via Mollie is binnengekomen, of de klant via bankoverschrijving heeft betaald en of de betaalstatus handmatig bijgewerkt moet worden.

Personeelsapp

Waarom zie ik mijn opdracht niet?
Controleer of je definitief bent ingepland, of je met het juiste account bent ingelogd en of de planning al is gepubliceerd.

Wat moet ik doen als ik geen toegang krijg tot een locatie?
Meld de werkbon af met de juiste reden, voeg een toelichting toe en neem bij spoed contact op met planning.

Wat als mijn foto niet uploadt?
Controleer je internetverbinding en open de app opnieuw zodra je verbinding hebt. Kijk of de offline wachtrij nog items bevat.

Klantenportaal

Waarom zie ik mijn rapport nog niet?
Rapporten worden pas zichtbaar nadat ze door het servicebedrijf zijn gecontroleerd en gedeeld.

Hoe keur ik een offerte goed?
Open Offertes, klik op de offerte, controleer de inhoud en klik op Akkoord als alles klopt.

Kan ik meerdere facturen tegelijk betalen?
Ja, als betaalbatches actief zijn kun je meerdere openstaande facturen selecteren en in één betaling voldoen.

Support

Wat zeg ik tegen klanten in plaats van tenant?
Gebruik “organisatie”, “omgeving”, “klantomgeving” of “organisatieomgeving”, afhankelijk van de context.$fgkb$
  );

CREATE TEMP TABLE fieldgrid_kb_content_v1_legacy_slug_seed (
  slug text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO fieldgrid_kb_content_v1_legacy_slug_seed (slug)
VALUES
  ('platform-dashboard-overzicht'),
  ('tenant-aanmaken-en-onboarding'),
  ('tenant-domeinen-en-custom-domains'),
  ('platform-gebruikers-en-rollen'),
  ('platform-instellingen-mail-smtp-api'),
  ('platform-security-audit-operations'),
  ('knowledgebase-artikelen-en-tooltips'),
  ('roadmap-featurewensen-triage'),
  ('release-notes-highlights'),
  ('tenant-dashboard-en-acties'),
  ('klanten-aanmaken-en-portaal-uitnodigen'),
  ('objecten-locaties-documenten'),
  ('opdrachten-werkbonnen-beheren'),
  ('planning-workbench-matchscores'),
  ('personeel-beschikbaarheid-verlof'),
  ('rapportages-controleren'),
  ('facturen-offertes-betalingen'),
  ('tickets-inbox-communicatie'),
  ('documenten-uploaden-delen'),
  ('materialen-beheren'),
  ('inventaris-qr-issues'),
  ('instellingen-rollen-permissies'),
  ('mailinstellingen-tenant'),
  ('taakcodes-sectoren-slim-plannen'),
  ('klantportaal-opdrachten-offertes-akkoord'),
  ('klantportaal-facturen-betalingen-documenten'),
  ('klantportaal-tickets-support'),
  ('personeelsapp-planning-opdrachten-status'),
  ('personeelsapp-rapportage-fotos-materiaal'),
  ('personeelsapp-beschikbaarheid-verlof-ziek'),
  ('help-roadmap-releases-gebruiken');

UPDATE kb_articles article
SET
  status = 'archived',
  featured = false,
  archived_at = COALESCE(article.archived_at, now()),
  updated_at = now()
WHERE article.scope = 'platform_global'
  AND article.tenant_id IS NULL
  AND article.language = 'nl'
  AND EXISTS (
    SELECT 1
    FROM fieldgrid_kb_content_v1_legacy_slug_seed legacy
    WHERE legacy.slug = article.slug
  )
  AND NOT EXISTS (
    SELECT 1
    FROM fieldgrid_kb_content_v1_article_seed seed
    WHERE seed.slug = article.slug
  );

WITH rendered AS (
  SELECT
    seed.*,
    categories.id AS category_id
  FROM fieldgrid_kb_content_v1_article_seed seed
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
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', rendered.summary))
      )
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
    categories.id AS category_id
  FROM fieldgrid_kb_content_v1_article_seed seed
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
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', rendered.summary))
      )
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
  SELECT article.id, seed.audiences
  FROM fieldgrid_kb_content_v1_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
)
DELETE FROM kb_article_audiences audience
USING scoped_articles
WHERE audience.article_id = scoped_articles.id
  AND NOT (audience.audience_key = ANY(scoped_articles.audiences));

WITH scoped_articles AS (
  SELECT article.id, seed.audiences
  FROM fieldgrid_kb_content_v1_article_seed seed
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
  FROM fieldgrid_kb_content_v1_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
)
DELETE FROM kb_article_modules module_link
USING scoped_articles
WHERE module_link.article_id = scoped_articles.id
  AND module_link.module_key <> scoped_articles.module_key;

WITH scoped_articles AS (
  SELECT article.id, seed.module_key
  FROM fieldgrid_kb_content_v1_article_seed seed
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
  SELECT article.id
  FROM fieldgrid_kb_content_v1_article_seed seed
  JOIN kb_articles article
    ON article.scope = 'platform_global'
   AND article.tenant_id IS NULL
   AND article.language = 'nl'
   AND article.slug = seed.slug
)
DELETE FROM kb_search_terms search_term
USING scoped_articles
WHERE search_term.article_id = scoped_articles.id;

WITH scoped_articles AS (
  SELECT article.id, seed.keywords, seed.smart_terms
  FROM fieldgrid_kb_content_v1_article_seed seed
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
  AND length(term) <= 220
ON CONFLICT DO NOTHING;
