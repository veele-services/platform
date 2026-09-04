# 01 — Fieldflow Calm designsysteem en componentcontract

De gebruiker bedoelt inderdaad **spacing** als overkoepelend begrip:

- **padding**: ruimte binnen een border/container;
- **gap**: ruimte tussen kinderen van een layoutcontainer;
- **margin**: buitenruimte van één element, alleen waar `gap` niet past;
- **spacing rhythm**: de consistente schaal die padding, gap en margin samen bestuurt.

Fieldflow Calm gebruikt geen “zo klein mogelijk”-dichtheid. Rust ontstaat door een voorspelbaar ritme, duidelijke groepering, één primaire actie per context en progressive disclosure.

## 1. Tokenarchitectuur

`manifests/fieldflow-tokens.json` is de machineleesbare bron. Implementeer een semantische laag; productcomponenten gebruiken nooit ruwe merkkleuren of willekeurige pixelwaarden.

Aanbevolen CSS-contract:

```css
:root {
  --ff-space-1: 4px;
  --ff-space-2: 8px;
  --ff-space-3: 12px;
  --ff-space-4: 16px;
  --ff-space-5: 20px;
  --ff-space-6: 24px;
  --ff-space-7: 28px;
  --ff-space-8: 32px;
  --ff-space-10: 40px;
  --ff-space-12: 48px;

  --ff-page-gutter: clamp(28px, 3.2vw, 54px);
  --ff-section-gap: 30px;
  --ff-cluster-gap: 22px;
  --ff-panel-padding: 26px;
  --ff-control-height: 44px;
  --ff-radius-panel: 22px;
  --ff-radius-card: 18px;
  --ff-radius-control: 13px;
}
```

Op maximaal 860 px:

```css
--ff-page-gutter: 17px;
--ff-section-gap: 22px;
--ff-cluster-gap: 16px;
--ff-panel-padding: 18px;
--ff-radius-panel: 16px;
```

### Gebruik

| Situatie                           | Token           |
| ---------------------------------- | --------------- |
| Pagina naar paginacontent          | `page-gutter`   |
| Tussen hoofdsecties                | `section-gap`   |
| Tussen cards/panelen in één sectie | `cluster-gap`   |
| Binnen hoofdpanel                  | `panel-padding` |
| Label naar input                   | 8 px            |
| Tussen form fields                 | 16 px           |
| Tekst naar border                  | minimaal 12 px  |
| Twee onafhankelijke containers     | minimaal 16 px  |
| Icon naar label                    | 8 px            |
| Titel naar beschrijving            | 8–12 px         |

Gebruik layout-`gap` boven kind-`margin`. Losse waarden als `p-3`, `gap-1` of inline pixels zijn alleen toegestaan wanneer ze aan een gedocumenteerde tokenalias koppelen.

### Dichtheid zonder interpretatieruimte

`compact`, `comfortable` en `spacious` veranderen uitsluitend de vier assen `componentInternalGap`, `controlHeight`, `tableRowMinHeight` en `planboardGeometry`. `fieldflow-tokens.json.density.variants` bevat voor ieder toegestaan veld de definitieve gehele pixelwaarde; runtimevermenigvuldiging, interpolatie en eigen afronding zijn verboden. Niet-genoemde maten blijven exact gelijk aan `comfortable`. Page gutter, section gap, cluster gap, breakpoints, informatiehiërarchie en de minimale pointertarget van 44 px veranderen nooit door density. Iedere preset krijgt een eigen snapshot op dezelfde viewport en themefixture.

## 2. Typografie

### Canonieke default

- body: `Aptos`, `Segoe UI Variable`, `Segoe UI`, sans-serif; canoniek 16 px en 1.45 line-height;
- display: `Aptos Display`, `Segoe UI Variable Display`, `Segoe UI`, sans-serif;
- hoofdtitel: 35–48 px desktop, 620 gewicht, `-0.045em` tracking en 1.03 line-height; 32 px/1.05 mobiel;
- paneltitel: 21 px;
- KPI: 29 px;
- body: canoniek 16 px; ondersteunende metadata gebruikt 12–14 px, alleen een benoemd overline/eyebrow- of planbordcode/tijdtoken mag 11 px zijn; 9–10 px komt niet in productie;
- interactieve labels: minimaal 13 px;
- mobiele form inputs: 16 px ter voorkoming van ongewenste Safari-zoom;
- eyebrow: 11 px, uppercase, 800, tracking 0.15 em.

