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
  geweigerde voorbeelden blijven expliciet DENY. Zie fase 23 en de securityreview.
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
[1.992 units](evidence/phase-26/unit-1992.log) en
[tien echte HTTP-grenschecks](evidence/phase-26/security-http-10.log) slagen.
De [1.417 beveiligingsoppervlakken](../../security/sites-v3-authorization-review-2026-10-16.md)
zijn opnieuw beoordeeld; de 138 baseline-migraties zijn niet herschreven.

De [bekekenlijst](evidence/phase-26/viewed-baselines.json) bindt 33 daadwerkelijk
bekeken nieuwe regressiereferenties aan hun hashes. Magenta maskers dekken alleen
benoemde variabele testgegevens; de ongemaskeerde bronvergelijkingen uit eerdere
fasen blijven de presentatieacceptatie. De [meerwerkfooter](evidence/phase-26/extra-work-320.png)
en [afrondingscontrole](evidence/phase-26/completion-320.png) zijn aanvullend bekeken.

De volledige 134-case regressie draait nog. Deze tussenstand claimt geen groene
integrale gate, stagingpromotie, externe providerbezorging of liveacceptatie.
De CI stopt bij tien fouten om volledig foutbewijs vóór de jobtimeout te bewaren;
een geslaagde run moet nog steeds alle vereiste controles uitvoeren. Alleen
screenshots van synthetische fouten worden kort bewaard, geen traces of cookies.
