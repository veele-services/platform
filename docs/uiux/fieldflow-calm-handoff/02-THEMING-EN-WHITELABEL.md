# 02 — Tenanttheming en whitelabelcontract

## 1. Bestaande autoriteit

Herbruik zonder duplicatie:

- `lib/db/src/tenant-branding.ts`;
- `lib/db/src/brand-color-contrast.ts`;
- `lib/db/migrations/098_theme_branding_settings.sql`;
- `lib/db/migrations/20260708121100_enterprise_whitelabel_theme.sql`;
- `lib/db/migrations/20260708183000_theme_splash_assets.sql`;
- `artifacts/backoffice/src/app/actions/theme-settings.ts`;
- `artifacts/backoffice/src/components/theme/BrandThemeForm.tsx`;
- `artifacts/backoffice/src/app/(dashboard)/instellingen/branding/page.tsx`.

Fieldflow Calm hergebruikt alle bestaande visuele waarden. Alleen de voor
fail-closed publicatie noodzakelijke tri-state assetmodes en monotone
`theme_revision` worden als forward migration toegevoegd; kleuren, fonts,
radius, density en e-mailvelden krijgen geen duplicaatkolommen.
De documenttabellen krijgen uitsluitend waar nodig de immutable
appearance-snapshot uit het documentlifecyclecontract; dit is geen
UI-versieselectie en wordt niet als verborgen thema-opslag gebruikt.

Voor de nieuwe raw→semantische kleurafleiding zijn aanvullend normatief:

- [`manifests/theme-derivation.json`](./manifests/theme-derivation.json): algoritmeversie, CSS-variablemapping, componentstates, native runtimecontract, negen volledige fixtures, verwachte resolve-resultaten/diagnostics en stabiele hashes;
- [`reference/theme-derivation.mjs`](./reference/theme-derivation.mjs): dependencyvrije executable referentie voor 8-bit sRGB, WCAG-contrast, canonicalisatie en manifestverificatie.

De autoriteitsvolgorde is expliciet: de bestaande loaders leveren een kandidaat raw `BrandTheme`; `fieldflow-calm-srgb-wcag@2.0.0` valideert en resolveert daaruit één complete veilige runtime-semantie of één complete veilige fallback; `fieldflow-tokens.json` blijft autoriteit voor functionele status-/planbordpalettes en voor de authored CI-pixelfixture. Proza in dit document verklaart dat machinecontract en mag er niet stil van afwijken.

## 2. Resolutie

De effectieve theme ontstaat server-side in deze vaste volgorde:

1. `FIELDGRID_DEFAULT_BRAND_THEME`;
2. `platform_theme_settings`;
3. legacy `organization_settings` voor bestaande naam/logo/mailcompatibiliteit;
4. `tenant_theme_settings` wanneer het plan custom branding toestaat en de tenantoverride actief is.

De huidige Enterprisecompatibiliteit moet behouden blijven: planrecht en `useCustomTheme` zijn niet hetzelfde. Modelleer intern expliciet:

```ts
type EffectiveTenantAppearance = {
  host: string;
  themeRevision: number;
  entitlement: "starter" | "professional" | "enterprise";
  canUseCustomBranding: boolean;
  tenantThemeOverrideEnabled: boolean;
  whiteLabelPresentationEnabled: boolean;
  theme: BrandTheme;
  tenantId: string;
};
```

- `canUseCustomBranding`: entitlement, momenteel Enterprise;
- `tenantThemeOverrideEnabled`: bepaalt of tenantwaarden de platformtheme overschrijven;
- `whiteLabelPresentationEnabled`: bestaande Enterprise-white-labelpresentatie; wijzig deze semantiek niet stil;
- `theme`: complete fallbackvrije snapshot.
- `host`, `tenantId`, `themeRevision`, `entitlement` en de drie booleans vormen samen de server-vertrouwde appearancecontext. Een snapshot zonder exact dezelfde gehashte context is stale/ongeldig.

Een onbekende planwaarde of tenantloaderfout faalt terug naar de laatst geverifieerde effectieve platformtheme voor dezelfde host. Een ongeldige raw appearance, ontbrekende veilige snapshot of integriteitsfout valt terug naar de hieronder vastgepinde codeplatformtheme. Een tenant mag nooit themegegevens van een andere tenant zien.

### 2.1 Fail-closed resolutie

`deriveTheme(rawTheme)` is uitsluitend de pure kandidaatberekening en editorpreview. `resolveTheme(rawTheme, options)` is de interne kleur-/geometryresolver. Publiceer geen van beide rechtstreeks. Alleen `resolveAppearance(rawTheme, options)` levert de activeerbare, contextgebonden volledige snapshot:

