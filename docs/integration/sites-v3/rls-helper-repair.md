# Herstel van bestaande RLS-helperrechten

Lokaal hersteld en getest; niet gedeployed of live geverifieerd.

Migratie 157 had naast de nieuwe rapportsnapshots twee bestaande `EXECUTE`-rechten ingetrokken: `private.report_backoffice(uuid)` en `private.report_storage_frozen(text,text)`. De bestaande signature- en Storage-policies roepen deze helpers rechtstreeks als authenticated caller aan. Daardoor kon de brede native workspace-loader op handtekeningen falen, ook wanneer die loader door het personeelsdossier of taakbeheer werd gebruikt. De Storage-mutatiepolicies hadden dezelfde ontbrekende uitvoerbevoegdheid.

Migratie 165 herstelt exact de authenticated-helperrechten die vóór migratie 157 bestonden. Functie-inhoud, tabelrechten, policies, modulevoorwaarden, bronbindingen en private-schema-exposure worden niet gewijzigd. De originele 138 migraties en de reeds vastgelegde migratie 157 blijven ongewijzigd. De correctie is query-first toegepast op de geïdentificeerde lokale stack, met de CLI als nieuwe migratie vastgelegd en in de lokale migratiehistorie gecontroleerd. De security-advisor meldt geen problemen.

De nieuwe regressie controleert daarnaast alle rechtstreeks door public-/storage-policies aangeroepen private helpers. Er ontbreken geen uitvoerrechten voor authenticated policycallers. Werkelijke handtekeningen houden de management-, eigen-bijdrage- en tenantgrenzen. Anonieme en service-callers krijgen geen directe helperbevoegdheid. Ingetrokken functierechten, lidmaatschap en sessies blijven toegang afwijzen. Bestanden die bij een onveranderlijk rapport horen, blijven via de Storage-RLS beschermd tegen wijzigen en verwijderen. De rollbacktest simuleert daarbij de sessie-instelling waarmee de Storage API zijn SQL-DELETE uitvoert.

Alle 63 nieuwe en bestaande controles voor deze helpers, modulegrenzen, releaseprivacy en rapporten slagen. De volledige personeelsbrowserketen slaagt opnieuw. Het volledige native HR-dossier is in een echte browser geopend; de daadwerkelijke titel en navigatie zijn gecontroleerd en het vastgelegde beeld is bekeken. Dit vult het eerdere fase-10-bewijs aan: alleen de HTTP-status was onvoldoende, omdat een gestreamde pagina na de headers alsnog kan falen.

Zie `evidence/rls-helper-repair/`. De koude productiebuild, volledige releasecontroles en de overige matrixrijen blijven vereist.
