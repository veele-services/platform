# Review productiepromotie Fieldgrid 1.1.0 — 14 oktober 2026

De eigenaar heeft productie-uitrol en aanvulling van releasenotes gevraagd.
Uitgangspunt is `9630c8f74a02cef98a12d213ec2ed87f8365afd4`, met geslaagde
main-CI en stagingdeployment. De productiebranch en publieke health wezen bij
aanvang nog naar `2324aa57fe98d4155e228049aaa055e115406c12` (1.0.0).

## Bronwijziging

Het enige gewijzigde operationele oppervlak is `operation:package.json`.
De productversie verandert van `1.1.0-rc.2` naar `1.1.0`. Een structurele
JSON-vergelijking controleert dat scripts, engines, packageManager en alle
dependencies exact gelijk blijven. De dependencylockfile, applicatiecode,
historische migraties en hun manifest worden niet aangepast.

De bijbehorende wijziging aan de inventaris wordt opgebouwd met de bestaande
`operationSurface`-functie. De oude fingerprint moet vóór vervanging kloppen;
alle overige inventaris- en reviewentries blijven behouden. De expliciete
beoordeling is `controlled`: de wijziging raakt alleen releasemetadata en
voegt geen data-, auth- of mutatiepad toe. Inventariscapture geldt op zichzelf
niet als reviewgoedkeuring.

De documentatie consolideert de releasenotes en verwijst voor definitief
deploymentbewijs naar de GitHub-release. Zij maakt geen productieclaim op
basis van alleen de packageversie. De gedateerde analyses van 9/10 oktober
blijven historisch bewijs. Productbeheerpublicatie en aankondigingen houden
hun bestaande expliciete beheeractie; deze promotie voegt geen nieuwe
operatorworkflow of redactiebevoegdheid toe.

## Productiegrenzen

- Main-CI en een volledige stagingdeploy moeten opnieuw slagen voor de exacte
  1.1.0-SHA. De productieguard blijft beide bewijzen eisen.
- Pas daarna wordt uitsluitend `ACCEPTED_RELEASE_SHA` in Environment
  `production` op die SHA gezet en de bestaande productiebranch fast-forward
  gepromoveerd. De gebruikersopdracht geeft toestemming voor die promotie.
- Credentials blijven in de bestaande geïsoleerde GitHub Environments.
  Er worden geen geheime waarden opgehaald, gekopieerd of gelogd.
- De productiepreflight, doelprojectguards, backup, historische migratiehashes,
  hosted build, attestaties, vaste broker en controles op een verse worker
  blijven vereist. Er wordt geen nieuw deploy- of herstelpad geïntroduceerd.
- De tag `v1.1.0` wordt pas na volledige productieacceptatie gemaakt op de
  werkelijk gedeployde commit. `v1.0.0` wordt niet verplaatst.

De [Supabase-changelog](https://supabase.com/changelog.md) en
[migratiehandleiding](https://supabase.com/docs/guides/deployment/database-migrations)
zijn op 14 oktober geraadpleegd. De nieuwe
[CBC/TLS-aankondiging](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
beschrijft een toekomstige uitfasering van oude HTTP-ciphers. Deze release
wijzigt geen TLS-configuratie of Supabase-client; de pipeline gebruikt de
bestaande Node 24.7.0-builder en doelproject-/verbindingscontroles.

## Verificatie

Lokaal: controle van de toegestane bronwijzigingen, JSON-vergelijking van de
package, onveranderde dependencies/lockfile/migraties, expliciete reviewledger
en whitespacecontrole. De bestaande volledige workflow controleert daarna
de schone schema-inventaris en alle CI-gates opnieuw. Definitieve runlinks,
exacte SHA en publieke health horen bij de werkelijke opleverrapportage en
GitHub-release; een vooraf geschreven reviewdocument bewijst geen deployment.
