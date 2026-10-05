# Portaalrelease: lokale verificatie op 5 oktober 2026

Kandidaat `5893d27fe9f3ead5402e85fbde1472e0b3932825` bevat de prototypeaanpassingen
voor de personeelsapp en tenantbackoffice, de vereenvoudigde werkbonaanmaak en
de forward correctie van de voorlopige planningstatus. De onderstaande
releasecontroles zijn lokaal voltooid vóór stagingpromotie.

| Controle | Resultaat |
| --- | --- |
| Lint en TypeScript | Geslaagd |
| Unittests | 141 bestanden, 1.420 tests geslaagd |
| Schone migratiereplay | 111 migraties; alle 110 bestaande statementhashes behouden |
| pgTAP | 12 bestanden, 398 controles geslaagd |
| Database-integratietests | 393 tests geslaagd |
| Historische werkbonupgrade | IDs, ondertekening, goedgekeurde tijd en taakrechten behouden |
| Notificatie-upgrade | IDs, leesstatus, mailsnapshots en tenanttemplates behouden |
| Platformupgrade | Uitnodigingshistorie behouden; ingetrokken autoriteit niet hersteld |
| Autorisatieregister en bronreviews | Alle 988 oppervlakken volledig beoordeeld |
| Auth, Data API, Storage en Realtime | 10 HTTP-integratietests geslaagd |
| Geïsoleerde echte ClamAV | Schone PDF/PNG geaccepteerd, EICAR geweigerd |
| Database-lint | Geen fouten; bestaande waarschuwingen blijven zichtbaar |
| Database security-advisors | Geen beveiligingsproblemen |
| Bron- en browsersecretcontrole | Geslaagd |
| Bestaande dependencycontrole | Geslaagd met het bestaande beleid |
| Productiebuild | Geslaagd |
| Chromium op de productiebuild | Alle 71 browserflows geslaagd |
| Linux root-/runnercontract | Geslaagd met echte geïsoleerde Linux-rechten |
| Standalone releasebestand | Verpakken en starten geslaagd |

Elf gewijzigde screenshotreferenties zijn visueel beoordeeld. De volledige
browserronde is daarna geslaagd zonder referenties bij te werken en met de
bestaande beeldtoleranties.

Deze proeven gebruiken uitsluitend synthetische gegevens en geïsoleerde lokale
diensten. Zij vervangen geen GitHub CI, CodeQL, controle op de exacte groene
`main`-commit, stagingbackup, deployment of publieke acceptatie. Volg daarvoor
het [stagingrunbook](staging-runbook.md). Een geslaagde deploymentclaim vereist
publieke gezondheid met de exacte gepromoveerde SHA en database-/scannerreadiness.
