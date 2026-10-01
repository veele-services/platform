# Centraal notificatiesysteem — implementatiecontract

Status: lokaal geïmplementeerd en geverifieerd; nog niet
gecommitteerd of uitgerold. Zie het [verificatiebewijs](../support/notifications-verification.md).

## Uitgangspunt

De analyse uit de bijlage van 30 september verwijst naar een oudere bronversie.
De implementatie sluit aan op `74966d8c` en de lokale Tickets & Support-uitbreiding.
Tickets zijn dus een bestaande bron, geen fictieve toekomstige integratie.
De bestaande main → bewuste stagingpromotie-keten blijft ongewijzigd.

Een bronactie, een persoonlijke inboxmelding, een kanaalpoging en een
ontvangstbevestiging zijn afzonderlijke registraties. Een gelezen bericht
wijzigt geen werkbon, akkoord, handtekening, factuur of ticketstatus.

## Aansluitingen en eigenaarschap

| Bron | Bestaande registratie | Integratiegrens |
| --- | --- | --- |
| Planning/werkbonnen | `outbox_events`, actuele toewijzingen | Actuele ontvangercontrole, veilige melding, afzonderlijke apparaatpogingen |
| Nieuws | `announcements`, `announcement_reads` | In-app onafhankelijk van de optionele push; artikel blijft de bron |
| Personeelsdossiers | `personnel_dossier_deliveries` | Bestaande historie behouden; één centrale verzendeigenaar, generieke inhoud, actuele dossierbevoegdheid |
| Objecten/klantdossiers | SQL-notificaties en reminderfuncties | Dezelfde policy in de brontransactie; geen tweede insertpad |
| Aanvragen/offertes | `commercial_events`, `mail_deliveries` | Snapshot, documentversie, ontvanger en bestaande idempotentiesleutel behouden |
| Facturen | Definitieve factuur/PDF en `mail_deliveries` | Verzending afzonderlijk geblokkeerd; financiële bron blijft intact |
| Tickets | Ticketgebeurtenissen en kanaal-/apparaatclaims | Centrale blokkades bovenop actuele gesprek- en doelgroeprechten |
| Handmatige berichten | Nieuwe campagnebron | Vastgelegde ontvangerselectie; actuele rechten opnieuw toetsen bij uitvoering |
| Apparaten | `push_subscriptions` | Eigen account, sessie, origin en toegestane appcontext; intrekken bij afmelden |
| Autorisatie | `permission_catalog`, `permission_grants` | Expliciete capabilities, geen tweede rollenregister of platforminhoud-bypass |

## Beslisregel

Een verzending vereist gelijktijdig toestemming van platform, tenant,
omgeving, type, kanaal, bronautorisatie en toepasselijke persoonlijke voorkeuren.
Een lagere instelling heft een hogere blokkade nooit op. Een ontbrekende
bronadapter wordt niet als werkende verzendoptie aangeboden.

De database is gezaghebbend voor beleid, revisies en claims. Een controle bij
het tonen van de pagina vervangt nooit de controle vlak vóór aflevering.
Alle gebruikersmails en pushes moeten via de centrale providergrens lopen.
Authenticatie en expliciete beveiligingsverificaties blijven afzonderlijke,
benoemde beveiligingsflows. Offerte- en factuurmails zijn geen uitzondering.

Een uitschakeling weigert direct nieuwe afleverpogingen. Reeds toegelaten,
lopende providerpogingen blijven zichtbaar totdat ze zijn afgehandeld;
uitschakelen kan een reeds aangenomen e-mail of push niet terughalen.
Onderdrukte gebeurtenissen worden bij herinschakelen niet automatisch ingehaald.
Dit geldt ook vóór de eerste workerclaim: de brontransactie legt de geldende
blokkades vast. Een latere fout bij berichtvoorbereiding mag een onderdrukte
claim niet opnieuw als herkansbare fout markeren.

Vóór opslaan toont de beleidseditor het actuele actieve-tenantbereik, de
werkruimte, typen en kanalen, inclusief een waarschuwing voor geraakte offerte-
en factuurmails. De globale telling vereist de globale beheerbevoegdheid en
geeft geen aanvullende tenantnamen of berichtinhoud vrij.

Planwijzigingen worden standaard 30 seconden gebundeld per medewerker,
werkbon en planningsdag. De beleidseditor ondersteunt 0–300 seconden en
overerving. Alleen nog niet aangeboden berichten kunnen worden samengevoegd;
de oorspronkelijke gebeurtenissen blijven herleidbaar. Een vervallen
toewijzing geeft een veilige melding, geen hernieuwde toegang tot de werkbon.

## Bewijs en release

Nieuwe migraties zijn aanvullend: bestaande inbox-ID's, leesstatus,
mailclaims, brongegevens en ticketgeschiedenis blijven behouden. Lokale SQL-,
integratie-, component- en browsercontroles gebruiken uitsluitend herkenbare
testdata. Provideracceptatie is geen bewijs van zichtbare aflevering.

Fysieke Android/desktop- en iOS-beginschermcontroles en de echte stagingworker
zijn aparte acceptatiepunten; browsermocks gelden daarvoor niet als bewijs.
De nog openstaande staging-scannerconfiguratie uit Tickets & Support blijft
een releasevoorwaarde. Geen productieacties en geen legacy-configuratiefallbacks.