```ts
type AppearanceResolveResult = {
  status: "resolved" | "fallback" | "rejected";
  reason:
    | null
    | "INVALID_RAW_THEME"
    | "UNRESOLVABLE_CONTRAST"
    | "STALE_THEME_SNAPSHOT"
    | "THEME_HASH_MISMATCH";
  requestedRawBrandThemeSha256: string;
  effectiveRawBrandThemeSha256: string;
  effectiveSemanticOutputSha256: string;
  effectiveResolutionSha256: string;
  requestedContextSha256: string | null;
  effectiveContextSha256: string;
  assetModeValidationErrors: string[];
  appearanceSha256: string;
  resultSha256: string;
  appearance: {
    context: Pick<
      EffectiveTenantAppearance,
      | "host"
      | "tenantId"
      | "themeRevision"
      | "entitlement"
      | "canUseCustomBranding"
      | "tenantThemeOverrideEnabled"
      | "whiteLabelPresentationEnabled"
    >;
    contextSha256: string;
    rawBrandThemeSha256: string;
    assetModesSha256: string;
    identity: ResolvedBrandIdentity;
    communication: { emailFooterText: string; emailSignature: string };
    semanticOutput: CompleteFieldflowSemanticTheme;
  };
};
```

Een kandidaat is alleen veilig als de server-vertrouwde context, raw hash en
hash van de drie expliciete assetmodes exact overeenkomen, hij geen
invalid-fielddiagnostics, geen `thresholdMet: false` en geen falend
gedeclareerd contrastpaar heeft. De context wordt uit de canonical
hostresolver, server-authtenant, monotone `theme_revision`, planresolver en
opgeslagen presentatiestates opgebouwd; browserheaders, queryparameters en
clientstate zijn nooit contextautoriteit. Bij editoractivatie betekent onveilig
`status: rejected`: niet saven/publiceren en de meegegeven, hashgeverifieerde
laatste veilige volledige appearance behouden. Bij runtime, stale data of hash
mismatch betekent dit `status: fallback`: één atomische fallback naar de
volledige `FIELDGRID_DEFAULT_BRAND_THEME`-snapshot met raw SHA-256
`b25dbedfeb0b05e4051a6a05c76d3d8435665f62d73644edc87f550b821d3c80`.
Deze fallback is afzonderlijk van de groene CI-fixture en wordt in de test
rechtstreeks tegen `lib/db/src/tenant-branding.ts` gecontroleerd.

Naam, platformattributie, logo/favicon/splash, e-mailfooter/signature, CSS-variables, portals, safe-area en native statusbar wisselen uitsluitend samen op `appearanceSha256`; nooit kandidaatvelden mengen met fallbackvelden. `effectiveResolutionSha256` bindt uitsluitend de semantische tokens en is niet voldoende als appearance-cachekey. De afgewezen raw kandidaat blijft auditdata en wordt niet door gecorrigeerde/fallbackwaarden overschreven. Een fallback met een onjuiste raw hash of die zelf de veiligheidsvalidator niet haalt, emit geen appearance en is een harde fout.

### 2.2 Canonieke pixel-fixture versus productie-default

De groene Fieldflow-reference is een expliciete visuele CI-fixture, niet een impliciete wijziging van `FIELDGRID_DEFAULT_BRAND_THEME`. `fieldflow-tokens.json.canonicalVisualFixture` bevat de complete raw `BrandTheme` en SHA-256 `9ca02c8def0805d87b21681edc909c2fc209793224e4c2568e75cf3a1e4d48e1`. De fixture `theme-derivation.json#default` bevat exact hetzelfde object, dezelfde veldvolgorde en dezelfde hash. Alleen deze fixture gebruikt `outputMode: authored-pixel-fixture`; zij legt de bestaande, toegankelijk genormaliseerde prototypewaarden over de algoritmische output en leidt ontbrekende states deterministisch af.

Deze uitzondering wordt uitsluitend op fixture-ID en CI-scope geactiveerd. Productie mag nooit op `brandName`, hexwaarden of een hash herkennen dat een tenant “de default” lijkt: iedere echte platform-/tenanttheme gebruikt altijd `resolve-v1-fail-closed`. Een authored waarde die voor een nieuw gedeclareerd statepaar niet aan het contrastcontract voldoet, wordt niet als onzichtbare uitzondering toegestaan; het contract gebruikt dan een state-specifieke foreground of afgeleide stategrens en de executable contrastassertie blijft leidend.

Dit sluit de kleurkeuze definitief:

- W01 verandert de bestaande Fieldgrid-codefallback of globale platformtheme niet stil als onderdeel van de UI-migratie;
- de echte runtime blijft de server-side effectieve platform-/tenanttheme gebruiken;
- elke kandidaat doorloopt intern `deriveTheme(rawTheme)` en `resolveTheme(...)`, maar uitsluitend `resolveAppearance(...)` wordt gepubliceerd; componenten lezen de semantische uitvoer volgens `theme-derivation.json.cssVariableMapping` uit die ene appearance;
- de comfortable CI-fixture moet pixelgelijk zijn aan de genormaliseerde referentie; echte kleur-, font- en radiusvarianten behouden dezelfde compositie, informatiehiërarchie en interactie;
- compact/comfortable/spacious hebben ieder een eigen geometrysnapshot en mogen alleen `density.geometryAxes` wijzigen; page gutters, section/container gaps, responsive gedrag, hit-targetminimum en informatiehiërarchie blijven exact gelijk;
- een latere bewuste wijziging van de globale Fieldgrid-merkpalette is een afzonderlijk brandingbesluit met eigen rollout, niet een verborgen gevolg van Fieldflow.

