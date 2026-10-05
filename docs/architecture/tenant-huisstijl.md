# Centrale tenant-huisstijl en portaal-backoffice

Status: geïmplementeerd; definitieve browser-, CI- en stagingacceptatie volgen.
Zie de [lokale integratiecontrole](../security/portal-release-verification-2026-10-05.md).

De eigenaarsopdracht van 5 oktober 2026 brengt de bestaande tenantbackoffice
in dezelfde portaalstijl als personeel en klanten. De huidige routes,
bevoegdheden, modules, domeinacties en managementinformatie blijven intact.
De algemene platformomgeving blijft tenantneutraal.

## Eén bron, gedeelde afgeleide tokens

`tenant_branding.primary_color`, `accent_color` en `logo_path` blijven de
enige opgeslagen huisstijlbron. Tenantnaam, juridische bedrijfsgegevens,
afzendergegevens en documentconfiguratie blijven in hun bestaande registratie.
Er komt geen concurrerende huisstijltabel of secundaire-kleurveld.

`createBrandPalette` en `brandThemeStyle` leiden leesbare semantische rollen af;
`portalThemeStyle` koppelt diezelfde rollen aan het klantportaal. Management en
klanten gebruiken dezelfde afgeleide tenantrollen.
De standaardkleurzaden blijven `#222C35` en `#41AC42`; de afgeleide primaire
actie is `#368341`, zoals in de portaalprototypes. Fout-, waarschuwing- en
succeskleuren blijven statuskleuren, geen merkzaden.

De vervolginstructie van de eigenaar op 5 oktober vraagt voor de personeelsapp
een exacte kopie van het groen/grijze prototype. `/staff` en de gedeelde
personeelsschil voor tickets/notificaties gebruiken daarom
`personnelThemeStyle`: de vaste Fieldgrid-identiteit, witte kaarten en neutrale
navigatie. Tenantkleuren blijven de bron voor management, klanten en externe
tenantpagina's; deze personeelsuitzondering schrijft geen andere huisstijl op.

Tickets blijft zichtbaar in de personeelsnavigatie. Wanneer de module uitstaat,
opent de ingang alleen een uitleg over activering via de platformmodules.
Bij een actieve module opent de bestaande ticketroute. De huidige RPC-,
sessie-, module- en inhoudsrechten blijven gelden; zichtbaarheid activeert de
module niet en verleent geen tickettoegang.

Branding staat al in de serverrender. Bewaren invalideert `/app`, `/staff`,
`/klant` en tenantgebonden `/login`; bestaande coarse-revision kanalen melden
alleen een invalidatie, nooit brandingrijen of privédossiers. Geopende
formulieren houden hun eigen concept en bronversie bij een refresh.
Actuele logo's krijgen een gecontroleerde versie-URL en geen herbruikbare
langdurige cache. De bestaande expliciet bevroren mailassets blijven immutable.

## Beheer en herstelbare wijzigingen

Alleen actuele `management`- of `tenant_admin`-leden binnen de hostname-tenant
mogen wijzigingen opslaan. De server accepteert geen tenant-ID, extern logo-URL
of opslagpad uit het formulier. Kleuren, afzendergegevens en eventuele
logovervanging/verwijdering worden samen opgeslagen met CAS op de bestaande
`updated_at`-bron. Een monotone timestamptrigger voorkomt dat een succesvolle
wijziging dezelfde bronversie houdt. Bij een conflict blijft het concept bestaan.

Het live voorbeeld heeft geen opslageffect. Annuleren herstelt het geladen
concept; terugzetten naar de Fieldgrid-standaard wijzigt alleen het concept
(kleurzaden en logo), tot de beheerder werkelijk opslaat. Afzender-, juridische
en bankgegevens worden niet gereset. Logo verwijderen ontkoppelt alleen het
actuele logo; historische bytes worden niet verwijderd.

Nieuwe uploads gebruiken het bestaande immutable private Storage- en
ClamAV-contract. Alleen PNG/JPEG/WebP tot 2 MB, maximaal 4096 pixels per zijde
en maximaal 16 miljoen pixels; werkelijk gedecodeerde afbeeldingmetadata
moet bij het formaat passen. Animatiechunks in PNG/WebP worden ook apart
geweigerd, zodat een decoder die alleen het eerste frame toont geen animatie
doorlaat. Geen SVG, animatie of willekeurige externe fetch.
De actuele beheerbevoegdheid wordt opnieuw gecontroleerd na scan/upload en
vóór de metadatawijziging. Reeds uitgegeven PDF's en mailassets veranderen niet.

## Bestaande module naar gedeelde component/stijl

