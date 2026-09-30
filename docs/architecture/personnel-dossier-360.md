# Personeelsdossier 360

Status: implementatiecontract voor de bestaande Fieldgrid-personeelmodule.

## Schermen en gegevens

De personeelslijst behoudt de rijacties en krijgt filters voor dienstverband,
functie, team, contracteinde, kwalificatie-aandacht en open acties. **Bekijk** opent
voor bevoegde HR-gebruikers `/app/personeel/{personnelId}?tab=overzicht`.
De twaalf onderdelen bewaren het actieve tabblad in de URL.
`/app/personeel/acties` is het centrale opvolgoverzicht. De rustige schermkleuren
zijn afgeleid van de tenant-huisstijl.

Naam, nummer en zakelijke contactgegevens blijven in `personnel`; profielwijzigingen
werken deze bron transactioneel bij. Functie, team, leidinggevende en uren komen uit
het actuele contract, met bestaande functie-koppelingen als terugval. Planning,
beschikbaarheid, werkbonnen en uren blijven hun bestaande tabellen gebruiken.

Contracten, certificaten, documenten en notities breiden bestaande tabellen uit.
`personnel_dossier_items` bevat aanvullende profielen, gesprekken, middelen,
administratief verzuim, VOG-controles, taken en checklists. Registraties hebben
revisies en afgeschermde versiehistorie; verouderde formulieren worden geweigerd.
Verlengingen/vernieuwingen gebruiken een nieuw record met `previous_id`.
Een addendum koppelt een document aan de oorspronkelijke overeenkomst.

De voorwaartse migraties bewaren bestaande medewerker-ID's. Bestaande kwalificaties
worden waar nodig overgenomen zonder hun verificatiedatum te verliezen. Historie
en gekoppelde bestanden hebben geen algemene verwijderactie. De bestaande
Verwijder-actie archiveert personeel; accountafsluiting en definitief verwijderen
blijven afzonderlijke processen.

## Bestaande autorisatie, geen nieuw rollenbeheer

**Rollenbeheer bestaat momenteel nog niet en wordt later toegevoegd.** Er is geen
rollenpagina, rechteneditor of nieuwe toegangsrol gebouwd. Toegang gebruikt de
bestaande actieve lidmaatschappen met `tenant_admin`, `management` of `hr` en de
ingeschakelde personeelmodule.

Serverpagina's, serveracties, relationele controles en RLS begrenzen toegang tot
tenant en medewerker. HR-versies, salarisafspraken, casusinhoud en reminderadressen
gaan niet naar het personeels-/klantportaal. Planners zien alleen operationele
kwalificatieproblemen en beschikbaarheid. Toekomstig rollenbeheer moet aansluiten
op deze dossiercategorieën, lees-/schrijfacties, verificaties, downloads en historie.

De tijdlijn toont type, actor en datum; volledige versies worden pas op verzoek
binnen het HR-dossier geladen. `personnel_dossier_access` registreert bezoek en
download zonder casus-/bestandsinhoud. Algemene logs, zoekbadges en notificaties
bevatten geen HR-inhoud.

## Contracten en kwalificaties

De wizards ondersteunen documenten, expliciete ontvangers, controle en historische
vervolgversies; contracten kunnen als concept worden bewaard. Een upload is nooit
een goedkeuring. Certificaten worden ongecontroleerd opgeslagen en vervolgens
afzonderlijk geverifieerd. Gewijzigd bewijs vraagt opnieuw controle.

Kwalificatietypen en standaardherinneringen zijn instelbaar. Een eis kan gelden voor
functie, discipline, klant, object of werkbon en kan zonder historieverlies worden
gepauzeerd. Alleen harde eisen blokkeren inzet; zachte eisen geven waarschuwingen.
Controle bestrijkt de gehele uitvoeringsperiode: geldig-tot is inclusief, de
opdrachteindtijd exclusief. Nieuwe signalen gelden ook voor bestaande toekomstige
inzet; historische eisen en gecontroleerde bewijsrevisies worden niet herschreven.

Zakelijke datums gebruiken Europe/Amsterdam. Bij expliciet bevestigde aanzegplicht
voor een tijdelijk contract van ten minste zes kalendermaanden wordt één
kalendermaand afgetrokken, met correcte maandultimo. Toepasselijkheid, uitzonderingen,
cao en ketenregeling blijven apart te beoordelen. Een interne reminder is geen
schriftelijke aanzegging: daadwerkelijke datum en bewijs staan afzonderlijk.

## Taken, checklists en servergestuurde reminders

Gesprekken/notities kunnen één gekoppelde opvolgtaak aanmaken. Middelen met een
retourdatum krijgen een retourtaak; werkelijke retour rondt deze af. Herhaald
opslaan en herhaald checklistgebruik dupliceren geen onderdelen. In-/uitdienst-
checklists sluiten accounts nooit automatisch.

