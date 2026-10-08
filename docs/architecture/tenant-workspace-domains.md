# Eigen domeinen voor tenantwerkruimtes

Een tenant wordt uitsluitend uit de door de proxy gecontroleerde hostname
opgelost. Naast het vaste tenantadres kan platformbeheer één eigen actief adres
per tenant en omgeving koppelen. De vaste adressen blijven bereikbaar. De root
van het eigen werkruimtedomein verwijst naar `/app`; de marketingwebsite blijft
op het vaste tenantadres.

`tenant_workspace_domains` is bewust gescheiden van `tenant_domains`: dat laatste
register verifieert e-mailafzenders en verleent geen toegang tot een website.
Alleen platformbeheer mag een werkruimtedomein registreren, verifiëren, activeren
of verwijderen. De server controleert platformidentiteit opnieuw; service-only
RPC's controleren de actuele platformrol, actieve tenant en domeinbinding.
Authenticated/anon hebben geen tabel- of RPC-toegang. Alle wijzigingen zijn
auditbaar en een hostname kan nooit aan twee tenants worden toegewezen.

Een koppeling begint als `pending`. De DNS-controle vereist zowel de unieke
TXT-challenge op `_fieldgrid.<host>` als een CNAME naar het vaste tenantadres.
DNS wordt uitsluitend via recordlookup gecontroleerd: er wordt geen door de
gebruiker opgegeven URL opgehaald. Na verificatie wordt het domein `verified`.
De operator richt eerst Caddy/HTTPS en de Auth-redirectallowlist in, en activeert
daarna expliciet de koppeling in platformbeheer. Activering controleert DNS
opnieuw. Alleen `active` domeinen van de huidige deploymentomgeving en een
actieve tenant worden door de proxy geaccepteerd. Een lookupfout geeft 503; een
onbekend, inactief of pending domein geeft 404 zonder fallbacktenant.

De proxy overschrijft tenant-, hostsoort-, pad- en sessieheaders. Custom hosts
verlenen geen lidmaatschap, managementrecht of klantaccount. OTP, rollen,
klantbindingen en alle bestaande RLS-controles blijven onafhankelijk vereist.
Canonieke slugs worden nooit uit een clientheader of domeinfragment afgeleid.
Intrekken werkt op de eerstvolgende aanvraag; domeinbindingslookup gebruikt geen
applicatiecache. Links via `tenantWorkspaceUrl` kiezen alleen een actief domein
van de huidige omgeving, met het vaste adres als veilige fallback.

Staging en productie hebben onafhankelijke databases; dezelfde koppeling moet
in de bedoelde omgeving worden gemaakt. Er worden geen productiehosts op
staging toegestaan door wildcardregels of configuratie uit een andere omgeving.
