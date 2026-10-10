# Changelog

Alle relevante wijzigingen aan Fieldgrid worden in dit bestand vastgelegd.

## Nog niet uitgebracht

### 1.1.0-rc.2 — Kennisbank

- Centrale kennisbank voor platformbeheer, tenantbeheer, personeel en klanten, met
  46 uitgebreide Nederlandstalige artikelen, stappenplannen en veelgestelde vragen.
- Zoeken in titel, trefwoorden, samenvatting en inhoud, met Nederlandse woordvormen,
  relevante sortering, typefoutondersteuning, categorieën en paginatie.
- Vaste artikellinks, inhoudsopgave en toeganggefilterde verwante artikelen.
- Alleen platformbeheerders schrijven; concept, expliciete publicatie, archivering,
  versiegeschiedenis en herstel behouden de laatste gepubliceerde lezersversie.
- Ticketbehandelaars zoeken artikelen voor de daadwerkelijke ontvanger, lezen ze
  in het gesprek en voegen een klikbare link toe aan een zelf te verzenden concept.
- Volledige bronanalyse en bruikbare productinhoud voor de toekomstige publieke website.

Deze kandidaat volgt de bestaande bewuste stagingpromotie. Productie blijft
1.0.0 totdat dezelfde kandidaat afzonderlijk wordt geaccepteerd en vrijgegeven.

### 1.1.0-rc.1 — Productbeheer

- Productbeheer in het platform met ideeënbehandeling, private notities, roadmapbord,
  releaseonderdelen en expliciete publicatie en aankondigingen.
- Roadmap & updates voor tenantmanagement; Wat is er nieuw? voor personeel en klanten.
- Doelgroepen gelden gezamenlijk per organisatie en portaal. Releaseonderdelen
  erven de bovengrens of beperken die verder; verborgen inhoud telt nergens mee.
- Voortgang, publicatie en handmatige beschikbaarheid blijven gescheiden.
- In-appmeldingen gebruiken de bestaande queue, deduplicatie en actuele bronrechten.
- Private, gescande bijlagen, idempotente opdrachten, behandel- en beheerhistorie,
  ontvangersvoorbeelden en verversing zonder gedeelde private caches.

Deze kandidaat is bestemd voor ontwikkel/test en staging. Productie blijft 1.0.0. Zie
[versiebeheer](docs/releases/versioning.md) voor de releaseafspraken.

## 1.0.0 - 2026-10-09

Formele baseline op verzoek van de eigenaar, inclusief de bestaande V1-portalen
en onderstaande verbeteringen.

- Platform-supportteam: mailuitnodiging, OTP-login, vier expliciete supportrechten,
  tenantbereik, herkenbare behandelaars, profielbeheer, intrekking en activiteit.
- Supportcockpit met directe links naar reactie nodig, niet toegewezen en
  verstreken termijnen. Supportaccounts landen in hun eigen platform-shell.
- Gecontroleerde ticketketen van personeel en klanten via de tenant naar Fieldgrid,
  met afzonderlijke notities en een expliciet terug te sturen antwoordconcept.
- Werkbon vrijgeven vanuit het planbordmenu, planborddetail, werkbonnenlijst en
  werkbondossier, via dezelfde versievaste publicatieopdracht.
- Reistijd sluit op dezelfde hoogte aan op de bijbehorende werkbon; tijdtekort
  blijft zichtbaar en bedienbaar.
- Gedeelde dashboardcomponenten, consistente tabbladen, formulieren, overlays,
  paginatie, tenantlogo's, zoekfunctie en compacte actieknoppen.
- Managementrollen met OTP-uitnodigingen en expliciete rechten, klantenportaal,
  eigen tenantdomeinen en een personeels-PWA met gecontroleerde installatieprompts.
- Adresaanvulling start uitsluitend vanuit straatnaam en postcode;
  huisnummer, huisletter en toevoeging blijven gewone invoervelden.
- OpenRouteService voor routeberekening; Google Routes staat uit. Adresverrijking
  gebruikt de ingestelde OpenStreetMap/PDOK-adapters.

### Ontwikkelbasis — 29 september 2026

### Toegevoegd

- Volledige multi-tenant V1 voor backoffice, personeels-PWA en veilige externe offerte-, boekings- en betaallinks.
- Supabase-schema met geforceerde RLS, private Storage, audittrail, idempotente domeinfuncties en versievaste migraties.
- Werkbonplanning, dispatch, tijdregistratie, rapportcorrecties, meerwerk, facturatie en Mollie-reconciliatie.
- Factuurmail via SendGrid v3 Mail Send, met tenantafzendercontrole, onveranderlijke PDF-bijlage en dubbele-verzendbeveiliging.
- Web Push/outbox-worker, routeprovider-integratie en expliciete providerfoutafhandeling.
- Herbruikbare CI voor `main` en expliciete, atomaire promotie van een bewezen
  `main`-SHA via branch `staging` en de exclusief gelabelde stagingrunner,
  inclusief Playwright-gate, preflight, backup, healthcheck en coderollback.
- Fail-closed staging-tenantroutering op `{slug}.staging.fieldgrid.nl`, met
  `/app` en `/staff` als werkruimtes en projectref-guards rond iedere
  stagingdatabaseverbinding.
- Private tenantlogo-upload en -weergave in backoffice, personeels-PWA en veilige externe flows.
- Aparte platform-backoffice op `/platform` met tenantoverzicht, herstelbare zesstaps-onboarding, huisstijl-, module- en communicatiebeheer.
- Vier tenantgebonden, versievaste berichttemplates voor facturen, prijsopgaven, nieuwe werkbonnen en planningswijzigingen, inclusief live HTML- en pushpreview.
- HTML- en tekstmail via SendGrid voor facturen en prijsopgaven, met veilige transactielinks en vastgelegde template- en brandingsnapshot per verzending.
- Fieldgrid-basishuisstijl met `#222C35` als primaire kleur en `#41AC42` als secundaire kleur voor platform en nieuwe tenants.
- Module-entitlements als autorisatiegrens in navigatie, server actions, RLS en database-triggers, inclusief security-definer RPC-bescherming.
- Platformbeheerde whitelabel-entitlement: tenantlogo's staan zonder dubbele naam/subtitel, Fieldgrid-attributie staat onderin de sidebar zolang whitelabel uitstaat en tenantkleuren gelden in de volledige werkruimte.
- E-mailheaders tonen uitsluitend het tenantlogo of, zonder logo, de tenantnaam; de veilige tenantwebsitelink staat in de voettekst.
- Unit-, databasecontract-, RLS-, browser- en visuele regressietests.
