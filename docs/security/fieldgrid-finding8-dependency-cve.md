# Finding 8 — dependency- en CVE-scanning

Fieldgrid controleert de volledige gelockte dependencygraph op iedere pull request naar `main` en op de exacte branch-head validatie. De gate is fail-closed: een onleesbaar registryantwoord, ongeldige package-signature of ontbrekend bewijs faalt de run.

## Beleid

- Production- en optional-dependencies blokkeren vanaf `moderate`.
- Development-dependencies blokkeren vanaf `high`.
- `critical` blokkeert altijd.
- Lagere bevindingen blijven zichtbaar in het JSON-rapport.
- Native pnpm-ignores en fail-open auditopties zijn verboden.
- Er zijn geen dependency-audituitzonderingen. Een toekomstige tijdelijke uitzondering vereist een apart, gereviewd beleid met eigenaar, tracking issue, compensating controls en harde vervaldatum; critical blijft nooit uitzonderbaar.

## Lokaal

```bash
pnpm fieldgrid:dependency-security:check
pnpm fieldgrid:dependency-security:audit
```

De audit schrijft reproduceerbaar bewijs naar `artifacts/dependency-security/`. Het geëvalueerde rapport bevat het Git-SHA, de scopes en blocking-status. De raw audit- en signaturebestanden bevatten alleen package-, advisory- en registry-signaturemetadata; geen credentials of applicatiedata. Ook wanneer pnpm exitcode 1 gebruikt om ontbrekende of ongeldige signatures te melden, wordt dat geldige JSON-bewijs eerst opgeslagen en faalt daarna de policy.

## CI

`main-exact-head-validation.yml` voert de policy en registry-signaturecontrole uit op `FIELDGRID_VALIDATION_SHA` en uploadt het bewijs ook bij een mislukking. Deze repository heeft GitHub Advanced Security/dependency review niet beschikbaar; daarom is de repository-onafhankelijke pnpm-gate autoritatief en wordt geen niet-ondersteunde GitHub-action fail-open gemaakt.

Een Finding 8-run mag pas groen zijn als zowel het policyrapport als de registry-signaturecontrole slaagt.

## Noodpatch 2026-09-08

De live audit blokkeerde de staging-release op `GHSA-p293-qw3h-jr36` in Next.js, vier HIGH-advisories in de transitieve XML-parser, `GHSA-2883-xcg3-v3hh` in de YAML-parser en `GHSA-rgj7-g3m4-5g8c` in Sharp/libheif. De workspace pint daarom Next.js en de bijbehorende lintconfig op `15.5.24`, forceert `@xmldom/xmldom` op `0.9.12`, `js-yaml` op `4.3.2` en Sharp op `0.35.4`: de eerste releases waarin deze advisories zijn verholpen.

De gepatchte packageversies waren bij adviserende publicatie al ouder dan 1440 minuten. Er is daarom geen `minimumReleaseAgeExclude` nodig: de supply-chainwachttijd, volledige dependencygraph en registry-signatures blijven zonder tijdelijke uitzondering fail-closed gecontroleerd.
