# Fieldgrid VPS- en domeinplan

Dit document beschrijft het beoogde domein-, DNS-, reverse-proxy-, TLS-, proces- en rollbackplan voor `fieldgrid.nl` op een VPS. Het plan gaat uit van één productie-VPS met een reverse proxy aan de voorkant en afzonderlijke applicatieprocessen op localhost-poorten.

## 1. DNS-records voor `fieldgrid.nl`

Configureer de zone `fieldgrid.nl` bij de DNS-provider met minimaal de onderstaande records.

| Naam | Type | Waarde | TTL | Doel |
| --- | --- | --- | --- | --- |
| `fieldgrid.nl` | `A` | `<PRODUCTIE_VPS_IPV4>` | 300 | Apexdomein naar productie-VPS. |
| `fieldgrid.nl` | `AAAA` | `<PRODUCTIE_VPS_IPV6>` | 300 | Optioneel, alleen als de VPS IPv6 gebruikt. |
| `www.fieldgrid.nl` | `CNAME` | `fieldgrid.nl` | 300 | Optionele redirect-host naar apex. |
| `app.fieldgrid.nl` | `A` of `CNAME` | `<PRODUCTIE_VPS_IPV4>` of `fieldgrid.nl` | 300 | Klant-PWA. |
| `platform.fieldgrid.nl` | `A` of `CNAME` | `<PRODUCTIE_VPS_IPV4>` of `fieldgrid.nl` | 300 | Platform-admin/backoffice. |
| `staging.fieldgrid.nl` | `A` of `CNAME` | `<STAGING_VPS_IPV4>` of `fieldgrid.nl` | 300 | Staging klantomgeving. |
| `platform-staging.fieldgrid.nl` | `A` of `CNAME` | `<STAGING_VPS_IPV4>` of `fieldgrid.nl` | 300 | Staging platform-admin. |

Aanbevelingen:

- Gebruik tijdens de migratie een lage TTL van `300` seconden, zodat wijzigingen snel kunnen worden teruggedraaid.
- Verhoog de TTL pas na een stabiele productieperiode, bijvoorbeeld naar `3600` of `14400` seconden.
- Laat `MX`, `SPF`, `DKIM` en `DMARC` records ongemoeid als e-mail door een externe mailprovider wordt afgehandeld.
- Gebruik `CNAME` voor subdomeinen wanneer de DNS-provider dit ondersteunt en beheer eenvoudiger moet blijven; gebruik `A`/`AAAA` records wanneer expliciete IP-routering nodig is.

## 2. Wildcard DNS voor `*.fieldgrid.nl`

Voor tenantdomeinen is een wildcardrecord nodig:

| Naam | Type | Waarde | TTL | Doel |
| --- | --- | --- | --- | --- |
| `*.fieldgrid.nl` | `A` | `<PRODUCTIE_VPS_IPV4>` | 300 | Alle tenant-subdomeinen naar productie-VPS. |
| `*.fieldgrid.nl` | `AAAA` | `<PRODUCTIE_VPS_IPV6>` | 300 | Optioneel, alleen als IPv6 actief is. |

Gedrag en aandachtspunten:

- Expliciete records winnen van de wildcard. `app.fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl` en `platform-staging.fieldgrid.nl` moeten daarom expliciet worden aangemaakt en in de reverse proxy apart worden gerouteerd.
- Tenant-subdomeinen volgen het patroon `{tenant}.fieldgrid.nl`, bijvoorbeeld `acme.fieldgrid.nl`.
- Reserveer systeemnamen zoals `app`, `platform`, `staging`, `platform-staging`, `www`, `api`, `admin`, `mail` en `support`, zodat tenants deze namen niet kunnen claimen.
- Valideer tenantnamen bij provisioning met een allowlist-regex, bijvoorbeeld `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`.

## 3. Reverse proxy routing

De reverse proxy luistert publiek op poort `80` en `443` en routeert intern naar applicatieprocessen op `127.0.0.1`. Gebruik bijvoorbeeld Caddy, Nginx of Traefik. Onderstaande routering is technologie-onafhankelijk.

| Host | Publieke route | Interne upstream | Applicatie | Opmerking |
| --- | --- | --- | --- | --- |
| `fieldgrid.nl` | `https://fieldgrid.nl` | `127.0.0.1:3100` | Backoffice/marketing entrypoint | Apexdomein; redirect `www` naar apex. |
| `app.fieldgrid.nl` | `https://app.fieldgrid.nl` | `127.0.0.1:3200` | Klant-PWA | Generieke klantapp zonder tenant-subdomein. |
| `platform.fieldgrid.nl` | `https://platform.fieldgrid.nl` | `127.0.0.1:3500` | Platform-admin | Alleen voor platformbeheerders. |
| `{tenant}.fieldgrid.nl` | `https://{tenant}.fieldgrid.nl` | `127.0.0.1:3300` | Personeel-PWA of tenantportaal | Tenant wordt afgeleid uit de `Host` header. |
| `api.fieldgrid.nl` | `https://api.fieldgrid.nl` | `127.0.0.1:3400` | API-server | Optioneel expliciet API-subdomein; anders alleen intern gebruiken. |

