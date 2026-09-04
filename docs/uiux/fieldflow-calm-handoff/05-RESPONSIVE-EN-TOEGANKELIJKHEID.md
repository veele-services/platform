# 05 — Desktop-first, responsive en toegankelijkheidscontract

## 1. Principe

Desktop-first bepaalt de primaire informatiearchitectuur. Responsive betekent vervolgens een expliciete taakgerichte compositie per ruimte, niet:

- desktop verkleinen;
- alles alleen onder elkaar zetten;
- brede tabellen laten overlopen;
- acties verbergen;
- drag-and-drop als enige planningbediening.

Functionaliteit, status, permission en data blijven gelijkwaardig op ieder formaat.

## 2. Layoutbreakpoints

| Range     | Shell                                             |
| --------- | ------------------------------------------------- |
| 320–560   | telefoon, mobiele header + navigatie-Sheet        |
| 561–860   | tabletportret, dezelfde mobiele/tabletshell       |
| 861–1180  | compact desktop/tabletlandscape, compacte sidebar |
| 1181–1919 | desktop, persistente sidebar                      |
| ≥1920     | wide desktop, begrensde contentstage              |

Container queries implementeren uitsluitend de hieronder benoemde interne transformaties en drempels. Verspreid geen eigen of tegenstrijdige `md/lg/xl`-besluiten door pagina’s.

`routes.json` selecteert per route uitsluitend het benoemde `responsiveProfile`; een vrije summary of routebeschrijving kiest nooit een layoutvariant. `manifests/fieldflow-tokens.json.responsive.rules`, de exacte tabel hieronder en `evidence/visual/capture-contract.json.normalization.responsiveContractGate` bepalen vervolgens de enige compositie per breakpoint en patroon. Alleen de twee expliciete extra componentdrempels op 1280 px mogen binnen de desktoprange een planbordqueue of website-studio naar een extra paneel omschakelen.

## 3. Verplichte viewports

| Viewport  | Shell/content                                                      | Lijsten/forms                                                     | Planbord                                                    | Overlays                                            |
| --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| 320×568   | 66px mobile header, 17px gutter, exact één contentkolom            | recordcards; één formkolom; 16px inputs                           | queue vóór agenda; `Plan/Verplaats` opent non-drag wizard   | bottom Sheet met 16px rand, max 100dvh en safe-area |
| 390×844   | dezelfde mobile shell en exact één contentkolom                    | recordcards met volledige data-/actiepariteit; gestapelde toolbar | queue vóór agenda; non-drag wizard                          | safe-area bottom Sheet                              |
| 430×932   | dezelfde mobile shell en exact één contentkolom                    | recordcards; gestapelde toolbar; één formkolom                    | queue vóór agenda; non-drag wizard                          | safe-area bottom Sheet                              |
| 768×1024  | dezelfde mobile/tabletshell en exact één contentkolom              | recordcards; gestapelde toolbar; één formkolom                    | queue vóór agenda; non-drag wizard                          | safe-area bottom Sheet                              |
| 1024×768  | 228px sidebar; 204px heading en 116px toolbar in twee vaste regels | semantische tabel met lokale scroll; één formkolom                | queue gesloten; side-Sheettrigger + lokaal scrollend canvas | detailaction side Sheet                             |
| 1280×800  | 228px sidebar en begrensde workspace                               | semantische tabel; exact twee formkolommen                        | inline queue van 300px + canvas                             | sticky action rail + centered Dialog                |
| 1440×1000 | canonieke 228px-sidebarcompositie                                  | éénregelige toolbar; tabel; exact twee formkolommen               | inline queue 300px + 93,81818px/uur reference               | sticky action rail + centered Dialog                |
| 1920×1080 | 252px sidebar en max stage 1640                                    | éénregelige toolbar; tabel; exact twee formkolommen               | inline queue 300px; dezelfde lane-/blokmaten                | sticky action rail + centered Dialog                |

Test daarnaast 1024×768 bij 200% zoom; dit moet functioneel reflowen als circa 512×384.

### Referentieautoriteit zonder pixelconflict