## 3. Raw instellingen en semantische uitvoer

| Bestaand veld            | Semantische uitvoer                                            |
| ------------------------ | -------------------------------------------------------------- |
| `brandName`              | shellnaam, loginnaam, alt/fallback, tenant-facing documentnaam |
| `platformName`           | alleen non-whitelabel product/providervermelding               |
| `logoUrl/storagePath`    | sidebar, mobiel, login, e-mail/PDF waar geschikt               |
| `faviconUrl/storagePath` | host-aware metadata en icon                                    |
| `splashUrl/storagePath`  | login/onboarding splash                                        |
| `primaryColor`           | primary CTA/link/selection/focusbasis                          |
| `secondaryColor`         | secondary merkoppervlak                                        |
| `accentColor`            | actieve state en accentbasis                                   |
| `backgroundColor`        | app canvas                                                     |
| `surfaceColor`           | panels/dialogs/sheets                                          |
| `textColor`              | hoofdtekst                                                     |
| `mutedColor`             | input voor afleiding; niet tegelijk blind tekst én achtergrond |
| `sidebarBackgroundColor` | sidebarbasis/gradient                                          |
| `sidebarTextColor`       | sidebarforeground                                              |
| `sidebarAccentColor`     | actieve navigatie/accent                                       |
| `fontFamily`             | bodyfontalias                                                  |
| `headingFontFamily`      | headingfontalias                                               |
| `borderRadius`           | goedgekeurde sm/md/lg-geometrie                                |
| `density`                | compact/comfortable/spacious componenttokens                   |
| `emailFooterText`        | tenantmailfooter                                               |
| `emailSignature`         | tenantmailsignature                                            |

`fieldflow-tokens.json.brandThemeMapping` beschrijft de veldintentie; `theme-derivation.json` en `theme-derivation.mjs` zijn de uitvoerbare autoriteit voor de precieze raw→semantische waarden. De volledige output is:

```text
root-background, canvas, surface, surface-subtle, surface-elevated
foreground, text, text-muted, muted-surface
primary, primary-hover, primary-pressed, primary-soft, primary-soft-hover
text-on-primary, text-on-primary-hover, text-on-primary-pressed
secondary-strong, secondary-soft, text-on-secondary
accent-strong, accent-hover, accent-pressed, accent-soft
text-on-accent, text-on-accent-hover, text-on-accent-pressed, text-on-accent-soft
selection, selection-hover, selection-border, selection-hover-border, text-on-selection
border-subtle, border-control, line
focus-ring, focus-ring-offset
sidebar-bg-start/mid/end, sidebar-text, sidebar-muted
sidebar-active-bg, sidebar-active-hover, sidebar-active-text, sidebar-active-hover-text
sidebar-active-indicator, sidebar-active-indicator-hover
font-body, font-heading, radius-preset, density-preset
native-status-bar-background, native-status-bar-style, native-safe-area-background
```

State-specifieke foregrounds zijn functioneel: een middenkleur kan bij donkerder hover/pressed-states niet altijd één gezamenlijke foreground van 4,5:1 behouden. Componenten moeten daarom de stateparen uit `componentStateContract` gebruiken en niet één `text-on-*` kleur over alle states forceren. Alle webvariables gebruiken de exacte namen uit `cssVariableMapping`; `nativeStatusBarStyle` is typed runtime-output en geen CSS-kleur.

De canonical bridge mag authored semantiek niet samenklappen. Voor de default blijven `foreground: #123532` en `text: #113B37`, `mutedSurface: #EEF2F0` en `secondarySoft: #EEF3F1`, en `line: #DCE7E3` en `borderSubtle: #DCE6E2` afzonderlijke keys. Daarom mappt `--foreground`, `--card-foreground` en `--popover-foreground` naar `foreground`, `--muted` naar `mutedSurface`, en `--line` naar `line`; nooit naar de bijna-gelijke buurwaarde. `theme-derivation.json.canonicalBridgeMapping` en de validator bewaken dit exact.

Functionele palettes blijven apart:

```text
success-bg/border/foreground/icon
warning-bg/border/foreground/icon
danger-bg/border/foreground/icon
info-bg/border/foreground/icon
locked-bg/border/foreground/icon
plan-mint/blue/aqua/peach/yellow/rose/lilac/orange
```

## 4. CSS-scope en portals

Huidig risico: de dashboardlayout zet variables op een binnenste wrapper, terwijl Radix-portals standaard onder `body` landen. Een Dialog/Sheet/Dropdown/Popover/Toast kan daardoor defaultkleuren krijgen.

