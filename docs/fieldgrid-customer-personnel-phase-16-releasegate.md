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
- geauthenticeerde Playwright-screenshots voor de volledige responsive matrix;
- HTTP-status-, onverwachte route- en auth-redirectasserties;
- mobiele `44x44` touch-targetcontrole;
- Axe serious/critical, toetsenbordfocus en `200%` zoom.

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

In plaats van cookies kunnen Playwright storage states worden gebruikt:

```bash
FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE="/absoluut/pad/customer.json" \
FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE="/absoluut/pad/personnel.json" \
pnpm fieldgrid:customer-personnel-final-gate
```

Strict release-evidence mode:

```bash
FIELDGRID_CUSTOMER_PORTAL_BASE_URL="https://veele.fieldgrid.nl/klant" \
FIELDGRID_PERSONNEL_PORTAL_BASE_URL="https://veele.fieldgrid.nl/personeel" \
FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE="/absoluut/pad/customer.json" \
FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE="/absoluut/pad/personnel.json" \
FIELDGRID_CUSTOMER_OBJECT_PATH="/objecten/<id>" \
FIELDGRID_CUSTOMER_ASSIGNMENT_PATH="/opdrachten/<id>" \
FIELDGRID_PERSONNEL_ASSIGNMENT_PATH="/opdrachten/<id>" \
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
- HTTP-status, uiteindelijke URL en controle op onverwachte login/onboardingredirects;
- Axe- en toetsenbordfocusresultaten;
- resterende P1/P2 backlog voor ontbrekende ingelogde evidence of concrete detailroutes.

## Viewports

- Mobile: `320x568`, `390x844` en `430x932`.
- Tablet: `768x1024`.
- Tablet landscape: `1024x768`.
- Desktop: `1280x800`, `1440x1100` en `1920x1080`.
- Zoom: `200%` bij een viewport van `1024x768`.

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
- meldingen en tickets;
- hulpcentrum, Wat is nieuw en idee insturen;
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
- hulpcentrum, Wat is nieuw en idee insturen.

## Gategedrag

De gate faalt op:

- ontbrekende vaste routes;
- kapotte lokale hrefs in app- en componentcode;
- `confirm`, `alert` of `prompt` in klant- of personeelsappcode;
- onafgemaakte security-copy zoals `MFA/TOTP`, `TODO`, `coming soon` of `not implemented`;
- notification hrefs die naar een verkeerde doelgroepapp wijzen;
- ontbrekende of foutieve HTTP-responses;
- redirects naar login, wachtwoordwijziging, contextkeuze of onboarding;
- een onverwacht eindpad voor een geauthenticeerde portalroute;
- horizontale overflow of server-side application errors;
- mobiele interactieve elementen kleiner dan `44x44`;
- ontbrekende zichtbare toetsenbordfocus;
- serious/critical Axe-overtredingen;
- ontbrekende screenshots voor concrete detailroutes in strict mode.

Zonder staging base-urls blijft de screenshotsectie expliciet als P1
evidence-backlog staan. De statische check claimt dan geen runtimebewijs. Voor een
releasecandidate is strict evidence verplicht; incomplete onboarding-accounts zijn
geen geldige storage state voor deze gate.

## Visuele baselinevergelijking

De generieke visual-regressionrunner vergelijkt in strict runtime-modus elke
nieuwe PNG met de goedgekeurde baseline via Playwrights PNG-comparator. De
standaardtolerantie is maximaal `0,1%` afwijkende pixels met een
pixelmatch-kleurdrempel van `0.2`. Hierdoor falen echte layout- en
stijlregressies, terwijl minieme antialiasingverschillen niet direct tot een
false positive leiden. Bij een afwijking wordt ook een `.diff.png` geschreven.

```bash
FIELDGRID_VISUAL_REGRESSION_BASELINE_DIR="tests/visual-regression/baselines" \
pnpm fieldgrid:visual-regression-snapshots:run -- \
  --target customer-portal \
  --strict
```

Een ontbrekende of gewijzigde baseline faalt strict mode. Alleen bij een bewust
beoordeelde UI-wijziging worden nieuwe baselines aangemaakt:

```bash
pnpm fieldgrid:visual-regression-snapshots:run -- \
  --target customer-portal \
  --update-baselines
```

De tolerantie is desgewenst strenger te zetten met
`--max-diff-pixel-ratio=0`, maar verruimen hoort alleen met expliciete
reviewmotivatie te gebeuren. PNG-SHA256-hashes blijven in het JSON-rapport
aanwezig voor bewijsintegriteit; zij bepalen niet zelfstandig of het beeld
regresseert.

De `--check`-modus voert dezelfde runtime- en baselinevergelijking uit zodra
voor alle geselecteerde persona's een base URL en storage state/cookie aanwezig
zijn. Zonder die configuratie rapporteert hij `manual` in plaats van ten onrechte
`ok`.
