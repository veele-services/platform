# Dagplanbord V1

## Aansluiting op de bestaande applicatie

`work_orders` is in V1 zowel de centrale bon als één concrete uitvoering. Er is
geen tweede afspraakadministratie of automatische reeksbewerking toegevoegd.
`work_order_assignments` koppelt één of meer medewerkers aan deze uitvoering.
`planned_*` blijft onderscheiden van de bestaande operationele `projected_*`
en werkelijk geregistreerde `actual_*` tijden. Planning wijzigt geen gewerkte
uren, rapporten, handtekeningen, tarieven of factuurregels.

Het bord gebruikt een doelgerichte gegevensprojectie, niet de brede
`getWorkspaceData`-payload. Alleen operationele persoonsgegevens, klant-/objectnamen,
afspraakgegevens en veilige kwalificatiesignalen gaan naar de browser. Objectcodes,
permanente toegangsinstructies en HR-inhoud worden niet opgehaald.

Directe verbindingen:

- Personeel 360: dezelfde medewerker, beschikbaarheid en kwalificatie-eisen;
  alleen bestaande HR-rechten openen het volledige dossier.
- Klant/Object: bestaande dossiers en dezelfde concrete uitvoeringen; geen
  nieuwe klant- of objectmasterdata en geen toegangscode-route via het bord.
- Personeelsapp: bestaande vrijgave, statusmachine, outbox en refreshstrategie;
  daginstructies zijn aan de concrete bon gekoppeld, niet aan een herhaalreeks.
- Rapportcontrole/finance: bestaande statuswaarden blijven intact; een resize
  is uitsluitend een planningswijziging.
- Reismodule: bestaande `travel_legs` met expliciete bekend/onbekend/verouderd-
  status. Gewijzigde routecontext maakt berekeningen ongeldig. Geen nieuwe
  provider, aangenomen thuisbasis of verzonnen reisduur.

## Opslag en validatie

`change_work_order_planning` is de atomaire opdracht voor slepen, exacte invoer,
resize, afspraakgegevens, daginstructies, verwijderen van een toewijzing en undo.
De oude `reschedule_work_order` en de bestaande bonaanmaak delegeren hieraan.
Directe REST-wijzigingen van toewijzingen en updates van bonnen zijn niet
toegestaan; bestaande status-/financecommando's
blijven de expliciete schrijfroutes. Versies en idempotentiesleutels
beschermen tegen verouderde en herhaalde verzoeken. Een tenantgebonden
transactielock en controles op ieder assignment-wijzigingspad serialiseren
gelijktijdige boekingen. Halfopen intervallen laten aansluitende tijden toe.
Beschikbaarheid, actieve medewerkers, klant/objectrelatie, volledige
kwalificatieperiode en bestaande uitvoeringsstatus worden opnieuw gecontroleerd.
Serverberekende zachte afwijkingen vereisen expliciet akkoord en komen in audit.

Verwijderen uit planning archiveert alleen de toewijzing en trekt de vrijgave
daarvan in. Historische gegevens blijven bestaan. `planning_changes` bewaart een
afgeschermde voor-/nasituatie; undo valideert opnieuw en overschrijft geen latere
wijzigingen. Niet-ingedeelde uitvoeringen mogen zonder tijdvak bestaan; een
gewenste datum en klantvenster worden niet door planning vervangen.

## Interface en gegevensvolume

De shell bevat één afgebakende viewport. Het bord en de verstelbare onderste
lijst scrollen onafhankelijk; de initialenstrook en tijdas zijn sticky. Een minuut
blijft de kleinste sleep-/resize-eenheid op iedere zoom. Afwijkende individuele
intervallen worden expliciet behouden of gezamenlijk vervangen in het paneel.
De bonnenlijst heeft serverfilters, volledige telling en paginering (50 rijen).
Grote personeelslijsten worden gevirtualiseerd met vaste rijgeometrie.

De lijstcategorie ‘Afgerond’ omvat ook teruggemelde uitvoeringen: deze zijn niet
meer planbaar via gewone planningsacties. De concrete uitvoeringsstatus blijft
zichtbaar; rapportcontrole en facturatie behouden hun eigen vervolgstatussen.

Voorkeuren zijn uitsluitend weergavegegevens en worden per gebruiker én tenant
opgeslagen. Geen bedrijfsgegevens of geheime informatie in lokale opslag.
Bij zomer-/wintertijd wordt een onbestaand of dubbelzinnig tijdstip niet stil
verschoven: de gebruiker moet een ondubbelzinnig tijdstip kiezen.

## Grenzen

Geen nieuw rollenbeheer, routeringsprovider, klantportaal of automatische
herhaalreeksbewerking. Een rooster ontbreekt mogelijk; dat betekent onbekend,
geen bevestiging van beschikbaarheid of afwezigheid. Medische redenen en gevoelige objecttoegang blijven buiten het
planbord. De bestaande staging-worker moet operationeel gezond zijn voor outbox-
meldingen; UI-refresh blijft onafhankelijk daarvan werken.

De bestaande reismodule legt route-eindpunten en berekeningen vast, maar plant
geen automatische herberekenopdracht. Bij een wijziging worden betrokken caches
als `planning_changed` gemarkeerd; de module moet opnieuw rekenen met expliciet
gekozen vertrekbasis/vervoer. Betrouwbare bestaande berekeningen met passende
buurobjecten kunnen een reistijdwaarschuwing geven. Er is geen nieuwe provider
of vertrekbasis toegevoegd. Een afzonderlijke Object 360 e-mail-OTP-route is
niet aanwezig in deze codebase en wordt niet door dit bord gesimuleerd.

Meerpersoonsuitvoering gebruikt dezelfde individuele assignment-statussen in
de personeelsapp. De gezamenlijke uitvoering blijft lopend tot de actieve ploeg
gereed/teruggemeld is. Bestaande automatische prognoseverschuiving bij echt
starten/afronden blijft beperkt tot volgende eenpersoonsuitvoeringen; botsende
prognoses of een ploeg vragen beoordeling in plaats van een stilzwijgende
gedeeltelijke ploegwijziging. De oorspronkelijk geplande tijden blijven intact.

## Verificatie

- Unit: minuutgeometrie, ploeg-offsets, halfopen tijden, filterbadge en DST.
- PostgreSQL: autorisatie, relatiecontrole, waarschuwing/akkoord, idempotentie,
  undo, echte gelijktijdige schrijvers, volledige telling/paginering en twee
  medewerkers die één uitvoering individueel starten/afronden.
- Playwright: 320/375/768/1280/1920 px, sticky initialen, portaled menu,
  onafhankelijke filters, lijsthoogte, Escape, minuutdrag, refresh, undo en
  mobiele exacte invoer met expliciete afwijkingsbevestiging. Daarnaast:
  medewerker verwisselen, resize, terug naar de lijst en opnieuw inplannen.