Vereist:

1. Resolve tenant + theme in de serverlayout vóór render.
2. Plaats de complete variable snapshot op een document-/portal-bereikbare scope.
3. Gebruik óf een centrale themed portalcontainer óf SSR variables op het relevante root/body-element.
4. Maak geen client-only themepatch na hydration.
5. Scope cachekeys op host, tenant-ID, theme revision en entitlement.
6. Verwijder oude tenantvariables volledig bij tenantwissel.
7. Test computed styles in gesloten én geopende overlays.

Geen flash van Fieldgrid-default voordat het whitelabelthema verschijnt.

## 5. Kleurafleiding en contrast

### Minimum

- normale tekst: 4,5:1;
- grote tekst: 3:1;
- controlgrens, icon, focus en betekenisvolle grafiek: 3:1;
- focusring: zichtbaar tegen zowel canvas, surface als primary;
- disabled blijft leesbaar maar hoeft geen actieve affordance te simuleren.

### Deterministische correctie

De enige normatieve implementatie is `fieldflow-calm-srgb-wcag@2.0.0`. Zij gebruikt 8-bit sRGB en de WCAG 2.x-luminantieformule, zonder browserparser, HSL of OKLCH. Een kleur is geldig als hij exact `#RRGGBB` is (hoofdletterongevoelig); output is altijd uppercase. De pure editorpreview kan ongeldige hex- en enumwaarden met de per-field referentiefallback tonen en levert daarbij `INVALID_HEX_FALLBACK` of `INVALID_ENUM_FALLBACK`. De activatie-/runtime-resolver behandelt dezelfde kandidaat fail-closed als `INVALID_RAW_THEME`. Raw input blijft ongewijzigd voor audit en foutfeedback en wordt niet effectief gepubliceerd.

`mix(first, second, p)` gebruikt integerpercentage `p` voor `first` en rondt ieder kanaal half-up: `floor(((first × p) + (second × (100 − p))) / 100 + 0,5)`. De vaste basismixen zijn:

| Token/state               | Eerste bron  |   % | Tweede bron |   % |
| ------------------------- | ------------ | --: | ----------- | --: |
| surface-subtle            | background   |  64 | surface     |  36 |
| muted-surface             | text         |   7 | surface     |  93 |
| primary-hover             | primary      |  88 | zwart       |  12 |
| primary-pressed           | primary      |  76 | zwart       |  24 |
| primary-soft              | primary      |  10 | surface     |  90 |
| primary-soft-hover        | primary      |  16 | surface     |  84 |
| secondary-soft            | secondary    |  10 | surface     |  90 |
| accent-hover              | accent       |  88 | zwart       |  12 |
| accent-pressed            | accent       |  76 | zwart       |  24 |
| accent-soft               | accent       |  12 | surface     |  88 |
| selection-hover           | accent       |  18 | surface     |  82 |
| border-subtle             | text         |  14 | surface     |  86 |
| line                      | text         |  12 | surface     |  88 |
| border-control basis      | text         |  38 | surface     |  62 |
| sidebar-mid               | sidebar-bg   |  88 | zwart       |  12 |
| sidebar-end               | sidebar-bg   |  76 | zwart       |  24 |
| sidebar-muted basis       | sidebar-text |  68 | sidebar-mid |  32 |
| sidebar-active soft       | indicator    |  14 | wit         |  86 |
| sidebar-active soft hover | indicator    |  20 | wit         |  80 |
| sidebar-indicator hover   | indicator    |  88 | zwart       |  12 |

Foregroundselectie bewaart de voorkeurskleur wanneer die tegen alle gedeclareerde achtergronden 4,5:1 haalt. Anders is de vaste keuzevolgorde diep `#081D3A`, wit `#FFFFFF`, zwart `#000000`; alleen wanneer geen kandidaat slaagt wint de hoogste minimumratio met diezelfde volgorde als tie-break. Primary, accent en hun hover/pressed-states hebben bewust state-specifieke foregrounds.

Wanneer een betekenisvolle fill/grens niet slaagt, zoekt het algoritme in deze vaste eindige gamut: basis; per heel percentage 1–100 richting zwart; per heel percentage 1–100 richting wit; daarna de 256 neutrale grijzen. De kandidaat met de kleinste gekwadrateerde 8-bit sRGB-afstand die alle drempels haalt wint; gelijke afstand sorteert op uppercase hex. Primary/accent-states moeten ieder ≥3:1 tegen canvas en surface en hun gekoppelde foreground moet ≥4,5:1 halen. `border-control` en de default/hover-selectiegrenzen worden afzonderlijk gecorrigeerd; `border-subtle` mag zachter zijn omdat whitespace/elevatie het panel mede begrenst.

