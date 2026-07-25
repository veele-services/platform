# Fieldgrid klantportaal fase 4 - Informatiearchitectuur

Datum: 2026-07-05
Status: geleverd
Scope: `artifacts/klant-pwa`

## Hoofdstructuur

Het klantportaal gebruikt vanaf fase 4 een taakgerichte hoofdstructuur:

| Gebied | Route | Doel |
| --- | --- | --- |
| Overzicht | `/` | Startpunt met status en snelle acties. |
| Opdrachten | `/opdrachten` | Opdrachtstatus, aanvragen, planning en historie. |
| Objecten | `/objecten` | Locaties, objectgegevens en objectdocumentatie. |
| Support | `/meldingen/tickets` | Tickets bekijken en een vraag stellen. |
| Offertes | `/offertes` | Offertes en akkoordstatus bekijken. |
| Facturen | `/facturen` | Facturen, betaalstatus en bestaande betaalopties bekijken. |
| Documenten | `/documenten` | Gedeelde bestanden en downloads. |

`Aanvragen` is geen hoofdnavigatie meer. Het is een actie binnen `Opdrachten` via `/opdrachten/aanvragen`.
`Afspraken` wordt niet meer als klantportaalnavigatie gebruikt; de consistente term is `Opdrachten`.

## Desktop

Desktop toont de hoofdgebieden direct in de sidebar:

- Overzicht
- Opdrachten
- Objecten
- Support
- Offertes
- Facturen
- Documenten

De factuuringang markeert ook `/financieel`, `/facturen` en `/betalingen` als actief. Offertes behouden een eigen taakgerichte ingang. Support markeert `/meldingen` en onderliggende ticketroutes als actief.

## Mobiel

De mobiele bottom nav heeft vijf vaste items:

- Overzicht
- Opdrachten
- Objecten
- Support
- Meer

`Meer` bevat de minder frequente maar belangrijke gebieden:

- Offertes
- Facturen
- Documenten
- Rapportages
- Meldingen
- Profiel
- Beveiliging
- Instellingen

Hiermee blijven offertes, open facturen en documenten binnen twee tikken bereikbaar: `Meer -> Offertes`, `Meer -> Facturen` en `Meer -> Documenten`.

## Financieel Werkgebied

`/financieel` is de vaste finance hub. Deze pagina groepeert:

- `/facturen`
- `/betalingen`
- `/offertes`

De hub toont een compacte summary voor open facturen, open betaalacties en offertes die akkoord vragen.

## Moduleflags

| Moduleflag | Routes | Navigatiegedrag | Empty state |
| --- | --- | --- | --- |
| `finance` | `/financieel`, `/facturen`, `/betalingen`, `/offertes` | Desktop sidebar toont Offertes en Facturen alleen wanneer finance actief is. | Finance-pagina en onderliggende pagina's tonen bestaande lege lijsten wanneer er nog geen data is. |
| `documents` | `/documenten` | Desktop sidebar toont Documenten alleen wanneer documenten actief zijn. | Documentenpagina toont "Geen documenten beschikbaar". |
| `reporting` | `/rapporten` | Rapportages staan onder Meer en worden als secundair gebied behandeld. | Rapportagespagina toont bestaande lege rapportagelijst. |

## Acceptatiecheck

- Opdrachtstatus: `Overzicht/Opdrachten -> opdracht`.
- Open factuur: `Facturen -> factuur`.
- Ticket: `Support -> ticket` of nieuw ticketformulier.
- Document: `Documenten` op desktop, `Meer -> Documenten` op mobiel.
