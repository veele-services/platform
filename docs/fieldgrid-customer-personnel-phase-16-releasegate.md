# Fieldgrid customer/personnel phase 16 releasegate

Roadmap: `docs/fieldgrid-customer-personnel-portal-roadmap.md`

## Scope

Fase 16 valideert de aangepaste klantportaal- en personeelsappflows als releasegate:

- typecheck en build voor `@workspace/klant-pwa`;
- typecheck en build voor `@workspace/personeel-pwa`;
- route- en navigatiecontract voor klantportaal en personeelsapp;
- raw browser dialog scan voor kernflows;
- security-copy scan voor onafgemaakte productieplaceholdertekst;
- notification href contract voor customer, personnel en management/backoffice doelgroep;
- optionele Playwright screenshots voor desktop, tablet en mobiel.

## Commands

Lokale statische gate:

```bash
pnpm fieldgrid:customer-personnel-final-gate:check
```

Volledige screenshotgate tegen staging:

```bash
FIELDGRID_CUSTOMER_PORTAL_BASE_URL="https://veele.fieldgrid.nl/klant" \
FIELDGRID_PERSONNEL_PORTAL_BASE_URL="https://veele.fieldgrid.nl/personeel" \
FIELDGRID_CUSTOMER_PORTAL_COOKIE="<customer auth cookie header>" \
FIELDGRID_PERSONNEL_PORTAL_COOKIE="<personnel auth cookie header>" \
FIELDGRID_CUSTOMER_OBJECT_PATH="/objecten/<id>" \
FIELDGRID_CUSTOMER_ASSIGNMENT_PATH="/opdrachten/<id>" \
FIELDGRID_PERSONNEL_ASSIGNMENT_PATH="/opdrachten/<id>" \
pnpm fieldgrid:customer-personnel-final-gate
```

Strict release-evidence mode:

```bash
pnpm fieldgrid:customer-personnel-final-gate:strict
```

## Output

De runner schrijft:

- `outputs/customer-personnel-phase16-releasegate/phase16-releasegate.json`;
- `outputs/customer-personnel-phase16-releasegate/screenshots/*.png` wanneer base-urls zijn gezet.

De JSON bevat:

- statische checkresultaten;
- screenshotplan per viewport;
- screenshotresultaten;
- resterende P1/P2 backlog voor ontbrekende ingelogde evidence of concrete detailroutes.

## Viewports

- Mobile: `390x844`.
- Tablet: `768x1024`.
- Desktop: `1440x1100`.

## Klantportaal screenshotdekking

- dashboard;
- objecten;
- objectdetail via `FIELDGRID_CUSTOMER_OBJECT_PATH`;
- opdrachten;
- opdrachtdetail via `FIELDGRID_CUSTOMER_ASSIGNMENT_PATH`;
- aanvraagflow;
- financieel, facturen, betalingen en offertes;
- documenten;
- rapportages;
- meldingen/tickets;
- profiel, beveiliging en instellingen.

## Personeelsapp screenshotdekking

- dashboard;
- planning/opdrachten;
- opdrachtdetail via `FIELDGRID_PERSONNEL_ASSIGNMENT_PATH`;
- openstaand;
- uren;
- beschikbaarheid en verlof;
- berichten;
- meldingen;
- documenten;
- profiel, beveiliging en instellingen;
- nieuws.

## Gategedrag

De gate faalt op:

- ontbrekende vaste routes;
- kapotte lokale hrefs in app- en componentcode;
- `confirm`, `alert` of `prompt` in klant- of personeelsappcode;
- onafgemaakte security-copy zoals `MFA/TOTP`, `TODO`, `coming soon` of `not implemented`;
- notification hrefs die naar een verkeerde doelgroepapp wijzen;
- screenshotresultaten met horizontale overflow, server-side application errors of te kleine interactieve elementen.

Zonder staging base-urls blijft de screenshotsectie bewust als P1 evidence-backlog staan. Dat maakt lokale CI bruikbaar zonder secrets, terwijl de releasecandidate alsnog strict evidence kan eisen.