- De negen desktopscenario's op 1440×1000 gebruiken de genormaliseerde, gehashte prototype-output als strikte pixelbaseline: `threshold: 0.1`, `maxDiffPixelRatio: 0.001`, maximaal 1440 afwijkende pixels en maximaal 1 px per betekenisvolle rectangle.
- De negen mobiele scenario's op 390×844 gebruiken raw en genormaliseerde prototypebeelden uitsluitend als compositie- en visuele-taalreferentie. Een productie-pixeldiff tegen die beelden is verboden, omdat de bindende mobiele Sheet-, Select-, toolbar- en planbordtransformaties bewust van het prototype afwijken.
- Mobiele productie levert per scenario een screenshot voor menselijke review plus DOM, semantische region-geometry, computed styles, Axe, keyboardtrace, touchtrace en een leeg runtime-errorlog. Elk artifact bindt aan scenario, HEAD en de hash van het responsive contract.
- Bij `BASELINE_READY` staan deze negen mobiele productierecords als de mobiele leden van `scenarioEvidence`; een los tweede bewijsregister is verboden. Ieder record bevat `referenceMode=mobile-responsive-contract`, exact viewport en transformpatroon, de responsive-contracthash, `status=passed`, alle patroon- en accessibilityassertions en content-addressed paden/hashes voor alle negen artifacts. De validator herleidt de vereiste semantische regio's, 44px targets, 8px controlafstand, 16px containerafstand, 12px text-to-borderpadding, nul serious/critical Axe-fouten, non-drag touch en deterministisch return-focus rechtstreeks uit die payload.
- `evidence/visual/capture-contract.json.normalization.referencePolicy` fixeert de twee disjuncte sets van elk negen scenario's. `responsiveContractGate.transformsByPattern` fixeert per mobiel patroon de vereiste DOM-regio's en assertions; een lijst met alleen viewports of een desktoppixelpass geldt nooit als mobiel bewijs.
- Een mobiele pixelbaseline wordt pas toegestaan nadat een nieuw prototype alle transformaties werkelijk rendert, broncommit en archiefhash opnieuw zijn gepind, alle negen scenario's zijn hercaptured, product-design en visual-a11y onafhankelijk goedkeuren en de protected contract-root is geroteerd.

## 4. Componenttransformaties

| Component      | 320–860                                                                                                                           | 861–1180                                                                                           | ≥1181                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Shell          | 66px header; navigatie in Radix bottom Sheet                                                                                      | 228px sidebar, standaard zichtbaar; gebruikertoggle naar 72px                                      | persistente sidebar: 228px t/m 1460 en 252px vanaf 1461                      |
| Page header    | titelblok gevolgd door exact één 44px `Meer acties`-trigger wanneer toegestane acties bestaan                                     | 861–1100: twee regels; 1101–1180: één regel met overflowacties in `Meer acties`                    | titel links, primaire actie rechts, overige acties in `Meer acties`          |
| KPI            | exact 1 kolom op 320–560; exact 2 kolommen op 561–860                                                                             | exact 2 kolommen                                                                                   | exact 4 kolommen                                                             |
| Toolbar        | regel 1: zoekveld volle breedte; regel 2: result count, 44px filter-Sheettrigger en 44px `Meer acties`; geen horizontale scroller | 861–1100: twee regels; 1101–1180: één regel, met overflowacties in `Meer acties`                   | exact één regel, met overflowacties in `Meer acties`                         |
| DataView       | recordcards met volledige data-, selectie- en actiepariteit                                                                       | semantische tabel met één benoemde lokale horizontale scroller                                     | semantische tabel zonder documentoverflow                                    |
| Dossiernav     | één gelabelde Radix `Select`; desktoptablist niet gerenderd                                                                       | één horizontale, benoemde en keyboard-scrollbare tablist                                           | normale sectionnav zonder horizontale scroller                               |
| Detailactions  | één 44px-trigger opent safe-area bottom Sheet                                                                                     | één 44px-trigger opent side Sheet                                                                  | sticky action rail                                                           |
| Form           | exact één kolom                                                                                                                   | exact één kolom                                                                                    | exact twee kolommen                                                          |
| Settings index | één gelabelde Radix `Select` boven de actieve sectie; desktopindex niet gerenderd                                                 | één horizontale, benoemde en keyboard-scrollbare index                                             | sticky indexlinks                                                            |
| Website studio | alleen canvas inline; één gesloten full-height bottom Sheet met tabs `Secties` en `Eigenschappen`                                 | alleen canvas inline; twee afzonderlijke, initieel gesloten side Sheets voor library en properties | 1181–1279 gelijk aan compact; vanaf 1280 exact drie inline panelen           |
| Planbordqueue  | queue als cards vóór de agenda; `Plan/Verplaats` opent de non-drag wizard; timeline alleen na expliciete `Timeline`-toggle        | queue initieel gesloten in side Sheet; tijdcanvas lokaal scrollbaar                                | 1181–1279 gelijk aan compact; vanaf 1280 inline queue van 300px naast canvas |
| Maand          | verticale agendalijst zonder kalendergrid                                                                                         | zevenkoloms kalender                                                                               | zevenkoloms kalender                                                         |
| Kaart          | lijst inline; één `Kaart tonen`-trigger opent een full-height bottom Sheet                                                        | vaste kaart-lijstsplitsing                                                                         | kaart, lijst en routepanel inline                                            |
| Overlays       | Dialog-, wizard-, filter- en detailcontent gebruikt safe-area bottom Sheet; AlertDialog blijft centered                           | side Sheet voor navigatie/detail en centered Dialog voor bevestiging                               | side Sheet voor secundaire panelen en centered Dialog voor bevestiging       |