“Beste beschikbare kleur” is geen geldige runtime-uitkomst wanneer geen kandidaat **alle** contexten haalt. Bijvoorbeeld een geldige raw theme met zwart canvas, wit surface en `#808080` text/muted bevat daarnaast een gemengde `surface-subtle`; één foreground kan dan niet op alle drie AA halen. De inverse combinatie heeft hetzelfde probleem. Beide fixtures moeten `UNRESOLVABLE_CONTRAST` produceren en atomair op de gehashte veilige platformfallback landen; een gedeeltelijk gecorrigeerde kandidaat is verboden.

De sidebar gebruikt een gradient met de vastgelegde start/mid/end-mixen. Gewone en muted tekst halen over alle drie stops 4,5:1; voor muted wordt het aandeel sidebar-text zo nodig per procent tot maximaal 100 verhoogd. Actieve navigatie heeft een **soft background** plus een afzonderlijke **strong indicator**: beide default/hover-backgrounds onderscheiden zich ≥3:1 van iedere gradientstop, de indicator onderscheidt zich ≥3:1 van de gradient en de stateforeground haalt 4,5:1 op zijn eigen soft background. Voor de authored canonical fixture zijn de door het echte prototype vastgepinde waarden exact `#D9F6E8` background, `#083F35` text en `#25B77F` inset indicator; de gelijk-specifieke hoverregel staat eerder, dus dezelfde active waarden blijven op hover gelden.

Focus is één composiet: `0 0 0 2px var(--ff-focus-ring-offset), 0 0 0 5px var(--ff-focus-ring)`. De eerste 2px vormen de surfacekleurige offset; de volgende 3px zijn een volledig dekkende, contrastveilige ring. De offset scheidt de ring van primary en de buitenring haalt ≥3:1 tegen canvas en surface. Geen component mag tokennamen, geometrie, dekking of de twee lagen wijzigen of tot één willekeurige outline reduceren.

Elke correctie levert geordende diagnostics met context, input/output, ratio vóór/na, drempel en `thresholdMet`. De editor toont daarvoor “Weergavekleur aangepast voor leesbaarheid”, maar schrijft computed output nooit terug over raw input. Een actieve/effectieve snapshot met een textpaar <4,5:1, boundary <3:1 of `thresholdMet: false` faalt altijd. Zo’n fout mag alleen als kandidaatbewijs bestaan bij een fixture waarvan de verwachte resolve-status `fallback`/`rejected` is en waarvan de effectieve output volledig veilig is. `verifyManifest()` controleert status, reason, requested/effective raw hashes, semantic/resolution/resulthash en atomische fallbackgelijkheid.

### Verplichte contrastfixtures

| Fixture-ID                   | Waarom                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `default`                    | immutable raw hash + authored prototype/pixelreferentie                       |
| `light`                      | zeer lichte primary/sidebar; donkere foreground en boundarycorrectie          |
| `dark`                       | donker canvas/surface/sidebar; lichte foreground en native `Style.Light`      |
| `red`                        | verzadigd merkrood blijft gescheiden van functionele danger                   |
| `yellow`                     | extreem lage witcontrastval en state-specifieke donkere foreground            |
| `monochrome`                 | status en selectie blijven herkenbaar zonder merkhue                          |
| `low-contrast`               | ongeldige hex/enums: previewdiagnostics, runtime `INVALID_RAW_THEME` fallback |
| `black-canvas-white-surface` | geldige maar onoplosbare AA-context: `UNRESOLVABLE_CONTRAST` fallback         |
| `white-canvas-black-surface` | geldige inverse onoplosbare AA-context: `UNRESOLVABLE_CONTRAST` fallback      |

Test default, hover, pressed, focus, disabled, active nav, selected card en geopende portalcomponenten.

## 6. Typography, radius en density

### Fonts

- map `inter|poppins|system` naar bestaande veilige fontloaders;
- `--ff-font-body` en `--ff-font-heading` zijn de enige consumptietokens;
- verwijder de Fieldflow-scope override naar Roboto;
- fallback blijft metrisch stabiel;
- geen externe runtimefontcall.

### Radius

| Preset         | Panel | Card | Control | Dialog |
| -------------- | ----: | ---: | ------: | -----: |
| sm             |    16 |   14 |      10 |     18 |
| md / canonical |    22 |   18 |      13 |     24 |
| lg             |    28 |   22 |      16 |     30 |

### Density

Density gebruikt nooit een runtimefactor. Iedere preset resolveert rechtstreeks naar deze integerwaarden:

| Preset      | Button gap | Sheet body | Sheet fieldset | Dialog kolom | Dialog rij | Dossier hero | Minicard |
| ----------- | ---------: | ---------: | -------------: | -----------: | ---------: | -----------: | -------: |
| compact     |       7 px |      21 px |          14 px |        19 px |      21 px |        23 px |    12 px |
| comfortable |       8 px |      23 px |          15 px |        21 px |      23 px |        25 px |    13 px |
| spacious    |       9 px |      25 px |          16 px |        23 px |      25 px |        27 px |    14 px |

