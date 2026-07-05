# Tenant backoffice UI primitives

Datum: 2026-07-05
Gerelateerd: `docs/research-tenant-backoffice-ui-cleanup.md`

## Doel

Deze primitives vormen de basis voor de gefaseerde tenant backoffice cleanup. Ze zijn bewust klein gehouden: ze bieden consistente page spacing, headers, toolbars, filterdrawers, active filters, action menus, confirm dialogs en datatable-basis zonder bestaande businesslogica te verplaatsen.

## Componenten

- `TenantPageShell`: standaard page width, padding en verticale spacing.
- `TenantPageHeader`: titel, subtitel, breadcrumbs, badges, metadata en acties.
- `TenantToolbar`: zoekveld, kernfilters, acties en actieve filters.
- `TenantToolbarSearch`: zoekinput met standaard icoon.
- `TenantActiveFilters`: compacte filterchips met optionele remove/reset acties.
- `TenantFilterDrawer`: shadcn Sheet-wrapper voor geavanceerde filters.
- `TenantActionMenu`: shadcn DropdownMenu-wrapper voor rij- en contextacties.
- `TenantConfirmDialog`: shadcn AlertDialog-wrapper voor risicovolle acties.
- `TenantDataTable`: desktop table met optionele mobile card renderer en empty state.

## Statuskleur-taxonomie

Gebruik statuskleur alleen voor workflowstatus. Gebruik prioriteitskleur alleen voor urgentie.

| Betekenis | Gebruik | Tone |
| --- | --- | --- |
| Neutral | concept, info, gepland | muted/outline |
| Success | actief, goedgekeurd, betaald, beschikbaar | success |
| Warning | wacht op controle, verloopt binnenkort, deels beschikbaar | warning |
| Danger | geblokkeerd, verlopen, achterstallig, storing | destructive |
| Muted | gearchiveerd, inactief, niet van toepassing | muted |

## Table-to-card mobile gedrag

Voor lijsten met operationele data:

- Desktop vanaf `md`: gebruik `TenantDataTable`.
- Mobiel onder `md`: geef `renderMobileCard` mee.
- Een mobile card toont maximaal:
  - primaire titel/code;
  - status of prioriteit;
  - twee tot drie metadataregels;
  - een `TenantActionMenu`.
- Vermijd horizontale scroll op mobiel, behalve bij echte matrixdata zoals permissies.

## Voorbeeld

```tsx
<TenantPageShell>
  <TenantPageHeader
    title="Instellingen"
    description="Beheer tenantinstellingen vanuit een rustig startpunt."
  />
  <TenantToolbar
    search={<TenantToolbarSearch name="search" defaultValue={search} />}
    actions={<TenantFilterDrawer activeCount={2}>...</TenantFilterDrawer>}
  />
  <TenantDataTable
    rows={rows}
    columns={columns}
    getRowKey={(row) => row.id}
    renderMobileCard={(row) => <MyMobileRow row={row} />}
  />
</TenantPageShell>
```

## Adoptievolgorde

1. Start met lijstschermen: klanten, objecten, opdrachten, personeel, documenten en taakcodes.
2. Verplaats permanente create/edit formulieren naar sheets of dialogs.
3. Vervang raw `confirm()` door `TenantConfirmDialog`.
4. Maak detailpagina's pas daarna gelijk met `TenantPageHeader` en action panels.
