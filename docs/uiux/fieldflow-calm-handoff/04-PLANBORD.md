# 04 — Fieldflow Calm planbordcontract

## 1. Uitkomst

Het productieplanbord krijgt exact de Fieldflow Calm-compositie:

- werkvoorraad links;
- uren horizontaal;
- medewerkers verticaal;
- sticky tijdheader en medewerkerkolom;
- ruime lanes;
- rustige, toegankelijke pastelblokken;
- heldere valid/conflict/pending/locked states;
- Bord, Dag, Week, Maand en Kaart in één consistente workspace;
- volwaardige pointer-, keyboard- en touchbediening.

De productie-datalaag en domeininvarianten blijven leidend. Het prototype levert geen auth, tenantisolatie, echte kaart, concurrency, realtime, teamplanning of persistence en wordt daarvoor niet gekopieerd.

De machineleesbare autoriteit voor iedere planbordcommand, payload, permission, interaction, reason code en response is [`manifests/planboard-actions.json`](./manifests/planboard-actions.json), contractversie `fieldflow-planboard-v1`. Dit document en dat manifest zijn één release-eenheid. CI faalt zodra de zeven actiontags, permissions, requirement-/riskverwijzingen of contractversie uiteenlopen.

## 2. Visuele geometry

| Onderdeel            |     Compact | Comfortable |    Spacious |
| -------------------- | ----------: | ----------: | ----------: |
| Board minimum        |     1260 px |     1260 px |     1260 px |
| Medewerkerkolom      |      228 px |      228 px |      228 px |
| Tijdcanvas reference |     1032 px |     1032 px |     1032 px |
| Uur reference        | 93,81818 px | 93,81818 px | 93,81818 px |
| Tijdheader           |       56 px |       56 px |       56 px |
| Lane                 |       78 px |       98 px |      108 px |
| Blokhoogte           |       58 px |       70 px |       78 px |
| Bloktop              |       10 px |       14 px |       15 px |
| Blokradius           |       12 px |       12 px |       12 px |
| Betekenisrand        |        4 px |        4 px |        4 px |
| Queue                |      300 px |      300 px |      300 px |
| Queue minimumhoogte  |      690 px |      690 px |      690 px |
| Queuecard minimum    |      128 px |      142 px |      156 px |

Deze waarden zijn de volledige `planboardGeometry`-as per density. Ze worden rechtstreeks gebruikt; een implementatie mag geen schaalfactor of eigen afronding toepassen. Alle niet-genoemde planbordmaten blijven tussen densities gelijk.

Referentievenster 08:00–19:00; productie mag via dezelfde control een groter/volledig tenantwerkvenster tonen. Een blok buiten het zichtbare venster wordt niet stil afgeknipt: scroll/venster past aan of een waarschuwing biedt een geldige keuze.

De referentie bevat exact elf uurintervallen. Daarom geldt voor de canonieke eerste render: `(1260 − 228) / 11 = 93,8181818182 px/uur`. De bestaande zoomfunctie blijft beschikbaar: compact 56, normaal 80 en detail 120 px/uur. Na een expliciete zoomkeuze is `timeCanvasWidth = visibleHourCount × selectedHourWidth` en `boardWidth = 228 + timeCanvasWidth`; alleen het canonieke eerste beeld gebruikt de referencewaarde. De geselecteerde semantische zoom-ID blijft als gebruikersvoorkeur bewaard.

Snapping is 15 minuten, gelijk aan het prototype. De bestaande instelling `planningTimeSlotMinutes` heeft standaard 90 en mag niet zonder datamigratie/terminologiebesluit worden geïnterpreteerd als een 90-minutenraster. Voor Fieldflow:

```ts
const FIELDFLOW_PLANNING_GRID_STEP_MINUTES = 15;
```

Clientpreview en servervalidatie gebruiken dezelfde pure helper. Een toekomstige tenantconfigureerbare gridstap is een apart product-/migratiebesluit.

## 3. Pastelpalet

| Categorie | Foreground/rand | Achtergrond |
| --------- | --------------- | ----------- |
| Mint      | `#174C3C`       | `#DCF5E9`   |
| Blue      | `#2C62A9`       | `#E3EDFD`   |
| Aqua      | `#1D6F73`       | `#DFF3F1`   |
| Peach     | `#994E20`       | `#FAE8D9`   |
| Yellow    | `#805A0A`       | `#F7EDC8`   |
| Rose      | `#A84355`       | `#F9E0E5`   |
| Lilac     | `#7654A9`       | `#ECE4F8`   |
| Orange    | `#934B10`       | `#F9E4D2`   |

Gebruik typed categorie/statusmapping, geen Nederlandse substringmatching. Tenantprimary verandert dit palet niet. Alle acht foreground/background-paren staan machineleesbaar in `fieldflow-tokens.json` en halen minimaal 4,5:1 voor de kleine metadata in een blok. Rand, label en icoon dragen de betekenis samen; kleur alleen is nooit voldoende.

Whitelabelmapping binnen planning:

| Affordance                                  | Tokenautoriteit                                                     |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Primaire CTA en “Nu”-lijn                   | `--ff-primary` + contrastveilige foreground                         |
| Actieve view/tab                            | `--ff-primary-soft`, `--ff-primary` en `--ff-text`                  |
| Geselecteerde queuecard/blok                | `--ff-selection`, `--ff-selection-border`, `--ff-text-on-selection` |
| Link en focus                               | `--ff-primary` respectievelijk de tweelaagse `--ff-focus-ring`      |
| Status, conflict, locked en pastelcategorie | vaste semantische/planbordtokens; nooit tenantprimary               |

Een blok bevat:

- code/titel;
- klant/object;
- tijd;
- statuslabel;
- waar nodig conflict-, actual-, team- of lockicoon.

De “Nu”-lijn gebruikt het contrastveilige tenant-primary token, loopt over het volledige board en heeft naast kleur een tekstlabel. Zij toont echte Amsterdamtijd en geen demo-waarde.

## 4. Canonieke URL en views

```text
/planning?view=board&date=YYYY-MM-DD
/planning?view=day&date=YYYY-MM-DD
/planning?view=week&date=YYYY-MM-DD
/planning?view=month&date=YYYY-MM-DD
/planning?view=map&date=YYYY-MM-DD
```

Oude `day`, `week` en `month` queryvormen normaliseren/redirecten compatibel. Zoek-, filter- en displaystate blijft bij view/datumnavigatie in de URL of in bestaande gebruikersvoorkeuren.

### Board

- queue + medewerkerstijdlijnen;
- queue→board;
- board→tijd/medewerker;
- expliciet ontkoppelen/vrijgeven;
- match, beschikbaarheid, kwalificatie, capaciteit en routecontext;
- detaildrawer;
- realtime;
- undo;
- volledige “Nieuwe opdracht”-wizard.

### Dag

- dezelfde timeline-/placementengine;
- queue standaard ingeklapt;
- focus op één datum;
- geen los legacy conflict-/mutatiepad;
- mobiel agenda-first;
- volledige “Nieuwe opdracht”-wizard.

### Week

De huidige `?week=` rendert feitelijk opnieuw het dagboard; dat is niet acceptabel. Bouw een echte zeven-dagenmatrix:

- medewerker × dag;
- geplande uren;
- beschikbare uren;
- bezettingspercentage;
- aandacht/conflict;
- teambezetting;
- klik opent Day met datum, medewerker en filters;
- planmatig overzicht duidelijk gelabeld, niet verwarren met actual liveconflict.

De onbereikbare legacy `PlanningView.tsx` wordt na parity verwijderd of aantoonbaar als gedeelde engine gebruikt; geen tweede dode implementatie.

### Maand

- echte data/aggregatie;
- belasting/capaciteit per dag;
- beperkte zichtbare chips;
- “Meer” opent toegankelijke lijst/drawer;
- weeklink opent werkelijk Week;
- telefoon gebruikt agenda/list-first;
- geen zeven onleesbare kolommen op 320 px.

### Kaart

Behoud productiefunctionaliteit:

- echte Google Maps;
- marker en polyline;
- afstand/reistijd/verkeer;
- auto, fiets, lopen, tweewieler en OV;
- routecache;
- ontbrekende locatie/providerfout;
- detaildrawer;
- tijdsuggestie met expliciete bevestiging.

Kaarttab verschijnt alleen wanneer één gedeelde servergate de map-featureflag, vereiste Google Maps-configuratie, de ingeschakelde `planning`-module en `planning:read` bevestigt. Routeberekening herhaalt die gate server-side; tijdtoepassing herhaalt hem met aanvullend `planning:write`. Er is geen niet-bestaande entitlementclaim. Bij providerfout blijft de lijst bruikbaar. Routevoorstel gaat door dezelfde status-, conflict-, version- en mutationengine als drag/drop.

## 5. Werkvoorraad

Queuecard toont:

- opdrachtcode en titel;
- klant/object/regio;
- duur;
- deadline/tijdvoorkeur;
- prioriteit;
- required/filled slots;
- matchstate;
- blockers/warnings;
- draggable/selected/pending state.

Controls:

- zoek;
- Alle;
- Beste match;
- Spoed;
- sorteer medewerkers op beste match, naam, belasting of regio;
- duidelijke count;
- leeg/gefilterd leeg/error/retry.

Op ≥1280 staat queue inline. Op compact desktop is zij inklapbaar/Sheet. Op mobiel staat zij vóór de agenda en opent details/planwizard zonder drag.

## 6. Plaatsingsengine

De ene pure gedeelde plaatsingsmodule staat op:

`artifacts/backoffice/src/lib/planning/placement.ts`

Input:

```ts
type PlacementIntent = {
  assignmentId: string;
  sourcePersonnelId: string | null;
  targetPersonnelId: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  pointerOffsetMinutes: number;
  gridStepMinutes: 15;
  expectedAssignmentVersion: string;
  expectedStaffingVersions: Record<string, string>;
  mutationId: string;
};
```

Output:

```ts
type PlacementEvaluation = {
  snappedStart: string;
  snappedEnd: string;
  state: "valid" | "warning" | "blocked";
  reasons: TypedPlanningReason[];
  affectedPersonnelIds: string[];
  affectedAssignmentIds: string[];
  teamImpact: TeamImpact;
};
```

De pure helper ontvangt uitsluitend een immutable `PlacementSnapshot` en doet geen auth- of databasereads. Hij berekent voor preview en server dezelfde temporele/matchuitkomst op de aangeleverde snapshot:

- kwartiersnap;
- duurbeleid: nieuwe queueplaatsing gebruikt de canonieke geschatte duur, begrensd op 30–480 minuten; een bestaand blok behoudt zijn exacte opgeslagen duur zolang die minimaal 15 minuten is, ook wanneer een legacyblok langer dan 480 minuten duurt;
- werkvenster/bounds;
- pointeroffset;
- overlap op effectieve intervallen;
- dubbele medewerker;
- indicatieve availability-, sickness/leave-, role-, sector-, certificate-, diploma-, knowledge- en regionmatch uit de snapshot;
- statuslock;
- required slots;
- teamimpact.

