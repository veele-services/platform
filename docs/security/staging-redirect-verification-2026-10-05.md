# Publieke OTP-redirectcontrole — 5 oktober 2026

Een publieke browsercontrole na activatie van `1e65cbe8` vond dat de oude
`/auth/confirm`-route naar `https://localhost:3301/login` verwees. De standalone
Next-runtime bood de interne origin aan via `request.url`, terwijl Caddy de
publieke staginghost bediende. De reguliere OTP-formulieren en anonieme
werkruimteguards slaagden; de fout trad op bij deze oude accountlinkroute.

De route retourneert nu HTTP 307 met een relatieve `Location: /login?...`,
zoals de bestaande uitlogroute. De browser behoudt daardoor zijn publieke
platform- of tenantorigin. `otpNext` begrenst de bestemming; de handler gebruikt
geen Host/Forwarded-headers, leest geen logincredentials, voert geen
Auth-verificatie uit en zet geen sessiecookie. `no-store` en `no-referrer`
blijven behouden. De proxy blijft de hostname vóór de route controleren.

De regressies in `lib/auth/auth-destinations.test.ts` reproduceerden de fout
eerst met een interne localhost-URL, een publieke platform-/tenanthost en
misleidende forwarded headers. Na de correctie slagen 63 gerichte tests en
scoped ESLint; TypeScript en de volledige suite van 1.303 unittests slagen.
Een onafhankelijke bronreview bevestigt het native Response-contract van de
geïnstalleerde Next 16-runtime. Betalingscallbacks gebruiken `tenantAppUrl`;
geen andere App Router-handler bouwt een browserredirect uit `request.url`.

De stagingacceptatie voert nu na de exacte-SHA healthcontrole een anonieme GET
op de publieke `/auth/confirm` uit. Die volgt geen redirects en gebruikt
uitsluitend fictieve parameters. De controle weigert iedere andere target dan
de vaste publieke stagingorigin en controleert bestemming, OTP-parameters,
cookieafwezigheid en privacyheaders. Op de oude live-release detecteert ze de
fout; negen synthetische succes-, afwijzings- en targetguardchecks slagen.

De structurele inventaris bevat nu 983 onderdelen. De confirmroute en de
workflow zijn inhoudelijk opnieuw beoordeeld als `corrected-and-rechecked`;
het nieuwe controlescript en zijn expliciete registratie in de structurele
inventaris zijn als `controlled` beoordeeld. De vier vingerafdrukken zijn
bijgewerkt na bronreview. Database- en runtimeconfiguratie zijn niet gewijzigd.

Deze lokale controle is geen bevestiging van de gecorrigeerde stagingdeploy.
De volledige CI en stagingworkflow moeten opnieuw slagen; de publieke
redirect wordt daarna opnieuw gecontroleerd. Hosted Auth-instellingen,
hookactivatie en echte branded OTP-bezorging blijven de afzonderlijke
operatoracceptatie uit `docs/deployment/mail-hooks.md`.
