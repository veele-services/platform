# Tenantgebruikers, rollen en rechten

De migratie `20261008173000_tenant_management_roles.sql` activeert het managementmodel voor bestaande eigenaren en nieuw toegewezen managementgebruikers. Het bestaande register `permission_catalog` blijft de definitiebron. Platformbevoegdheden, concrete personeelsuitvoering en expliciet gekoppelde klantaccounts blijven afzonderlijke toegangsgrenzen.

## Rollen en toekenning

Iedere tenant heeft vijf vaste profielidentiteiten. De eigenaar beheert de rechten van de overige vier profielen op **Gebruikers & rollen**. Nieuwe rechten uit latere releases worden nooit automatisch aan bestaande profielen toegevoegd.

| Profiel | Standaardbereik |
| --- | --- |
| Eigenaar | Alle huidige tenantpagina's en functies; als enige ook gebruikers-, rollen- en eigenaarsbeheer |
| Management | Operationele backoffice, inclusief vertrouwelijk personeelsbeheer en beveiligde objectgegevens; zonder eigenaarsbeheer of afzonderlijke HR-ticket-/delegatiebevoegdheid |
| Planning | Planning en werkbonuitvoering, operationele klant-/object-/taak-/personeelsinformatie; zonder tarieven, financiële snapshots, privévertrekpunten, HR-dossiers of objectgeheimen |
| Administratie | Facturen en klantbeheer, inzage in commerciële aanvragen en werkbonnen; zonder vertrouwelijke personeelsdossiers |
| Support | Eigen en toegewezen interne/supporttickets, niet-vertrouwelijke opvolging en eigen notificaties |

De eigenaarrol kan niet worden aangepast of via gewone roltoewijzing worden toegekend. Een rol heeft expliciete pagina-/modulebevoegdheden en afzonderlijke functiebevoegdheden. Een wijzigingsrecht vereist het bijbehorende leesrecht; gevoelige rechten hebben aanvullende afhankelijkheden. Governancebevoegdheden blijven exclusief voor de eigenaar. Een rolnaam of zichtbare knop geeft nooit zelfstandig toegang.

Bestaande actieve `tenant_admin`-lidmaatschappen krijgen een eigenaarprofiel. Andere bestaande accounts behouden hun bestaande autorisatie totdat de eigenaar ze expliciet een managementprofiel geeft. Dit maakt de omschakeling zichtbaar en voorkomt dat een migratie bestaande personeels- of klantrelaties stilzwijgend vervangt. Een beheerd profiel gebruikt de enumrollen alleen als technische compatibiliteit met de oorspronkelijke recordcontroles; de actuele profielrechten vormen daarboven een verplichte beperking.

Een managementprofiel intrekken laat een afzonderlijk personeelslidmaatschap actief met uitsluitend de rol `staff`. Het ingetrokken profiel blijft als deny-record bestaan: oude directe ticket-/notificatiegrants kunnen hierdoor geen backofficebevoegdheden laten herleven. Personeels- en klantacties blijven uitsluitend beschikbaar via concrete toewijzingen, verzendingen, eigen zichtbare documenten of geverifieerde klantbindingen.

## Opslag en databasegrenzen

Private tabellen bevatten profielen, expliciete profielrechten, membershiptoewijzingen, commandreceipts en overdrachten. Samengestelde tenant-FK's voorkomen dat een profiel of overdracht aan een andere tenant wordt gekoppeld. De tabellen hebben geforceerde RLS en geen directe Data API-toegang. Mutaties verlopen via geauthenticeerde command-RPC's met actuele sessie-, tenant- en membershipcontrole.

Managementcommando's serialiseren op een tenantlock, controleren verwachte revisies en gebruiken een actor-/tenantgebonden UUID met een payloadfingerprint. Een identieke herhaling retourneert dezelfde uitkomst; een gewijzigde payload wordt geweigerd. Herhaling kan geen ingetrokken actor of inactieve tenant opnieuw activeren. De laatste actieve eigenaar kan niet via een membershipmutatie worden verwijderd of gedeactiveerd. Expliciete verwijdering van de parenttenant blijft mogelijk voor het platform.

De publieke backoffice-RPC's controleren zowel het module-/actierecht als de concrete functiekey. Restrictieve RLS beperkt directe tabeltoegang aanvullend. Financiële volledige rijen en vertrouwelijke personeelsgegevens blijven afgeschermd; veilige operationele RPC-projecties blijven beschikbaar. Storage, service-mediated objectgeheimen, reisgegevens en provideracties hebben eigen actuele controles. Een object-OTP bewijst identiteit en vervangt geen objectgeheimrecht.

Directe recordbewerkingen delen de modulebevoegdheid `write`: een functioneel identieke Data API-bewerking heeft dezelfde grens als het formulier. Afzonderlijke bedrijfsacties hebben daarnaast een eigen functiekey, waaronder facturen versturen, gecombineerde betaallinks maken, medewerkers uitnodigen of opnieuw uitnodigen en commerciële mails verwerken. Zulke service-role acties controleren de actuele actor, tenant en functie opnieuw na voorbereidende I/O en direct vóór de externe provider of het uitgeven van een extern token.

