# Fieldgrid fase 4 module enforcement

Datum: 3 juli 2026  
Status: uitgevoerd op branch `codex/phase-4-module-enforcement-20260703`  
Scope: runtime-code en statische canonbewaking, zonder database- of migratiewijzigingen.

## Doel

Fase 4 harmoniseert module enforcement tussen API, backoffice, portalen en toekomstige jobs. Een gebruiker kan dus niet alleen op basis van RBAC bij een functionaliteit komen: zodra een permission-resource aan een module gekoppeld is, moet die module ook voor de tenant actief zijn.

Deze fase lost het canonpunt op dat de backoffice module-mapping kleiner was dan de API-mapping. De nieuwe bron van waarheid is `FIELDGRID_PERMISSION_MODULES` in `lib/db/src/module-permissions.ts`.

## Uitgevoerd

- Centrale module-mapping toegevoegd in `lib/db/src/module-permissions.ts`.
- Helpercontract toegevoegd:
  - `FIELDGRID_PERMISSION_MODULES`;
  - `moduleForPermissionResource(resource)`;
  - `resourceFromPermissionKey(permission)`;
  - `moduleForPermissionKey(permission)`.
- API-auth gebruikt de gedeelde mapping in plaats van een lokale `PERMISSION_MODULES`-lijst.
- Backoffice-auth gebruikt de gedeelde mapping in plaats van een lokale `PERMISSION_MODULES`-lijst.
- Portalresources zijn expliciet gekoppeld:
  - `customer_portal` en `customer_users` -> `customer_portal`;
  - `personnel_portal` -> `personnel_portal`.
- Subresources zijn expliciet gekoppeld aan hun module, zoals contacts, notes, assignment media, payment batches, news en task codes.
- Geen schema, migratie of staging-data aangepast.

## Canoniek contract

| Permission-resource | Module |
| --- | --- |
| `customers`, `customer_contacts`, `customer_notes` | `customers` |
| `customer_portal`, `customer_users` | `customer_portal` |
| `objects`, `object_contacts`, `object_personnel` | `objects` |
| `personnel`, `qualifications`, `availability`, `leave_periods` | `personnel` |
| `personnel_portal` | `personnel_portal` |
| `assignments`, `assignment_personnel`, `assignment_tasks`, `assignment_extra_work` | `assignments` |
| `assignment_photos`, `assignment_report_notes`, `assignment_report_note_attachments` | `assignments` |
| `planning` | `planning` |
| `smart_planning` | `smart_planning` |
| `reports` | `reporting` |
| `documents` | `documents` |
| `invoices`, `quotes`, `payments`, `customer_payment_batches`, `customer_payment_batch_items` | `finance` |
| `notifications`, `news` | `notifications` |
| `task_codes` | `assignments` |

## Runtime-regel

De volgorde blijft:

1. Host en tenantcontext worden vastgesteld.
2. Support grant of tenantrol bepaalt of de actor de permission mag gebruiken.
3. `moduleForPermissionResource(resource)` zoekt de module op.
4. Als er een module is, blokkeert `requireTenantModule(tenantId, moduleKey)` de actie wanneer de module uit staat.
5. Resources zonder modulemapping blijven alleen RBAC-gestuurd tot ze canoniek aan een module gekoppeld worden.

## Securitygrenzen

Deze fase raakt de volgende grenzen uit de testmatrix:

- `FG-MODULE-001`: module aan via UI/API happy path.
- `FG-MODULE-002`: module uit via backoffice UI denial.
- `FG-MODULE-003`: module uit via API denial.
- `FG-MODULE-004`: directe URL of server action mag moduleguard niet overslaan.
- `FG-MODULE-005`: backoffice en API gebruiken dezelfde centrale modulemapping.
- `FG-PORTAL-C-001`: customer portal resources vereisen de customer portal module.
- `FG-PORTAL-P-001`: personnel portal resources vereisen de personnel portal module.
- `FG-DIRECT-ID-001`: moduletoegang vervangt tenantisolatie niet; entity tenant checks blijven verplicht.

## Staging-impact

Deze fase is staging-veilig:

- geen migraties;
- geen DDL;
- geen data-backfill;
- geen reset/drop/rebuild;
- alleen moduleguardgedrag wordt strakker en consistenter.

Voor promotie naar staging blijft vereist:

- `pnpm test`;
- `pnpm run typecheck`;
- bestaande buildworkflow;
- bij voorkeur een handmatige smoke op een tenant met een module uitgeschakeld.

## Niet in deze fase

- Playwright hosttests voor modules uit/aan.
- Echte API-integrationtests met Tenant A/B/Veele fixtures.
- Module dependency visualisatie in de UI.
- Portal-end-to-end tests met echte customer/personnel sessies.
- Auditdashboard voor module-denials.

Deze punten blijven onderdeel van de latere test- en productiseringsfases uit `docs/fieldgrid-next-major-update-plan.md`.
