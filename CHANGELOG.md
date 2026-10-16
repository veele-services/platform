# Changelog

Alle relevante wijzigingen aan Fieldgrid worden in dit bestand vastgelegd.

## Nog niet uitgebracht

## 1.2.0-rc.1 — kandidaat

- Signature Grid-presentatie uit overdracht v3 voor de publieke Fieldgrid-site,
  platformbeheer, tenantmanagement en de personeels- en klantportalen.
- Expliciete marketinghostroutering voor `www.fieldgrid.nl`, met gescheiden
  publieke productuitleg en privéplatformbeheer; de bestaande APP_URL en
  tenantdomeinen blijven leidend voor hun eigen werkruimte.
- Werkelijk platform-CRM: pipeline, blijvende websiteaanvragen, dossiers,
  opvolgtaken, telefonische afspraken en instelbare beschikbaarheid.
  Beheerdersmeldingen gebruiken de bestaande primaire beheerregistratie en
  centrale notificatiepolicy, outbox, worker en SendGrid-service.
- Managementoverzicht en bronvensters voor opvolging, compliance, besluiten,
  SLA, facturatie, indexatie en weekrapporten, op bestaande native registraties
  en actuele, afzonderlijke toegangsrechten.
- Bronvensters en responsive portalweergaven met behoud van toegewezen werk,
  urencontrole, privébestanden, rapportversies, facturen, klantbinding en de
  beoordeelde ticketoverdracht van medewerker/klant via tenant naar Fieldgrid.
- Herstel van verloren/onzekere responses, de CRM-filterrace, optionele lege
  KvK-opslag, mobiele dialoogbediening en de expliciet geautoriseerde CRM-mailretry.
- Tenantgebonden inlogredirects en PWA-branding, werkende private PDF-voorbeelden,
  vaste formulieracties en aangesloten dossiertabbladen in de bronvensters.
  Ticketuploads behouden hun exacte origincontrole; de lokale tenant-testhost
  wordt afzonderlijk van HTTPS op staging en productie behandeld.
- De statuslegenda op het planbord blijft open bij klikken na aanwijzen en
  behoudt de bestaande bediening met Escape en buiten klikken.

Dit is een releasekandidaat. Lokale implementatie en tests betekenen geen
productiepublicatie, externe bezorging of liveacceptatie. De volledige
[scopecheck](docs/integration/sites-v3/screen-register.json) houdt die statussen
afzonderlijk bij. Definitieve publieke bedrijfs-/privacygegevens en de normale
review-, staging- en productieacceptatie blijven afzonderlijke stappen.

## 1.1.0 - 2026-10-14

Deze release bundelt de op staging gecontroleerde kandidaten `1.1.0-rc.1`
(Productbeheer) en `1.1.0-rc.2` (Kennisbank). Nieuwe functies volgen de bestaande
module-, rol- en portaalrechten.

### Productbeheer, roadmap en updates

- Platformbeheerders behandelen tenantideeën, houden interne notities bij en
  beheren ontwikkelingen, releases en de afzonderlijke releaseonderdelen.
- Tenantmanagement krijgt **Roadmap & updates**, met de ontwikkelingen en
  inzendingen van de eigen organisatie. Personeel en klanten krijgen
  **Wat is er nieuw?** met uitsluitend de voor hen gepubliceerde onderdelen.
- Publiceren, ontwikkelvoortgang en beschikbaarheid in staging/productie zijn
  afzonderlijke handelingen. Doelgroepen en eventuele gefaseerde uitrol zijn
  per organisatie en portaal instelbaar; ontvangersvoorbeelden helpen bij controle.
- Bijlagen blijven privé en worden gescand. Wijzigingen zijn versiegecontroleerd
  en herhaalde opdrachten worden ontdubbeld. Optionele aankondigingen gebruiken
  de bestaande in-appnotificaties en actuele toegangscontrole.

### Kennisbank en ondersteuning

- Centrale kennisbank voor platformbeheer, tenantbeheer, personeel en klanten, met
  46 uitgebreide Nederlandstalige artikelen, stappenplannen en veelgestelde vragen.
- Zoeken in titel, trefwoorden, samenvatting en inhoud, met Nederlandse woordvormen,
  relevante sortering, typefoutondersteuning, categorieën en paginatie.
- Vaste artikellinks, inhoudsopgave en toeganggefilterde verwante artikelen.
- Alleen platformbeheerders schrijven; concept, expliciete publicatie, archivering,
  versiegeschiedenis en herstel behouden de laatste gepubliceerde lezersversie.
- Een geopende editor behoudt onopgeslagen tekst bij live verversing; een
  concurrerende opslag blijft via de revisiecontrole geweigerd.
- Ticketbehandelaars zoeken artikelen voor de daadwerkelijke ontvanger, lezen ze
  in het gesprek en voegen een klikbare link toe aan een zelf te verzenden concept.
- Volledige bronanalyse en bruikbare productinhoud voor de toekomstige publieke website.

### Uitrol en naslag

- Productversie verhoogd van `1.1.0-rc.2` naar `1.1.0`; dependencies en
  runtimeconfiguratie behouden hun bestaande contracten.
- De productiepromotie omvat de reeds op staging gecontroleerde Productbeheer-
  en kennisbankmigraties. Bestaande historische migraties blijven onveranderd;
  de workflow maakt vóór toepassing een databasebackup.
- De initiële kennisbankinhoud vult ontbrekende artikelen aan. Latere
  beheerderswijzigingen worden bij een volgende deployment behouden.
- [Uitgebreide releasenotes en bediening](docs/releases/fieldgrid-1.1.0.md),
  [codebaseanalyse](docs/releases/codebase-analyse-2026-10-10.md) en
  [productbrief voor de publieke website](docs/product/publieke-website-functioneel-overzicht.md).
- De onveranderlijke tag `v1.1.0` wordt na succesvolle productieacceptatie op
  de werkelijk gedeployde SHA gemaakt, volgens het [versiebeleid](docs/releases/versioning.md).

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
