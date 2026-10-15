# Supportdesk en supportinstellingen

P05 en P06 worden aangesloten op de bestaande ticketquery's, commando's en actuele rechten. De zes bronkolommen en het gespreksvenster vervangen de uitgebreide lijstpresentatie; de bestaande detailroute blijft beschikbaar voor context, toewijzing, prioriteit, overdracht, historie en gecontroleerde redactie. Dit document is tussentijds; er is geen deployment- of liveacceptatieclaim.

| Onderdeel | Keuze | Uitwerking |
| --- | --- | --- |
| Supportlijst | Uitbreiden | Zes bronkolommen, bronknoppen, badges, typografie en gespreksvenster. Bestaande zoek-, weergave-, sorteer- en scopefilters blijven via de filterknop bereikbaar. |
| Gesprek en antwoord | Hergebruiken | Actuele native detailprojectie, zichtbaarheid per doelgroep, kennisartikelen, gecontroleerde bestanden en de bestaande herhaalbare antwoordopslag. |
| Afsluiten | Hergebruiken | De bronknop opent de bestaande oplossingsregistratie. Een oplossing wordt eerst voorgesteld; de echte bevestigings-/heropeningsflow blijft behouden. |
| Uitgebreide afhandeling | Hergebruiken | De werkelijke ticketdetailroute blijft alle operationele acties, context en audit aanbieden. |
| Supportdefaults | Uitbreiden | De twee bronvelden bewerken de reactietermijn en standaardbehandelaar van een werkelijk gekozen intakecategorie. |
| Rechten en SLA | Hergebruiken | Bestaande databasecontrole, categorieversie, herhaalsleutel, huidige bevoegdheden, businessuren en automatische intake bepalen de werkelijke behandeling. |
| Geavanceerde inrichting | Hergebruiken | Categorieën, groepen, openingstijden, eigen notificaties, begrensde delegatie met OTP en beheergeschiedenis blijven beschikbaar onder hun eigen uitklapbare onderdeel. |

## Noodzakelijke integratieverschillen

De bron gebruikt twee fictieve tickets en één vaste verantwoordelijke. Productie toont uitsluitend werkelijk gedeelde tickets binnen de actuele supportscope en de werkelijke behandelaar. Platformbeheer alleen geeft geen automatische inzage in gesprekken. Een antwoord is een echte transactie en een oplossing volgt de bestaande expliciete lifecycle; de lokale demo-afsluiting wordt niet overgenomen.

De bestaande reactietermijn en automatische toewijzing zijn per intakecategorie ingericht. De bronvelden krijgen daarom een expliciete categoriekeuze wanneer er meerdere categorieën zijn. Eén instelling wordt niet stilzwijgend over alle categorieën geschreven en er komt geen tweede supportregister bij. Eén werkdag wordt vertaald naar de werkelijk ingestelde dagelijkse openingstijd; bestaande afwijkende werkminuten blijven kiesbaar. Een wijziging bewaart de andere categorievelden en gebruikt de bestaande versiecontrole. Bestaande gesprekken en hun vastgelegde termijnen worden niet achteraf herschreven.

Een gesprek wordt bij openen, focus en elke dertig seconden opnieuw geautoriseerd. Een ontzegde of verwijderde resource wordt gewist. Een transportfout verbergt de laatst geladen inhoud en bewaart het concept tot expliciet herladen of sluiten. Antwoorden kunnen bij een onbekende uitkomst met dezelfde invoer en sleutel worden herhaald. Navigatie, sluiten en wijzigingen tijdens verzending zijn begrensd om conceptverlies te voorkomen.

Het hoofdvenster volgt de bron met berichtblokken en een reactieveld. De bestaande kennisartikelen, bijlagen en interne zichtbaarheid staan in een uitklapbaar onderdeel; een gekozen interne doelgroep blijft daarnaast expliciet boven het reactieveld vermeld. De intakecategoriekeuze wikkelt op smalle schermen onder de sectietitel, zodat lange werkelijke namen geen horizontale pagina-overloop veroorzaken. De eerste verpakte browserrun bevestigde antwoorden, terugkoppeling en oplossen; de mobiele overloop werd daarbij gevonden en vóór acceptatie hersteld.

## Bewijsstatus

De bestaande native suites voor tickets, aflevering, supportteam en klanttickets slagen samen voor vijftig controles, inclusief personeel → tenant → Fieldgrid, gescheiden interne notities, expliciete terugkoppeling, beperkte operators en intrekking van bestaande sessies. De werkelijk verpakte runtime `969822c53de24b999c8221d792b186c88541fb68` slaagt voor zeven browserketens, waaronder de daadwerkelijke antwoord-/oplossingsflow, expliciete terugkoppeling aan personeel, duurzame intake-instellingen, de werkelijke nieuwe businessurentermijn en behoud van historische termijnen, conceptbescherming en intrekking bij een open gesprek. Er zijn achttien beelden bekeken: zes lijst-/instellingenparen en drie gespreksparen op 1440, 768 en 390 px. Er is geen horizontale pagina-overloop. Zie [verification.json](evidence/phase-21/verification.json). De compacte reactielabeldikte en uitlijning van de reactieknop worden in fase 22 nog met de bron gelijkgetrokken. De globale autorisatie-inventaris blijft een afzonderlijke releasegate.