| Preset      | Controlhoogte | Pointertarget minimum | Tabelrij minimum | Planbordrij | Blokhoogte | Bloktop | Queuecard minimum |
| ----------- | ------------: | --------------------: | ---------------: | ----------: | ---------: | ------: | ----------------: |
| compact     |         44 px |                 44 px |            68 px |       78 px |      58 px |   10 px |            128 px |
| comfortable |         44 px |                 44 px |            74 px |       98 px |      70 px |   14 px |            142 px |
| spacious    |         48 px |                 44 px |            82 px |      108 px |      78 px |   15 px |            156 px |

Density wijzigt uitsluitend de benoemde interne componentgaps, controlhoogte, tabelrijminimum en complete planbordgeometry. Page gutters, section gap, cluster/container gap, breakpointcompositie, informatiehiërarchie en het 44px targetminimum veranderen nooit. Het is componentgedreven, niet een globale selector die Tailwindclassnames onderschept.

## 7. Assets

Huidige applicatie-intentie, te verifiëren tegen de werkelijk gedeployde bucket en policies:

- platform: `branding/platform/{logo|favicon|splash}/...`;
- tenant: `tenant/{tenantId}/branding/{logo|favicon|splash}/...`;
- `org-assets` bucket;
- server-side tenant- en permissioncontrole;
- PNG/JPEG/WebP;
- SVG geweigerd totdat een expliciete sanitizer bestaat;
- de actions adverteren maximaal 2 MB voor logo/favicon en 6 MB voor splash.

De bekende bucketlimiet is 3 MB en de MIME-policy staat mogelijk SVG toe terwijl de action SVG afwijst. W00/W01 brengen UI, servervalidatie en bucketconfiguratie daarom eerst onder één contract. Tot die controle is 6 MB geen betrouwbare gebruikersbelofte.

UI:

- drag/select uploadarea is toetsenbord- en touchbedienbaar;
- toont bestandstype en limiet vóór upload;
- progress, succes en fout inline;
- vorige asset blijft actief tot succesvolle save;
- verwijderen via AlertDialog;
- preview desktop én mobiel;
- geen path of technische storagefout in eindgebruikerscopy.

Logo:

- desktopbox circa 170×48;
- mobiele box circa 128×32;
- `object-fit: contain`;
- zeer breed/hoog logo vervormt niet;
- bij fout: brandName of initialen;
- `alt=""` alleen als dezelfde merknaam direct zichtbaar staat; anders tenantnaam als alt.

Upload- en publicatiecontract:

- controleer magic bytes, decodeerbaarheid, pixelafmetingen, aspectratio en bestandsgrootte server-side;
- strip metadata/re-encode waar het beveiligingsbeleid dit vereist;
- valideer een asset-ID opnieuw op tenantownership; vertrouw nooit een client-URL of storagepath;
- upload precies eenmaal en test request-/writecount; publiceer de nieuwe referentie niet direct vóór de version-safe themesave;
- activeer een nieuwe asset pas samen met een geslaagde, version-safe themesave;
- houd de vorige asset bruikbaar tot commit en herstel haar bij een fout;
- de forward migration voegt per asset exact één modekolom toe: `logo_mode`, `favicon_mode`, `splash_mode`, elk `inherit | asset | none`, plus de monotone `theme_revision bigint`; alleen kleur/font/radius/density blijven zonder nieuwe opslagvelden;
- `inherit` gebruikt de geverifieerde platformasset, `asset` vereist een owned storagepath en server-afgeleide URL, `none` forceert beide effectieve velden op `null`; een URL of pad alleen kan nooit de mode afleiden;
- legacybackfill is deterministisch: geldig tenant-owned pad → `asset`; geen tenantasset → `inherit`; een legacy externe URL gaat pas naar `asset` na allowlist/ownershipmigratie en anders naar `inherit` met auditwaarschuwing;
- ondersteunen: vervangen (`asset`), expliciet verwijderen (`none`), erven/resetten (`inherit`) en gecontroleerde orphancleanup;
- externe redirect-/fetch-URL's zijn niet automatisch toegestaan; PWA, e-mail en PDF gebruiken owned assets of een expliciete allowlist;
- storage write/delete policies binden actor én pad aan dezelfde tenant en worden met tenant A/B-negatieve tests bewezen.

## 8. Volledige whitelabeldekking

| Oppervlak                       | Vereist                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Dashboard/sidebar/mobile header | tenantnaam, logo, kleuren, font                                                              |
| Login/password flows            | host-resolved naam, logo/splash, kleuren, helpcontext                                        |
| HTML metadata                   | dynamische title/description waar relevant                                                   |
| Favicon/app manifest            | host-resolved asset, veilige fallback                                                        |
| Command palette/notifications   | geen hardcoded Fieldgrid-copy in custom mode                                                 |
| Planning                        | geen “Fieldgrid past …” of hardcoded brandkleur                                              |
| Empty/error/forbidden           | tenant-facing productnaam/fallback                                                           |
| First-run                       | effectieve tenanttheme en assetpreview                                                       |
| Klant-/personeelsportaal        | dezelfde effectieve tenantbrand snapshot                                                     |
| E-mail                          | naam, logo, footer, signature en toegankelijke CTA                                           |
| PDF/export                      | tenantlogo/naam en geen ongewenste platformondertitel                                        |
| Websitebeheer                   | beheerchrome tenantthemed; gepubliceerde site volgt eigen websitecontract                    |
| Supportmodus                    | interne Fieldgrid-attributie mag zichtbaar blijven voor audit, maar tenantcontext overheerst |

