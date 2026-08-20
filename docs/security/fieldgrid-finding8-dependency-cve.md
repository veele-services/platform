# Finding 8 — dependency- en CVE-scanning

Fieldgrid controleert dependencies op iedere pull request naar `main` en op de exacte branch-head validatie. De gate is fail-closed: een onleesbaar registryantwoord, ongeldige package-signature of ontbrekend bewijs faalt de run.

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

De audit schrijft reproduceerbaar bewijs naar `artifacts/dependency-security/`. Het geëvalueerde rapport bevat het Git-SHA, de scopes en blocking-status. Het raw auditrapport bevat alleen package- en advisorymetadata; geen credentials of applicatiedata.

## CI

`main-exact-head-validation.yml` voert de policy en registry-signaturecontrole uit op `FIELDGRID_VALIDATION_SHA` en uploadt het bewijs ook bij een mislukking. `dependency-review.yml` blokkeert daarnaast pull requests die nieuwe dependencies met severity `moderate` of hoger introduceren.

Een Finding 8-run mag pas groen zijn als zowel het policyrapport als de registry-signaturecontrole slaagt.
