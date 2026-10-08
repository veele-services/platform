# Tenantadres app.veeleservices.nl

De applicatie ondersteunt een eigen werkruimtedomein. DNS-, Caddy- en Supabase
Auth-configuratie blijven operatorhandelingen. De onderstaande koppeling
verandert geen tenantdata of bestaande gebruikersrechten.

1. Open op **productie** Platform → Tenants → Veele Services → Domein.
   Registreer `app.veeleservices.nl`.
2. Voeg de daar getoonde TXT-challenge toe en de CNAME:
   `app.veeleservices.nl` → `veele-services.fieldgrid.nl`.
   Gebruik DNS-only bij de CNAME tijdens verificatie; een DNS-proxy verbergt de
   CNAME voor de expliciete eigendomscontrole.
3. Voeg na een backup van de actieve Caddyconfiguratie een expliciete host toe.
   Gebruik de bestaande V1 TLS-snippet; de wildcard voor fieldgrid.nl dekt dit
   certificaat niet. De geïnstalleerde DNS-provider moet toegang hebben tot de
   zone veeleservices.nl. Bewaar tokens uitsluitend in de bestaande beveiligde
   Caddy-environmentconfiguratie, nooit in dit bestand of Git.

   ```caddyfile
   app.veeleservices.nl {
       import fieldgrid_tls
       encode zstd gzip
       reverse_proxy 127.0.0.1:3302
   }
   ```

   Valideer met `sudo caddy validate --config /etc/caddy/Caddyfile`, herlaad met
   `sudo systemctl reload caddy` en controleer `sudo systemctl is-active caddy`.
   Staging blijft op 3301. Gebruik voor een stagingtest een afzonderlijk
   stagingdomein en koppeling; proxy nooit deze productiehost naar staging.
4. Voeg in het **productie-Supabaseproject** bij Authentication → URL
   Configuration de exacte redirect toe:
   `https://app.veeleservices.nl/auth/verify`. Het vaste tenantadres blijft
   eveneens in de allowlist. E-mailafzenderverificatie is een aparte instelling.
5. Klik DNS controleren en daarna Activeren na Caddy-inrichting. Controleer
   HTTPS, `/login`, `/app`, `/staff`, `/klant` en `/api/healthz`. Vergelijk de
   release-SHA en `environment=production` met het vaste productieadres. Test
   OTP met een reeds geautoriseerd account; een domeinkoppeling maakt geen
   gebruiker of klantbinding aan.
6. Bij een verkeerde hostconfiguratie: verwijder de koppeling via platformbeheer
   en gebruik het vaste tenantadres. Verwijder daarna de Caddy-host en DNS-records
   als operator. Dit is geen code- of databaserollback.

De publieke Veele-site blijft op het vaste tenantadres. De root van het eigen
werkruimtedomein verwijst naar `/app`; `/app`, `/staff` en `/klant` blijven
de werkruimtes op zowel het vaste als het gekoppelde adres.
