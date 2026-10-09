# Fieldgrid-versiebeheer

De eigenaar heeft op 9 oktober 2026 de huidige functionele versie aangewezen
als **Fieldgrid 1.0.0**. De eerdere `1.0.0` in package.json en de ontwikkelnotities
waren nog geen getagde release. Vanaf deze baseline gelden onderstaande afspraken.

- `package.json` bevat de productversie; `CHANGELOG.md` beschrijft elke release.
- Elke afgeronde productierelease krijgt een onveranderlijke Git-tag `vMAJOR.MINOR.PATCH`
  op de werkelijk gecontroleerde en gedeployde commit. Een tag wordt nooit verplaatst.
- `PATCH`, bijvoorbeeld 1.0.1: reparaties en vormgevingscorrecties zonder nieuwe functies.
- `MINOR`, bijvoorbeeld 1.1.0: nieuwe functies met behoud van bestaande contracten.
- `MAJOR`, bijvoorbeeld 2.0.0: bewust incompatibele contractwijzigingen, met migratieplan.
- Releasekandidaten kunnen `1.1.0-rc.1` krijgen. De stagingbranch blijft een promotiebranch;
  er komen geen ontwikkelbranches per versie.

Ontwikkeling gaat via een gereviewde wijziging naar `main`. Dezelfde volledige
Git-SHA gaat vervolgens bewust naar `staging`. Alleen na geslaagde stagingacceptatie
en expliciete eigenaarvrijgave wordt diezelfde SHA naar `production` gepromoveerd.
De productnaam vervangt nooit de technische release-identiteit: healthchecks,
migratiemanifesten, deployments en rollback blijven de exacte SHA controleren.

Voor een volgende release: bepaal de versie, werk package/changelog bij, voer alle
CI-gates uit, promoveer staging, registreer de geaccepteerde production-SHA en
controleer webhealth en een verse workeruitvoering. Maak daarna de Git-tag op de
bewezen SHA. Documentatieanalyses na oplevering mogen afzonderlijk op main staan;
zij veranderen de bestaande productietag en release niet.

Databasewijzigingen krijgen nieuwe voorwaartse migraties. Oude migraties en hun
vastgelegde hashes blijven onveranderd. Een coderollback draait niet vanzelf een
databasemigratie terug; compatibiliteit en herstel horen bij de releasereview.