De Server Action blijft de enige autoriteit. Direct vóór de write resolveert hij host/tenant en actor opnieuw, controleert hij `planning:write` (of voor “Nieuwe opdracht” de contractueel uitgelijnde `assignments:write`-policy), module en mapfeature waar relevant, herlaadt hij assignment, staffing, interestresponse, ziekte/verlof/beschikbaarheid, rol, sector, certificaat, diploma, kennis, regio, duplicate/capaciteit en alle geobserveerde versies, en voert hij dezelfde pure evaluatie nogmaals uit. De korte mutatietransactie houdt de tenant-autorisatie-epoch en concrete membership- of supportgrantrij gelockt, lockt iedere rij uit de gesloten dependencyclasses en hercontroleert autorisatie en support-TTL met de databaseklok op het linearisatiepunt. Een blocker schrijft geen domeinrij, receipt, audit, event, routecache of notificatie. Een warning schrijft uitsluitend na een expliciet, aan dezelfde evaluatiehash gebonden bevestigingsbesluit.

Groene preview betekent dat de laatst bekende snapshot de intentie accepteert; zij is nooit autorisatiebewijs. Rode preview betekent lokale weigering. De server kan na verse hercontrole alsnog veilig weigeren. Een waarschuwing vereist expliciete bevestiging waar domeinregels dit toestaan.

### 6.1 Wire-union

Elke request is een discriminated union op `action`. De gemeenschappelijke envelope is onveranderlijk:

```ts
type PlanningAction =
  | "place"
  | "move"
  | "unassign"
  | "release"
  | "optimize-preview"
  | "optimize-commit"
  | "undo";

type PlanningInputMode =
  | "pointer"
  | "keyboard"
  | "touch"
  | "menu"
  | "map-suggestion";

type PlanningActionCommon<A extends PlanningAction> = Readonly<{
  contractVersion: "fieldflow-planboard-v1";
  action: A;
  mutationId: string; // UUID; gelijk houden bij warning-confirm en transportretry
  originClientId: string; // UUID per browser-tab/geïnstalleerde client
  requestedAt: string; // RFC 3339 UTC
  inputMode: PlanningInputMode;
  versions: PlanningVersionVector;
}>;

type PlanningActionRequest =
  | (PlanningActionCommon<"place"> & { payload: PlacePayload })
  | (PlanningActionCommon<"move"> & { payload: MovePayload })
  | (PlanningActionCommon<"unassign"> & { payload: UnassignPayload })
  | (PlanningActionCommon<"release"> & { payload: ReleasePayload })
  | (PlanningActionCommon<"optimize-preview"> & {
      payload: OptimizePreviewPayload;
    })
  | (PlanningActionCommon<"optimize-commit"> & {
      payload: OptimizeCommitPayload;
    })
  | (PlanningActionCommon<"undo"> & { payload: UndoPayload });
```

`PlanningVersionVector` bevat `planningRevision` als base-10 bigint-string en gesorteerde, unieke arrays `assignments`, `staffing` en `interestResponses`. Iedere assignmententry bevat `assignmentId`, `lifecycleVersion` en `updatedAt`; iedere staffingentry `staffingId`, `lifecycleVersion` en `updatedAt`; iedere interestentry `interestResponseId`, `lifecycleVersion` en `updatedAt`. De server bepaalt eerst zelf de volledige dependency closure van de action. De request moet exact alle reeds bestaande records uit die closure bevatten: ontbrekende, dubbele, extra of stale entries leveren `VERSION_STALE` en nul writes op. `interestResponses` is leeg behalve bij `place` met `source.kind="interest"`, waar exact de geselecteerde response verplicht is. Een nog niet bestaande staffinglink zit niet in de vector; de gelockte assignmentrij en de unieke staffingconstraint serialiseren creatie.

| Action             | Exacte payload naast common                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `place`            | `assignmentId`, gesloten `source={kind:"queue"} \| {kind:"interest",interestResponseId}`, `targetPersonnelId`, `date`, `requestedStartMinutes`, `durationMinutes`, `pointerOffsetMinutes=0`, `warningConfirmation` |
| `move`             | `assignmentId`, `moveMode`, `sourceStaffingId`, `sourcePersonnelId`, `targetPersonnelId`, `date`, `requestedStartMinutes`, `durationMinutes`, `pointerOffsetMinutes`, `warningConfirmation`                        |
| `unassign`         | `assignmentId`, `staffingId`, `personnelId`, `reasonCode`, `reasonNote`, `warningConfirmation`                                                                                                                     |
| `release`          | `assignmentId`, `reasonCode`, `reasonNote`, `warningConfirmation`                                                                                                                                                  |
| `optimize-preview` | `scope`, `objective`, `constraints`                                                                                                                                                                                |
| `optimize-commit`  | `previewMutationId`, `previewEvaluationHash`, `proposalHash`, `warningConfirmation`                                                                                                                                |
| `undo`             | `targetMutationId`                                                                                                                                                                                                 |

De enums, nullability, ranges en conditionele regels van ieder veld staan normatief in het manifest. Common envelope, payload en ieder nested object zijn gesloten; de server past geen permissieve coercion toe. Een structureel onparseerbare common envelope, inclusief een structureel ongeldige versionvector, kan niet eerlijk een `action`, `mutationId` of `requestHash` echoën en valt daarom vóór de actionresult-union af met HTTP 400 `application/problem+json`, code `INVALID_ACTION_ENVELOPE` en pointer-gescopeerde `fieldErrors`. Zodra common geldig is, geeft een payloadfout `kind="invalid"` met `INVALID_PAYLOAD`. Een structureel geldige vector die de server-derived closure mist, aanvult, dupliceert of met stale waarden beschrijft geeft `kind="conflict"` met `VERSION_STALE`. Alle paden schrijven niets.

### 6.2 Typed result-union

Iedere response ná geldige common-envelopevalidatie discrimineert op `kind` en bevat altijd `contractVersion`, `action`, `mutationId`, `requestHash`, `serverTime` en `replayed`:

```ts
type PlanningActionResult =
  | PlanningCommittedResult
  | PlanningPreviewResult
  | PlanningWarningRequiredResult
  | PlanningBlockedResult
  | PlanningConflictResult
  | PlanningForbiddenResult
  | PlanningInvalidResult
  | PlanningFailedResult;
```

| `kind`             | Verplichte typed velden                                                                                                                                                  | Side effect |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `committed`        | `receiptId`, `saved`, `versions`, `planningRevision`, `affectedAssignmentIds`, `affectedStaffingIds`, `affectedInterestResponseIds`, `undo`, `undoState`                 | atomair     |
| `preview`          | `receiptId`, `previewEvaluationHash`, `proposalHash`, `evaluationIssuedAt`, `validUntil`, `planningRevision`, `beforeRecords`, `afterRecords`, `reasons`, `previewState` | receipt     |
| `warning-required` | `warningEvaluationHash`, `evaluationIssuedAt`, `validUntil`, `reasons`, `safeSnapshot`                                                                                   | geen        |
| `blocked`          | `reasons`, `safeSnapshot`                                                                                                                                                | geen        |
| `conflict`         | `code`, `reasons`, `currentVersions`, `safeSnapshot`                                                                                                                     | geen        |
| `forbidden`        | `code`                                                                                                                                                                   | geen        |
| `invalid`          | `code`, `fieldErrors`                                                                                                                                                    | geen        |
| `failed`           | `code`, `retryable`                                                                                                                                                      | geen        |

`committed.saved` bevat exact de door de server opgeslagen, voor de actor toegestane assignment-, staffing- en interestresponseprojectie, niet de aangevraagde clientwaarden. `saved_result` bewaart het immutable variantbody plus identifiers, maar geen tijdsafhankelijke transportmetadata. Een replay gebruikt dat JSON-body semantisch ongewijzigd en maakt een verse wrapper met huidig `serverTime`, `replayed=true` en opnieuw berekende `undoState` of `previewState`; hierdoor lijken een verlopen, verbruikte of door latere state geblokkeerde actie nooit opnieuw beschikbaar. `undoState` is exact `available | expired | already-undone | version-conflict | not-undoable`; `previewState` is exact `usable | expired | consumed`. Deze twee velden worden niet in `saved_result` opgeslagen. Conflict-, forbidden-, invalid- en failurecodes zijn gesloten enums uit het manifest.

Voor `previewState` wint `consumed` wanneer een `optimize-commit`-childreceipt bestaat; anders is de state `expired` bij `serverTime >= validUntil` en anders `usable`. Voor `committed` en `preview` accepteert de UI state alleen wanneer de top-level `planningRevision` niet lager is dan de lokale revision én `mutationId` nog eigenaar is van de pending projectie. `warning-required`, `blocked` en `conflict` gebruiken daarvoor `safeSnapshot.planningRevision`. Bij gelijke revision mag alleen dezelfde pending mutation haar projectie vervangen; `forbidden`, `invalid` en `failed` vervangen nooit planningstate.

Serverhersteldata en clientprojecties zijn strikt gescheiden. `before_records`/`after_records` gebruiken `ReceiptRecordState`: een server-only existentie-union met de volledige mutation- en restorewaarde die nooit in een response wordt geserialiseerd. Huidige records mogen `assignment`, `staffing` of `interest-response` zijn. `display_before_records`/`display_after_records` en `preview.beforeRecords`/`preview.afterRecords` gebruiken `PlanningDisplayRecordState`. De gesloten assignmentvalue bevat exact `code`, `title`, `status`, `scheduledDate`, `scheduledStart`, `scheduledEnd`, `assignedPersonnelIds`, `requiredSlots` en `filledSlots`; de staffingvalue exact `personnelId` en `active`; de interestresponsevalue exact `personnelId` en `status`. Deze vaste minimumprojectie is beschikbaar voor iedere op dat moment opnieuw geautoriseerde `planning:write`-actor en bevat geen klant- of personeelsdossiervelden, zodat ook een latere replay geen historisch ruimer veldrecht herintroduceert. Wanneer `place` of optimalisatie een nieuwe staffingrij maakt, reserveert de server haar UUID na geslaagde evaluatie/bevestiging maar vóór de receipt-/domeinwrite en schrijft in beide toepasselijke before-sets de tombstone `{recordType:"staffing", id, assignmentId, exists:false, lifecycleVersion:null, updatedAt:null, value:null}` plus een `exists:true` after-state. Alleen de server-only after-state is volledig. Bij `optimize-preview` gebeurt deze reservering in de previewreceipt en commit hergebruikt haar. Undo kan daardoor exact de voorafgaande afwezigheid herstellen zonder hersteldata naar de client te lekken. De versie-arrays gebruiken dezelfde `exists`-discriminant; er wordt nooit uit een ontbrekende version gegist. `lifecycleVersion` en `updatedAt` in een snapshot zijn uitsluitend vergelijkingsbewijs: undo kopieert alleen domeinwaarden/existentie en kent iedere geschreven rij een verse monotone versie en database-`updatedAt` toe.

### 6.3 Tweestapswaarschuwing en hashes

1. De eerste call stuurt `warningConfirmation: null`. Blockers geven `blocked` en nul writes. Waarschuwingen geven `warning-required` en nul writes.
2. De tweede call houdt alle semantische invoer en `mutationId` gelijk en stuurt `decision: "accept"`, de ontvangen `warningEvaluationHash`, `evaluationIssuedAt` en de exact gelijke gesorteerde set `acceptedReasonCodes`.
3. De server herlaadt de state, voert de evaluatie opnieuw uit en accepteert uitsluitend dezelfde, nog geen vijf minuten oude evaluatie. Gewijzigde state, proposal, policy of reasoncodes geeft `kind="conflict"` met `EVALUATION_CHANGED`; expiry geeft `kind="conflict"` met `WARNING_CONFIRMATION_EXPIRED`. Beide schrijven niets en verplichten de client call één opnieuw uit te voeren vóór een nieuwe bevestiging.

