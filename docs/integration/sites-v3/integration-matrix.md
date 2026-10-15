# Sites v3 integratieregister

Baseline: `71df59ab0390ffeae482c7edbaf27efe3fa6546d`. De actuele lokale en remote main komen hiermee overeen; de werkboom was schoon. Ontwikkelbranch: `codex/sites-v3-integration`. Alle 344 SHA256-checksums zijn gecontroleerd zonder afwijking. De uitgepakte referentie blijft ongewijzigd buiten de runtime. `screen-register.json` omvat iedere acceptatie-ID uit docs/09; pending betekent niet geleverd.

| Onderdeel | Hergebruik | Uitbreiden | Nieuw | Rechten/data | Bewijs |
| --- | --- | --- | --- | --- | --- |
| Marketinghost | APP_URL, CSP, fail-closed hostname | proxy dispatch vóór login, architecture/runbooks | interne `/fieldgrid-site` route | alleen www; geen tenant | hostmatrix + browser |
| Signature Grid | Next/React/Lucide | gerichte CSS-isolatie, productiecopy/SEO | broncomponenten, 23 routes, alle assets | publiek; geen bedrijfsdata in demo | routecrawl + visuele vergelijking |
| CRM UI | platform shell en actuele authcontext | navigatie, acht acties, brongetrouwe console | pipeline/dossier/agenda/taken | uitsluitend actuele platformbeheerder | HTTP/RPC + e2e |
| CRM opslag | private schema, gecontroleerde RPC, audit | bestaande migratieketen en typen | leads/snapshots/taken/agenda/idempotentie | geen tenantvermenging; transacties | replay/upgrade/RLS/races |
| Platformmail | globale SendGrid, policy, transport, outbox/worker | tenantloze CRM bronadapter | CRM catalogus/context | geregistreerde primaire admin | worker + policy/uncertain tests |
| Platformbeheer | provisioning, modules, domeinen, supportteam, tickets, kennisbank | presentatie volgens bron | alleen ontbrekende acties | bestaande rechten blijven | bestaande + nieuwe browserflows |
| Tenantmanagement | dossiers, werkbonnen, planbord, rollen, facturen | brongetrouwe shells/aggregaties/opvolging | ontbrekende managementdomeinen | bronrechten en versiecontrole | domeintests + portalregressie |
| Personeel/klant | eigen bindingen, downloads, PWA, tickets | bronpresentatie en navigatie | alleen ontbrekende werkelijke functies | eigen toegewezen resources | e2e + mobiel/tablet/desktop |

## Releasegrens

Gebouwd, getest, gedeployed en live functioneel geverifieerd worden afzonderlijk bijgehouden. Geen DNS-, Caddy-, runtime- of productiepromotie op basis van dit register. Stagingmarketing wordt expliciet `www.staging.fieldgrid.nl`; bestaande platformorigin en tenantorigin blijven gelijk. Externe DNS/TLS en live mailbezorging zijn afzonderlijke operator-/acceptatiefeiten.

## Integratieafwijkingen

Noodzakelijke integratieverschillen worden per fase afzonderlijk gemotiveerd en met bekeken beelden vastgelegd. De Sites-bron blijft leidend; dit is geen algemene uitzondering voor een redesign. Interne assetnamen/paden en importpaden mogen wijzigen om bestaande assets en hostgrenzen te behouden. Demohelpers, lokale bedrijfsdata en ownerheader-fallback worden niet in productie opgenomen.