Zoek vóór release in alle tenant-facing code, e-mailtemplates, PDF-routes en metadata naar `Fieldgrid`, `Veele`, defaulthexes en vaste faviconpaden. Classificeer iedere hit als:

- juridisch/interne audit en toegestaan;
- functionele semantische kleur;
- veilige fallback;
- ongewenst merklek en verwijderen.

### 8.1 Oppervlakgrenzen en domeinen

“Volledig whitelabel” geldt alleen geloofwaardig wanneer per surface vaststaat wie de branding beheert. [surfaces.json](./manifests/surfaces.json) is de uitputtende, machineleesbare lijst met scope, themabron, bronpaden, evidence-targets en gekoppelde acceptance-ID’s:

- backoffice, auth, klant-/personeelsportaal, web-PWA en e-mail gebruiken de effectieve host-/tenantbrand snapshot; PDF/export volgt per document het vastgelegde effectieve of juridische snapshotbeleid;
- de gepubliceerde publieke website behoudt haar eigen versioned `WebsiteTheme`; zij erft standaard niets. Een eventuele keuze `none | identity_only | identity_and_palette` vraagt een apart product- en migratiebesluit en mag publicaties niet stil wijzigen;
- gefinaliseerde facturen en andere juridische documenten behouden hun immutable
  uitgiftesnapshot, ook na een themeswitch.
  `theme-derivation.json.documentAppearanceSnapshotContract` legt de exacte,
  zelfstandig renderbare projectie vast: merknaam/attributiebeleid,
  documentfooter, volledige PDF-palette en een owned logoreferentie met immutable
  objectversie, contenthash, MIME en byte length. Het contract bepaalt ook
  lifecycle-events en forward migration voor facturen, offertes, rapporten en
  verzamelfacturen. Alle backoffice-, klantportaal- en compatibiliteitsroutes
  lezen na uitgifte uitsluitend die snapshot; een GET mag nooit lazy een
  snapshot schrijven en een ontbrekend snapshotasset mag nooit naar de actuele
  tenanttheme of een externe URL terugvallen;
- de Capacitor-webinhoud, webview-safe-area en runtime StatusBar blijven in scope. De typed output is `{ nativeStatusBarBackground: #RRGGBB; nativeStatusBarStyle: Style.Light | Style.Dark; nativeSafeAreaBackground: #RRGGBB }`: background en safe-area zijn exact de resolved semantische canvas; `Style.Dark` wint wanneer zwart systeemiconcontrast groter dan **of exact gelijk aan** wit is, anders `Style.Light`. Vóór een geverifieerde host+tenant+revision snapshot beschikbaar is, geldt exact de afgeleide veilige codeplatformtuple `#F8FAFC` + `Style.Dark`; background/style/safe-area wisselen daarna als één overgang. Een cached tenant A-kleur mag nooit zichtbaar worden tijdens tenant B-resolutie. `theme-derivation.json.nativeRuntimeContract` en de fixtures `light`, `dark`, `low-contrast` maken FFC-BRAND-019 uitvoerbaar. Native launcher-/displaynaam, package/application-ID, launchericon, OS-launchsplash en build-time notificationicon/channelmetadata vallen buiten de runtime-whitelabelclaim en gebruiken een goedgekeurde neutrale/flavor-identiteit. Een per-tenant native build/releasepipeline is een afzonderlijk toekomstig productprogramma en geen releasevoorwaarde voor Fieldflow Calm;
- platform-/providerattributie, supportmodus en juridische afzender zijn aparte beleidsvelden en worden niet via tekstvervanging afgeleid.

### 8.2 PWA-installatiecontract

Klant- en personeels-PWA publiceren per canonical host één dynamisch manifest
uit dezelfde `appearanceSha256`. `name` is de effectieve merknaam plus de vaste
productsuffix, `short_name` wordt server-side grafeemveilig tot maximaal 24
tekens afgekapt, `background_color` is `canvas`, `theme_color` is
`accentStrong`, en `start_url`/`scope` blijven exact binnen respectievelijk
`/klant` en `/personeel`. Iconen zijn gegenereerde 192×192- en 512×512-PNG/WebP,
waarbij de 512-variant `any maskable` is en essentiële pixels binnen de
gecentreerde 80%-safe-zone blijven. Splash is 1080×1920, gebruikt `contain` en
valt terug op het semantische canvas zonder crop.