Deze tabel is normatief voor de eerste render en voor de genoemde triggeruitkomst. Een route mag niet tussen de genoemde varianten kiezen op basis van vrije ruimte, tekstlengte of lokale `md/lg/xl`-classes. Alleen de twee expliciete 1280px-componentdrempels voor planbord en website-studio zijn aanvullend toegestaan.

## 5. Overflow

Harde runtimeassertie:

```ts
document.documentElement.scrollWidth <=
  document.documentElement.clientWidth + 1;
```

Uitzonderingen zijn lokale, benoemde containers:

- planbordtijdlijn;
- datatabel wanneer prioritering nog onvoldoende is;
- horizontale tabs/chips.

Iedere lokale scroller:

- is focusbaar;
- heeft accessible naam/instructie;
- toont visuele scrollhint;
- heeft sticky headers waar nodig;
- kapt focusring niet af;
- veroorzaakt geen tweedimensionale paginascroll.

## 6. Touch en pointer

- alle Fieldflow-controls/hitareas minimaal 44×44;
- minimaal 8px tussen aangrenzende kleine targets;
- geen actie alleen op hover;
- coarse pointer krijgt nooit compacte 32/36px override;
- touchplanning gebruikt de wizard uit hoofdstuk 04;
- swipe is aanvullend, nooit enige actie;
- long press is aanvullend, nooit verborgen primaire bediening.

## 7. Keyboard

Algemeen:

- logische DOM-/tabvolgorde;
- focus zichtbaar en niet afgeknipt;
- skiplink naar `#hoofdinhoud`;
- Enter/Spatie activeert passende control;
- Escape sluit veilige overlay/annuleert actieve modus;
- focus keert naar opener;
- row actions zijn bereikbaar zonder eerst een verborgen rowclick te gebruiken.

Data:

- sort button noemt huidige en volgende sortering;
- alleen actieve kolom heeft `aria-sort`;
- selectiecheckbox heeft recordnaam;
- bulkbar komt logisch na selectie, niet als focusval;
- pagination heeft huidige pagina.

Planbord:

- één duidelijk grid/workspace;
- medewerkers als rowheaders;
- roving focus of aantoonbaar schaalbare focusstrategie;
- announcements voor select, positie, validity, save, error en undo;
- verouderde `aria-grabbed`/`aria-dropeffect` tellen niet als oplossing.

