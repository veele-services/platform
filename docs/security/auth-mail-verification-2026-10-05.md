# Auth-mailcontract en klantidentiteit — 5 oktober 2026

Een nieuwe klant met een expliciete `customer_portal_accounts`-binding kon al
vóór het eerste object `/klant` gebruiken, maar de mailcontext kende alleen
personeelslidmaatschappen en objectbindingen. De Send Email-hook weigerde daarom
deze klant met 503. De nieuwe, uitsluitend voorwaartse migratie
`20261005075500_customer_auth_mail_context.sql` gebruikt de actuele
klantaccountidentiteit, klantstatus, contactgeldigheid en tenantstatus zonder
een bestaande browsersessie te vereisen.

De oude objectbindingfallback is verwijderd: historische objectbindingen zijn
al expliciet naar klantaccounts gemigreerd. Een achtergebleven objectbinding
mag een ingetrokken klantaccount niet opnieuw autoriseren. Actieve
personeelslidmaatschappen en de vooraf aangemaakte tenantbeheerderuitnodiging
blijven hun bestaande autorisatie behouden. De RPC blijft uitsluitend
beschikbaar voor `service_role`.

De ondertekende hookpayload bepaalt de Auth-identiteit en ontvanger; de RPC
autoriseert de tenantbranding. Accountactivatie en e-mailadreswijzigingen
kunnen aan de zichtbare Auth-databasewijziging voorafgaan. De klantcontrole
vereist daarom geen gelijkheid met het nog oude opgeslagen e-mailadres en
staat de afzonderlijke activatie-/email-change-events vóór e-mailbevestiging
toe. OTP-login blijft een bevestigde, actieve identiteit vereisen; de latere
sessie- en werkruimtecontrole is niet gewijzigd.

De hook gaf bovendien een lege HTTP-200-respons na verzending en bij een al
voltooide aanroep. De [GoTrue HTTP-hookdispatcher](https://github.com/supabase/auth/blob/v2.196.0/internal/hooks/hookshttp/hookshttp.go#L186-L231)
vereist voor HTTP 200 een JSON-contenttype en parsebare JSON. Beide succesroutes
geven nu `application/json` met `{}` terug. Een voltooide duplicaat-aanroep
blijft geen mail versturen. Ondertekende verzoeken, ontvangstclaims, centrale
mailstop, trackinguitschakeling en het ontbreken van credentials in opslag of
foutmeldingen blijven behouden.

De regressies reproduceerden vóór de correctie drie klantcontextfouten en twee
responsecontractfouten. Na een incrementele upgrade slagen 19 mail-DB-tests en
54 gerichte unitchecks. Een onafhankelijke bronreview bevestigt de
klantautorisatie, transactionele account-events en service-only grants. Een
schone lokale replay bevat 110 migraties; alle 109 eerder beoordeelde
statementhashes zijn exact behouden. Na die replay slagen de gecombineerde
mail- en klantportaalsuites met 46 tests, de volledige suite van 1.303 unittests
en TypeScript.

De structurele inventaris blijft 983 onderdelen bevatten. De Auth-mailroute
en mailcontext-RPC zijn inhoudelijk herbeoordeeld als
`corrected-and-rechecked`; de manifestuitbreiding is `controlled`. Alleen deze
drie beoordeelde vingerafdrukken zijn bijgewerkt.

De eigenaar bevestigt de nieuwe Send Email-hook, bijgewerkte GitHub-secret en
uitgeschakelde, verkeerd gekoppelde JWT-hook. De volgende stagingdeploy moet
de nieuwe secret in de runtime installeren. De volledige CI en exacte-SHA
stagingacceptatie blijven verplicht. Deze lokale bewijsvoering bevestigt geen
echte mailbezorging; die provideracceptatie volgt het
[`mail-hooks.md`-runbook](../deployment/mail-hooks.md).
