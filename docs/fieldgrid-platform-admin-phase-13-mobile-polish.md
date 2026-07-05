# Fieldgrid platform-admin fase 13 - Mobile responsiveness en UI polish

Datum: 2026-07-05
Branch: `codex/platform-mobile-polish-v1`

## Scope

Fase 13 maakt de bestaande platform-admin oppervlakken consequenter bruikbaar op telefoon, tablet en desktop.

Gecontroleerde oppervlakken:

- `/platform`;
- `/platform/tenants`;
- `/platform/tenants/:tenantId`;
- `/platform/tenants/:tenantId?tab=domains`;
- `/platform/tickets`;
- `/platform/security`;
- aanvullende routes via dezelfde shell: operations, staging smoke, subscriptions, notifications, users, settings en onboarding.

## UI-aanpassingen

- `.platform-page` voorkomt horizontale body-overflow en normaliseert touch targets.
- `.platform-scroll-x` maakt brede tabellen en tabbars expliciet swipebaar.
- `.platform-tab-strip` voegt scroll-snap toe voor tenantdetail tabs en onboarding stappen.
- `.platform-long-text` laat lange domeinen, UUID's, DNS-records, smoke commands en auditwaarden netjes breken.
- `.platform-empty-state` maakt lege staten consistent.
- Platform shell:
  - mobile drawer krijgt een viewport-bound max-width;
  - navigatielinks hebben grotere touch targets;
  - header blijft compact op kleine schermen.
- Tenantdetail:
  - tabs blijven leesbaar en swipebaar;
  - DNS-instructies en custom-domain waarden breken zonder horizontale overflow;
  - subscriptiontabel gebruikt het gedeelde scrollgebied.

## Screenshot smoke

Uitvoerbaar commando:

```text
pnpm fieldgrid:platform-phase13-visual-smoke
```

Belangrijke environmentvariabelen:

```text
FIELDGRID_PLATFORM_PHASE13_BASE_URL=https://admin.fieldgrid.nl
FIELDGRID_PLATFORM_PHASE13_COOKIE=<ingelogde platform-admin cookie>
FIELDGRID_PLATFORM_PHASE13_TENANT_DETAIL_PATH=/platform/tenants/<tenant-id>
FIELDGRID_PLATFORM_PHASE13_OUT_DIR=artifacts/platform-mobile-polish
```

Viewports:

- `390x844` mobiel;
- `768x1024` tablet;
- `1440x1100` desktop.

De runner maakt screenshots en schrijft `artifacts/platform-mobile-polish/phase13-visual-smoke.json`. De smoke faalt als:

- de pagina horizontale document-overflow heeft;
- zichtbare interactieve elementen kleiner zijn dan 32px;
- een target met HTTP 500 of hoger terugkomt.

## Acceptatie

- Geen horizontale overflow op de platform shell en kernpagina's.
- Lange domeinen, UUID's en DNS-records breken binnen hun kaart.
- Tenantdetail tabs en onboarding stappen blijven touchvriendelijk.
- Tables gebruiken desktop-scroll of mobile cards.
- Empty states zijn consistent.
- Screenshot-smoke is klaar voor staging/CI zodra Playwright en een platform-admin sessie beschikbaar zijn.