`requestHash` is de lowercase hex-SHA-256 van RFC 8785-canoniek JSON over `{contractVersion, action, mutationId, originClientId, requestedAt, inputMode, versions, payloadWithoutWarningConfirmation}`. `warningEvaluationHash` is dezelfde hashvorm over `{contractVersion, tenantId, actorUserId, action, requestHash, policyVersion, evaluationIssuedAt, planningRevision, versions, normalizedIntent, snappedInterval, affectedRecordKeys, proposedChanges, warningReasonCodes}`. Een recordkey is `assignment:<assignmentId>`, `staffing:<staffingId>`, `interest-response:<interestResponseId>` of voor een nog niet bestaande link `staffing-new:<assignmentId>:<personnelId>`. `proposedChanges` verwijst naar deze stabiele keys, nooit naar een vers gegenereerde UUID. Alle keys, arrays en change-sets zijn vóór canonicalisatie lexicografisch gesorteerd. `warningConfirmation` blijft als enige buiten `requestHash`, zodat de bevestigingscall hetzelfde idempotency-key kan gebruiken. Blockers zijn nooit bevestigbaar.

`optimize-preview` noemt zijn eigen action-evaluatie in de response `previewEvaluationHash`. `optimize-commit.payload.previewEvaluationHash` moet die waarde exact kopiëren en bindt samen met `previewMutationId` en `proposalHash` aan de previewreceipt. Wanneer de commit-evaluatie waarschuwingen heeft, gebruikt `warningConfirmation.warningEvaluationHash` een afzonderlijke hash voor action `optimize-commit` en haar eigen `requestHash`. Deze twee hashes zijn nooit uitwisselbaar; de receipt bewaart ze als `source_preview_evaluation_hash` respectievelijk `action_evaluation_hash`.

Voor een normale `place`/`move` met een nog niet bestaande staffinglink genereert de server de nieuwe staffing-UUID pas nadat dezelfde warning-evaluatie geldig is bevestigd en vóór de atomische write. Call één en call twee hashen daardoor dezelfde logical key. `optimize-preview` mag de UUID reserveren wanneer zij haar duurzame previewreceipt schrijft; `optimize-commit` hergebruikt exact die opgeslagen UUID. `proposalHash` is SHA-256/RFC 8785 over `{contractVersion, tenantId, actorUserId, previewMutationId, policyVersion, scope, objective, constraints, planningRevision, versions, proposedChanges}`, waarbij changes op recordkey/operation gesorteerd zijn.

## 7. Status- en permissioncontract

Muteerbaar:

- `plannable`;
- `scheduled`.

Read-only:

- `seen`;
- `en_route`;
- `in_progress`;
- completion/report/invoice/payment/closed;
- cancelled.

UI en server importeren dezelfde helper. Locked blok toont sloticoon, status en uitleg. Directe forged call wordt server-side geweigerd.

- lezen: `planning:read`;
- plannen/verplaatsen/vrijgeven: `planning:write`;
- aanvullende recordinformatie alleen met bijbehorende readpermission.

| Oppervlak/action                   | Zichtbaarheid/uitvoer                         | Serverpermission    |
| ---------------------------------- | --------------------------------------------- | ------------------- |
| workspace, board/day/week/month    | data en read-only details                     | `planning:read`     |
| `place`                            | queue→board                                   | `planning:write`    |
| `move`                             | tijd, medewerker of beide                     | `planning:write`    |
| `unassign`                         | één staffinglink beëindigen                   | `planning:write`    |
| `release`                          | hele opdracht terug naar queue                | `planning:write`    |
| `optimize-preview`                 | voorstel en impactreceipt berekenen           | `planning:write`    |
| `optimize-commit`                  | exact previewvoorstel atomair toepassen       | `planning:write`    |
| `undo`                             | complete before-set atomair herstellen        | `planning:write`    |
| Nieuwe opdracht                    | bestaande createflow openen en submitten      | `assignments:write` |
| kaart bekijken/route berekenen     | gedeelde mapgate plus route-/fallbackuitkomst | `planning:read`     |
| kaartvoorstel via `move` toepassen | `inputMode="map-suggestion"`                  | `planning:write`    |

De client leidt permissions niet af uit rolnaam of uit één brede `canWrite`. Elke Server Action resolveert tenant, actor en actieve supportcontext zelf en controleert module plus bovenstaande permission vóór receiptlookup en opnieuw binnen de korte mutatietransactie. `tenantId`, `actorUserId`, permission en supportgrant zijn geen requestvelden. `inputMode` kan een gate nooit versoepelen: `map-suggestion` voegt verplicht de server-side mapfeature-, providerconfig-, `planning`-, `planning:read`- en `planning:write`-gate toe; een forged request zonder één van deze voorwaarden geeft `MAP_GATE_DENIED` en nul writes.

Gebruik niet rechtstreeks een `assignments:write`-action voor planbordvrijgave wanneer het planbordcontract `planning:write` vereist.

“Nieuwe opdracht” opent wel de bestaande createflow en submit. De trigger is alleen zichtbaar wanneer de actor de echte serverautoriteit `assignments:write` bezit. Wanneer productbeleid dit naar `planning:write` wil verplaatsen, wijzigen UI, Server Action, tests en permissiondocumentatie in één gereviewde securitywijziging; een UI-only verruiming is verboden.

## 8. Teamplanning

Een opdracht heeft momenteel één geplande tijd voor alle gekoppelde medewerkers. Daardoor:

- tijd verplaatsen wijzigt het hele teamtijdvak;
- medewerker wisselen kan staffing wijzigen zonder het tijdvak voor overige teamleden te veranderen;
- UI toont vóór bevestiging wie geraakt wordt;
- required slots gebruikt overal `resolveRequiredSlots(...)`;
- “Reserve” telt niet als ingepland;
- interesse-“Selecteer en plan in” gebruikt `place` met `source.kind="interest"`; de Server Action lockt exact die tenant-owned response, vergelijkt haar version, vereist dat assignment en medewerker overeenkomen, zet haar atomair op `confirmed` en maakt/reactiveert de juiste `assigned`-koppeling. Daarna bepaalt `resolveRequiredSlots` exact `max(expliciet benodigd personeelsaantal, aantal verschillende verplichte rollen, 1)`, telt `filledSlots` verschillende medewerkers met een actieve `assigned`-koppeling en gaat de opdracht uitsluitend naar `scheduled` wanneer `scheduledDate`, `scheduledStart` en `scheduledEnd` volledig aanwezig zijn én alle vereiste slots zijn gevuld. Een actieve of finale workflowstatus wordt nooit teruggezet; geplande velden blijven bij start/afronding behouden en actual timestamps bepalen de effectieve weergave. De hele selectie schrijft één gezamenlijke receipt/audit/revision/outboxevent;
- duplicate/staffing-capacity/lifecycle guards blijven.

Een retry of procesrestart gebruikt de gewone tenant+actor+mutation-ID-receipt. Twee gelijktijdige selecties voor het laatste slot hebben precies één winnaar; iedere verliezer retourneert `VERSION_STALE` of `REQUIRED_SLOTS_EXCEEDED` met nul domein-, receipt-, audit-, revision-, event- en notificatiewrites. De interestresponse staat met haar volledige server-only before/after-state en versions in de receipt, zodat undo haar oude domeinstatus samen met assignment en staffing herstelt, maar met een verse lifecycleversie.

## 9. Queue-release

Een drop/actie naar queue biedt twee expliciete intenties:

### Medewerker ontkoppelen

- één staffinglink;
- resterende bezetting zichtbaar;
- assignmentstatus en gepland tijdvak blijven ook wanneer dit de laatste staffinglink is;
- nul actieve staffinglinks verschijnt expliciet als gepland/onbezet aandachtspunt;
- verplichte reden waar het domein dit vraagt.

### Opdracht vrijgeven

- alleen pre-start en uitsluitend vanuit `scheduled`;
- alle geraakte medewerkers, huidige tijd en status zichtbaar vóór bevestiging;
- verwijder alle actieve staffinglinks en transitioneer `scheduled → plannable` in één transactie;
- wis `scheduledDate`, `scheduledStart` en `scheduledEnd` in diezelfde transactie;
- leg één complete audited before-snapshot vast voor version-safe volledige undo;
- wijzig nooit `actualStartedAt`, `actualCompletedAt` of participant execution timestamps.

Live/gestarte/afgeronde opdrachten kunnen niet worden vrijgegeven.

## 10. Geen verborgen rebalancing

Huidig `scheduleAssignmentOnBoard` roept na de hoofdtransactie `rebalancePersonnelDaySchedule` aan. Dat kan:

- andere opdrachten doorschuiven;
- medewerkers ontkoppelen;
- buiten de primaire transactie optreden;
- meer wijzigen dan undo herstelt.

Fieldflowbesluit:

- gewone drop verandert exact één gekozen planningintentie;
- overlap wordt vooraf rood en server-side geweigerd;
- andere opdrachten verschuiven nooit stil;
- geen automatische unassign.

“Automatisch oplossen” wordt uitsluitend als aparte actie aangeboden:

1. `optimize-preview` berekent impact en schrijft uitsluitend de duurzame previewreceipt;
2. toon elke opdracht, oude/nieuwe tijd en staffingwijziging uit de permission-filtered displayprojectie;
3. pas de preview alleen toe als haar `planningRevision` niet ouder is dan de lokale revision en `mutationId` de pending state nog bezit;
4. activeer bevestigen alleen zolang de verse transportwaarde `previewState="usable"` is;
5. `optimize-commit` herlaadt en controleert receipt, proposal, previewhash, deadline, versions en warnings;
6. commit de hele set in één transactie en audit de volledige server-only before/after-state;
7. emit idempotente events/notificaties en bied één volledige version-safe undo.

## 11. Concurrency

Het bestaande `expectedUpdatedAt` beschermt de oude clientbasis nu niet volledig. Verplicht:

- kaartdata bevat assignment `updatedAt/lifecycleVersion`;
- staffinglinks bevatten relevante versie;
- client stuurt geobserveerde versies;
- server vergelijkt exact vóór iedere write;
- mismatch schrijft niets, emit niets en notificeert niets;
- response bevat `VERSION_STALE` en actuele veilige snapshot;
- UI rolt optimistic state terug en toont “Planning is intussen gewijzigd”;
- herhalen met hetzelfde mutation-ID is duurzaam idempotent;
- oudere response mag nieuwere state niet overschrijven.

De Drizzle-definitie komt exact in `lib/db/src/schema/planning-mutations.ts`; de forward migration heet exact `lib/db/migrations/20260904120000_planning_mutation_receipts.sql`. Drizzle spiegelt tabel, kolommen, typen, keys en indexes; de migration is de uitvoerbare autoriteit voor de volledige onderstaande DDL inclusief functions, triggers, RLS en grants. Een implementatie wijzigt namen, typen, constraints, indexes, grants of termijnen alleen via een nieuw gereviewd contractbesluit en bijbehorende contractversie.