Manifest-, icon- en splash-URL's dragen `themeRevision` én
`appearanceSha256`; caches zijn geïsoleerd op canonical host, tenant en
revision. De effectieve favicon is bron, met deterministische initialen op
primary als veilige fallback. Legacy `public/manifest.json`, favicon/iconfiles
en service-worker-precache mogen niet als concurrerende statische waarheid
blijven bestaan: verwijderen of `no-store` redirecten naar de host-resolved
endpoint. De service worker verwijdert assets van een andere host, tenant of
revision. Responsive bewijs omvat standalone launch en offline reload op
320/390/768/1440 px, lange merknaam, breed/hoog/kapot logo en alle drie
assetmodes. De exacte waarden staan in
`theme-derivation.json.pwaInstallContract`.

Een custom domain is pas actief na echte DNS- én TLS-verificatie. Primary-hostrouting, redirects, callback-URL's, cookie scope, CSP/CORS, PWA start URL en tenantresolutie gebruiken daarna dezelfde canonical host. `x-forwarded-host` wordt alleen uit een vastgelegde trusted-proxyketen geaccepteerd. Een bestaand Fieldgrid-subdomein mag een geldig primair custom domain niet onbedoeld voorrang geven.

## 9. Brandingeditor

Structuur:

1. entitlement/statusbanner;
2. live preview desktop/mobiel/login;
3. identiteit en assets;
4. merkkleuren;
5. canvas/tekst;
6. sidebar;
7. typografie;
8. radius/density;
9. e-mailidentiteit;
10. reset en save.

Gedrag:

- Starter/Professional: read-only effectieve platformpreview met upgrade-uitleg; geen vals werkende inputs.
- Enterprise, override uit: platformtheme preview + whitelabelpresentatie volgens bestaande compatibility.
- Enterprise, override aan: tenantwaarden.
- reset herstelt platformtheme, niet hardcoded defaults;
- save valideert server-side en activeert alleen `status: resolved`; bij `rejected` blijft de laatste veilige effectieve theme actief en toont de editor reason plus veld-/contrastdiagnostics;
- unsaved changes worden bij verlaten bevestigd;
- contrastwaarschuwing koppelt raw aan computed kleur;
- preview rendert dezelfde productcomponenten/tokens, geen los nagemaakte mini-UI.

## 10. Caching, veiligheid en audit

- geen globale mutable theme singleton;
- `tenantId` komt uitsluitend uit server-auth/hostcontext;
- storageasset-ID wordt opnieuw tegen tenantpad gevalideerd;
- RLS en ingetrokken anon/auth Data API-toegang blijven;
- theme save/upload/delete wordt geaudit;
- logs bevatten geen bestandinhoud of secrets;
- cache invalidation gebeurt na theme save en tenant switch;
- twee gelijktijdige theme-editors gebruiken revision/updatedAt-bewaking;
- previewquery of clientparameter kan geen andere tenant laden.
- cache/publish alleen een complete `AppearanceResolveResult` met gecontroleerde `appearanceSha256` én `resultSha256`; de key is exact `host + tenantId + themeRevision + entitlement + tenantThemeOverrideEnabled + whiteLabelPresentationEnabled + algoritmeversie`. Ontbrekende/stale/hash-mismatched data activeert de volledige veilige platformfallback en nooit een gedeeltelijke tokenset of kandidaat-identiteit.

## 11. Testmatrix

De deterministische contractgate draait zonder browser of kleurdependency:

```bash
node docs/uiux/fieldflow-calm-handoff/reference/theme-derivation.mjs --check
node --test docs/uiux/fieldflow-calm-handoff/reference/theme-derivation.test.mjs
```

De eerste opdracht vergelijkt algoritmecontract, negen volledige raw fixtures, canonical raw hash, gehashte productieplatformfallback, resolve-status/reason/resultHash, verwachte effectieve semantic output, diagnostics en semantic/resolutionhash. Hij voert bovendien alle gedeclareerde 4,5:1-textparen, 3:1-boundaryparen, de composiete focusring en native style/background-invarianten uit. De tests bewijzen editorbehoud van de laatste veilige snapshot, atomische runtimefallback bij onoplosbaar/invalid/stale/hash mismatch, en harde afwijzing van een fallback met foutieve hash. Zij lezen ook de vastgepinde active-navkleuren rechtstreeks uit het embedded prototypearchief, bewijzen dat `reference-normalization.css` die selector niet overschrijft en bewaken dat de canonical bridge geen bijna-gelijke authored tokens samenklapt.

Voor elk themeprofiel:

1. login;
2. dashboard;
3. lijst + geopende filter Sheet en row Dropdown;
4. dossier + action Sheet;
5. form + invalid state;
6. AlertDialog;
7. planbord met alle pastel/statusstates;
8. settings brandingpreview;
9. e-mail fixture;
10. PDF fixture;
11. klant-/personeelsportaal smoke;
12. tenant A→B→A switch.

Meet screenshot, computed variables, contrast, accessible name, overflow en cache/tenantisolatie.
