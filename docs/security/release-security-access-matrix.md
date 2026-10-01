# Toegangscontract voor release

Dit is het te verifiëren contract, geen claim dat alle paden al voldoen.

| Actor | Toegestaan | Niet toegestaan |
| --- | --- | --- |
| Anoniem | Publieke tenantpresentatie/intake; beperkte geldige capability | Tenantdossiers, personeel, interne gegevens |
| Klantbinding | Eigen expliciet gebonden klant/object/afspraak en gepubliceerde documenten | Andere klant; interne notities; personeel; toegangscodes zonder aparte controle |
| Medewerker | Eigen actieve toewijzing, minimale klant/objectgegevens, eigen bijdragen en een eigen-bijdrageweergave van het werkrapport | Bijdragen, identiteit, handtekeningen, woonadres, dossier, uren of bestanden van collega's; volledige klantcontact-/factuuradministratie |
| Planner/backoffice | Bestaande expliciete operationele rol, binnen actieve tenant | Automatisch HR-/beveiligings-/platformbereik |
| HR/finance | Bestaande domeinrol binnen actieve tenant; minimale noodzakelijke velden | Andere domeinen zonder expliciete bevoegdheid |
| Tenantbeheer | Bestaande expliciete tenantbevoegdheden | Andere tenant of platformbeheer |
| Platformbeheer | Platformmetadata/beheer | Impliciet alle tenantinhoud via is_member/has_role |
| Worker/provider | Begrensde huidige opdracht, bron, ontvanger en lease | Willekeurige tenant/resource/ontvanger of achterhaalde bevoegdheid |

Een sessie moet daadwerkelijk bestaan, niet verlopen zijn en bij een actief
account horen. Een actief tenantlidmaatschap en actieve tenant blijven vereist.
Een UI-filter is geen beveiligingsgrens: hetzelfde contract geldt voor RPC,
rechtstreekse tabellen, Storage, Realtime, downloads en vertraagde verwerking.

Moduletoegang geldt ook voor opgeslagen commandresultaten, secundaire
dossiercollecties en factuur-/handtekeningssamenvattingen. Personeel-only blijft
bruikbaar zonder Planning; ontbrekende modules heten niet ten onrechte een
lege administratie. Tenantinstellingen mogen niet worden vervangen of naar een
andere tenant verplaatst om platform-entitlements te wijzigen.

De oorspronkelijke platformuitnodiging bindt eenmaal de gecontroleerde
ontvanger. Een retry verleent geen eerder ingetrokken tenantmembership opnieuw.
Verwijderen van platformbeheer trekt de daarvan afgeleide bootstrapgrants in;
afzonderlijke expliciete delegaties blijven afzonderlijke bevoegdheden.

Een gedelegeerde notificatiebeheerder mag alleen rechten aanpassen waarvan
zowel het bestaande als het nieuwe bereik binnen de eigen delegatie valt.
Dit wordt na het database-rijslot opnieuw gecontroleerd, ook bij intrekken.
Een geldige OTP of bekende revisie geeft geen ruimer bereik. Tenantbeheer ziet
en erft alleen gepubliceerde platformtemplates; platformconcepten blijven bij
platformbeheer. Eigen tenantconcepten blijven in die tenant bewerkbaar.

Nieuwsleesbevestigingen blijven bij dezelfde gebruiker, tenant en hetzelfde
bericht en volgen de actuele toegang tot dat bericht. Een toegewezen reminder
geeft op zichzelf geen toegang na sessie-/membershipintrekking of tot een
personeelsdossier van een ander. Nieuwe klantauditregels bewaren alleen de
gebeurtenis, relevante IDs/status/versie en gewijzigde veldnamen, geen volledige
klant-, contact-, document- of overeenkomstpayloads.

Ook een taakdetail mag geen namenlijst van collega's aan personeel leveren.
Taakverdeling en de volledige ploeg blijven voor bevoegde planners beschikbaar.
Klantzichtbare opleverrapporten blijven afzonderlijke gepubliceerde documenten;
de oorspronkelijke snapshot, hash en ondertekening blijven ongewijzigd. De klant
ontvangt geen medewerkershandtekening of naam van de vastleggende medewerker,
maar een niet-identificerende verificatiestatus. Bevoegde backoffice behoudt
het originele bewijs. Een beperkte weergave heet expliciet een afgeleide kopie.