### 11.1 Exacte DDL

```sql
CREATE FUNCTION public.fieldgrid_uuid_array_is_sorted_unique(p_values uuid[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    array_position(p_values, NULL) IS NULL
    AND p_values = ARRAY(
      SELECT DISTINCT item
      FROM unnest(p_values) AS valueset(item)
      ORDER BY item
    );
$$;

CREATE FUNCTION public.fieldgrid_text_array_is_sorted_unique(p_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    array_position(p_values, NULL) IS NULL
    AND p_values = ARRAY(
      SELECT item
      FROM (
        SELECT DISTINCT item COLLATE "C" AS item
        FROM unnest(p_values) AS valueset(item)
      ) AS distinct_values
      ORDER BY item COLLATE "C"
    );
$$;

CREATE TABLE public.planning_revision_counters (
  tenant_id uuid PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT planning_revision_counters_revision_check
    CHECK (current_revision >= 0)
);

CREATE TABLE public.planning_authorization_epochs (
  tenant_id uuid PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_epoch bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT planning_authorization_epochs_epoch_check
    CHECK (current_epoch >= 0)
);

INSERT INTO public.planning_authorization_epochs (
  tenant_id,
  current_epoch,
  updated_at
)
SELECT tenant.id, 0, transaction_timestamp()
FROM public.tenants AS tenant
ON CONFLICT (tenant_id) DO NOTHING;

CREATE FUNCTION public.fieldgrid_initialize_planning_authorization_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.planning_authorization_epochs (
    tenant_id,
    current_epoch,
    updated_at
  )
  VALUES (NEW.id, 0, pg_catalog.transaction_timestamp())
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_initialize_planning_authorization_epoch
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_initialize_planning_authorization_epoch();

ALTER TABLE public.planning_revision_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planning_revision_counters
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.planning_authorization_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planning_authorization_epochs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.fieldgrid_advance_planning_revision(
  p_tenant_id uuid,
  p_expected_revision bigint
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_revision bigint;
  context_tenant text;
BEGIN
  context_tenant := pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  );
  IF context_tenant IS NULL OR context_tenant <> p_tenant_id::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning revision tenant context mismatch';
  END IF;

  IF p_expected_revision < 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.planning_revision_counters AS counter
  SET
    current_revision = counter.current_revision + 1,
    updated_at = transaction_timestamp()
  WHERE counter.tenant_id = p_tenant_id
    AND counter.current_revision = p_expected_revision
  RETURNING counter.current_revision INTO next_revision;

  IF FOUND THEN
    RETURN next_revision;
  END IF;

  IF p_expected_revision <> 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.planning_revision_counters (
    tenant_id,
    current_revision,
    updated_at
  )
  VALUES (p_tenant_id, 1, transaction_timestamp())
  ON CONFLICT (tenant_id) DO NOTHING
  RETURNING current_revision INTO next_revision;

  RETURN next_revision;
END;
$$;

CREATE FUNCTION public.fieldgrid_advance_planning_authorization_epoch(
  p_tenant_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_epoch bigint;
  context_tenant text;
BEGIN
  context_tenant := pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  );
  IF context_tenant IS NULL OR context_tenant <> p_tenant_id::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning authorization tenant context mismatch';
  END IF;

  INSERT INTO public.planning_authorization_epochs AS epoch (
    tenant_id,
    current_epoch,
    updated_at
  )
  VALUES (p_tenant_id, 1, transaction_timestamp())
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    current_epoch = epoch.current_epoch + 1,
    updated_at = transaction_timestamp()
  RETURNING current_epoch INTO next_epoch;

  RETURN next_epoch;
END;
$$;

CREATE UNIQUE INDEX support_access_grants_planning_scope_idx
  ON public.support_access_grants(tenant_id, platform_user_id, id);

CREATE UNIQUE INDEX platform_users_planning_actor_idx
  ON public.platform_users(id, user_id);

CREATE TABLE public.planning_mutation_receipts (
  id uuid PRIMARY KEY,
  contract_version text NOT NULL,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  support_grant_id uuid,
  support_platform_user_id uuid,
  support_grant_reason text,
  support_grant_starts_at timestamptz,
  support_grant_expires_at timestamptz,
  authorization_epoch bigint NOT NULL,
  authorization_checked_at timestamptz NOT NULL,
  authorization_context_hash text NOT NULL,
  mutation_id uuid NOT NULL,
  origin_client_id uuid NOT NULL,
  action_type text NOT NULL,
  input_mode text NOT NULL,
  permission_key text NOT NULL,
  requested_at timestamptz NOT NULL,
  request_hash text NOT NULL,
  normalized_request jsonb NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  evaluation_expires_at timestamptz NOT NULL,
  action_evaluation_hash text NOT NULL,
  source_preview_evaluation_hash text,
  proposal_hash text,
  warning_reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  accepted_warning_reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  affected_assignment_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  affected_staffing_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  affected_interest_response_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  expected_assignment_versions jsonb NOT NULL,
  expected_staffing_versions jsonb NOT NULL,
  expected_interest_response_versions jsonb NOT NULL,
  before_assignment_versions jsonb NOT NULL,
  after_assignment_versions jsonb NOT NULL,
  before_staffing_versions jsonb NOT NULL,
  after_staffing_versions jsonb NOT NULL,
  before_interest_response_versions jsonb NOT NULL,
  after_interest_response_versions jsonb NOT NULL,
  before_records jsonb NOT NULL,
  after_records jsonb NOT NULL,
  display_before_records jsonb NOT NULL,
  display_after_records jsonb NOT NULL,
  saved_result jsonb NOT NULL,
  planning_revision_before bigint NOT NULL,
  planning_revision_after bigint NOT NULL,
  preview_receipt_id uuid,
  undo_of_receipt_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  committed_at timestamptz NOT NULL,
  undo_expires_at timestamptz,
  retention_until timestamptz NOT NULL,

  CONSTRAINT planning_mutation_receipts_contract_check
    CHECK (contract_version = 'fieldflow-planboard-v1'),
  CONSTRAINT planning_mutation_receipts_action_check
    CHECK (action_type IN (
      'place', 'move', 'unassign', 'release',
      'optimize-preview', 'optimize-commit', 'undo'
    )),
  CONSTRAINT planning_mutation_receipts_input_mode_check
    CHECK (input_mode IN (
      'pointer', 'keyboard', 'touch', 'menu', 'map-suggestion'
    )),
  CONSTRAINT planning_mutation_receipts_permission_check
    CHECK (permission_key = 'planning:write'),
  CONSTRAINT planning_mutation_receipts_status_check
    CHECK (
      (action_type = 'optimize-preview' AND status = 'previewed')
      OR (action_type <> 'optimize-preview' AND status = 'committed')
    ),
  CONSTRAINT planning_mutation_receipts_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT planning_mutation_receipts_authorization_check
    CHECK (
      authorization_epoch >= 0
      AND authorization_context_hash ~ '^[0-9a-f]{64}$'
      AND authorization_checked_at = committed_at
    ),
  CONSTRAINT planning_mutation_receipts_support_context_check
    CHECK ((
      (
        support_grant_id IS NULL
        AND support_platform_user_id IS NULL
        AND support_grant_reason IS NULL
        AND support_grant_starts_at IS NULL
        AND support_grant_expires_at IS NULL
      )
      OR (
        support_grant_id IS NOT NULL
        AND support_platform_user_id IS NOT NULL
        AND support_grant_reason IS NOT NULL
        AND support_grant_starts_at IS NOT NULL
        AND support_grant_expires_at IS NOT NULL
        AND length(btrim(support_grant_reason)) > 0
        AND support_grant_starts_at <= authorization_checked_at
        AND support_grant_expires_at > authorization_checked_at
      )
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_action_evaluation_hash_check
    CHECK (action_evaluation_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT planning_mutation_receipts_source_preview_hash_check
    CHECK (
      (action_type = 'optimize-commit'
        AND source_preview_evaluation_hash IS NOT NULL
        AND source_preview_evaluation_hash ~ '^[0-9a-f]{64}$')
      OR (action_type <> 'optimize-commit'
        AND source_preview_evaluation_hash IS NULL)
    ),
  CONSTRAINT planning_mutation_receipts_proposal_hash_check
    CHECK (
      (action_type IN ('optimize-preview', 'optimize-commit')
        AND proposal_hash IS NOT NULL
        AND proposal_hash ~ '^[0-9a-f]{64}$')
      OR (action_type NOT IN ('optimize-preview', 'optimize-commit')
        AND proposal_hash IS NULL)
    ),
  CONSTRAINT planning_mutation_receipts_warning_codes_check
    CHECK (
      public.fieldgrid_text_array_is_sorted_unique(warning_reason_codes)
      AND warning_reason_codes <@ ARRAY[
        'AVAILABILITY_MISMATCH',
        'ROLE_MISMATCH',
        'SECTOR_MISMATCH',
        'CERTIFICATE_MISMATCH',
        'DIPLOMA_MISMATCH',
        'KNOWLEDGE_MISMATCH',
        'REGION_MISMATCH',
        'CAPACITY_NEAR_LIMIT',
        'OUTSIDE_PREFERRED_WINDOW',
        'TEAM_TIME_CHANGE',
        'ROUTE_TRAVEL_TIGHT'
      ]::text[]
      AND public.fieldgrid_text_array_is_sorted_unique(
        accepted_warning_reason_codes
      )
      AND (
        (action_type = 'optimize-preview'
          AND accepted_warning_reason_codes = ARRAY[]::text[])
        OR (action_type = 'undo'
          AND warning_reason_codes = ARRAY[]::text[]
          AND accepted_warning_reason_codes = ARRAY[]::text[])
        OR (action_type NOT IN ('optimize-preview', 'undo')
          AND accepted_warning_reason_codes = warning_reason_codes)
      )
    ),
  CONSTRAINT planning_mutation_receipts_affected_ids_check
    CHECK (
      cardinality(affected_assignment_ids) > 0
      AND public.fieldgrid_uuid_array_is_sorted_unique(
        affected_assignment_ids
      )
      AND public.fieldgrid_uuid_array_is_sorted_unique(affected_staffing_ids)
      AND public.fieldgrid_uuid_array_is_sorted_unique(
        affected_interest_response_ids
      )
    ),
  CONSTRAINT planning_mutation_receipts_interest_ids_check
    CHECK ((
      (
        action_type = 'place'
        AND normalized_request #>> '{payload,source,kind}' = 'interest'
        AND cardinality(affected_interest_response_ids) = 1
        AND affected_interest_response_ids[1]::text
          = normalized_request #>> '{payload,source,interestResponseId}'
      )
      OR (
        NOT (
          action_type = 'place'
          AND normalized_request #>> '{payload,source,kind}' = 'interest'
        )
        AND affected_interest_response_ids = ARRAY[]::uuid[]
      )
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_json_shapes_check
    CHECK (
      jsonb_typeof(normalized_request) = 'object'
      AND jsonb_typeof(expected_assignment_versions) = 'array'
      AND jsonb_typeof(expected_staffing_versions) = 'array'
      AND jsonb_typeof(expected_interest_response_versions) = 'array'
      AND jsonb_typeof(before_assignment_versions) = 'array'
      AND jsonb_typeof(after_assignment_versions) = 'array'
      AND jsonb_typeof(before_staffing_versions) = 'array'
      AND jsonb_typeof(after_staffing_versions) = 'array'
      AND jsonb_typeof(before_interest_response_versions) = 'array'
      AND jsonb_typeof(after_interest_response_versions) = 'array'
      AND jsonb_typeof(before_records) = 'array'
      AND jsonb_typeof(after_records) = 'array'
      AND jsonb_typeof(display_before_records) = 'array'
      AND jsonb_typeof(display_after_records) = 'array'
      AND jsonb_typeof(saved_result) = 'object'
    ),
  CONSTRAINT planning_mutation_receipts_display_records_check
    CHECK (
      status = 'previewed'
      OR (
        status = 'committed'
        AND display_before_records = '[]'::jsonb
        AND display_after_records = '[]'::jsonb
      )
    ),
  CONSTRAINT planning_mutation_receipts_request_identity_check
    CHECK ((
      normalized_request ?& ARRAY[
        'contractVersion', 'action', 'mutationId',
        'originClientId', 'requestedAt', 'inputMode',
        'versions', 'payload'
      ]::text[]
      AND jsonb_typeof(normalized_request -> 'requestedAt') = 'string'
      AND jsonb_typeof(normalized_request -> 'versions') = 'object'
      AND jsonb_typeof(normalized_request -> 'payload') = 'object'
      AND normalized_request ->> 'contractVersion' = contract_version
      AND normalized_request ->> 'action' = action_type
      AND normalized_request ->> 'mutationId' = mutation_id::text
      AND normalized_request ->> 'originClientId' = origin_client_id::text
      AND (normalized_request ->> 'requestedAt')::timestamptz = requested_at
      AND normalized_request ->> 'inputMode' = input_mode
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_preview_hash_identity_check
    CHECK ((
      (action_type = 'optimize-commit'
        AND normalized_request #>> '{payload,previewEvaluationHash}'
          = source_preview_evaluation_hash)
      OR action_type <> 'optimize-commit'
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_warning_confirmation_check
    CHECK ((
      action_type = 'optimize-preview'
      OR cardinality(warning_reason_codes) = 0
      OR (
        normalized_request #>> '{payload,warningConfirmation,decision}'
          = 'accept'
        AND normalized_request
          #>> '{payload,warningConfirmation,warningEvaluationHash}'
          = action_evaluation_hash
        AND (
          normalized_request
            #>> '{payload,warningConfirmation,evaluationIssuedAt}'
        )::timestamptz = evaluated_at
        AND normalized_request
          #> '{payload,warningConfirmation,acceptedReasonCodes}'
          = to_jsonb(accepted_warning_reason_codes)
      )
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_result_identity_check
    CHECK ((
      saved_result ?& ARRAY[
        'contractVersion', 'action', 'mutationId',
        'requestHash', 'kind', 'receiptId'
      ]::text[]
      AND saved_result ->> 'contractVersion' = contract_version
      AND saved_result ->> 'action' = action_type
      AND saved_result ->> 'mutationId' = mutation_id::text
      AND saved_result ->> 'requestHash' = request_hash
      AND saved_result ->> 'receiptId' = id::text
      AND (
        (status = 'previewed'
          AND jsonb_object_length(saved_result) = 14
          AND saved_result ?& ARRAY[
            'previewEvaluationHash', 'proposalHash',
            'evaluationIssuedAt', 'validUntil', 'planningRevision',
            'beforeRecords', 'afterRecords', 'reasons'
          ]::text[]
          AND saved_result ->> 'kind' = 'preview'
          AND saved_result ->> 'previewEvaluationHash'
            = action_evaluation_hash
          AND saved_result ->> 'proposalHash' = proposal_hash
          AND (
            saved_result ->> 'evaluationIssuedAt'
          )::timestamptz = evaluated_at
          AND (saved_result ->> 'validUntil')::timestamptz
            = evaluation_expires_at
          AND jsonb_typeof(saved_result -> 'planningRevision') = 'string'
          AND saved_result ->> 'planningRevision'
            = planning_revision_before::text
          AND planning_revision_after = planning_revision_before
          AND saved_result -> 'beforeRecords' = display_before_records
          AND saved_result -> 'afterRecords' = display_after_records
          AND jsonb_typeof(saved_result -> 'reasons') = 'array')
        OR (status = 'committed'
          AND jsonb_object_length(saved_result) = 13
          AND saved_result ?& ARRAY[
            'saved', 'versions', 'planningRevision',
            'affectedAssignmentIds', 'affectedStaffingIds',
            'affectedInterestResponseIds', 'undo'
          ]::text[]
          AND saved_result ->> 'kind' = 'committed'
          AND jsonb_typeof(saved_result -> 'saved') = 'object'
          AND jsonb_typeof(saved_result -> 'versions') = 'object'
          AND jsonb_typeof(saved_result -> 'planningRevision') = 'string'
          AND jsonb_typeof(
            saved_result #> '{versions,planningRevision}'
          ) = 'string'
          AND jsonb_typeof(
            saved_result #> '{versions,assignments}'
          ) = 'array'
          AND jsonb_typeof(
            saved_result #> '{versions,staffing}'
          ) = 'array'
          AND jsonb_typeof(
            saved_result #> '{versions,interestResponses}'
          ) = 'array'
          AND jsonb_typeof(
            saved_result #> '{saved,planningRevision}'
          ) = 'string'
          AND jsonb_typeof(
            saved_result #> '{saved,assignments}'
          ) = 'array'
          AND jsonb_typeof(
            saved_result #> '{saved,staffing}'
          ) = 'array'
          AND jsonb_typeof(
            saved_result #> '{saved,interestResponses}'
          ) = 'array'
          AND saved_result ->> 'planningRevision'
            = planning_revision_after::text
          AND saved_result #>> '{versions,planningRevision}'
            = planning_revision_after::text
          AND saved_result #>> '{saved,planningRevision}'
            = planning_revision_after::text
          AND saved_result -> 'affectedAssignmentIds'
            = to_jsonb(affected_assignment_ids)
          AND saved_result -> 'affectedStaffingIds'
            = to_jsonb(affected_staffing_ids)
          AND saved_result -> 'affectedInterestResponseIds'
            = to_jsonb(affected_interest_response_ids)
          AND jsonb_typeof(saved_result -> 'undo') = 'object'
          AND (saved_result -> 'undo') ?& ARRAY[
            'eligibleAtCommit', 'targetMutationId', 'expiresAt'
          ]::text[]
          AND (
            (action_type = 'undo'
              AND jsonb_object_length(saved_result -> 'undo') = 4
              AND jsonb_typeof(
                saved_result #> '{undo,eligibleAtCommit}'
              ) = 'boolean'
              AND saved_result #>> '{undo,eligibleAtCommit}' = 'false'
              AND saved_result #> '{undo,targetMutationId}' = 'null'::jsonb
              AND saved_result #> '{undo,expiresAt}' = 'null'::jsonb
              AND saved_result #>> '{undo,reason}' = 'NOT_UNDOABLE')
            OR (action_type <> 'undo'
              AND jsonb_object_length(saved_result -> 'undo') = 3
              AND jsonb_typeof(
                saved_result #> '{undo,eligibleAtCommit}'
              ) = 'boolean'
              AND saved_result #>> '{undo,eligibleAtCommit}' = 'true'
              AND saved_result #>> '{undo,targetMutationId}'
                = mutation_id::text
              AND (
                saved_result #>> '{undo,expiresAt}'
              )::timestamptz = undo_expires_at)
          ))
      )
    ) IS TRUE),
  CONSTRAINT planning_mutation_receipts_revision_check
    CHECK (
      planning_revision_before >= 0
      AND (
        (status = 'previewed'
          AND planning_revision_after = planning_revision_before)
        OR (status = 'committed'
          AND planning_revision_after = planning_revision_before + 1)
      )
    ),
  CONSTRAINT planning_mutation_receipts_evaluation_window_check
    CHECK (
      evaluation_expires_at = evaluated_at + interval '5 minutes'
      AND committed_at >= evaluated_at
      AND created_at <= committed_at
    ),
  CONSTRAINT planning_mutation_receipts_undo_window_check
    CHECK (
      (action_type IN (
        'place', 'move', 'unassign', 'release', 'optimize-commit'
      )
        AND undo_expires_at IS NOT NULL
        AND undo_expires_at = committed_at + interval '10 minutes')
      OR (action_type IN ('optimize-preview', 'undo')
        AND undo_expires_at IS NULL)
    ),
  CONSTRAINT planning_mutation_receipts_retention_check
    CHECK (retention_until = committed_at + interval '180 days'),
  CONSTRAINT planning_mutation_receipts_preview_link_check
    CHECK (
      (action_type = 'optimize-commit' AND preview_receipt_id IS NOT NULL)
      OR (action_type <> 'optimize-commit' AND preview_receipt_id IS NULL)
    ),
  CONSTRAINT planning_mutation_receipts_undo_link_check
    CHECK (
      (action_type = 'undo' AND undo_of_receipt_id IS NOT NULL)
      OR (action_type <> 'undo' AND undo_of_receipt_id IS NULL)
    ),
  CONSTRAINT planning_mutation_receipts_idempotency_key
    UNIQUE (tenant_id, actor_user_id, mutation_id),
  CONSTRAINT planning_mutation_receipts_scoped_id_key
    UNIQUE (tenant_id, actor_user_id, id),
  CONSTRAINT planning_mutation_receipts_preview_receipt_fk
    FOREIGN KEY (tenant_id, actor_user_id, preview_receipt_id)
    REFERENCES public.planning_mutation_receipts(
      tenant_id, actor_user_id, id
    ) ON DELETE RESTRICT,
  CONSTRAINT planning_mutation_receipts_undo_receipt_fk
    FOREIGN KEY (tenant_id, actor_user_id, undo_of_receipt_id)
    REFERENCES public.planning_mutation_receipts(
      tenant_id, actor_user_id, id
    ) ON DELETE RESTRICT,
  CONSTRAINT planning_mutation_receipts_support_grant_fk
    FOREIGN KEY (
      tenant_id,
      support_platform_user_id,
      support_grant_id
    )
    REFERENCES public.support_access_grants(
      tenant_id,
      platform_user_id,
      id
    ) ON DELETE RESTRICT,
  CONSTRAINT planning_mutation_receipts_support_actor_fk
    FOREIGN KEY (support_platform_user_id, actor_user_id)
    REFERENCES public.platform_users(id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE public.planning_mutation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planning_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX planning_mutation_receipts_preview_once_idx
  ON public.planning_mutation_receipts(preview_receipt_id)
  WHERE action_type = 'optimize-commit';

CREATE UNIQUE INDEX planning_mutation_receipts_undo_once_idx
  ON public.planning_mutation_receipts(undo_of_receipt_id)
  WHERE action_type = 'undo';

CREATE INDEX planning_mutation_receipts_tenant_activity_idx
  ON public.planning_mutation_receipts(
    tenant_id, committed_at DESC, id
  );

CREATE INDEX planning_mutation_receipts_support_grant_idx
  ON public.planning_mutation_receipts(support_grant_id)
  WHERE support_grant_id IS NOT NULL;

CREATE INDEX planning_mutation_receipts_retention_idx
  ON public.planning_mutation_receipts(retention_until, id);

CREATE INDEX planning_mutation_receipts_assignments_gin_idx
  ON public.planning_mutation_receipts
  USING gin (affected_assignment_ids);

CREATE INDEX planning_mutation_receipts_staffing_gin_idx
  ON public.planning_mutation_receipts
  USING gin (affected_staffing_ids);

CREATE INDEX planning_mutation_receipts_interest_responses_gin_idx
  ON public.planning_mutation_receipts
  USING gin (affected_interest_response_ids);

CREATE FUNCTION public.fieldgrid_get_planning_revision()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  observed_revision bigint;
BEGIN
  context_tenant := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  ), '')::uuid;
  context_actor := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_actor_user_id',
    true
  ), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning revision context is required';
  END IF;

  SELECT counter.current_revision
  INTO observed_revision
  FROM public.planning_revision_counters AS counter
  WHERE counter.tenant_id = context_tenant;

  RETURN COALESCE(observed_revision, 0);
END;
$$;

CREATE FUNCTION public.fieldgrid_lock_planning_authorization_epoch()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  observed_epoch bigint;
BEGIN
  context_tenant := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  ), '')::uuid;
  context_actor := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_actor_user_id',
    true
  ), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning authorization context is required';
  END IF;

  SELECT epoch.current_epoch
  INTO observed_epoch
  FROM public.planning_authorization_epochs AS epoch
  WHERE epoch.tenant_id = context_tenant
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning authorization epoch is missing';
  END IF;

  RETURN observed_epoch;
END;
$$;

CREATE FUNCTION public.fieldgrid_get_planning_receipt_by_mutation(
  p_mutation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  receipt_json jsonb;
BEGIN
  context_tenant := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  ), '')::uuid;
  context_actor := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_actor_user_id',
    true
  ), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning receipt context is required';
  END IF;

  SELECT pg_catalog.to_jsonb(receipt)
  INTO receipt_json
  FROM public.planning_mutation_receipts AS receipt
  WHERE receipt.tenant_id = context_tenant
    AND receipt.actor_user_id = context_actor
    AND receipt.mutation_id = p_mutation_id
  FOR UPDATE;

  RETURN receipt_json;
END;
$$;

CREATE FUNCTION public.fieldgrid_get_planning_receipt_child(
  p_parent_receipt_id uuid,
  p_child_action text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  receipt_json jsonb;
BEGIN
  IF p_child_action NOT IN ('optimize-commit', 'undo') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unsupported planning receipt child action';
  END IF;

  context_tenant := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  ), '')::uuid;
  context_actor := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_actor_user_id',
    true
  ), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning receipt context is required';
  END IF;

  SELECT pg_catalog.to_jsonb(receipt)
  INTO receipt_json
  FROM public.planning_mutation_receipts AS receipt
  WHERE receipt.tenant_id = context_tenant
    AND receipt.actor_user_id = context_actor
    AND receipt.action_type = p_child_action
    AND (
      (p_child_action = 'optimize-commit'
        AND receipt.preview_receipt_id = p_parent_receipt_id)
      OR (p_child_action = 'undo'
        AND receipt.undo_of_receipt_id = p_parent_receipt_id)
    )
  FOR UPDATE;

  RETURN receipt_json;
END;
$$;

CREATE FUNCTION public.fieldgrid_insert_planning_mutation_receipt(
  p_receipt jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  context_tenant uuid;
  context_actor uuid;
  candidate public.planning_mutation_receipts%ROWTYPE;
  inserted_receipt public.planning_mutation_receipts%ROWTYPE;
  observed_epoch bigint;
  insert_clock timestamptz;
BEGIN
  IF pg_catalog.jsonb_typeof(p_receipt) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'planning receipt must be a JSON object';
  END IF;

  context_tenant := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_tenant_id',
    true
  ), '')::uuid;
  context_actor := NULLIF(pg_catalog.current_setting(
    'app.fieldgrid_actor_user_id',
    true
  ), '')::uuid;

  IF context_tenant IS NULL OR context_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning receipt context is required';
  END IF;

  SELECT populated.*
  INTO candidate
  FROM pg_catalog.jsonb_populate_record(
    NULL::public.planning_mutation_receipts,
    p_receipt
  ) AS populated;

  IF candidate.tenant_id IS DISTINCT FROM context_tenant
    OR candidate.actor_user_id IS DISTINCT FROM context_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning receipt tenant or actor context mismatch';
  END IF;

  SELECT epoch.current_epoch
  INTO observed_epoch
  FROM public.planning_authorization_epochs AS epoch
  WHERE epoch.tenant_id = context_tenant
  FOR SHARE;

  IF NOT FOUND OR candidate.authorization_epoch IS DISTINCT FROM observed_epoch THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'planning receipt authorization epoch mismatch';
  END IF;

  insert_clock := pg_catalog.clock_timestamp();
  IF candidate.committed_at < pg_catalog.transaction_timestamp()
    OR candidate.committed_at > insert_clock THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'planning receipt commit time is outside this transaction';
  END IF;

  INSERT INTO public.planning_mutation_receipts
  SELECT (candidate).*
  RETURNING * INTO inserted_receipt;

  RETURN pg_catalog.to_jsonb(inserted_receipt);
END;
$$;

CREATE FUNCTION public.fieldgrid_planning_receipt_reject_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'planning mutation receipts are immutable';
END;
$$;

CREATE TRIGGER planning_mutation_receipts_reject_update
BEFORE UPDATE ON public.planning_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_planning_receipt_reject_update();

CREATE FUNCTION public.fieldgrid_planning_receipt_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.retention_until > transaction_timestamp() THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'planning mutation receipt retention has not expired';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER planning_mutation_receipts_delete_guard
BEFORE DELETE ON public.planning_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_planning_receipt_delete_guard();

CREATE FUNCTION public.fieldgrid_prune_planning_mutation_receipts(
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'p_limit must be between 1 and 10000';
  END IF;

  WITH doomed AS (
    SELECT receipt.id
    FROM public.planning_mutation_receipts AS receipt
    WHERE receipt.retention_until <= transaction_timestamp()
      AND NOT EXISTS (
        SELECT 1
        FROM public.planning_mutation_receipts AS child
        WHERE child.preview_receipt_id = receipt.id
           OR child.undo_of_receipt_id = receipt.id
      )
    ORDER BY receipt.retention_until, receipt.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.planning_mutation_receipts AS receipt
    USING doomed
    WHERE receipt.id = doomed.id
    RETURNING receipt.id
  )
  SELECT count(*)::integer INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fieldgrid_uuid_array_is_sorted_unique(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_text_array_is_sorted_unique(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_advance_planning_revision(uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_advance_planning_authorization_epoch(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_initialize_planning_authorization_epoch()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_get_planning_revision()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_lock_planning_authorization_epoch()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_get_planning_receipt_by_mutation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_get_planning_receipt_child(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_insert_planning_mutation_receipt(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_planning_receipt_reject_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_planning_receipt_delete_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.fieldgrid_prune_planning_mutation_receipts(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_get_planning_revision()
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_lock_planning_authorization_epoch()
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_get_planning_receipt_by_mutation(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_get_planning_receipt_child(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_insert_planning_mutation_receipt(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_advance_planning_revision(uuid, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_advance_planning_authorization_epoch(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.fieldgrid_prune_planning_mutation_receipts(integer)
  TO service_role;
```

