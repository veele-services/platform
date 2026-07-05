# Fieldgrid personeelsapp offline coverage

Datum: 2026-07-05
Scope: `artifacts/personeel-pwa`

## Doel

Deze matrix documenteert welke kritieke werkvloeracties offline-safe zijn, welke via de offline queue worden gesynchroniseerd en welke bewust online-only blijven.

## Queue en status

- Queue storage: `veele-personeel-offline-work-order-actions-v1` in `localStorage`.
- Sync trigger: background sync waar beschikbaar, plus online/focus/visibility fallback in `PersonnelRealtimeOfflineProvider`.
- UI-states: pending queue count, syncing, failed + retry, en korte synced-confirmatie.
- Falen: failed acties blijven in de queue met `lastError` en kunnen opnieuw worden geprobeerd via de globale statusbalk.

## Actiematrix

| Actie | Offline-status | Queue type | UI feedback |
| --- | --- | --- | --- |
| Werkbon starten | Offline-safe | `start-assignment` | Inline notice + globale pending/sync/failed/synced status |
| Checklisttaak afvinken | Offline-safe | `set-task-completion` | Optimistische taakstatus + notice + globale syncstatus |
| Materiaal toevoegen | Offline-safe | `add-material-usage` | Lokale pending rij + notice + globale syncstatus |
| Materiaal verwijderen | Online-only, behalve lokale pending rij | n.v.t. | Offline blokkade met uitleg; lokale pending rij verwijdert ook queued actie |
| Inventaris registreren | Offline-safe | `add-inventory-usage` | Lokale pending rij + notice + globale syncstatus |
| Meerwerk toevoegen | Offline-safe | `add-extra-work` | Lokale pending rij + notice + globale syncstatus |
| Meerwerk verwijderen | Online-only, behalve lokale pending rij | n.v.t. | Offline blokkade met uitleg; lokale pending rij verwijdert ook queued actie |
| Rapportnotitie zonder bijlage | Offline-safe | `add-report-note` | Lokale notitie + globale syncstatus |
| Rapportnotitie met foto's/bijlagen | Online-only voor bijlagen | n.v.t. | Bestandselectie en submit blokkeren met uitleg; tekstnotitie kan offline |
| Werkbon afronden | Offline-safe | `complete-assignment` | Notice + redirect terug naar werkbon + globale syncstatus |
| Werkbon afmelden/niet afgerond | Offline-safe | `not-complete-assignment` | Notice + redirect terug naar werkbon + globale syncstatus |

## Bewuste online-only keuzes

- Bestandsuploads blijven online-only omdat signed upload URLs en Supabase Storage direct netwerk vereisen.
- Verwijderen van reeds gesynchroniseerde materiaal- en meerwerkregels blijft online-only om conflicten met backoffice review/facturatie te voorkomen.
- Offline toegevoegde lokale materiaal- en meerwerkregels mogen direct verwijderd worden; de corresponderende queued actie wordt dan ook verwijderd.