Routingregels:

1. Forceer HTTP naar HTTPS met permanente redirects zodra TLS live is.
2. Routeer expliciete hostnames vóór wildcardregels.
3. Stuur de originele headers door: `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For` en `X-Real-IP`.
4. Beperk `platform.fieldgrid.nl` waar mogelijk met extra beveiliging, zoals IP-allowlisting, SSO, MFA en strengere rate limits.
5. Laat onbekende of niet-geprovisioneerde tenant-hosts niet op een willekeurige tenant landen; geef een neutrale `404` of provisioningpagina terug.
6. Configureer health checks per upstream, bijvoorbeeld `/health` of `/api/health`.

Voorbeeldroutering in pseudoconfiguratie:

```text
fieldgrid.nl                 -> http://127.0.0.1:3100
www.fieldgrid.nl             -> 301 https://fieldgrid.nl$request_uri
app.fieldgrid.nl             -> http://127.0.0.1:3200
platform.fieldgrid.nl        -> http://127.0.0.1:3500
api.fieldgrid.nl             -> http://127.0.0.1:3400
*.fieldgrid.nl               -> http://127.0.0.1:3300
```

## 4. TLS-certificaatstrategie

Gebruik automatische TLS via ACME, bij voorkeur Let's Encrypt of ZeroSSL.

Strategie:

- Vraag losse certificaten aan voor expliciete hosts: `fieldgrid.nl`, `www.fieldgrid.nl`, `app.fieldgrid.nl`, `platform.fieldgrid.nl`, `staging.fieldgrid.nl` en `platform-staging.fieldgrid.nl`.
- Vraag één wildcardcertificaat aan voor `*.fieldgrid.nl` voor tenant-subdomeinen.
- Gebruik DNS-01 validatie voor het wildcardcertificaat, omdat HTTP-01 geen wildcardcertificaten ondersteunt.
- Gebruik HTTP-01 of TLS-ALPN-01 voor losse hostcertificaten als poort `80` en `443` direct op de VPS beschikbaar zijn.
- Automatiseer vernieuwing en monitor certificaatverval, bijvoorbeeld met een dagelijkse timer en alerting bij minder dan 14 dagen resterende geldigheid.
- Bewaar ACME-accountgegevens en DNS API-credentials buiten de repository, bijvoorbeeld in environment files met beperkte bestandsrechten of in een secrets manager.

Aanbevolen certificaatset:

| Certificaat | Namen | Validatie | Gebruik |
| --- | --- | --- | --- |
| Apex/app/platform | `fieldgrid.nl`, `www.fieldgrid.nl`, `app.fieldgrid.nl`, `platform.fieldgrid.nl` | HTTP-01 of DNS-01 | Productie vaste hosts. |
| Wildcard tenants | `*.fieldgrid.nl` | DNS-01 | Productie tenant-subdomeinen. |
| Staging | `staging.fieldgrid.nl`, `platform-staging.fieldgrid.nl` | HTTP-01 of DNS-01 | Staging hosts. |

## 5. Stagingdomeinen

Staging krijgt eigen hostnames en bij voorkeur eigen processen, databaseschema's of databases, object storage buckets en secrets.

| Host | Interne upstream | Doel |
| --- | --- | --- |
| `staging.fieldgrid.nl` | `127.0.0.1:4200` | Stagingversie van klant-PWA en tenantflows. |
| `platform-staging.fieldgrid.nl` | `127.0.0.1:4500` | Stagingversie van platform-admin/backoffice. |
| `api-staging.fieldgrid.nl` | `127.0.0.1:4400` | Optioneel staging API-subdomein. |

Stagingrichtlijnen:

- Gebruik afzonderlijke environmentvariabelen en secrets voor staging.
- Voorkom productie-e-mail, productiebetalingen en productie-webhooks vanuit staging.
- Bescherm staging met basic auth, SSO of IP-allowlisting als er klantdata of realistische testdata zichtbaar is.
- Voeg duidelijke visuele staging-indicatoren toe in de UI.
- Laat staging niet meeliften op wildcard tenantrouting, tenzij er bewust een aparte wildcard zoals `*.staging.fieldgrid.nl` wordt ingericht.

## 6. Poorten en processen

Alle applicatieprocessen luisteren alleen op `127.0.0.1` en worden publiek ontsloten via de reverse proxy.