Er is bewust op geen van de drie contracttabellen een policy of directe DML-grant voor `PUBLIC`, `anon`, `authenticated` of `service_role`; RLS staat enabled als extra deny-laag. `FORCE ROW LEVEL SECURITY` is bewust niet gezet: dezelfde vaste migratieowner bezit tabellen én definers, zodat uitsluitend de gerevokete `SECURITY DEFINER`-route portable door RLS heen kan werken zonder superuser- of `BYPASSRLS`-aanname. De Server Action gebruikt de bestaande server-only `DATABASE_URL`/serviceverbinding en exact één korte PostgreSQL-transactie voor canonieke autorisatie- en dependencylocks, domeinwrites, receipt, audit en outbox. Na het afleiden van tenant en actor uit host/session/servercontext zet die transactie via `set_config(..., true)` exact `app.fieldgrid_tenant_id` en `app.fieldgrid_actor_user_id`. Er is geen tweede credential, connection, nested transaction of `SET ROLE`: alle effecten committen of rollen samen terug.

Alle runtime-toegang tot de drie contracttabellen loopt via de exacte, van `PUBLIC`, browserrollen en eerst ook `service_role` gerevokete `SECURITY DEFINER`-functies, waarna alleen `service_role` gericht `EXECUTE` terugkrijgt. `fieldgrid_get_planning_revision`, `fieldgrid_lock_planning_authorization_epoch`, beide receiptlookups en receiptinsert vereisen geldige transaction-local tenant- én actorcontext; lookup en insert filteren/binden beide waarden. `fieldgrid_advance_planning_revision` en de producer-only `fieldgrid_advance_planning_authorization_epoch` weigeren een tenantparameter die afwijkt van de tenantcontext. Alleen de onderhoudsfunctie prune is tenantloos. Alle definers hebben `search_path=''` en volledig gekwalificeerde relaties; de insert controleert bovendien epoch en een databasekloktijd uit dezelfde transactie. Arrayhelpers en triggers blijven `SECURITY INVOKER`. De migratieowner bezit de tabellen en definers uitsluitend voor migratie/defineruitvoering; server- en browserrollen mogen ze niet vervangen of als owner verbinden.