Databasetriggers plannen reminders, onafhankelijk van een browser. Contracten
hebben deadlines voor bespreking, proeftijd, einde en nog niet uitgevoerde
aanzegging. Gesprekken en hun opvolgtaken houden afzonderlijke deadlines.
Alleen expliciet geselecteerde actieve HR-verantwoordelijken krijgen in-app
meldingen; e-mail gaat alleen naar ingevulde managementadressen. Catalogusstandaarden
gelden voor nieuwe bewijzen, niet als stille wijziging van bestaande afspraken.

`personnel_dossier_deliveries` wordt verwerkt door de bestaande `POST /api/worker`
en `fieldgrid-worker@staging.timer`. Rijlocks en unieke verzendsleutels voorkomen
herhaalde verwerking. Bevestigde providerfouten krijgen maximaal vijf pogingen met
uitstel. Een afgebroken/onbekende provideruitkomst wordt **Verzending onzeker**:
controleer eerst de provider, geen blinde herverzending. Datumwijzigingen vervangen
toekomstige meldingen, niet historische verzendingen. Lezen/verzenden rondt geen
taak af.

SendGrid-mails gebruiken de gedeelde tenant-huisstijl en een beveiligde dossierlink,
zonder medewerkernaam of gevoelige casusinhoud. Er zijn geen nieuwe secrets nodig.
Echte aflevering vereist de bestaande SendGrid-configuratie en actieve worker-timer.
Er is geen nieuw pushkanaal of automatisch digest toegevoegd.

## Documenten en privacygrenzen

De bestaande private bucket `personnel-documents` blijft leidend. Nieuwe
HR-documenten zijn niet portaalzichtbaar. Eén bestand kan aan meerdere registraties
van dezelfde medewerker gekoppeld worden. Nieuwe versies overschrijven oude bytes
niet. Downloads vereisen actuele sessie/tenantcontext en gebruiken kortlevende links.

PDF/JPG/PNG, bestandssignatuur en maximaal 10 MB worden gecontroleerd. Uitgesloten
VOG-, identiteits- en medische namen/categorieën worden ook in de generieke upload
geweigerd; de gebruiker bevestigt noodzakelijkheid en toegestane inhoud. Dit is
**geen volledige inhouds- of malwarecontrole**: misleidend benoemde bestanden kunnen
niet automatisch worden geclassificeerd.

VOG is een gezien-controle met actor, datum en optionele volgende controle, zonder
vaste vervaldatum of kopie. Verzuim bevat alleen administratieve procesgegevens,
geen diagnose, oorzaak, behandeling of medische bijlagen. Planning ontvangt alleen
**Niet beschikbaar**, zonder HR-toelichting.

## Expliciet niet aangesloten

- Salarisverwerking, externe verlofsaldi en automatische overurenberekening:
  bestaande uren/goedkeuringen zijn zichtbaar, zonder fictieve saldi.
- Arbodienst en gevalideerde bedrijfs-/cao-procesconfiguratie: handmatige afspraken
  en deadlines, geen juridisch volledige automatisering.
- Externe digitale ondertekening en malware-/inhoudsscanning. Een daadwerkelijk
  ondertekend bestand kan wel als bewijs worden geregistreerd.
- Automatische bewaartermijnen en vernietiging: beleid wordt vastgelegd, maar
  definitieve verwijdering is een apart proces.
- Fijnmazig rollenbeheer per dossieronderdeel: vervolgwerk.

Deze beperkingen staan ook in de betreffende schermen. Alle tests gebruiken
fictieve data op geïsoleerde lokale Supabase; deployments maken geen
voorbeeldmedewerkers op staging aan.

## Bronnen en verificatie

De uitgangspunten zijn gecontroleerd tegen primaire bronnen:
[Rijksoverheid: aanzegtermijn](https://www.rijksoverheid.nl/vraag-en-antwoord/arbeidsovereenkomst-en-cao/wat-is-een-aanzegtermijn),
[Justis: VOG](https://www.justis.nl/service-contact/veelgestelde-vragen/vog/hoe-lang-is-een-vog-geldig),
[AP: personeelsdossier](https://www.autoriteitpersoonsgegevens.nl/themas/werk-en-uitkering/personeelsgegevens/personeelsdossier),
[AP: zieke werknemer](https://www.autoriteitpersoonsgegevens.nl/uploads/imported/beleidsregels_de_zieke_werknemer.pdf)
en [UWV: re-integratie](https://www.uwv.nl/nl/ziek/re-integratie/samenwerking-werknemer-werkgever).
Zij vervangen toepasselijke bedrijfs- en cao-afspraken niet.

Regressiecontroles: `lib/personnel/dossier.test.ts`,
`supabase/tests/database/personnel_dossier.sql` en
`tests/e2e/personnel-dossier.spec.ts`. Verplichte CI voert deze met de bestaande
suite uit. Zie [stagingacceptatie](../staging-acceptance.md).