## 8. Screenreader/semantiek

- één zichtbare h1;
- landmarks header/nav/main/aside waar zinvol;
- headings zonder niveauoverslag;
- icon-only button heeft naam;
- decoratief logo/icon heeft lege alt alleen als zichtbare equivalenttekst bestaat;
- status heeft tekst;
- KPI heeft label, waarde en context;
- grafiek/capaciteit heeft tekstuele samenvatting of tabel;
- formgroup gebruikt fieldset/legend;
- fout is met control verbonden;
- tabs gebruiken Radix semantics; inactive panel niet in accessibility tree;
- loading gebruikt `aria-busy`, niet een stroom skeletonannouncements;
- live regions zijn gedoseerd.

## 9. Forms

- zichtbaar label voor iedere input;
- help/error via `aria-describedby`;
- `aria-invalid` na valideerpoging;
- required niet alleen met kleur/ster;
- mobiel font minimaal 16px;
- datum/tijd heeft Nederlandse instructie en Amsterdamcontext;
- autocomplete/inputmode waar veilig;
- submit pendinglabel beschrijft actie;
- exact één fout focust de gekoppelde control; meer dan één fout focust één bovenaan geplaatste Error summary;
- ingevoerde data blijft na serverfout;
- sticky actions bedekken geen laatste veld.

## 10. Overlays

Alleen canonical Radix/shadcn:

- Dialog;
- AlertDialog;
- Sheet;
- DropdownMenu;
- Popover;
- Tooltip;
- Select/Combobox;
- Tabs/Accordion/Collapsible.

Verifieer:

- correcte title/description;
- focus trap;
- Escape;
- overlay click volgens risiconiveau;
- scroll lock;
- focus return;
- nested overlaygedrag;
- themed body portal;
- safe area;
- 200% zoom;
- keyboard zichtbaar op phone;
- destructive intent niet per ongeluk dismissable.

## 11. Kleur en contrast

WCAG 2.2 AA:

- normale tekst 4,5:1;
- grote tekst 3:1;
- betekenisvolle icon/grens/focus 3:1;
- status niet alleen kleur;
- forced-colors behoudt focus, selection, borders en planblokken;
- focusring tegen beide aangrenzende vlakken;
- muted tekst `#5D716E` canonical in plaats van de net falende prototypewaarde;
- statusbuttons gebruiken berekende donkere foreground waar wit onvoldoende is.

Tenantthema’s uit hoofdstuk 02 worden in werkelijk gerenderde componentstates gemeten.

## 12. Motion

`prefers-reduced-motion: reduce`:

- geen page translate/fade;
- geen hover translate;
- geen smooth scroll;
- geen skeleton shimmer;
- overlay direct;
- planbordghost/state blijft direct zichtbaar;
- functionele progress blijft zonder beweging begrijpelijk.

Normaal:

- snel 120ms;
- standaard 180ms;
- langzaam 260ms;
- easing `cubic-bezier(.2,0,0,1)`;
- beweging ondersteunt oorzaak/gevolg, nooit decoratieve onrust.

## 13. Zoom, tekst en lokalisatie

Test:

- browserzoom 200%;
- tekstresize 200%;
- WCAG text spacing override;
- lange Nederlandse labels;
- tenantnaam van 60+ tekens;
- medewerker/klant/objecttitel van 100+ tekens;
- bedragen met grote waarden;
- validatiefouten van twee regels;
- RTL is geen huidige locale-eis, maar DOM-order mag niet visueel gehackt worden.

Kritieke betekenis mag niet uitsluitend door ellipsis verdwijnen. Toon volledige waarde via wrap of toegankelijke detailweergave.

## 14. Loading, empty en error

