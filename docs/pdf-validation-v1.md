# PDF-validatie v1.0

## Doel

Deze notitie hoort bij #TAAK-18 en beschrijft welke rapport- en factuur-PDF's in de huidige versie gecontroleerd zijn of voorbereid zijn voor acceptatie op staging.

## Beschikbare PDF's

| PDF | Route | Toegang | Opmerkingen |
| --- | --- | --- | --- |
| Rapportage-PDF | `/api/reports/[id]/pdf` | Backoffice met `reports:read`; niet-management alleen eigen rapport | Alleen goedgekeurde rapporten. Toont uitvoerder als Veele Services, geen personeelsnamen. |
| Backoffice factuur-PDF | `/api/invoices/[id]/pdf` | Backoffice met `invoices:read` | Zelfde opmaak als e-mailbijlage. Toont werkzaamheden, meerwerk, materiaal/verbruik en totalen. |
| Klant factuur-PDF | `/api/factuur/[id]/pdf` | Klantportaal via `customer_users` + `customer_id` | Geen autorisatie op alleen e-mail. Alleen verzonden, betaalde of geannuleerde facturen. |
| Backoffice verzamelfactuur-PDF | `/api/invoices/batches/[id]/pdf` | Backoffice met `invoices:read` | Toont batchregels, korting, toeslag, BTW en totaal. |
| Klant verzamelfactuur-PDF | `/api/verzamelfactuur/[id]/pdf` | Klantportaal via `customer_users` + `customer_id` | Geen interne batchnotities zichtbaar. |

## Privacygrenzen

- Klantgerichte PDF's tonen geen personeelsnamen.
- Rapportage-PDF toont "Veele Services" als indiener/goedgekeurde uitvoerder.
- Klantgerichte factuur-PDF's gebruiken `customer_users` scope en niet alleen `user.email`.
- Interne batchnotities staan alleen in de backoffice verzamelfactuur-PDF.
- Factuur-PDF's tonen alleen factureerbare regels.

## Financiele controles

- Factuur-PDF toont subtotaal exclusief BTW, BTW en totaal inclusief BTW vanuit de opgeslagen factuurwaarden.
- Factuurregels worden opgebouwd uit werkzaamheden, meerwerk en materiaal/verbruik.
- Verzamelfactuur-PDF toont:
  - subtotaal;
  - BTW;
  - korting;
  - toeslag;
  - totaal te betalen.
- Verzamelfactuurregels gebruiken de bedragen uit `customer_payment_batch_items`, zodat het batchbedrag aansluit op de Mollie-betaalbatch.

## Staging smoke test

1. Open backoffice en ga naar een goedgekeurd rapport.
2. Klik `Download PDF`.
3. Controleer dat het rapport professioneel oogt en geen personeelsnamen toont.
4. Open backoffice en ga naar een factuurdetailpagina.
5. Klik `Download PDF`.
6. Controleer werkzaamheden, meerwerk, materiaal/verbruik en totalen.
7. Maak of open een verzamelfactuur bij `Facturen`.
8. Klik `PDF controleren`.
9. Controleer batchregels, BTW, korting/toeslag en totaal.
10. Log in als klant en download een losse factuur via het klantportaal.
11. Log in als klant en download een verzamelfactuur via `Betalingen`.
12. Controleer dat geen interne notities of personeelsnamen zichtbaar zijn.

## Lokale verificatie

De relevante TypeScript-projecten zijn gecontroleerd met:

```bash
tsc -p artifacts/backoffice/tsconfig.json --noEmit --pretty false
tsc -p artifacts/klant-pwa/tsconfig.json --noEmit --pretty false
```

Visuele rendering naar PNG vereist Poppler (`pdftoppm`). Als Poppler lokaal beschikbaar is:

```bash
pdftoppm -png input.pdf output-prefix
```