`planning_revision_counters` is de enige planningrevisionautoriteit. Een ontbrekende rij betekent revision `0`; contextgebonden reads en previews gebruiken `fieldgrid_get_planning_revision()` en muteren niets. De gesloten producerlijst is: assignment lifecycle/schedule, staffingtransition, interestresponsetransition, personnelactivatie, beschikbaarheid, ziekte/verlof, rol/sector/certificaat/diploma/kennis, regio, required-slots/capaciteit, routecache/reisbeleid en planningpolicy. Iedere producer zet binnen dezelfde bestaande server-/domeintransactie de tenantcontext, roept `fieldgrid_advance_planning_revision(tenantId, expectedRevision)` aan en schrijft één `planning_refresh`-outboxevent; een nieuwe dependency of writer mag niet releasen voordat zij aan beide lijsten is toegevoegd. De functie retourneert exact `expectedRevision + 1`; `NULL` betekent dat een andere commit won en wordt `VERSION_STALE` met volledige rollback. Daardoor kan receiptretention de monotoniciteit nooit resetten.

`planning_authorization_epochs` serialiseert tenantmembership, rol/permission, planningmodule, mapfeature/providerconfig, tenantstatus en supportgrant create/revoke/scope. Iedere producer zet eerst de tenantcontext en verhoogt via `fieldgrid_advance_planning_authorization_epoch(tenantId)` de tenantepoch, en wijzigt daarna de autorisatierij in dezelfde transactie; dit is de vaste lockvolgorde. Een planbordmutatie roept `fieldgrid_lock_planning_authorization_epoch()` aan en houdt de verkregen `FOR SHARE`-lock vast, lockt daarna met de bestaande serverprivileges de concrete `tenant_users`-membership óf `support_access_grants` plus `platform_users`, en lockt de canonieke module-/permission-/mapgatebronnen. Zij bewaart het epochnummer en hercontroleert alle bronnen direct vóór de write. De autorisatiewriter heeft de conflicterende epoch-update nodig; daardoor serialiseert commit vóór revoke óf revoke vóór een volledig geweigerde mutation. Een ontbrekende epoch is `AUTHORIZATION_CHANGED` en nul writes; tenantprovisioning maakt altijd epoch `0`.

