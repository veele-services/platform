# Personeelsquery-scope audit v1

Datum: 2026-06-23
Taak: #TAAK-21 - Personeelsquery-scope via `personnel.user_id`

## Doel

Een personeelsgebruiker mag alleen gegevens zien of wijzigen die via het eigen personeelsprofiel zijn toegestaan. De veilige koppeling is:

1. Supabase Auth `user.id`
2. `personnel.user_id`
3. `personnel.id`
4. `personnel.tenant_id`
5. Domeinkoppelingen zoals `assignment_personnel.personnel_id`

Server actions mogen daarom niet vertrouwen op losse client-ID's zoals `assignmentId`, `taskId`, `notificationId` of `documentId` zonder opnieuw de personeelskoppeling te controleren.

## Gecontroleerde modules

### Profiel

- `artifacts/personeel-pwa/src/actions/personnel.ts`
- Profiel lezen en wijzigen gebeurt via `personnel.user_id = auth.uid()`.
- Gedeactiveerde personeelsrecords (`is_active = false`) worden uitgesloten.
- Avatarupdate valideert opnieuw op eigen personeelsrecord.

### Mijn planning en werkbonnen

- `artifacts/personeel-pwa/src/actions/assignments.ts`
- Werkbonnen worden opgehaald via `assignment_personnel.personnel_id`.
- Detailpagina's vereisen dezelfde personeelskoppeling.
- Statusupdates, taakafhandeling, afronden en afmelden controleren `assignment_personnel` en `assignments.tenant_id`.
- Task-updates filteren expliciet op `task_id + assignment_id`.

### Open diensten/opdrachten

- `artifacts/personeel-pwa/src/actions/open-assignments.ts`
- Open opdrachten worden beperkt tot de tenant van het personeelslid.
- Interesse-uitnodigingen worden beperkt op `personnel_id + tenant_id`.
- Server-side eligibility blijft actief voor regio, rol, certificaten, diploma's en kennis.

### Uren

- `artifacts/personeel-pwa/src/actions/hours.ts`
- Urenoverzichten vereisen nu naast `reports.submitted_by` ook een actieve `assignment_personnel`-koppeling.
- Rapporten worden alleen meegenomen als de opdracht binnen dezelfde tenant valt.

### Rapportage-notities en media

- `artifacts/personeel-pwa/src/actions/reports.ts`
- Uploadvoorbereiding, notities, rapportstatus en rapportindiening controleren `personnel.user_id`, `assignment_personnel` en `assignments.tenant_id`.
- Notitie-auteur blijft klantgericht weergegeven als tenantnaam, niet als personeelsnaam.

### Meerwerk en materiaal

- `artifacts/personeel-pwa/src/actions/extra-work.ts`
- `artifacts/personeel-pwa/src/actions/materials.ts`
- Lezen, toevoegen, wijzigen, verwijderen en upload-acties vereisen eigen personeelsprofiel, actieve assignment-koppeling en tenant-match.
- Mutaties blijven beperkt tot items die door dezelfde gebruiker zijn aangemaakt.

### Documenten

- `artifacts/personeel-pwa/src/actions/documents.ts`
- Personeelsdocumenten worden alleen gelezen of ondertekend via `entity_type = personnel` en `entity_id = own personnel.id`.
- Gedeactiveerde personeelsrecords worden uitgesloten.

### Meldingen en push

- `artifacts/personeel-pwa/src/actions/notifications.ts`
- Meldingen worden gefilterd op `personnel_id + tenant_id`.
- Bulkacties zoals alles gelezen/ongelezen/wissen gebruiken dezelfde scope.

- `artifacts/personeel-pwa/src/actions/push.ts`
- Browser push en native push tokens worden gekoppeld aan `personnel_id + tenant_id`.
- Status en deactivatie controleren dezelfde eigenaar en tenant.

### Beschikbaarheid en verlof

- `artifacts/personeel-pwa/src/actions/availability.ts`
- `artifacts/personeel-pwa/src/actions/leave.ts`
- Beide flows herleiden het personeelsrecord via `personnel.user_id`.
- Gedeactiveerde personeelsrecords worden uitgesloten.

## Handmatige acceptatietests

1. Log in als personeelslid A en open direct een URL van een werkbon die alleen aan personeelslid B is gekoppeld. Verwacht: niet gevonden of geen toegang.
2. Roep een server action voor taak afronden aan met `assignmentId` van A en `taskId` van B. Verwacht: foutmelding, geen update.
3. Log in als personeelslid A en probeer een document-ID van personeelslid B te downloaden. Verwacht: geen signed URL.
4. Log in als personeelslid A en probeer een notificatie-ID van personeelslid B te markeren als gelezen. Verwacht: geen effect.
5. Log in als personeelslid A en controleer `/uren`. Verwacht: alleen rapporten voor opdrachten waar A via `assignment_personnel` aan gekoppeld is.
6. Deactiveer personeelslid A in backoffice en herlaad de PWA met bestaande sessie. Verwacht: profiel, planning, meldingen en documenten leveren geen data of een niet-ingelogd/niet-gevonden melding.

## Resterende aandachtspunten

- Supabase RLS/storage policies moeten bij de aparte storage/RLS-eindcontrole nog in het dashboard of via database-inspect bevestigd worden.
- `documents` heeft geen eigen `tenant_id`; personeelsdocumenten zijn daarom gescoped via `entity_type = personnel` en `entity_id = personnel.id`.
- `availability_windows` en verlofqueries blijven primair via `personnel_id` gescoped. Dat is veilig zolang `personnel_id` altijd uit `personnel.user_id` wordt herleid.