| Staat                     | Contract                                              |
| ------------------------- | ----------------------------------------------------- |
| Eerste load               | geometry-getrouwe skeleton, aria-busy                 |
| Filter/paginering         | bestaande resultaten blijven, progress zichtbaar      |
| Leeg                      | reden, uitleg, toegestane primary                     |
| Gefilterd leeg            | filtercontext + “Filters wissen”                      |
| Forbidden                 | geen forbidden controls/data; menselijke uitleg       |
| Pending                   | alleen betrokken mutation geblokkeerd                 |
| Success                   | zichtbare gewijzigde state + inline/live confirmation |
| Validation                | field error + summary                                 |
| Servererror               | veilige tekst + retry                                 |
| Offline/realtime degraded | laatste sync + retry                                  |
| Stale                     | actuele serverstate + herbevestigen                   |
| Planbordrollback          | exacte vorige state + focus                           |

Skeletons gebruiken dezelfde Fieldflow-layouttokens; geen generiek oud `max-w-7xl`-dashboard voor elke route.

## 15. Accessibilitybewijs

Automatisch:

- Axe op initiële en geopende states;
- accessible-name checks;
- overflow/touchsize/contrast/computed style;
- keyboard journeys;
- reduced-motion/forced-colors emulatie;
- screenshot per viewport.

Handmatig/assisted:

- keyboardwalkthrough per pagefamilie;
- screenreader smoke voor shell, DataView, form, Dialog/Sheet en planbord;
- zoom/text spacing;
- mobile VoiceOver/TalkBack voor kernflow;
- focus bij async/stale/rollback.

Releaseblokker:

- iedere serious/critical Axe-fout;
- naamloos control;
- core flow zonder keyboard/touch;
- target <44;
- pageoverflow;
- focusverlies/trapfout;
- status alleen kleur;
- ontbrekende mobile action;
- `manual` of niet-uitgevoerd bewijs.

## 16. Verplichte component- en overlaystatejourneys

De volledige machineleesbare matrix staat in
`manifests/component-states.json`. Elke case produceert pas bij uitvoering vier
afzonderlijke bewijssoorten onder het vastgelegde targetprefix: visual, Axe,
computed geometry/contrast en interaction/focus. Een verwachte bestandsnaam of
een broncodecheck telt niet als runtimebewijs.

### Overlaylifecycle

| Component              | Open/initial focus                                  | Escape                                  | Return-focus                                                                | Mobiele extra eis                                                          |
| ---------------------- | --------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RowAction DropdownMenu | eerste toegestane item                              | sluit zonder actie                      | exacte kebab van dezelfde row/card                                          | items en trigger 44 px; collision binnen viewport                          |
| Filter Sheet           | titelcontext, daarna eerste filter                  | sluit en verwerpt niet-toegepaste draft | knop Filters                                                                | footer boven keyboard en safe-area                                         |
| Detail Sheet           | titelcontext, daarna eerste betekenisvolle actie    | nested overlay eerst, daarna Sheet      | exacte openende row/card                                                    | laatste actie bereikbaar in interne scroll                                 |
| Dialog                 | eerste betekenisvolle control of expliciete heading | sluit wanneer veilig                    | opener                                                                      | transformeert naar safe-area bottom Sheet van max 100dvh; footer zichtbaar |
| AlertDialog            | veilige Annuleren-actie                             | annuleert vóór mutation                 | opener of dichtstbijzijnde overlevende control                              | target en gevolg volledig zichtbaar; acties 44 px                          |
| EntityWizard           | titel en eerste veld van huidige stap               | clean sluit; dirty opent AlertDialog    | opener, stepheading, errorsummary of nieuwe entitycontext volgens resultaat | één kolom; sticky footer bedekt geen veld                                  |
| Command palette        | zoekinput                                           | sluit palette na eventueel nested state | trigger/vorige focus; na selectie destination heading                       | resultaten en input boven keyboard, geen private routes                    |
| Mobile navigation      | navigatietitel/routecontext                         | sluit Sheet                             | menuknop; na route destination heading                                      | 100dvh, safe-area, alle routes intern scrollbaar                           |

### Invalid-formjourney

Bij exact één fout focust de flow rechtstreeks de gekoppelde control en is een samenvatting niet verplicht. Iedere create/edit/wizardflow bewijst bij meer dan één fout dezelfde keten:

