# Codex-opdracht — bestaande Fieldgrid integreren met leidende Sites-UI

## Resultaat

Lever de goedgekeurde website en platformervaring op binnen `veele-services/platform`, met werkelijke domeinkoppelingen en behoud van de bestaande gebruikersprocessen. De Signature Grid-website heeft **https://www.fieldgrid.nl** als productiebestemming. Het platformbeheer en de tenantomgevingen behouden hun eigen bestaande host-/routecontracten.

Dit pakket is een overdracht, geen uitvoering op de doelrepo. Het geeft geen bewijs van een actieve productie- of stagingrelease. Voer implementatie en verificatie uit in de bedoelde ontwikkelomgeving; gebruik voor release de bestaande procedures, gates en autorisatie. Geen verborgen infrastructurele herinrichting, ongecontroleerde main-push, forcepush of automatische productiepromotie.

## Bindende prioriteiten

1. De actuele gebruikersopdracht, inclusief `www.fieldgrid.nl` en ‘UI/UX uit Sites is leidend’.
2. De actuele presentatie uit de vastgezette `source/platform/` en `source/marketing/` met het UI-contract in `docs/03`.
3. De huidige repo voor serverautorisatie, tenantisolatie, echte brondata, notificatie-/providerbeleid, architectuur en releasegates.
4. De implementatie- en acceptatiedocumenten van dit pakket.
5. Historische functionele verdieping onder `reference/historisch-v2/`, alleen waar die niet is vervangen.

Dit zijn verschillende verantwoordelijkheden: de oude repo-UI is geen reden om het Sites-ontwerp te negeren; een Sites-demo is geen reden om serverbeveiliging of bestaande functionaliteit te verwijderen. Leg een botsing vast met een concrete adapteroplossing.

## UI-overname

Gebruik broncode, geen reconstructie vanuit alleen screenshots. Behoud tokens, klassen, compositie, verhoudingen, typografie, iconen, tabcontainers, lichte schaduwen, blauwe accenten, grid, afbeeldingen, koppen, copy, CTA's, sticky gedrag, focus en modalinteracties. Splits componenten waar de repo dat vraagt, maar voorkom visuele drift.

De vier omgevingen zijn inbegrepen: tenantbackoffice, personeelsapp, klantportaal en platformbeheer. Bestaande volwaardige schermen mogen niet door beperktere demotabellen worden vervangen. Geef de bestaande processen de goedgekeurde presentatie. Management hoort in het gezamenlijke Overzicht; voeg geen concurrerend tweede startscherm toe.

Prototypewisselbalk, rolkeuze, reset, expliciete fictieve records en andere demohelpers horen niet als productiefunctie in de echte app. Het verwijderen daarvan vereist aangepaste sticky offsets, niet een andere shell. Neem bedrijfsteksten en fotoverhoudingen over; verwijder alleen referentie-/demodisclaimers die in productie feitelijk niet meer passen. Beschrijf zo'n gerichte copycorrectie.

## Functionele scope

| Gebied | Opdracht |
| --- | --- |
| Signature Grid | Alleen dit gekozen ontwerp; alle bestaande marketingroutes, content, sectoren, modules, menu's en CTA's compleet overnemen. |
| Host www | Expliciete marketinghost vóór tenantresolutie; canonieke www-URL's; bestaande routes voor platform en tenants behouden. |
| Websiteaanvragen | Contact/proefaanvraag en telefonische kennismaking/demo naar de platform-CRM-domeinlaag; gevalideerde invoer, blijvende registratie, duidelijke fout- en successtatus. |
| CRM | Zeven fasen, dossier, aanvraaghistorie, zoek-/filterweergaven, taken, opvolging, afspraakbeheer en notificatiestatus. |
| Platformoverzicht | Laatste goedgekeurde sectievolgorde zonder CRM-kopregel; gegevens uit dezelfde CRM-definities; alle acties verbonden. |
| Centrale mail | Bestaande provider/service, centrale policy/transport en outbox/worker; primaire platformbeheerder uit bestaande beheeridentiteit; geen extra adresveld. |
| Agenda | Vrijgegeven momenten, buffers, voorbereidingstijd, geblokkeerde dagen, boekingshorizon, conflicten, verplaatsen/annuleren en ICS. |
| Management en portalen | Bestaande goedgekeurde uitbreiding behouden/integreren; precieze bronkoppelingen, rollen, metrieken en werkelijke processen. |

Gebruik een ‘reeds aanwezig’-status alleen na inspectie van de huidige repo en relevante tests. Een route, tabel of toast is niet hetzelfde als een complete keten.

## Technische grenzen

- Behoud de repository-package manager, lockfile en frameworkarchitectuur. Sites gebruikt Vinext/Cloudflare en dient als referentie; er is geen opdracht om de doelrepo naar die stack te migreren.
- Neem `.openai`, Sites-workers, authheaders, servicetokens, hostnamen en D1-migraties niet blind over. Alle bronexports zijn leesbare referenties; exporteer geen productiegeheimen of gebruikersdata.
- Gebruik bestaande Supabase/Postgres-/authpatronen. Maak platform-CRM niet zichtbaar voor willekeurige tenantbeheerders en vermeng prospects niet met tenantklanten zonder expliciete conversie.
- Gebruik gerichte serverprojecties en paginatie voor groeiende CRM-lijsten. Het prototype haalt alle records op; productie hoeft dat implementatiedetail niet over te nemen.
- Leg intake, aanvraag, taak, outboxevent en slotreservering transactioneel vast. Mailverzending vindt na commit plaats. Herhalingen of racecondities mogen geen dubbele afspraak of aanvraag maken.
- De browser mag geen mailontvanger, platformrol of tenanttoegang bepalen. De eerste geregistreerde geldige platformbeheerder is geen willekeurig eerste Auth-account.
- Maak alleen voorwaartse migraties en test bestaande gegevens. Behoud historische provideruitkomsten en bestaande opt-outs.
- Gebruik de bestaande queue-/jobinfrastructuur. Geen tweede mailengine en geen browserinterval als bedrijfsworker. Auto-refresh voor zichtbare kaarten is wel presentatiegedrag.

## Uitvoeringsdiscipline

Lees actuele `AGENTS.md` en bestaande repo-instructies. Controleer HEAD en werkstatus; behoud ongeschreven en later werk. Vul de integratiematrix uit `docs/06` in. Werk in een passende branch/worktree. Houd migratienummering en gedeelde shell/CSS onder één eigenaar; onafhankelijke onderdelen kunnen parallel.

Werk tot de gevraagde integratie klaar en controleerbaar is. Bij een concrete blokkade: leg oorzaak, resterend werk en benodigde handeling vast; rond onafhankelijk werk wel af. Verander geen gates, rechten of testverwachtingen om een fout te verbergen. Gebruik `docs/07` als definitie van klaar, de verificatiestatus uit `docs/08` als eerlijk startpunt en de volledige schermen- en actiematrix uit `docs/09` als scopecheck. Lever per matrixrij de doelroute, broncomponent, data-aansluiting en status van implementatie, test en visuele vergelijking op.
