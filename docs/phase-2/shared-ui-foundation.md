# Phase 2 W06 — Shared UI foundation

Deze basis introduceert herbruikbare primitives voor tenant backoffice, personeel PWA en klant PWA zonder bestaande featurepagina's of businesslogica te herontwerpen.

## Contract

Gebruik `@workspace/shared-ui` voor nieuwe Phase 2 schermen. De package levert:

- layout: `SkipLink`, `PageContainer`, `PageHeader`, `SectionHeader`, `FilterBar`;
- datavisualisatie: `StatusBadge`, `MetricCard`, `DataTableShell`, `MobileCardList`, `MetadataRow`;
- staten: `EmptyState`, `ErrorState`, `LoadingSkeleton`, `InlineFeedback`, `ToastRegion`;
- formulieren en acties: `FormField`, `ConfirmDialog`, `ResponsiveDrawer`, `IconOnlyButton`;
- activiteit: `Timeline`, `TimelineItem`;
- status-contract: `statusTones`, `statusLabels` en `StatusTone`.

## Migratie-afspraken voor latere Phase 2 taken

1. Voeg bovenaan elke shell een `SkipLink` toe en geef de hoofdcontainer `id="main-content"` via `PageContainer`.
2. Gebruik `PageHeader` en `SectionHeader` voor nieuwe pagina's; plaats acties in de `actions` slot zodat mobiele wrapping voorspelbaar blijft.
3. Gebruik alleen `StatusBadge` met een semantische `StatusTone`. Maak geen feature-specifieke raw kleurmaps voor statussen.
4. Combineer `DataTableShell` op tablet/desktop met `MobileCardList` voor mobiel wanneer tabellen horizontaal onleesbaar worden.
5. Gebruik `FormField` voor label-, hint- en foutkoppeling. Interactieve controls moeten altijd een zichtbaar label of `aria-label` hebben.
6. Gebruik `IconOnlyButton` voor icon-only acties. Een label is verplicht en wordt ook als `title` gezet.
7. Markeer destructive acties met `destructive` op `ConfirmDialog` of de bestaande destructive button variant.
8. Gebruik `InlineFeedback` voor directe success/error meldingen en `ToastRegion` als polite live region voor tijdelijke meldingen.
9. Importeer de shared styles in surface globals zodat focusringen, touch targets, reduced motion en semantische status tokens beschikbaar zijn.

## Responsiveness en toegankelijkheid

- Mobiel: één kolom, minimaal 44px interactieve targets, drawer als bottom sheet.
- Tablet: filters mogen wrappen; tabellen krijgen horizontale overflow of kaartalternatief.
- Laptop/wide desktop: `PageContainer` begrenst content tot `max-w-7xl`, behalve expliciet `size="full"`.
- Keyboard: focus volgorde volgt DOM-volgorde; focus is zichtbaar via `:focus-visible`.
- Motion: shared styles respecteren `prefers-reduced-motion`.
- Copy: standaardteksten zijn Nederlands en sober; geen decoratieve dashboard clutter.

## Niet doen

- Geen nieuwe grote UI framework dependency toevoegen.
- Geen business action, database schema, migratie of server-side businesslogica aanpassen.
- Geen inline statuskleuren of gedupliceerde statuskleurmaps introduceren wanneer `statusTones` volstaat.