| Component | Procesnaam/systemd unit | Bind address | Poort | Publieke host |
| --- | --- | --- | --- | --- |
| Backoffice | `fieldgrid-backoffice.service` | `127.0.0.1` | `3100` | `fieldgrid.nl` |
| Klant-PWA | `fieldgrid-customer-pwa.service` | `127.0.0.1` | `3200` | `app.fieldgrid.nl` |
| Personeel-PWA | `fieldgrid-staff-pwa.service` | `127.0.0.1` | `3300` | `{tenant}.fieldgrid.nl` |
| API-server | `fieldgrid-api.service` | `127.0.0.1` | `3400` | `api.fieldgrid.nl` of intern via proxyregels |
| Platform-admin | `fieldgrid-platform-admin.service` | `127.0.0.1` | `3500` | `platform.fieldgrid.nl` |
| Staging klant-PWA | `fieldgrid-customer-pwa-staging.service` | `127.0.0.1` | `4200` | `staging.fieldgrid.nl` |
| Staging API-server | `fieldgrid-api-staging.service` | `127.0.0.1` | `4400` | `api-staging.fieldgrid.nl` |
| Staging platform-admin | `fieldgrid-platform-admin-staging.service` | `127.0.0.1` | `4500` | `platform-staging.fieldgrid.nl` |

Procesrichtlijnen:

- Beheer processen met systemd of een vergelijkbare supervisor.
- Gebruik `Restart=always` of `Restart=on-failure`, log naar journald en configureer resource-limieten.
- Zorg dat poorten niet publiek openstaan in de firewall; publiek zijn alleen `22`, `80` en `443` nodig.
- Leg per service environmentbestanden vast buiten Git, bijvoorbeeld `/etc/fieldgrid/<service>.env` met rechten `0600`.
- Voeg per service een health endpoint toe voor deploychecks en monitoring.

## 7. Rollbackstrategie

Rollback moet mogelijk zijn zonder DNS-wijzigingen, omdat DNS-propagatie onzeker is. De voorkeursrollback is daarom op applicatie- en reverse-proxyniveau.

Standaard rollbackprocedure:

1. Houd per service de laatst werkende release beschikbaar, bijvoorbeeld via release directories zoals `/opt/fieldgrid/releases/<timestamp>` en een symlink `/opt/fieldgrid/current`.
2. Deploy een nieuwe release naar een nieuwe directory en wijzig pas na succesvolle smoke tests de `current` symlink.
3. Herstart alleen de betrokken systemd units.
4. Voer smoke tests uit op `fieldgrid.nl`, `app.fieldgrid.nl`, `platform.fieldgrid.nl` en een representatief tenant-subdomein.
5. Bij fouten: zet de `current` symlink terug naar de vorige release en herstart de betrokken services.
6. Als de proxyconfig de oorzaak is: herstel de vorige reverse-proxyconfig en reload de proxy.
7. Als TLS-vernieuwing de oorzaak is: herstel de vorige certificaatconfiguratie of schakel tijdelijk terug naar alleen expliciete hostcertificaten.

Database rollback:

- Vermijd destructieve migraties zonder expand-and-contract-aanpak.
- Maak migraties waar mogelijk backward compatible, zodat oude applicatiecode tijdelijk met het nieuwe schema kan werken.
- Voor destructieve wijzigingen moet vooraf een expliciet herstelplan bestaan, inclusief restoretijd, dataverliesvenster en communicatie naar gebruikers.
- Gebruik point-in-time recovery als de databaseprovider dit ondersteunt.

DNS rollback:

- Houd TTL tijdelijk laag vóór en tijdens migraties.
- Laat oude infrastructuur minimaal één TTL-periode plus veiligheidsmarge beschikbaar nadat DNS is omgezet.
- Gebruik DNS-rollback alleen als applicatie/proxyrollback onvoldoende is, omdat clients en resolvers oude records kunnen cachen.

## 8. Database backupmomenten vóór migraties

Maak altijd een databasebackup vóór migraties die schema, permissies, tenantdata of kritieke configuratie raken.

Minimale backupmomenten:

| Moment | Backup | Doel |
| --- | --- | --- |
| 24 uur vóór migratie | Volledige databasebackup | Controle dat backups werken en restorebaar zijn. |
| 1 uur vóór migratie | Nieuwe volledige backup of snapshot | Recente fallback vóór freeze. |
| Direct vóór migratie | Laatste snapshot of dump na write freeze | Minimaal dataverliesvenster. |
| Direct na migratie | Post-migratie backup | Nieuw goed startpunt na succesvolle migratie. |

Procedure vóór migratie:

1. Kondig een write freeze of onderhoudsvenster aan als de migratie niet volledig online kan plaatsvinden.
2. Controleer dat de laatste geplande backup succesvol is afgerond.
3. Maak een handmatige pre-migration backup met een herkenbare naam, bijvoorbeeld `pre-domain-migration-YYYYMMDD-HHMM`.
4. Valideer de backup met een restoretest naar een tijdelijke database of stagingomgeving.
5. Noteer backup-ID, tijdstip, databaseversie, applicatierelease en migratieversie in het deploylog.
6. Start de migratie pas na expliciete bevestiging dat de backup restorebaar is.

Voorbeeldchecklist:

```text
[ ] Laatste automatische backup succesvol
[ ] Handmatige pre-migration backup gemaakt
[ ] Restoretest uitgevoerd
[ ] Backup-ID vastgelegd in deploylog
[ ] Rollbackrelease beschikbaar
[ ] Onderhoudsvenster of write freeze actief indien nodig
[ ] Migratiecommando en verwachte duur bevestigd
```