De canonieke desktop-pixelvergelijking vereist een gebundeld of via `next/font` deterministisch font. Kies binnen de bestaande gelicenseerde opties de metrisch dichtstbijzijnde stack en leg deze in de baseline vast. Mobiel gebruikt hetzelfde deterministische font voor contract- en geometrybewijs, maar wordt niet pixelmatig tegen het prototype vergeleken. Runtime mag niet afhankelijk zijn van een extern fontrequest.

Het prototype gebruikt een 3px focusoutline met 2px offset. Fieldflow behoudt die geometrie; tenantkleurafleiding mag alleen de contrastveilige ringkleur wijzigen.

### Tenantfont

`fontFamily` en `headingFontFamily` mappen naar `--ff-font-body` en `--ff-font-heading`. Een tenantfont mag de geometrie niet breken. Test korte/lange labels en getallen opnieuw per optie.

## 3. Kleurrollen

### Brandbaar

- primaire CTA, link en geselecteerde state;
- actieve navigatie;
- focusring, mits contrastcorrectie;
- subtiele merkaccenten en illustratieve orbits;
- sidebarachtergrond/-tekst/-accent;
- canvas, surface, tekst en muted tekst;
- logo/naam/assets.

### Niet rechtstreeks brandbaar

- success, warning, danger, info;
- priority;
- locked/live/conflict;
- planningcategorieën;
- review-/betaal-/lifecyclebetekenis.

Elke semantische toestand gebruikt een apart, typed viertal `background`, `border`, `foreground` en `icon` uit `fieldflow-tokens.json`; één hex mag nooit alle rollen tegelijk vervullen. Tekst haalt minimaal 4,5:1 binnen de statusbadge/card en rand/icoon minimaal 3:1. Geen betekenis uitsluitend via kleur.

De prototypewaarde `#667C78` haalt op lichte Fieldflow-oppervlakken niet altijd 4,5:1. De productiecanonical gebruikt daarom `#5D716E` voor normale muted tekst, ook op de donkerste toegestane lichte muted surface. Dit is een verplichte toegankelijkheidscorrectie, geen vrije visuele afwijking.

## 4. Oppervlakken en elevatie

### Workspace

- achtergrond `--ff-app-bg`;
- zachte radial tint rechtsboven;
- maximale stage 1640 px;
- content blijft op 1920 px leesbaar begrensd;
- alleen planbord-/tabelsubcontainers mogen gecontroleerd horizontaal scrollen.

### Panel

- wit of tenant surface;
- subtiele 1px line;
- 22px canonical radius;
- 26px canonical padding;
- inner highlight;
- shadow `0 18px 44px rgba(25,74,61,.075)`.

Een kaart is geen universele paginacontainer. Gebruik cards voor herhaalde records, KPI’s of afgebakende datablokken. Paginahiërarchie gebruikt sections en panels; vermijd een “kaart in kaart in kaart”-effect.

## 5. Applicatieshell

### Desktop vanaf 1181 px

- sidebar exact 228 px op 1181–1460, exact 252 px op 1461–1919 en exact 252 px vanaf 1920;
- utility bar 70 px;
- workspace apart scrollbaar;
- h1 in content, niet dubbel in utilitybar;
- gegroepeerde taaknavigatie;
- status, zoeken, notificaties, tenantwissel en profiel permanent bereikbaar;
- huidige route, tenant en supportmodus zijn duidelijk.

### Compact desktop 861–1180 px

- sidebar exact 228 px en standaard zichtbaar; de expliciete gebruiker-toggle klapt hem naar exact 72 px in en geen containerquery kiest zelfstandig een andere variant;
- op 861–1100 px volgt de bron exact de compacte contentgeometrie: workspace heading minimaal 204 px met één kolom en 20 px row-gap; page toolbar minimaal 116 px met twee rijen, 10 px row-gap en 14 px column-gap;
- op 1101–1180 px zijn workspace heading en page toolbar exact één regel met minima 170/78 px; acties die niet in de vaste primaire positie passen staan in het gelabelde `Meer acties`-menu;
- formulieren en dossiers gebruiken exact één inhoudskolom;
- detailacties gebruiken één 44px-trigger die een side Sheet opent;
- planbord gebruikt een lokale scrollcanvas; de queue is bij eerste render gesloten en opent met één gelabelde 44px-trigger in een side Sheet.

