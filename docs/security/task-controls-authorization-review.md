# Autorisatiereview taakgerichte controles

Bronbasis: `7398d6cb7f2a2cf75eb22a8b33aa7726fa827eb6`.
De structurele inventaris wordt uit een schone lokale replay vastgelegd.
Dit document behandelt de gewijzigde oppervlakken; bestaande bevindingen en
bewijzen in de reviewledger blijven behouden.

## Ingangen en capabilities

De bestaande taak- en werkbonmutaties bewaren hun management-asserts. Nieuwe
serveractions bepalen tenant en sessie met `getAuthContext`, valideren invoer en
gebruiken de authenticated databaseclient. Geen action ontvangt een tenant-ID
als autoriteit van de browser. De RPC controleert dezelfde autoriteit opnieuw.
De nieuwe actions voor controles, items, bezoeken en normen verwijzen naar de
bestaande capabilities in `docs/architecture/task-controls.md`; er is geen
algemene nieuwe klant-, onderhouds- of beheerdersrol.

Taakconfiguratie, verkorte omschrijvingen, eenheden en revisie-insert worden ook
serverzijdig gevalideerd. De oorspronkelijke snapshot-/norm-/begrotings- en
commerciële kolommen kunnen niet rechtstreeks door authenticated worden ingevuld
of gewijzigd. Bestaande kolomrechten blijven beschikbaar voor oude formulieren.
De directe kolomrechten staan expliciet in de inventarisfingerprint.

Bewijs: `scripts/test-task-controls.mjs` (legacy-mutatie, modelvariant,
vreemde tenant/rol, directe tabel- en kolomdenials), bestaande taakcatalogus-,
managementrollen- en werkbonregressies.

## Private gegevens en scoped projecties

Alle nieuwe private tabellen hebben forced RLS, samengestelde tenant/context-FK's
en geen directe grant aan anon, authenticated of service_role. Private helpers
hebben geen publieke execute-grant. Publieke nieuwe RPC's hebben uitsluitend
execute voor authenticated. Bestaande private of legacy implementaties behouden
hun bestaande gesloten grants. Security-definers gebruiken een lege search_path.

Een medewerker leest uitsluitend vanuit eigen actuele dispatch/inzet; na
bezoekbinding is een eigen actieve sessie nodig om te schrijven. Gedeelde
voortgang is gescheiden van antwoorden en verborgen bevindingen. Itemdossier
voor personeel is beperkt tot de concrete toegankelijke bon en geeft geen
algemene locatiehistorie. QR is uitsluitend identiteit, geen credential of
bevoegdheid. Zoek- en pagineringresultaten blijven tenant/object/bongebonden.

Normanalyse en besluiten zijn beheerdersprojecties. De test laadt echt afwijkende
metingen van tenant B met dezelfde vergelijkingssleutel; de dataset/hash en
1522 minuten van tenant A blijven gelijk. Personeel krijgt geen normanalytics.
Bestaande klantbindingen en vrijgegeven rapportprojecties blijven de enige
klantingang. Klantnotities bevatten geen interne bevinding of auteur.

Bewijs: `scripts/test-task-controls.mjs`, `scripts/test-security-catalog.mjs`,
`scripts/test-work-order-reports.mjs`, `scripts/test-personnel-privacy.mjs`,
`scripts/test-customer-portal.mjs` en de bestaande HTTP-securitysuite.

## Mutaties, concurrency en bronuren

Nieuwe commands serialiseren op de bestaande tenantplanning- of cataloguslock.
Sessie en capabilities worden na de lock opnieuw gecontroleerd. Receipts bewaren
actor, tenant, actie en volledige payload/hash; gewijzigde retries falen en
stale versies kunnen geen antwoord/resultaat overschrijven. Controlerondes en
normbesluiten zijn aanvullend en bewaren historie. Scopeoverdracht verwijst naar
concrete restdoelen. Een intrekking moet overeenkomen met de bewaarde private
scopehistorie. Doelvolume kan niet los van actieve koppelingen worden gewijzigd.

