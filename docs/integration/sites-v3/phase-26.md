# Native browserregressie na de bronovername

De 105 scherm-/actierijen houden hun afzonderlijke bewijs in het schermregister.
Deze aanvullende controle toetst de bestaande brede regressiesuite via de nieuwe
presentatie. Deployment en liveacceptatie blijven afzonderlijke stappen.

De tests bedienen de echte nieuwe labels, tabbladen, bronvensters en gerichte
uitklapsecties. Database-, scan-, historiek-, privacy-, concurrency-, OTP- en
intrekkingscontroles zijn behouden. Lokale fixtures gebruiken gewone gevalideerde
tenant.localhost-hostnamen, geen vertrouwde presentatieheaders of productbypass.
Een exacte lookup van de synthetische testidentiteit vervangt een afgekapt
Auth-gebruikersoverzicht. Uitnodigingsfixtures worden bij onveranderlijke historie
inactief gemaakt; geschiedenis en guards worden niet gewist of uitgeschakeld.

## Gevonden en herstelde integratieafwijkingen

- Inlogredirects behouden de al gevalideerde tenant-/customhost en gebruiken
  geen onbetrouwbare forwarded authority.
- Een oorspronkelijke private PDF wordt werkelijk in de browser getoond.
  Alleen geautoriseerde, gescande PDF-/rastervoorbeelden krijgen SAMEORIGIN;
  geweigerde voorbeelden verbieden framing expliciet via CSP. Zie fase 23 en de securityreview.
- Native formulieracties staan in de vaste bronfooter, met behoud van echte
  formulier-associatie en submitopdrachten. Directe conditional fragments verliezen
  geen acties. Lange mobiele labels mogen volgens de bronregels ombreken.
- Native aanvullende dossiertabs behouden Radix-bediening en krijgen de
  aangesloten kaartstijl van de bron. De impliciete wizardkolom kan op 320 px niet
  langer breder worden dan de beschikbare inhoud; stapnummers blijven behouden.
- De klantenlijst behoudt haar bestaande paginavoorkeur en de volledige
  zoek-/sorteercontext bij openen en teruggaan uit het dossier.
- Ticketuploads behouden exacte Origin/Host-validatie. Alleen de afzonderlijke
  lokale ontwikkelomgeving staat HTTP-loopback met één geldige tenantlabel toe;
  staging en productie blijven HTTPS vereisen.

## Bewijs en actuele grens

De opnieuw opgebouwde, eigen lokale testomgeving heeft 178 migraties. Alle
[723 native databasecontroles](evidence/phase-26/native-db-723.log),
[398 pgTAP-checks](evidence/phase-26/pgtap-398.log),
[1.998 units](evidence/phase-26/unit-1998.log) en
[tien echte HTTP-grenschecks](evidence/phase-26/security-http-10.log) slagen.
De [1.418 beveiligingsoppervlakken](../../security/sites-v3-authorization-review-2026-10-16.md)
zijn opnieuw beoordeeld; de 138 baseline-migraties zijn niet herschreven.

De [bekekenlijst](evidence/phase-26/viewed-baselines.json) bindt 33 daadwerkelijk
bekeken nieuwe regressiereferenties aan hun hashes. Magenta maskers dekken alleen
benoemde variabele testgegevens; de ongemaskeerde bronvergelijkingen uit eerdere
fasen blijven de presentatieacceptatie. De [meerwerkfooter](evidence/phase-26/extra-work-320.png)
en [afrondingscontrole](evidence/phase-26/completion-320.png) zijn aanvullend bekeken.
De definitieve [native werkbonwizard](evidence/phase-26/viewed-native-wizard.json)
is daarna daadwerkelijk bekeken op 320, 390 en 1440 px. De eerdere opname met een
samengedrukte stapcirkel is verworpen; stapcirkels en echte formulieracties blijven
zichtbaar. Lange native stapnamen breken op 320 px af binnen hun eigen kolom.

De [brede 134-case run](evidence/phase-26/native-browser-regression.json) bewaart
127 geslaagde, vijf mislukte en twee niet uitgevoerde gevallen. Alle betrokken
gevallen slagen vervolgens in acht gerichte herhalingen. De oorspronkelijke
fouten blijven zichtbaar: ontbrekende lokale testserver-assets, schijfruimtegebrek,
een verborgen coördinaatveld en het dubbel toggelen van de statuslegenda bij
aanwijzen plus klikken. Geen trigger- of auditbypass was nodig voor opruimen van
de achtergebleven lege synthetische tenant. Lokale trace-opname werd uitgezet;
alle functionele assertions bleven behouden.

Dit is volledige gevaldekking, geen groene enkele 134-case run. De exacte-commit-CI
blijft een verplichte promotiegate. Er is nog geen stagingpromotie, externe
providerbezorging of liveacceptatie geclaimd.
De CI stopt bij tien fouten om volledig foutbewijs vóór de jobtimeout te bewaren;
een geslaagde run moet nog steeds alle vereiste controles uitvoeren. Alleen
screenshots van synthetische fouten worden kort bewaard, geen traces of cookies.

## Registryherstel zonder lagere releasegate

[CI 38858676964](https://github.com/veele-services/platform/actions/runs/38858676964)
stopte vóór de Linux-assertions omdat public ECR zijn datalimiet weigerde. De
[test-only transportbrug](../../../scripts/contract-test-image.sh) probeert beide
vastgelegde publieke registries maximaal eenmaal, met een downloadtimeout en
exact dezelfde immutable digest. De officiële Docker Hub-manifestbytes zijn
tegen die digest geverifieerd en de echte pull slaagt. Er zijn geen extra
credentials, veranderde runtimebytes of overgeslagen assertions.

De [zes fout-/herstelcontroles](evidence/phase-26/contract-image-unit-6.log) toetsen
onder meer cache, primaire uitval, beide transports defect, ontbrekend image na
pull en afgewezen overrides. Beide echte Linux-rechten-/isolatierunners slagen;
[het bewijs](evidence/phase-26/registry-recovery.json) houdt de eerdere CI-fout
zichtbaar. De volledige unitset telt nu 1.998 controles in 208 bestanden. De
operationele fingerprints zijn inhoudelijk opnieuw beoordeeld; de inventaris
telt 1.418 oppervlakken. Een volledige groene exacte-commit-CI blijft vereist.
