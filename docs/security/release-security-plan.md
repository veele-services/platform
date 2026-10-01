# Release security — uitvoeringsplan

Baseline: `74966d8c250536466e6e1e988ef114ff6207a000` plus de bestaande,
ongecommitte wijzigingen voor tickets, notificaties, mail, rechten en ClamAV.
Deze baseline is geen release-artifact. Productie blijft buiten scope.

## Volgorde en acceptatie

1. Inventariseer routes/actions, Data API, RPC, Storage, Realtime, workers,
   service-rolegebruik, providers en deployment. Onderscheid broncontrole van
   daadwerkelijke runtimecontrole; markeer niet-beoordeelde paden expliciet.
2. Leg actor/resource/handeling/veldbereik vast. Platformbeheer verleent geen
   impliciete tenantinhoudstoegang. Bijdragen blijven van de medewerker, ook
   wanneer zij in een oorspronkelijk gezamenlijk rapport staan. Een beperkte
   audience-projectie verandert de oorspronkelijke bewijsversie niet.
3. Reproduceer bevindingen met echte lokale databaseprincipals, twee tenants,
   twee medewerkers en klantbindingen. Geen echte klantgegevens of verzending.
4. Herstel gedeelde grenzen: actuele sessie/lidmaatschap/tenant, persoonlijke
   rapportregels, bestandspaden, capability-intrekking en veilige redirects.
   Verifieer zowel misbruik als behoud van toegestane workflows.
5. Beoordeel overige modules en voer hun negatieve controles uit. Controleer
   service-rolepayloads, veldprojecties, vertraagde jobs en directe API-paden.
6. Rond query-first mail/schemawijzigingen af met gegenereerde migraties.
   Test een schone migratie-installatie én upgrade; de bestaande lokale database
   met extra SQL is niet voldoende bewijs voor een release.
7. Lint, types, unit-, database-, browser-, scanner- en buildcontroles; inspecteer
   dependency-, configuratie-, logging-, cache- en artifactrisico's.
8. Alleen GO met gesloten releaseblokkers en aantoonbare omgevingsvoorwaarden.
   Daarna commit, push naar main, CI, bewuste promotie van dezelfde SHA naar
   staging, deploy/health/SHA en gecontroleerde acceptatie.

## Externe voorwaarden

De runtime- en runneridentiteit, geïnstalleerde systemd-units en werkelijke
ClamAV-socketrechten moeten aantoonbaar aan `docs/deployment/clamav.md` voldoen.
Geen secretwaarden opvragen of loggen. GitHub Environment `staging` is de enige
stagingconfiguratiebron. De Supabase Auth-hook blijft uit tot de werkelijke
endpoint en mailflow zijn opgeleverd en gecontroleerd. Geen productieacties.

## Hervatting 1 oktober 2026

Op verzoek zonder Daybreak doorgewerkt. Gerichte onafhankelijke onderzoeken
en hercontroles gebruikten geen Daybreak-dienst. Reparaties zijn lokaal met
beperkte databaseprincipals en echte Auth/Storage/Realtime-clients getoetst.
Zie bevindingen en verificatie; de verse Standard-scan vond nul rapporteerbare
bevindingen in de gewijzigde implementatie en beveiligingskritieke grenzen, maar
de codedekking is partieel en dit is nog geen release-GO.

Het configureerbare rollenmodel is een afzonderlijke, niet-geactiveerde
proefimplementatie. Volgens onderdeel 2 van de releaseopdracht is een nieuwe
rollenbeheerinterface geen voorwaarde voor deze audit. De release wordt daarom
getoetst op de bestaande expliciete rollen; het prototype wordt niet gemigreerd
of geactiveerd en niet als opgeleverd gepresenteerd. De eerdere rollenopdracht
blijft onvoltooid, maar behoeft voor deze afbakening geen nieuwe gebruikerskeuze.

De securitywijzigingen zijn inmiddels vastgelegd in zestien forward-migraties
(toegangsgrenzen, bestanden/scans, reistijden, betaalintegriteit, betaalretries,
HR-privacy, afwezigheidsprivacy, platform-onboarding, modulegrenzen/-samenvattingen,
eigen werkbonmeldingen, resource-/factuurhistorie, notificatie-/auditgrenzen en
publieke commerciële entitlementgrenzen). Een geïsoleerde schone
installatie van alle 55 migraties slaagt. Drie historische upgradeproeven zijn
tot en met migratie 54 geslaagd; de laatste descriptorfix is daarna met de
schone replay en volledige DB-suite getoetst.
De tijdelijke database bevat geen prototype-rollen. De oorspronkelijke lokale
werkdatabase is niet gereset. Historische handtekeningen, goedgekeurde uren,
notificatieleesstanden, mailmomenten en tenanttemplates zijn in de upgradeproeven
behouden; geen fictieve nieuw gegenereerde bewijsversies.

De staging-runner met label `fieldgrid-staging` staat bij de laatste names/status-
socketrechten, `r-x` op `/home/fieldgrid`, een echte runner-schrijfproef en een
daadwerkelijk geverifieerde GitHub-verbinding. App/worker gebruiken nog
`fieldgrid.env`; de gecontroleerde overgang naar `runtime.env` is nog nodig.
Alle ontdekte autorisatie-/dataoppervlakken hebben nu een expliciete afgeronde
reviewstatus en bewijsset. De algemene Standard-scan blijft transparant partieel
voor ongewijzigde presentatie-, documentatie- en fixturebestanden; er staat geen
ontdekt toegangspad stilzwijgend open. Runtime-/provideracceptatie blijft een
externe vrijgavevoorwaarde; geen push/deploy.