| Bestaand onderdeel | Behouden inhoud en acties | Gedeelde portaaluitwerking |
| --- | --- | --- |
| `/app`, navigatie en header | Module-entitlements, aandacht, tenantkeuze, notificaties, uitloggen | `BackofficeShell`, centrale tokens, 232px sidebar, 82px header |
| Aanvragen/offertes | Lijsten, concrete versies, wizard, prijs/acceptatie/mailacties | Bestaande commercial components, compacte filters, kaart/formulier/dialog-adapter |
| Planbord | Drag/drop, reistijd, medewerkers, publicatie, ongedaan maken, uitvoeringshistorie | Bestaande planboard, eigen scrollgebied en passende compacte bediening |
| Werkbonnen | Lijst/dossier, taken/checklists, rapport/controle, gerelateerde dossiers | Bestaande work-order components, gedeelde tokens en vaste dialogframe |
| Taken/tarieven/templates | Catalogus, versieprijzen, meerwerk en templatebeheer | Bestaande formulieren/tabellen; portaalknoppen, velden en tabs |
| Klanten | Lijst, dossier, contacten, afspraken, documenten, contracten, toegang | Bestaande customer components, geen managementvelden verwijderd |
| Objecten | Lijst, dossier, structurele instructies, vault, bezoeken, documenten | Bestaande object components; interne/vaultrechten blijven onveranderd |
| Personeel/opvolging | Lijst, dossier, HR/kwalificaties, verlof/urencorrecties, acties | Bestaande personnel components; interne identiteit zichtbaar waar bevoegd |
| Rapportcontrole/facturen | Besluiten, bewijs, factuurregels, betaling, PDF/mail | Bestaande resource/finance components; statuskleuren blijven herkenbaar |
| Nieuws/meldingen/support/notificaties | Campagnes, inbox, tickets, rechten, uploads en instellingen | Bestaande engines/components; gedeelde kaart/tabel/dialogafwerking |
| Instellingen | Huisstijl/afzender, nummering, reizen, ondertekening | Centrale Huisstijl-editor plus alle bestaande instellingen |
| Leeg/laden/fout | Huidige veilige fout- en modulegrenzen | Gedeelde typografie, kleuren, spacing en focusstijl |

Alle dialogframes zijn maximaal 860px breed en 90dvh hoog; tot en met 600px
worden ze schermvullend. Header/footer blijven vast, inhoud scrolt intern en
tabwissels veranderen de buitenmaat niet. Native/Radix focusherstel, Escape,
inert achtergrond, conceptverlieswaarschuwingen en busyguards blijven behouden.

## Verificatie vóór release

Controleer alle modules op 1440/1024/768/390/320px, ruime tabellen/planbord,
langere labels, foutmeldingen, focus en vaste acties. Test standaard, twee
verschillende tenants, opslaan/annuleren/default en onbevoegde verzoeken;
ongeldige/grote/afwijkende logo's; doorwerking in drie portalen en login;
bevroren historische PDF's tegenover nieuwe versies. Pas na daadwerkelijke
browser-, document-, database- en releasegates wordt acceptatie vastgelegd.

## Lokale review van 5 oktober 2026

De centrale dialogcomponent neemt het tenantthema via React-context mee naar
Radix-portals. De portaaladapter raakt alleen dialogen met die context; een
eerder bezochte tenantpagina verandert de platformomgeving niet. Het mobiele
menu gebruikt een inert hoofdscherm, focust de navigatie en herstelt de focus
bij Escape of sluiten. Het planbord houdt rekening met de nieuwe 82px-header.

`BackofficeLive` luistert uitsluitend naar de bestaande
`staff_workspace_revisions`-teller en ververst na reconnect/focus of een gemiste
update. De management-leespolicy op die tabel geldt ook zonder optionele
modules. Actuele sessie en tenantlidmaatschap blijven vereist. De unieke
huisstijlmigratie is `20261005065200_tenant_house_style_consistency.sql`.

De 79 gerichte unitcases in `lib/branding` controleren kleurcontrast, veilige
logo-URL's en uploads, autorisatie, tenantwissels, CAS-conflicten en de
volgorde scannen–opnieuw autoriseren–opslaan. De databasefixture
`scripts/test-tenant-house-style.mjs` controleert monotone bronversies,
ongeldige oude schrijfpogingen, coarse invalidatie en ingetrokken toegang.
`tests/e2e/tenant-branding.spec.ts` bevat de browserscenario's voor live
voorbeeld, annuleren, opslaan, gelijktijdige concepten, reset, ongeldige upload,
vijf schermbreedtes en gebrande dialogen. Uitvoering daarvan en stagingacceptatie
worden apart vastgelegd; alleen de aanwezigheid van tests geldt niet als bewijs.
