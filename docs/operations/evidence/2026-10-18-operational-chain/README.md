# Visueel bewijs operationele ketens

Deze afbeeldingen zijn op 18 oktober 2026 vastgelegd door de lokale
Playwright-releasegate en daarna op inhoud, overflow, bediening en leesbaarheid
bekeken. Ze zijn bewijs van de lokale presentatie; ze vormen geen
stagingacceptatie.

| Bestand | Viewport | Gecontroleerd |
| --- | --- | --- |
| `capacity-day-1440.png` | 1440 × 900 | Dagfilters, kengetallen, concrete vraag, dekkingsstatus en aansluiting op het planbord |
| `capacity-week-390.png` | 390 × 900 | Weekstand, mobiele filtervelden, tweekoloms kengetallen, status en horizontaal bruikbaar planbord |
| `planboard-collapsed-capacity-768.png` | 768 × 900 | Compacte gesloten capaciteitrij; tijdlijn en twee personeelsrijen blijven zichtbaar |
| `staff-availability-1920.png` | 1920 × 900 | Vaste weekbeschikbaarheid en overige planningsvoorkeuren in de personeelsapp |
| `staff-availability-390.png` | 390 × 900 | Dezelfde invoer en toelichting zonder horizontale overflow op mobiel |
| `release-planboard-1440.png` | 1440 × 900 | Vrijgave vanuit het planbord met expliciet, begrensd afwijkingsveld |
| `release-list-390.png` | 390 × 900 | Dezelfde vrijgave vanuit de lijst als volledig bruikbaar mobiel venster |
| `release-dossier-1440.png` | 1440 × 900 | Dezelfde versievaste mutatie vanuit het werkbondossier |

Herkomst:

- `tests/e2e/planboard.spec.ts`, scenario's voor capaciteit en de vijf
  planborddoelbreedtes;
- `tests/e2e/staff-availability.spec.ts`, scenario voor de door Planning
  beheerde beschikbaarheidsweek;
- `tests/e2e/work-order-release.spec.ts`, één servermutatie bereikbaar vanuit
  planbord, lijst en dossier, gevolgd door dezelfde personeelsdispatch.

De financiële, contract-, kwalificatie- en betaalpresentaties zijn daarnaast
functioneel afgedekt in de volledige 135-scenario browsergate. De bijbehorende
servermutaties en invarianten worden bewezen door de database- en
integratiesuites; een lege PDF-iframe-screenshot is bewust niet als visueel
bewijs opgenomen.