1. submit met meerdere fouten;
2. één focusbare Error summary verschijnt en krijgt focus;
3. elke fout staat precies één keer in de summary;
4. een summarylink focust de exact gekoppelde control;
5. control heeft `aria-invalid` en help plus fout via `aria-describedby`;
6. correctie verwijdert alleen de betreffende fout zonder onverwachte focus;
7. servererror behoudt alle waarden en toont veilige retryfeedback;
8. mobile keyboard en sticky footer bedekken summary, field en fouttekst niet.

### Mobiele planbordjourneys

`component-states.json.crossComponentJourneys` houdt twee bewijspaden strikt
gescheiden. `mobile-planboard-non-drag` bewijst op 320, 390, 430 en 768 px de
volledige touchflow in een full-screen wizard: plannen, exacte tijd,
verplaatsen, medewerker vervangen, één medewerker ontkoppelen én de volledige
opdracht vrijgeven als twee afzonderlijke flows, conflict, bevestigen,
annuleren en undo. Ontkoppelen behoudt moment en overige staffing; vrijgeven
toont eerst alle geraakte teamleden, ondersteunt annuleren zonder writes en
bewijst daarna de atomische status-/tijd-/staffingmutatie plus volledige
rollback/undo. Beide flows hebben eigen review-, pending-, success- en
herstelstates.
`mobile-planboard-timeline-keyboard` bewijst op dezelfde breedtes uitsluitend
de na een expliciete `Timeline`-toggle geopende timeline met keyboardbediening. Een keyboard-gridplaatsing mag
nooit als touch- of wizardbewijs worden hergebruikt.

`planboard-placement-interaction` voegt twee afzonderlijke desktop-only
active-interactioncases toe. De pointercase bevriest vóór release de geldige,
waarschuwende en geblokkeerde dragframes met ghost, semantische targethighlight,
typed reason en een exact meetbare 45-minuten-pointeroffset. De keyboardcase
bevriest vóór bevestiging `position-preview` en `invalid-position`, inclusief
live announcement en focusbehoud. Mobiele functionele pariteit komt uitsluitend
uit de twee journeys hierboven; touch hoeft geen drag te emuleren. De
post-placement-baselines in `evidence/visual/capture-contract.json` bewijzen
alleen de geplaatste eindstaat en Undo, nooit de actieve pointer-, touch- of
keyboardinteractie.

### Capture- en asserteregel

- De eerste 29 componenten hebben elk één desktop- en één mobiele capturecase;
  het desktop-only planboard-interactiecomponent heeft twee actieve cases. Het
  contract bevat daardoor 60 basiscases: 31 desktop en 29 mobiel.
  `caseExecutionMatrix` breidt elke mobiele case exact uit over 320, 390, 430
  en 768 px en elke desktopcase over 1024, 1280, 1440 en 1920 px. Bovendien
  draait iedere basiscase op 1024×768 bij 200% browserzoom. De 60 definities
  leveren exact 300 viewport-/zoomruns op. Deze 300 runs zijn een verplichte
  subset van de hieronder beschreven volledige testassensuite; ze mogen niet
  als afzonderlijk of volledig asbewijs worden gerapporteerd.
- Iedere component declareert `parityRequiredStates`. De validator eist iedere
  genoemde state afzonderlijk in zowel de desktop- als mobiele case; een
  desktop-success, -disabled, -error of -navigating state kan daardoor nooit de
  mobiele variant afdekken. Alleen aantoonbaar input-/compositiegebonden states,
  zoals pure hover of een mobiel-only navigatie-Sheet, mogen buiten die set
  blijven. Alleen `planboard-placement-interaction` heeft een lege set: diens
  exact gevalideerde `interactionModeParityContract` bindt de desktop-only
  active-interactioncases aan de twee afzonderlijke mobiele journeys, zonder
  active-dragbewijs en functionele mobiele pariteit uitwisselbaar te maken.