Gedeelde checklists tonen alleen eigen antwoordwaarden en booleaanse
vraagstatus (van toepassing, ingevuld, bewerkbaar). Condities worden op de
server bepaald. Personeel kan antwoorden/bewijs van een ander niet overnemen;
bevoegde planning behoudt de bestaande correctiemogelijkheid.
Hetzelfde geldt voor werkbonmeldingen: personeel ziet eigen meldingen en eigen
bijlagen, zonder de identiteit van een interne behandelaar of collega-bijdragen.

Private downloads controleren bronautorisatie vóór én na I/O, exacte tenant/
oudernamespace en een opgeslagen digest. Directe private Storage-signing is
geblokkeerd. Reeds eerder uitgegeven URLs vereisen afzonderlijke operationele
afhandeling; die zijn niet automatisch ingetrokken. Branding blijft apart.

Realtime publiceert alleen INSERT/UPDATE. DELETE/TRUNCATE valt buiten het
contract omdat RLS verwijderde rijen niet kan beoordelen. Clientfilters zijn
geen beveiligingsgrens; de negatieve test gebruikt een ongefilterd kanaal.

Reisplanning vergelijkt na externe I/O zowel de actuele planningsversie als de
toegestane personen, assignments en privévelden. Rolintrekking verandert niet
noodzakelijk de planningsversie. Historische snapshots worden niet teruggegeven
als een daarin genoemde eerdere assignment niet meer toegankelijk is; het
origineel blijft opgeslagen. Handmatige reistijd vereist bij de databasewrite
dezelfde actieve actor/sessie en actuele planningsbevoegdheid.
Daginstellingen kunnen niet naar een andere medewerker of datum worden
verplaatst. Een operationele planner kan vervoer/vertrekkeuze herstellen, maar
geen privévertrekadres wijzigen of wissen. HR/beheer behoudt die bevoegdheid.

Interne HR-gegevens blijven intern, ook bij oudere records zonder
`dossier_managed`. Raw contracten, certificaten, notities en documentmetadata
vereisen `dossier_access`. Personeel ziet via `staff_workspace` uitsluitend de
expliciet gedeelde eigen documentlijst; `personnel_document_file` levert alleen
de exacte downloadidentiteit. Eigen beschikbaarheid en vertrek-/vervoergegevens
blijven via hun bestaande selfservicepaden beschikbaar. Noodcontactgegevens
worden niet meer via de algemene operationele personeelsquery uitgeleverd.
De algemene beschikbaarheidsquery loopt via `personnel_availability`: de
planner ziet tijdblokken en beschikbaar/onbeschikbaar, zonder ziekte-/verloftype,
vrije reden of interne HR-bron-ID. HR en de medewerker zelf behouden de
bestaande lees-/schrijfmogelijkheden; de originele records worden niet gewijzigd.

Finance mag een echte handmatige betaling via de geauditeerde RPC registreren,
maar geen providerbewijs, Mollie-allocatie of afgeleid betaaldsaldo fabriceren.
Providerstatus wordt servermatig opgehaald en alleen bij exacte identiteit,
modus, valuta, bedrag en bestemming verwerkt. Een ingetrokken betaallink mag
geen nieuwe checkout starten; een werkelijk ontvangen betaling wordt nog wel
correct geboekt. Een uitgegeven bundel kan niet naar een andere klant wijzen.
Definitieve facturen en hun bronregels kunnen niet worden verwijderd of naar
een concept worden verplaatst. Hiermee blijven zowel de hoeveelheidstoewijzing
als de objectscope van een klantdocument intact; ongebruikte concepten blijven
bewerkbaar/verwijderbaar. Een object met bestaande klanttoegang of dossierhistorie
kan niet van klant veranderen. Een werkelijk ongebruikt object kan wel worden
gecorrigeerd. Bestaande archivering is geen nieuwe algemene intrekking van
portaaltoegang: archiveren/herstellen/verwijderen volgt de bestaande beheerrol.

De browser gebruikt een niet-geheim sessiesignaal om de getoonde pagina te
binden aan de identiteit die haar heeft laten renderen. Bij logout/accountwissel
wordt de lokale weergave afgeschermd, vrije zoektekst uit oude browseropslag
verwijderd en identiteit opnieuw gecontroleerd. Dit is geen resourceautorisatie:
die blijft op server en database verplicht. Reeds ontvangen bytes, downloads en
gewone URL-geschiedenis worden hiermee niet teruggehaald of verwijderd.