Voor een normale tenantgebruiker zijn alle supportkolommen verplicht `NULL` en moet `(tenant_id, actor_user_id)` naar de gelockte actieve tenantmembership leiden. Voor support-as-tenant bewaart de receipt naast de composite same-tenant/platform-user/grant-FK een immutable snapshot van grant-ID, platform-user, reden, start en expiry; een tweede composite FK bindt `(support_platform_user_id, actor_user_id)` aan `platform_users(id, user_id)`. Een grant kan daardoor ook via een serverroutebug niet aan een andere tenant of auth-actor worden gehangen. `authorization_context_hash` is lowercase SHA-256/RFC 8785 over `{mode,tenantId,actorUserId,authorizationEpoch,membershipId,supportGrantId,supportPlatformUserId,supportReason,supportStartsAt,supportExpiresAt,module,permissions,mapGate}`. Dezelfde snapshot staat in het auditrecord. Direct na de finale recheck leest de transactie één database-`clock_timestamp()` en gebruikt exact die waarde als `authorization_checked_at` én `committed_at`; de insertfunctie weigert een tijd vóór de transactiestart of in de toekomst, en de constraints eisen `startsAt <= committedAt < expiresAt`. Revoked, verlopen, verwisselde of cross-tenant grants schrijven niets.

De onderhoudsscheduler roept dagelijks om `02:15 UTC` als `service_role` `fieldgrid_prune_planning_mutation_receipts(1000)` aan en herhaalt binnen dezelfde run totdat `0` wordt geretourneerd. Een receipt blijft exact 180 dagen na `committed_at` intact. Een nog gerefereerde preview- of undoreceipt blijft staan totdat eerst het eveneens verlopen kind is verwijderd; de FK gebruikt `RESTRICT`, nooit cascade.

### 11.2 Transactie-, retry- en conflictalgoritme

1. Resolveer de authentieke tenant, actor en eventuele supportcontext uit host/session/servercontext; controleer voorlopig `planning` en `planning:write`. Geen van die waarden komt uit de body. Open daarna op de bestaande server-only `DATABASE_URL`/serviceverbinding exact één korte DB-transactie en zet beide transaction-local contextwaarden; open geen tweede connection en wissel geen rol.
2. Roep `fieldgrid_lock_planning_authorization_epoch()` aan, houd de epoch-lock tot transactie-einde vast en lock daarna de concrete membership- of supportgrant/platform-user-, tenant-, module-, permission- en zo nodig mapfeature/providerconfigrijen met de bestaande serverprivileges. Herhaal de autorisatie met databasewaarden. Neem vervolgens `pg_advisory_xact_lock(hashtextextended(tenantId || ':' || actorUserId || ':' || mutationId, 0))`.
3. Parse de gesloten union, canonicaliseer met RFC 8785 en bereken `requestHash`. Zoek pas na autorisatie via `fieldgrid_get_planning_receipt_by_mutation(mutationId)`; de functie filtert intern op de transaction-local tenant én actor en lockt een gevonden rij. Bij gelijke `action_type` en `request_hash` blijft het opgeslagen `saved_result` ongewijzigd; de server maakt een nieuwe responsewrapper met huidig `serverTime`, `replayed=true` en een vers berekende `previewState` of `undoState`. Iedere afwijking retourneert `MUTATION_ID_REUSED`; geen replay veroorzaakt domeinwrite, audit, revision, event of notificatie.
4. Alleen wanneer geen receipt bestaat, accepteert de server `requestedAt` van maximaal 24 uur oud en maximaal 60 seconden in de toekomst; anders `REQUEST_EXPIRED` zonder write. Een bestaande exacte replay blijft na dit admission window beschikbaar zolang de receipt bestaat en de actor nú opnieuw geautoriseerd is.
5. Bepaal de volledige dependency closure server-side. Lock in vaste classvolgorde assignments, staffing, interestresponses, personnelstate, beschikbaarheid, ziekte/verlof, role/sector/qualification, regio, required-slots/capaciteit en routecache/reisbeleid; binnen een class op oplopende UUID. Vergelijk planningrevision en iedere opgegeven assignment-/staffing-/interestresponseversion exact. Een ontbrekende, extra, dubbele of afwijkende entry geeft `VERSION_STALE` en nul writes. Een niet-lockbare dependency moet een monotone version in de evaluatiehash hebben én haar writer verhoogt dezelfde tenantrevision, anders faalt de action gesloten.
6. Evalueer status, tijd, overlap, staffing, interessebron, capaciteit, teamimpact en warninghash op de gelockte state. Bij interestbron moeten response, assignment en targetpersoon exact overeenkomen. Blocked/forbidden/invalid/stale/expired/changed/undo-conflict rolt de hele transactie terug, inclusief receipt.
7. Hercontroleer de onveranderde autorisatie-epoch, membership of grant, support-TTL met `clock_timestamp()` en conditionele mapgate. Een verschil is `AUTHORIZATION_CHANGED`, `PERMISSION_DENIED`, `MAP_GATE_DENIED` of `TENANT_DENIED` en nul writes.
8. Genereer `receiptId` server-side en lees direct na de finale recheck één database-linearisatietijd. `optimize-preview` leest revision via `fieldgrid_get_planning_revision()` en schrijft uitsluitend één previewreceipt met gelijke before/after-revision. Iedere geslaagde overige action compare-and-increment via `fieldgrid_advance_planning_revision(tenantId, expectedRevision)`. `place` met interestbron wijzigt response→`confirmed`, staffing, assignment en capaciteit in dezelfde transactie. Domainrecords krijgen verse lifecycleversions; `fieldgrid_insert_planning_mutation_receipt(receiptJson)` bindt tenant, actor, epoch en transactietijd. Receipt, volledige audit inclusief autorisatiecontext en één transactional-outboxevent committen samen.
9. Notificaties consumeren pas na commit het outboxevent met dedupekey `planning:<tenantId>:<actorUserId>:<mutationId>`, exact dezelfde scope als de receiptkey; `mutationId` alleen is verboden. Een verloren verbinding na commit leidt bij retry naar stap 3 en kan geen tweede event of mutatie veroorzaken, terwijl dezelfde UUID bij een andere actor of tenant niet botst.

`optimize-commit` laadt en lockt de same-tenant/same-actor previewreceipt via `fieldgrid_get_planning_receipt_by_mutation(previewMutationId)` en controleert via `fieldgrid_get_planning_receipt_child(previewReceiptId, 'optimize-commit')` of al een kind bestaat. `undo` lockt haar doel via dezelfde mutationlookup, vereist een doeltype `place`, `move`, `unassign`, `release` of `optimize-commit`, en controleert het kind met action `undo`. De unieke partial indexes blijven de uiteindelijke exact-once-autoriteit. De actionlaag vertaalt unique violation `23505` respectievelijk naar `PREVIEW_ALREADY_COMMITTED` of `ALREADY_UNDONE`; version mismatch naar `UNDO_VERSION_MISMATCH`; een verlopen deadline naar `WARNING_CONFIRMATION_EXPIRED`, `PREVIEW_EXPIRED` of `UNDO_WINDOW_EXPIRED`. Geen van deze conflicten schrijft een receipt.

Test met twee browser-/DB-sessies, tegengestelde lockvolgorde, retry vóór/na commit, connection loss, dubbele warning-confirm, twee gelijktijdige optimize-commits, twee gelijktijdige undo’s, twee interestselecties voor het laatste slot en procesrestart. Plaats daarnaast barrières tussen eerste authcheck en write en laat membership, permission, module, mapgate of supportgrant gelijktijdig intrekken/verlopen: de uitkomst is een geldige seriële commit vóór de wijziging óf nul writes erna, nooit een post-revoke commit. Laat iedere dependencyproducer tijdens evaluatie muteren en bewijs revisionconflict. Bewijs ten slotte dat browserrollen en `service_role` geen directe receipt/counter/epoch-DML hebben; dat alle entrypoints zonder, met malformed of met mismatched GUC-context gesloten falen; dat een same-session transactie domainwrite plus receipt/outbox werkelijk samen commit en samen terugrolt; dat authproducenten vóór hun rowwrite de epoch verhogen; en dat iedere nieuw gecommitte tenant automatisch epoch `0` krijgt terwijl een teruggerolde tenantinsert geen epoch achterlaat. Iedere faaluitkomst heeft nul domein-, receipt-, audit-, revision-, event- en notificatiewrites. DEC-06 verbiedt alleen een schemawaarde voor designselectie; deze concurrencyremediatie is een afzonderlijke forward migration met rollbackbewijs.

## 12. Optimistic state en undo

### Optimistic

- kaart beweegt direct;
- krijgt pending/aria-busy;
- verdwijnt tijdelijk uit bron;
- success gebruikt server `saved`, niet requestwaarde;
- error herstelt exact bronrij/tijd/staffing/status/focus;
- één actieve mutation per opdracht.

### Undo

Voor:

- queue→board;
- tijd verplaatsen;
- medewerker wisselen;
- medewerker ontkoppelen;
- opdracht vrijgeven;
- expliciet automatisch oplossen (`optimize-commit`).

Undo is exact tien minuten vanaf `committed_at` beschikbaar en wordt daarna server-side met `UNDO_WINDOW_EXPIRED` geweigerd. De immutable server-only receipt bewaart complete `before_records`/`after_records` en before-/after-versionarrays per geraakt assignment, staffinglink én interestresponse; deze volledige snapshots staan bewust niet in de clientresponse. `committed` retourneert `mutationId`, `receiptId`, permission-filtered `saved`, actuele `versions`, `planningRevision`, alle drie affected-ID-arrays, de immutable commitdescriptor `undo` en de verse transportwaarde `undoState`. De client toont een actieve Undo-knop uitsluitend wanneer `undoState.state="available"`; `eligibleAtCommit` of een lokale klokvergelijking is nooit voldoende. De berekeningsvolgorde is exact: action `undo` → `not-undoable`; bestaande undoreceipt → `already-undone`; `serverTime >= expiresAt` → `expired`; afwijkende huidige after-version → `version-conflict`; anders `available`.

De `undo`-action vergelijkt voor iedere huidige assignment, staffinglink en interestresponse exact existence plus de after-version van de doelreceipt. Alleen restorable domeinwaarden en bestaan uit `before_records` worden teruggezet; historische `lifecycleVersion` en `updatedAt` zijn uitsluitend bewijs en worden nooit teruggeschreven. Iedere na undo bestaande rij krijgt `lifecycleVersion = current + 1` en één verse database-`updatedAt`; een door undo verwijderde rij krijgt in de nieuwe receipt een `exists=false` after-tombstone. De undoreceipt gebruikt als before-version de huidige target-after-version en als after-version uitsluitend de nieuw toegewezen versies/tombstones. Daardoor falen zowel een vertraagde pre-undo client als een vertraagde target-response daarna met `VERSION_STALE` in plaats van een ABA-match. Eén mismatch betekent geen enkele write en `UNDO_VERSION_MISMATCH`; één doelreceipt heeft maximaal één undoreceipt. Dit geldt ook voor interestselectie, teamrelease en expliciet automatisch oplossen. Previewreceipts en undo zelf zijn niet undoable. Actual lifecycle timestamps worden nooit door planningundo gewijzigd.

