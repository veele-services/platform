# Acceptatie en opleveringsbewijs

Vink uitsluitend af wat met concrete waarneming of test is bewezen. Een build is geen browseracceptatie, een provider-202 is geen bezorgbewijs en een begonnen deployment is geen afgeronde release.

## UI/UX — bindend

- [ ] Signature Grid en platformpresentatie komen uit de vastgezette bron, inclusief merkassets, copy, beeldverhoudingen, blauwe accenten, schaduwen, tokens, componenten en responsive gedrag.
- [ ] Alleen Signature Grid is actief; oude concepten keren niet terug.
- [ ] Homepage: ‘Gemaakt voor de werkdag’ staat direct boven het donkerblauwe ‘Iedereen op dezelfde pagina’.
- [ ] Platform: statistieken → vier CRM-kaarten → Aandacht/Support → Tenant/Platformacties.
- [ ] De verwijderde CRM-groepskop, toelichting, selector en vernieuwknop ontbreken; de vier kaartkoppen blijven intact.
- [ ] Acht Platformacties werken; nieuwe lead en afspraak openen direct de passende dialoog. Bestaande tenant-, branding- en templateacties blijven behouden.
- [ ] Pipeline heeft bord/lijst, filters, fasewissel, leaddossier en alternatieve bediening voor drag/drop. Dossiers, agenda en taken behouden de referentie-interacties.
- [ ] Geen verloren operationeel planbord, dossierfunctie, portalbinding of tenantthema door overname van demoadapters.
- [ ] Desktop 1440/1024, tablet 768, mobiel 390/320 zijn bekeken; geen horizontale paginascroll. Controleer 200% zoom, toetsenbord, focusherstel, Escape, reduced motion en touch.

Vergelijk met identieke fictieve fixtures en states: normale data, nul data, lang bedrijfs-/contactlabel, fout/retry, overvolle pipeline, verlopen taak, aangevraagde en geannuleerde afspraak, geopend dossier en modal. Leg referentie-SHA, implementatie-SHA, host/route, rol, viewport en waargenomen afwijking bij ieder beeld vast. Bekijk de beelden zelf.

## Website en www-host

- [ ] Alle 23 routes uit `docs/05` openen direct en na refresh; onbekend pad geeft echte 404. Menu, footer, breadcrumbs en gerelateerde pagina's hebben werkende bestemmingen.
- [ ] Beide hoofd-CTA's werken overal; persoonlijke demo kiest `/afspraak?type=demo`. Geen videogesprekoptie of verborgen videovalidatie.
- [ ] www wordt als marketinghost herkend; er wordt geen tenant `www` gezocht of aangemaakt.
- [ ] Marketing `/platform` op www blijft productuitleg. Private `/platform` op de platformhost blijft geauthenticeerd beheer.
- [ ] Hostafhankelijke dispatch vindt vóór de bestaande `isProtectedPage`-/logincontrole plaats. Een directe request naar het interne marketingpad op een andere host geeft geen bypass.
- [ ] `APP_URL=https://fieldgrid.nl` en bestaande tenant-URL-generatie behouden; login/OTP, API's, webhooks, Veele Services-website en onbekende tenants correct afgehandeld.
- [ ] Canonicals, metadataBase, OG, JSON-LD en sitemap gebruiken https://www.fieldgrid.nl; geen achtergebleven Sites-origin in publieke navigatie of metadata.
- [ ] Alleen het bedoelde productiedomein is indexeerbaar; staging/preview blijft noindex. Sitemap bevat alleen publieke marketingpagina's.
- [ ] Productieprivacy en trialbevestiging beschrijven de werkelijke flow; geen automatisch geactiveerd proefaccount of externe calendarsync claimen als dat niet is gebouwd.

## CRM-keten en integriteit