Factuurverzending gebruikt `backoffice.functions.send_invoice`; een gecombineerde betaallink gebruikt `backoffice.functions.create_payment_bundle`. Personeelsuitnodigingen gebruiken respectievelijk `backoffice.functions.invite_personnel` en `backoffice.functions.repeat_personnel_invitation`. De geauthenticeerde binder controleert het actuele Auth-e-mailadres en voegt uitsluitend `staff` aan een actief lidmaatschap toe. Een bestaand managementprofiel, ingetrokken profielrecord en andere enumrollen blijven daarbij intact. De mail controleert vervolgens ook de concrete personeelsregistratie en het actieve personeelslidmaatschap vóór verzending.

`getAuthContext` leest het actuele profiel per paginanavigatie. De proxy overschrijft het interne pathnameheader; een client kan daarmee geen andere autorisatiecontext kiezen. Een cached Next-layout is geen autorisatiegrens. Serveracties controleren opnieuw hun module- en functiebevoegdheden; databasechecks blijven leidend bij directe RPC's of Data API-verzoeken.

## Tickets en notificaties

Nieuwe beheerde accounts ontvangen hun toegestane ticket-/notificatiefuncties uit het expliciete profiel. Bestaande scoped grants en uitgeschakelde grants begrenzen dat profiel aanvullend. Een oude grant kan een ontbrekend rolrecht nooit terugbrengen. Vertrouwelijke HR-tickets vereisen altijd een afzonderlijk gedelegeerd recht met de exacte recordscope; een breed eigenaar-/managementprofiel heft die grens niet op. Platformgrants blijven in het platformdomein.

Delegatiescopes worden actueel gelezen. Eigenaarsdemotie verwijdert onmiddellijk de governancebevoegdheid, ook wanneer historische directe grants nog bestaan. Bron- en ontvangerscope blijven vereist bij notificatielevering.

## Uitnodiging en OTP

Uitnodigen, opnieuw versturen en gebruikers-/rolwijzigingen vereisen een door Supabase Auth onderhouden sessie van maximaal vijftien minuten met een geregistreerde `otp`-authenticatiemethode. Een nieuwe JWT of een verse wachtwoordlogin is onvoldoende. De eigenaarcontrole vindt plaats vóór enige service-role accountvoorbereiding.

Een nieuw account wordt zonder wachtwoord voorbereid. De uitnodiging bevat een tenantgebonden login-URL en instructies om daarna met een eenmalige e-mailcode in te loggen. Bestaande accounts worden niet gereset en hun globale Auth-profiel wordt niet overschreven. De tenantgebonden uitnodigingsnaam vormt een fallback voor het gebruikersprofiel.

De mail gebruikt de standaardhuisstijl, een bevroren gecontroleerd logo en een onveranderlijke mailsnapshot. Een geverifieerd actief custom appdomein heeft voorrang; anders wordt de canonieke tenanthost gebruikt. De bezorgsleutel is aan het uitnodigingscommando gebonden. Een dubbele of onzekere provideruitkomst leidt niet tot een automatische tweede verzending.

Na logo-, branding- en snapshot-I/O controleert een geauthenticeerde read-only RPC onmiddellijk vóór de provider opnieuw de recente eigenaar-OTP, dezelfde commandreceipt, exacte doelmembership, niet-ingetrokken managementprofiel, actuele Auth-status en huidig e-mailadres. Een actief staff-only lidmaatschap voldoet niet als managementuitnodiging.

## Eigenaarschap overdragen

De eigenaar kiest een andere actieve managementgebruiker die al heeft ingelogd. De overdracht verloopt na 48 uur. Tot acceptatie behoudt de huidige eigenaar diens rechten. Alleen het gekozen account kan accepteren, vanuit een recente door Auth geregistreerde OTP-sessie. Acceptatie verheft het doel tot eigenaar en zet de bron atomair om naar Management; eventuele personeelsrelaties en benodigde compatibiliteitsrollen blijven behouden. De eigenaar kan een open overdracht intrekken.

## Verificatie en release

De gerichte databasefixture gebruikt fictieve bevestigde accounts, echte Auth-sessieregistraties en de principals `authenticated` en `anon`. Private helperinspecties draaien afzonderlijk met expliciete actorclaims als `postgres`; die worden niet als publiek RPC-bewijs gepresenteerd. Publieke RPC- en RLS-denials worden als beperkte principal getest. Fixtures worden teruggedraaid en er gaan geen uitnodigingen naar echte adressen.

Unitcontroles dekken strikte payloads, module-/routegrenzen, tenantmail, de eigenaarcontrole vóór Auth-I/O en intrekking tijdens branding-I/O. Browsercontrole gebruikt lokale mailopvang voor uitnodiging, OTP, rechtenwijziging in een bestaande sessie en eigenaarsacceptatie. Volledige regressie, chronologische schone migratiereplay en inhoudgebonden securityreview blijven voorwaarden voor promotie volgens de staging-/productierunbooks.

Het oude query-first bestand `scripts/sql/authorization-roles.sql` is historische ontwerpverkenning en wordt niet gedeployed. Dit document en de daadwerkelijke migratie beschrijven het actuele managementmodel; het oude prototype geeft geen actieve rechten.