Arbeidsallocaties verwijzen naar eigen bronuren, voorkomen overlap en begrenzen
de toerekening tot de bron en sessie. De broninvariant van één open registratie
wordt bij commit gecontroleerd: de bestaande atomische overgang van reis naar
werk mag eerst werk invoegen en daarna reis sluiten. Dit is geen uitzondering
op de eindinvariant. Concurrente starts hebben één winnaar. Persoonlijk sluiten
wijzigt geen collega en is geen gezamenlijke oplevering.

Bezoekplanning hergebruikt de bestaande personeelsfit inclusief harde grenzen,
kwalificaties, contractperiode en expliciet bevestigde beschikbaarheidswaarschuwingen.
Native planmutaties, inzetguards en personeelsfit herkennen andere bezoeken.
De oude bonplanning mag een bezoekketen niet overschrijven. Private worker-
generatie gebruikt de bestaande reeks/occurrence en vastgelegde bronactor; een
onduidelijke commerciële bron wordt geen willekeurige doelbinding.

Bewijs: `scripts/test-task-controls-concurrency.mjs` (echte onafhankelijke
transacties, bronstarts, resultaat-CAS, normbesluit-CAS en ingetrokken sessie tijdens
lockwait), `scripts/test-task-controls.mjs` (sessies, tweede dag, bronoverschrijding,
planning, intrekking/overdracht, retries en cycli), planbord/live-planningregressies.

## Rapport en financieel recht

De bestaande rapportversie, hash, signatures, review en PDF blijven leidend.
Alleen de actuele controleronde bepaalt de nieuwe oplevering; oude antwoorden
blijven bewaard. Uitgevoerd-afgekeurd is iets anders dan onuitgevoerd. Verplichte
controlevelden, conditionele regels, technische grenswaarden en doelbewijs worden
serverzijdig gecontroleerd. Een bestaande rapportversie verandert niet door
latere item-/catalogus-/normwijziging.

Materiaal is aan dezelfde bon/taak en optioneel doel gebonden, met bestaande
catalogussnapshot en review. Extra doelen en nieuwe normen verhogen geen prijs.
De factuurguard controleert de gezamenlijke oorspronkelijke scopebron over
bron- en deelbonnen. De test doorloopt echte rapportindiening, review en
facturatie: onbeoordeelde extra hoeveelheid wordt geweigerd; expliciet financieel
geaccepteerde hoeveelheid wordt eenmaal tegen het oude tarief verwerkt.

Bewijs: `scripts/test-task-controls.mjs`, werkbonrapport-, lineage-, commerciële-,
bronfactuur- en operationele-ketenregressies. De migration verandert geen oude
uren, signatures, prijzen, factuurallocaties of rapporthashes.

## Release en beperkingen

Alleen de bestaande stagingpromotie is geautoriseerd. De migratie is aanvullend;
de 179 historische statementhashes blijven onveranderd. Lokale upgradefixtures
staan uitsluitend op een expliciet begrensde tijdelijke loopbackstack. Geen
providercredential of echte tenantdata wordt in bewijs opgenomen. Screenshots
gebruiken afzonderlijke fictieve lokale tenants. `qrcode` genereert uitsluitend
een canvas met de ondoorzichtige itemidentiteit en verzendt geen data.

De uitbreiding bevat geen volledige offlinequeue. Netwerkfouten geven geen
succesbevestiging; open formulieren behouden invoer en herhaalsleutel. Camera-QR
is browserafhankelijk en heeft een volwaardige zoek-/invoerfallback.

De bestaande dependency-audit signaleerde de op 20 oktober gepubliceerde
[launch-editor/Vite-kwetsbaarheid](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
De transitive ontwikkeldependency is op de gepatchte Vite 8.3.3 vastgezet.
De bestaande braces-patch met bijbehorende eerdere audituitzondering blijft
ongewijzigd; er is geen nieuwe audituitzondering toegevoegd.

De aanvullende read-compatibiliteitsmigratie bewaart de oude strikte personeels-
projectie. De nieuwe serverclient vraagt de versie expliciet op; de header
verleent geen toegang. De locatieguard verhindert dat personeel via een oude
bon actuele gegevens van een verplaatst item leest. Itemmetadata verleent geen
afgeleide bevoegdheid op taak-/rapporthistorie. De regressies controleren de
oude en nieuwe projectie, locatieverandering en intrekking van de bronmodule.