### Mobiel/tabletportret tot 860 px

- 66px header;
- Radix Sheet voor navigatie;
- navigatietrigger links, merknaam links uitgelijnd in het flexibele middenvak en profieltrigger rechts; alle drie blijven op één regel;
- 17px gutter;
- één inhoudskolom;
- `100dvh` en safe-area;
- volledige menu-, tenant-, profiel-, notification- en supportfunctionaliteit.

Prototype-only labbar, conceptnummer, “Test drag & drop” en “Analyse & dekking” verdwijnen volledig.

## 6. Paginacomposities

### TenantPageShell

- `size=default|wide|full`;
- consistente gutter en section gap;
- page-level loading/error/empty/forbidden/not-found;
- geen lokale afwijkende `max-w-*`;
- skeleton gebruikt dezelfde geometry.

### TenantPageHeader

Anatomie:

1. optionele breadcrumb/context;
2. eyebrow;
3. één h1;
4. beschrijving;
5. badges/context;
6. één primaire actie;
7. maximaal één zichtbare secundaire actie; overige in “Meer”.

Desktop min-height 170 px; compact 861–1100 exact 204 px; mobiel 148 px. Lange titels wrappen. Op 861–1100 staan acties op de vaste tweede regel; op 1101–1180 en vanaf 1181 staan de primaire actie plus `Meer acties` op dezelfde regel als het titelblok; op 320–860 staat uitsluitend de ene 44px `Meer acties`-trigger naast het titelblok wanneer toegestane acties bestaan.

### Dashboard

Vaste volgorde:

1. vier permission-aware KPI’s;
2. één attention strip;
3. live operationele stroom;
4. besluitwachtrij;
5. quick-create/registreeracties;
6. weekbezetting;
7. recente dossiers.

Geen finance-, planning- en beheerwidgets door elkaar zonder taakprioriteit. Een gebruiker zonder onderliggende permission ziet geen lege of misleidende KPI.

### Lijst

Vaste volgorde:

1. summary strip;
2. betekenisvolle tabs;
3. command bar;
4. actieve filterchips;
5. desktoptabel of mobiele cards;
6. selectiegebonden bulkbar;
7. paginering.

Command bar:

- zoekveld;
- maximaal één kernfilter;
- knop “Filters” voor geavanceerd;
- weergave/density;
- export in menu;
- primaire createactie.

Rijacties:

- klik op identiteit opent detail;
- kebabmenu: Openen, Bewerken, Dupliceren/nieuwe versie waar toepasselijk;
- divider;
- Archiveer/Verwijder als destructief;
- acties verdwijnen of zijn disabled met uitleg op basis van **specifieke** permission.

Mobiele recordcard bevat dezelfde betekenis:

- selectievak/hitarea;
- identiteit en code;
- status/priority;
- maximaal drie kernmetadataregels;
- primaire tap opent detail;
- kebabmenu;
- geen uitgeklede duplicaatbusinesslogica.

### Dossier

Vaste anatomie:

1. hero met identiteit, code, status, context en primaire volgende actie;
2. status strip;
3. responsive section navigation;
4. hoofdcontent;
5. sticky action rail vanaf 1181 px, één 44px-trigger naar een side Sheet op 861–1180 px en één 44px-trigger naar een safe-area bottom Sheet op 320–860 px;
6. dossiernotities/timeline waar rechten dit toelaten.

Deep workflows blijven detailroutes. Snelle inspectie mag in een drawer, maar vervangt de route niet.

### Settings

- sticky index links vanaf 1181 px;
- één horizontale, benoemde en keyboard-scrollbare index op 861–1180 px;
- één gelabelde Radix `Select` boven de actieve sectie op 320–860 px; de desktopindex is daar niet gerenderd;
- dezelfde permissionfiltering voor index, tabs en directe routes;
- form sections met duidelijke legends en 30px tussen hoofdgroepen;
- savebar blokkeert inhoud niet.

### Website studio