## 13. Realtime

De bestaande `BackofficeRealtimeProvider` abonneert al tenantgescopeerd op de managementstroom en ververst generiek na `planning_refresh`. Behoud dit; de expliciete planbordadapter staat op `artifacts/backoffice/src/lib/realtime/planning-realtime-client.ts`.

`PlanningRouteRefreshPayload` is de gesloten vorm `{tenantId, actorUserId, mutationId, revision, originClientId}`. Tenant en actor zijn server-derived UUID’s, `revision` is de base-10 bigint-string uit de tenantcounter na commit en `originClientId` is uitsluitend een UI-optimalisatie. De subscriber verwerpt het event vóór iedere statewijziging wanneer `tenantId` niet exact de authentieke subscriptiontenant is. Eventidentity en dedupe zijn `(tenantId, revision)`; een los `mutationId` is verboden omdat dezelfde mutation-UUID voor een andere actor een geldige andere receipt kan zijn.

De planbordadapter bewaart per tenant `maxSeenRevision` en `appliedRevision`. Ieder geldig event, ook duplicate of out-of-order, zet high-water op `max(huidig, event.revision)`. Er is maximaal één fetch tegelijk; coalescing bewaart altijd de hoogste revision en na iedere fetch herhaalt de adapter totdat `snapshot.planningRevision >= maxSeenRevision`. Een eigen event mag de fetch alleen overslaan wanneer tenant, actor, originclient én mutation exact de lokaal gecommitte command zijn én `appliedRevision >= event.revision`; een hogere revision wordt nooit door client-ID’s weggefilterd.

Tijdens drag, wizard of pending mutation blijft high-water oplopen, maar de adapter vervangt geen interactionstate en toont “Nieuwere planning beschikbaar”. Na cancel of settle start exact één coalesced catch-uploop. Op subscribe, reconnect, channel error of revisiongap leest de serverroute via `fieldgrid_get_planning_revision()` de autoritatieve tenantrevision en gebruikt dezelfde loop; status blijft `degraded` en daarna `stale` totdat applied de high-water bereikt. Een tenantswitch wist pending-, dedupe- en revisionstate van de oude scope volledig.

Buiten een actieve interactie is een commit in een tweede planner zichtbaar binnen maximaal `2000 ms`, gemeten vanaf de receipt-linearisatietijd; outboxdispatch, channeldelivery en catch-up retries delen dit harde budget. Iedere gesloten dependencyproducer verhoogt revision en schrijft exact één `planning_refresh`-outboxevent in dezelfde transactie. `optimize-preview` en iedere zero-write uitkomst emitten niets. Verplichte tests zijn: dezelfde mutation-UUID bij twee actors, duplicate delivery, `r+2` vóór `r+1`, verloren event plus reconnect, gap tijdens drag, tenantswitch met in-flight fetch, vervalst own-event-ID met hogere revision en een gemeten end-to-end `<=2000 ms` idle-pad.

## 14. Planned versus actual

Gebruik overal `resolveAssignmentEffectiveInterval` met `Europe/Amsterdam`.

| Situatie          | Weergave                                             |
| ----------------- | ---------------------------------------------------- |
| Niet gestart      | planned date/start/end                               |
| In progress       | actual start → nu, planned outline blijft            |
| Completed         | actual start → actual end, planned outline blijft    |
| Partly actual     | best mogelijke interval + datakwaliteitswaarschuwing |
| Geen geldige tijd | ongepland/afwijkend, niet een misleidend blok        |

Geplande velden worden nooit door start/completion overschreven. Conflictdetectie voor de operationele boardweergave gebruikt effectieve intervallen.

Centraliseer “vandaag”/datum/tijd voor Amsterdam. Test:

- lokale middernacht;
- start zomertijd, niet-bestaande tijd;
- einde zomertijd, dubbele tijd;
- over-middernacht;
- server in UTC.

## 15. Inputmethoden

### Pointer

- queuekaart en movable blok draggable;
- pointeroffset behouden;
- volledige hitarea;
- ghost;
- valid/warning/blocked tekst + kleur;
- Escape annuleert.

### Keyboard

- Tab naar queue/board;
- Enter/Spatie selecteert;
- links/rechts = één gridstap (15 min);
- Shift + links/rechts = één uur;
- omhoog/omlaag = medewerker;
- Enter bevestigt;
- Escape annuleert;
- Home/End naar werkvenstergrens;
- `aria-live` noemt medewerker, datum, tijd, status en fout.

Gebruik instructietekst via `aria-describedby`; verouderde `aria-grabbed`/`aria-dropeffect` zijn geen oplossing.

### Touch/mobile

Op 320, 390, 430 en 768:

1. open werk selecteren;
2. details/eisen;
3. medewerker;
4. datum;
5. exact kwartier en duur;
6. conflict/availability/teamimpact;
7. bevestigen of annuleren;
8. bestaande afspraak verplaatsen;
9. medewerker vervangen;
10. ontkoppelen/vrijgeven;
11. undo.

Patroon: card action menu → bottom/fullscreen Sheet wizard. Timeline blijft als optionele expertweergave lokaal horizontaal scrollbaar.

## 16. Technische opsplitsing

Splits de huidige monoliet zonder businesslogica te forken:

```text
PlanningWorkspace
├─ PlanningCommandBar
├─ PlanningFilters
├─ PlanningQueue
│  └─ PlanningQueueCard
├─ PlanningTimeline
│  ├─ TimeHeader
│  ├─ PersonnelRow
│  └─ AssignmentBlock
├─ PlanningDetailsSheet
├─ PlanningMoveWizard
├─ PlanningWeekView
├─ PlanningMonthView
└─ PlanningMapView
```

State:

- URL/view/filter;
- server snapshot;
- optimistic mutation queue;
- active drag/keyboard/touch intent;
- realtime revision;
- local display preferences.

## 17. Kritieke acceptatiescenario’s

| Scenario                   | Verwacht                                          |
| -------------------------- | ------------------------------------------------- |
| Queue naar vrij slot       | kwartiersnap; één mutation; opgeslagen servertijd |
| Queue op overlap           | rood; geen DB/audit/event/notificatie             |
| Blok verplaatsen           | pointeroffset; andere opdrachten bewegen niet     |
| Andere medewerker          | atomair staffingdoel; duplicate/capacityguard     |
| Teamtijd verplaatsen       | teamimpact vóór bevestiging                       |
| Terug naar queue           | expliciete ontkoppel/vrijgeefkeuze                |
| Live blok                  | locked in UI en server                            |
| Mobiel                     | volledige wizard zonder drag                      |
| Keyboard                   | complete workflow en announcements                |
| Serverfout                 | exacte rollback + focus                           |
| Stale planner A/B          | oude save geweigerd                               |
| Realtime tijdens drag      | niet onderbroken; catch-up tot high-water erna    |
| Actual start/completion    | planned behouden; actual overlay correct          |
| Undo direct                | volledige vorige staat                            |
| Undo na nieuwere wijziging | veilig geweigerd                                  |
| Routevoorstel              | dezelfde mutationregels                           |
| Read-only                  | informatie ja, mutationcontrols nee               |
| 320 px                     | geen pageoverflow; 44px                           |
| 1920 px                    | ruimte benut, tekst niet uitgerekt                |

## 18. Actiontraceability

Alle onderstaande IDs bestaan in `manifests/acceptance.json` en `10-RISICOREGISTER.md`. Het machineleesbare manifest herhaalt deze arrays per action; onbekende of verwijderde IDs laten de contractcheck falen.

Normatieve verfijning: FFC-PB-015 omvat assignment-, staffing- én interestresponse-records plus alle drie versionmaps. “Eén refresh” in FFC-PB-016 betekent één coalesced catch-uploop; die loop mag en moet meerdere fetches uitvoeren totdat `snapshot.planningRevision >= maxSeenRevision`, zonder refreshstorm of interactionstate te vervangen.

| Action             | Requirement-IDs                                                                                                                                                                                              | Risk-IDs                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `place`            | FFC-PB-004, FFC-PB-005, FFC-PB-007, FFC-PB-009, FFC-PB-010, FFC-PB-012, FFC-PB-013, FFC-PB-014, FFC-PB-015, FFC-PB-016, FFC-PB-022, FFC-PB-023, FFC-PB-024, FFC-SEC-001, FFC-SEC-002                         | R-003, R-022, R-023, R-025, R-027, R-029, R-031        |
| `move`             | FFC-PB-004, FFC-PB-005, FFC-PB-006, FFC-PB-007, FFC-PB-009, FFC-PB-010, FFC-PB-012, FFC-PB-013, FFC-PB-014, FFC-PB-015, FFC-PB-016, FFC-PB-023, FFC-PB-024, FFC-PB-028, FFC-PB-029, FFC-SEC-001, FFC-SEC-002 | R-003, R-022, R-023, R-025, R-027, R-029, R-030, R-031 |
| `unassign`         | FFC-PB-007, FFC-PB-008, FFC-PB-010, FFC-PB-012, FFC-PB-013, FFC-PB-015, FFC-PB-016, FFC-PB-023, FFC-SEC-001, FFC-SEC-002                                                                                     | R-003, R-024, R-025, R-028, R-029                      |
| `release`          | FFC-PB-007, FFC-PB-008, FFC-PB-012, FFC-PB-013, FFC-PB-015, FFC-PB-016, FFC-PB-023, FFC-SEC-001, FFC-SEC-002                                                                                                 | R-003, R-024, R-025, R-028, R-029                      |
| `optimize-preview` | FFC-PB-004, FFC-PB-010, FFC-PB-011, FFC-PB-012, FFC-PB-013, FFC-PB-023, FFC-SEC-001, FFC-SEC-002                                                                                                             | R-003, R-023, R-024, R-025, R-029                      |
| `optimize-commit`  | FFC-PB-004, FFC-PB-010, FFC-PB-011, FFC-PB-012, FFC-PB-013, FFC-PB-015, FFC-PB-016, FFC-PB-023, FFC-SEC-001, FFC-SEC-002                                                                                     | R-003, R-023, R-024, R-025, R-029                      |
| `undo`             | FFC-PB-008, FFC-PB-011, FFC-PB-012, FFC-PB-013, FFC-PB-015, FFC-PB-016, FFC-PB-023, FFC-SEC-001, FFC-SEC-002                                                                                                 | R-003, R-024, R-025, R-028, R-029                      |

Overkoepelend gelden daarnaast exact de manifestset FFC-SRC-003, FFC-ROUTE-001, FFC-ROUTE-007, alle FFC-PB-001 t/m FFC-PB-030, FFC-RSP-001, FFC-RSP-002, FFC-RSP-008, FFC-RSP-009, FFC-RSP-010, FFC-A11Y-004, FFC-A11Y-007, FFC-SEC-001, FFC-SEC-002, FFC-SEC-003 en FFC-SEC-008, plus R-026, R-032, R-033, R-037 en R-049.