## Gebruik en configuratie

- Platform: `/platform/notificaties`; tenantbeheer: `/app/notificaties`.
- Personeel: `/staff/notificaties`; gebonden klanten: `/klant/notificaties`.
- Elke omgeving heeft een eigen inbox, belletje en persoonlijke voorkeuren.
  Lezen, archiveren en ontvangst bevestigen zijn afzonderlijke acties.
- Beheer gebruikt het bestaande capabilityregister. Platformbeheer geeft niet
  automatisch toestemming om de inhoud van tenantberichten te lezen of namens
  tenants te verzenden. Gevoelige delegatie vereist recente, sessie- en
  inhoudgebonden e-mailverificatie; ticketbevoegdheden zijn geen vervanging.
- Handmatige campagnes leggen de bevestigde ontvangers vast. Actuele
  toegang, beleidsblokkades en actieve apparaten worden bij aflevering opnieuw
  gecontroleerd. Een campagne mag geen nieuwe selectie afleiden uit een oude
  bevestiging. Nieuwe soorten automatische meldingen zijn opt-in waar nog geen
  bestaande verzendafspraak aanwezig was.
- SendGrid gebruikt de bestaande `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` en
  `SENDGRID_FROM_NAME`. Push gebruikt de bestaande VAPID-configuratie. Er is
  geen tweede mailprovider of nieuwe notificatiesecret nodig.
- De bestaande worker verzorgt fan-out, rusttijden en begrensde herkansingen.
  Een onzekere provideruitkomst is geen veilige retry. HTTP 202 bij SendGrid
  betekent aangenomen, niet bewezen bezorgd of gelezen.
- Zoeken in de afleverhistorie gebruikt uitsluitend reeds toegestane labels,
  type, werkruimte, kanaal en toestand. Een zoekterm kan geen afgeschermde
  ontvangeridentiteit of verborgen berichttekst via tellingen onthullen.

Templates worden per type, omgeving en kanaal gepubliceerd. Tenantoverrides
blijven per veld herkenbaar. De eerste poging bewaart de concrete tekst,
huisstijl, link, documentpad en gebruikte templateversies; een veilige retry
gebruikt diezelfde versie. Commerciële bron- en akkoordgegevens blijven de
bestaande registraties. Rusttijden stellen gewone documentmails uit, zonder
de offerte of factuur terug te draaien. Accountactivatie en expliciete OTP’s
blijven beveiligingsflows en worden niet opgenomen in bewerkbare campagnes.
Historische mail-logo's zijn content-geadresseerd en beschermd tegen schrijven
of verwijderen via normale tenantopslagrechten. De download controleert de
inhoudshash; een aangepast bestand wordt niet als de oorspronkelijke versie
geserveerd.

## Migratie en terugzetten

Bestaande notificaties, leesmomenten, providerregistraties en aangepaste
tenanttemplates blijven behouden. Oude pushabonnementen gelden niet als een
actieve, geverifieerde sessie-/apparaatbinding: gebruikers activeren push
opnieuw vanuit hun eigen omgeving. De interface toont een actieve registratie
pas na een succesvolle serverbevestiging.

Database en worker vormen vanaf deze migratie één versiecontract. Oude workers
kunnen centrale outboxgebeurtenissen niet claimen en oude dossierclaimers zijn
geen tweede verzendeigenaar. Dit maakt een oude webrelease met rechtstreekse
SendGrid-aanroepen niet veilig: terugzetten vereist een notificatiecompatibele
web- én workerrelease. Zonder zo’n release blijven verzendingen gepauzeerd
totdat een gecontroleerde voorwaartse correctie beschikbaar is.

De verplichte CI bevat een voorwaartse migratietest met herkenbare lokale
historische fixtures en daarnaast de volledige schone migratieketen. Beide
moeten slagen voordat stagingpromotie in aanmerking komt.

## Grenzen en bewuste keuzes

- De gewone factuurmelding volgt de klantportaaltoegang tot de definitieve
  factuur en alle betrokken objecten. Een intern concept of alleen een
  ontbrekende PDF wordt niet als beschikbaar klantdocument gemeld.
- Een gecontroleerde automatische factuurherinnerbron ontbreekt nog in de
  bestaande administratie. `invoice.reminder` blijft daarom zichtbaar als
  niet aangesloten; de catalogus bouwt geen nieuwe debiteurenworkflow.
- Nieuwe klantmeldingen bij afspraakwijzigingen, onderweg en uitvoering zijn
  opt-in. Een klantcontact zonder portaalaccount kan uitsluitend een expliciet
  toegestane e-mail krijgen, geen fictieve inbox- of pushaflevering. Zo'n gewone
  melding linkt naar de publieke tenantwebsite, niet naar een onbereikbaar
  portaal. Bestaande beveiligde offerte-/factuurdocumentflows blijven apart.
- Pushtekst is een afzonderlijke veilige template, niet de privétekst uit een
  inbox of campagne. Een onveilige historische pushoverride blijft in de
  historie, maar krijgt een zichtbare waarschuwing en een veilige weergave.
- Een vooruitgeplande bronherinnering krijgt standaard geldigheid vanaf het
  geplande verzendmoment, niet vanaf het veel eerdere aanmaakmoment. Een
  expliciete einddatum blijft leidend. Actuele bronrechten worden opnieuw
  gecontroleerd bij iedere poging.