- ≥1280: section library, canvas en properties als drie gelijktijdige panelen;
- 861–1279: alleen canvas inline; library en properties openen elk in hun eigen side Sheet en zijn bij eerste render gesloten;
- ≤860: alleen canvas inline; één full-height bottom Sheet met tabs `Secties` en `Eigenschappen` en die Sheet is bij eerste render gesloten, dus ook op de verplichte 768px-portraitfixture;
- devicepreview is geen excuus voor documentoverflow;
- revision/unsaved state zichtbaar;
- publiceren blijft een afzonderlijke reviewed actie.

## 7. Canonieke componenten

Productpagina’s importeren uit `@/components/ui` en composities uit `@/components/tenant-ui`. Er komt geen concurrerende UI-library.

| Component            | Verplicht gedrag                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Button`             | 44px, loadinglabel, icon gap, disabled + aria-disabled waar nodig                                                            |
| `IconButton`         | 44×44, accessible name, tooltip aanvullend                                                                                   |
| `Input/Textarea`     | label, help, error, aria-invalid/describedby                                                                                 |
| `Select/Combobox`    | Radix/shadcn, keyboard, clear state, no native ad-hoc variant                                                                |
| `Date/TimeRange`     | Amsterdamcontext, validatie en 15-min default raster                                                                         |
| `Badge/StatusBadge`  | typed semantic variant, label/icoon, geen substringkleur                                                                     |
| `CommandBar`         | responsive wrapping zonder actionverlies                                                                                     |
| `FilterDrawer`       | actieve count, reset/apply, focus return                                                                                     |
| `DataView`           | semantic table, mobile cards, sorting, pagination, saved view                                                                |
| `ActionMenu`         | permission-aware, separators, destructive placement                                                                          |
| `BulkActionBar`      | alleen bij selectie; aantal; clear; sticky non-obscuring                                                                     |
| `DetailHeader`       | één identity source, status en volgende actie                                                                                |
| `SectionNav`         | hidden panels echt hidden; mobile selector                                                                                   |
| `ActionRail`         | sticky desktop; safe-area bottom Sheet van max 100dvh mobiel                                                                 |
| `FormSection`        | fieldset/legend, description, tokenized spacing                                                                              |
| `Dialog`             | centered; breedte `min(840px, 94vw)`; maxhoogte `calc(100dvh - 32px)`; één body-scroller; focus trap, Escape en return-focus |
| `Sheet`              | desktopbreedte `min(500px, 94vw)`; safe-area bottom Sheet binnen 16px zijmarges en max 100dvh mobiel                         |
| `AlertDialog`        | target + gevolg + expliciete bevestiging                                                                                     |
| `Wizard`             | state blijft bij terug; validation per step; progress text                                                                   |
| `Toast/InlineStatus` | inline is primair; toast aanvullend; live region                                                                             |
| `EmptyState`         | reden, uitleg, relevante actie                                                                                               |
| `Skeleton`           | exacte layoutgeometry, reduced-motion                                                                                        |

## 8. Forms

### Sheet

- breedte `min(500px,94vw)`;
- header/body/footer 25 px;
- bodygap 23 px;
- titel 24 px;
- fieldsetpadding 19 px, gap 15 px.

### Dialog/wizard

- breedte `min(840px,94vw)`;
- header `29px 33px 21px`;
- body minimaal 400 px en padding 33 px desktop;
- fieldgap 23×21 px;
- footer `19px 33px`;
- mobiel altijd safe-area bottom Sheet binnen 16px zijmarges en max 100dvh;
- acties blijven zichtbaar zonder keyboard of safe-area te bedekken.

### Validatie

- valideer client voor directe feedback én server als autoriteit;
- behoud invoer na serverfout;
- plaats fout direct onder veld;
- bij exact één fout ontvangt de gekoppelde control focus; bij meer dan één fout verschijnt bovenaan één focusbare samenvatting en ontvangt die focus;
- iedere samenvattingslink focust exact de bijbehorende control;
- pending blokkeert alleen betrokken mutation;
- succes sluit alleen wanneer verliesvrij en gewenst;
- unsaved-changebevestiging bij verlaten van complexe editors.

## 9. States

| State               | Presentatie                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| Initial loading     | layoutvaste skeleton, `aria-busy`, geen focusbare placeholder              |
| Refresh/filter      | bestaande data blijft staan; rustige progress; dubbele request geblokkeerd |
| Empty               | uitlegbare oorzaak + relevante createactie                                 |
| Filtered empty      | huidige filtercontext + “Filters wissen”                                   |
| Forbidden           | menselijke Nederlandse tekst, geen interne permissionstring                |
| Not found           | terugroute en geen datalek over bestaan van ander tenantrecord             |
| Pending             | spinner én werkwoord; geen layoutshift                                     |
| Success             | inline confirmation; toast aanvullend                                      |
| Validation error    | veldfeedback + summary, data behouden                                      |
| Server error        | veilige tekst, retry, geen stack/ID tenzij supportcontext                  |
| Offline/stale       | laatste sync, retry, geen schijnsuccess                                    |
| Concurrent change   | server snapshot, verschillen, expliciet herbevestigen                      |
| Optimistic rollback | exacte vorige staat en focus herstellen                                    |

## 10. Af te bouwen huidige patronen

- `.tenant-admin-compact` op de Fieldflow-boom;
- geforceerde Roboto bovenop tenantfonts;
- class-name selectors die alle `p-6`, `gap-4`, `h-10` enzovoort herschrijven;
- ruwe `veele-card` als universele container;
- inline permanente createforms naast tabellen;
- native `confirm`, `prompt` en `alert`;
- zichtbare rijactierijen met vier concurrerende knoppen;
- generieke `canWrite` voor verschillende privileges;
- hardcoded slate/cyan/hex in bereikbare productcomponenten;
- mobiel als alleen gestapelde desktop;
- bereikbare “tabs” waarvan de content niet verandert;
- lege/interactief ogende elementen zonder handler.

## 11. Machineleesbaar component- en statecontract

`manifests/component-states.json` is de normatieve state-inventaris voor de
canonieke componentlaag. Het manifest staat bewust op `CONTRACTED`: genoemde
artifactpaden zijn toekomstige **evidencetargets**, geen bewijs dat de state al
is geïmplementeerd of geverifieerd.

Het contract bevat 30 componenten en 60 vaste capturecases:

| Groep                | Componenten                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Primitives           | Button, Label, Input, Select, Combobox, Textarea, Checkbox, RadioGroup, Switch, Date/Time |
| Data                 | DataView row, DataView card, RowAction DropdownMenu                                       |
| Overlays             | Filter Sheet, Detail Sheet, Dialog, AlertDialog, Popover, Tooltip, EntityWizard           |
| Navigatie/disclosure | Tabs, Accordion/Collapsible, Command palette, Mobile navigation                           |
| Feedback             | Toast, Error summary, Empty, Loading, Forbidden                                           |
| Planbordinteractie   | Actieve pointer-drag en keyboard-positionering                                            |

Per component is minimaal vastgelegd:

- bereikbare visuele, validatie-, pending-, success-, error- en permissionstates;
- desktop- en mobiele compositie;
- expliciete `parityRequiredStates` die in de desktop- én mobiele capturecase
  afzonderlijk aanwezig moeten zijn; alleen de desktop-only planbordinteractie
  heeft een lege set, verplicht gecombineerd met een exact
  `interactionModeParityContract` dat de mobiele non-drag- en keyboardjourneys
  bindt zonder bewijs uitwisselbaar te maken;
- initial focus, tabgedrag, Escape en return-focus;
- minimale target-, font- en contrastwaarden;
- density- en tenanttheme-assen;
- bestaande bronautoriteit en het beoogde implementatiepad;
- exacte prefixes voor visual-, Axe-, computed-style- en interaction evidence.

De top-level `caseExecutionMatrix` houdt het aantal basiscases op 60 (31
desktop, 29 mobiel) en verplicht iedere mobiele case op 320/390/430/768 px,
iedere desktopcase op
1024/1280/1440/1920 px en iedere case aanvullend op 1024×768 bij 200% zoom. De
matrix koppelt hieraan vaste lange Nederlandse content, keyboard/safe-area-
rectmetingen en geopende portaltheming voor `Dialog`/`Sheet` plus acht extra
portaltypen. De 300 afgeleide runs zijn pas bewijs nadat hun vereiste artifacts,
hashes en assertions werkelijk zijn vastgelegd.

`sourceEvidence` is een gediscrimineerde machineleesbare union. Een
`repositorySource` bevat exact één bestaand `sourcePath` en exact één benoemde
AST-declaratie in `symbol`; komma-lijsten en beschrijvende pseudosymbolen zijn
niet toegestaan. Een `prototypeArchivePath` bevat juist
`prototypeArchivePath`, `archiveManifest` en één exact archiefsymbool. Zo'n
prototypepad mag nooit als repositorypad worden opgelost of als bewijs van
bestaande productiefunctionaliteit worden geïnterpreteerd.

`manifests/component-source-coverage.json` sluit het brondekkingsgat tussen die
30 statecontracten en de volledige publieke componentlaag. Het inventariseert
AST-gestuurd alle 299 direct benoemde exports uit `components/ui` en
`components/tenant-ui`: 132 exports zijn rechtstreeks `state-owner`, 122 zijn
een `composite` met één of meer state-ID's plus een concrete witnessroute en
compositiecontract, en 45 zijn aantoonbaar `non-visual`. Die laatste categorie
is uitsluitend toegestaan voor compile-time types, context/statehelpers en
class-variantrecepten; iedere entry bevat een concrete reden. Een component,
trigger, menu-item, overlay, control of andere user-facing runtime-export mag
nooit via `non-visual` aan statebewijs ontsnappen.

De packagevalidator regenereert deze exportset met de TypeScript-AST en faalt
op ontbrekende of stale exports, dubbele keys, gewijzigde declaration metadata,
herclassificatie, onbekende component-state-ID's, ongeldige witnessroutes en
lege redenen. Naamloze `export *`-statements worden niet als named export
geteld; de expliciete exports in hun bronmodules worden wel volledig geteld.

### Verplichte implementatiebesluiten

`manifests/component-api-contract.json` sluit het publieke API-contract voor de
twee nieuwe canonieke componenten. Het specificeert hun exacte exports, props,
discriminated unions, foutobjecten, focuscallbacks, events en state ownership.
`EntityWizard` bestuurt geen entiteitsvelden, businessvalidatie, permissions of
Server Actions: de bestaande Assignment-, Customer-, Object- en Personnel-forms
blijven daarvoor autoriteit en leveren gecontroleerde state en callbacks.
`FormErrorSummary` ontvangt reeds veilige, geordende foutobjecten, focust alleen
bij een nieuwe mislukte submitpoging en vervangt nooit de veldgebonden fouttekst.
De vier opgenomen compile-fixtures worden bij implementatie bytegetrouw onder
het gedeclareerde contractpad geplaatst en moeten zonder `any`, suppressions of
`skipLibCheck` door de backoffice-typecheck lopen.

- `EntityWizard` wordt één nieuwe canonieke tenantcompositie in
  `components/tenant-ui`; het prototype bewijst alleen de presentatie. De
  bestaande productieforms blijven autoriteit voor velden, validatie en
  mutaties.
- `FormErrorSummary` wordt één gedeelde UI-compositie. Losse veldfouten in de
  bestaande forms zijn bronbewijs voor huidige validatie, maar bewijzen nog
  geen complete samenvatting/focusjourney.
- `TenantActionMenu` blijft de enige rij-/cardactiemenucompositie en gebruikt
  de gedeelde DropdownMenu-primitives. Trigger én items zijn minimaal 44 px.
- `TenantFilterDrawer`, `TenantDetailDrawer`, Dialog en AlertDialog delen
  portalthema, z-index, scroll lock, focus trap en return-focus; pagina’s mogen
  deze lifecycle niet lokaal opnieuw implementeren.
- Sonner via `components/ui/sonner.tsx` is de canonieke toastlaag. Toast is
  aanvullend op een inline status en mag nooit de enige fout- of
  validatieterugkoppeling zijn.
- DataView row en card delen één veld-/actieprojectie. Mobile cards krijgen
  geen tweede businesslogica en desktop rows worden op mobiel niet alleen
  verborgen zonder gelijkwaardige card.

Iedere wijziging aan een van deze componenten werkt het statecontract en de
bijbehorende acceptance-traceability in dezelfde wijziging bij. Alleen een
bestaand artifact met hash, bijbehorende geautomatiseerde asserties en review
mag een component naar een volgende bewijsstate brengen.