- De vaste `long-content-nl-v1`-fixture bevat een tenantnaam van exact 60
  codepoints, een entitynaam van exact 100 codepoints, een fout van twee
  regels, twee lange adressen en grote positieve/negatieve bedragen. Zij draait
  op 320×568, 768×1024, 1024×768@200% en 1920×1080 en faalt op documentoverflow,
  kritieke clipping, verlies van de volledige waarde, gewijzigde lees-/focusorde
  of onbereikbare acties.
- De mobiele keyboardfixture meet op 320, 390, 430 en 768 px de werkelijke
  `visualViewport`, safe-area-insets, sticky-footer-, actieve-control-,
  fouttekst- en overlayrectangles. Een ontbrekende rectangle faalt; footer,
  control, fouttekst en overlay moeten binnen de berekende zichtbare grenzen
  liggen en `document.scrollWidth` mag `document.clientWidth` niet overschrijden.
- Portaltheming wordt met geopende content gemeten voor `Dialog` en `Sheet` én
  voor de acht extra portaltypen `DropdownMenu`, `Select`, `Combobox`,
  `Popover`, `Tooltip`, `AlertDialog`, `CommandPalette` en `Toast`. De run legt
  computed themetokens, content- en targetrectangles, focusmanagement,
  Escapevolgorde en exact return-focus vast.
- De kritieke scopes `shell`, `branding-editor`, `planboard` en `permissions`
  zijn in `caseExecutionMatrix.axisCoverage.criticalFullCartesian` aan exact 26
  execution units gekoppeld: 24 componentcapturecases plus de twee mobiele
  planbordjourneys. Iedere unit draait op vijf passende viewport-/zoomprofielen
  × zeven themes × drie densities × twee motionwaarden × twee contrastmodi ×
  drie permissionprofielen. Dat zijn 1.260 runs per unit en exact 32.760
  kritieke Cartesian unit-runs. Na projectie over de units bevat iedere scope
  exact 2.268 verschillende ascombinaties en alle vier samen exact 9.072.
  Iedere scope bevat zowel mobiele als desktopunits; gezamenlijk raakt elke
  scope alle acht breedtes en 1024×768@200%.
- De overige 36 componentcapturecases gebruiken exact
  `ordered-axis-pair-closure-v1`. Het algoritme zaait eerst voor elk van de vijf
  passende viewport-/zoomprofielen de canonieke defaulttuple en genereert daarna
  in vaste as- en waardevolgorde alle ongeordende asparen. Na deterministische
  deduplicatie blijven exact 182 runs en 192 aantoonbare waardeparen per case
  over: 6.552 runs en 6.912 paarasserties totaal. Een ontbrekende aswaarde,
  combinatie, baseline seed, execution unit, count of tuple-SHA-256 faalt de
  pakketvalidator.
- Daarmee bevat de componenttestassensuite exact 39.312 verplichte runs:
  32.760 volledige kritieke Cartesian runs plus 6.552 deterministische pairwise
  runs. De manifestvolgorde en tupleformattering zijn normatief; sampling of een
  handmatig gekozen “representatieve” subset is niet toegestaan.
- Open overlays worden als open overlay getest. Closed-state screenshots mogen
  open-, focus-, Escape-, scroll-lock- of portalthemingbewijs nooit vervangen.
- Focusbewijs registreert `document.activeElement` vóór openen, na openen, na
  nested Escape, na outer Escape en na success/cancel.
- Geometrybewijs meet de uiteindelijke DOM-rectangles. Een 44px class in een
  primitive is onvoldoende wanneer een latere `h-8`, `h-9`, `size-9` of
  densityoverride de rendered target verkleint.
- Contrast wordt op de werkelijk berekende foreground/background/border/ring
  per state gemeten, inclusief body-level portals en gecorrigeerde
  laag-contrasttenantthema’s.
- Elk `evidenceTargetPrefix` is een uniek, veilig repositoryrelatief pad onder
  `evidence/implementation/component-states`; absolute paden, backslashes,
  `..`-segmenten en een reeds bestaand bestand als vermeend toekomstdoel zijn
  ongeldig.
- Geen case mag `VERIFIED_LOCAL` of hoger heten zolang een vereist artifact,
  hash, assertion of onafhankelijke review ontbreekt.