- [ ] Voor elk type — trial, kennismaking, demo — verschijnt een succesvolle submit eenmaal als aanvraag en gekoppelde lead, taak, historie en outboxevent; alleen afspraak/demo reserveert agenda.
- [ ] Zelfde sleutel/zelfde payload geeft dezelfde uitkomst; afwijkende payload met bestaande sleutel geeft conflict. Retry na time-out dupliceert geen aanvraag, afspraak, taak of delivery.
- [ ] Dezelfde e-mail/organisatie koppelt aan één lead met meerdere blijvende aanvraagsnapshots. Veranderde leadgegevens overschrijven eerdere snapshots niet.
- [ ] Ongeldige e-mail, ontbrekende telefoon bij afspraak, ongeldige datum, buiten werktijd, overgrote payload en ongeldige aanvraagtypen krijgen bruikbare serverfouten zonder half opgeslagen aanvraag.
- [ ] Race op hetzelfde of overlappend slot: maximaal één reservering; buffer en instellingenwijziging worden meegenomen.
- [ ] Verplaatsen is atomair; bij conflict blijft oude afspraak staan. Annuleren heropent de beschikbaarheid. Herhaalde actie blijft consistent.
- [ ] Amsterdamtijd, zomer-/wintertijd, boekingshorizon en voorlooptijd getest; UTC-opslag en ICS tonen hetzelfde gesprek.
- [ ] CRM-kaarten en volledige lijsten gebruiken gedeelde tellingen. Potentiële maandwaarde blijft onderscheiden van omzet. Paginatie vertekent totalen niet.
- [ ] Na refresh en opnieuw inloggen blijven echte mutaties bewaard. Geen succes-toast zonder servercommit.

## Auth en centrale mail

- [ ] Platformbeheerder heeft passende toegang. Anoniem, tenantbeheerder, personeel, klant en support-only account krijgen geen volledige CRM-data of mutatierecht.
- [ ] Directe API-/RPC-/ID-wisseling levert geen ruimere toegang; ingetrokken beheerrechten worden opnieuw gecontroleerd.
- [ ] Publieke availability geeft alleen tijdsloten. Publieke intake kan geen owner, fase, beheeradres, providerconfig of platformrol bepalen.
- [ ] Bestaande primaire platformbeheerder wordt gebruikt; geen apart CRM-mailadres, geen willekeurige eerste Auth-user en geen demo-adres.
- [ ] Centrale SendGrid-policy/transport/worker gebruikt één duurzame deliverysleutel en juiste platformcontext, ook zonder klanttenant.
- [ ] Ontbrekende configuratie, expliciete opt-out, policyblokkade, tijdelijke providerfout, 202, onzekere uitkomst en veilige retry zijn afzonderlijk bewezen.
- [ ] Intake blijft bewaard als mail later faalt. Historische geaccepteerde ontvanger/status wordt niet herschreven door beheerwijziging.
- [ ] Geen echte e-mail naar fictieve of niet-geautoriseerde ontvangers in test/staging; geen tokens in browserbundles of overdracht.

## Repo- en releasebewijs

- [ ] Actuele repo-instructies en gates gevolgd; bestaande relevante tests en nieuwe domein-/rechten-/hosttests geslaagd.
- [ ] Forward migratie, upgrade met bestaande gegevens, schone replay, gegenereerde typen, RLS/RPC en passende indexen gecontroleerd volgens bestaande repo-patronen.
- [ ] Managementmetrieken en operationele regressies blijven correct; historische achtergrondacceptatie meegenomen waar de integratie die modules raakt.
- [ ] Build/typecheck en betekenisvolle e2e-flows uitgevoerd op de implementatie-SHA; bekende concrete beperkingen benoemd.
- [ ] Release via bestaande procedure, met exacte commit/target en terminale status. Live health/host/functionele keten afzonderlijk bewezen waar gedeployed.

## Opleveringssjabloon voor uitvoerende Codex

| Bewijs | In te vullen |
| --- | --- |
| Baseline / implementatiecommit(s) | SHA's en branch/PR |
| Referentie-SHA's | Platform 3999c85… / marketing c783778… |
| Geïntegreerde schermen en acties | Matrix met echte route/command |
| Tests | Commando, exitcode, omgeving en concrete cases |
| Browservergelijking | Bekeken screenshots met route/state/viewport en verschillen |
| www-host | Hosttest, canonical/sitemap, feitelijke DNS/TLS/deploymentstatus |
| Mail | Centrale adapter, beheerselectie, testdelivery/status; geen geheimen |
| Database | Nieuwe migraties, upgrade/replay en rechtenbewijs |
| Release | Target, commit, workflow/deployresultaat, URL en runtimebewijs |
| Afwijkingen | Alleen noodzakelijke, gemotiveerde UI-/integratiecorrecties |
| Resterend | Concrete blocker/eigenaar/volgende handeling; geen vage ‘later’-lijst |

Rapporteer apart: **gebouwd**, **getest**, **gedeployed**, **live functioneel geverifieerd**.
