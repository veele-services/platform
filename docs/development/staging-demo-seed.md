# Staging Demo Seed

Het Den Haag demo-seedscript vult alleen de staging database met testdata voor de volledige operationele keten:

- klanten, klantcontacten en interne klantnotities;
- objecten, objectcontacten en gekoppelde medewerkers;
- personeel met rollen, regio's, certificaten, kennis, beschikbaarheid en verlof;
- werkbonnen in meerdere lifecycle-statussen;
- planbordscenario's met open werkbonnen, ingeplande werkbonnen, conflicten en teamplanning;
- offertes, rapporten, meerwerk, foto's, facturen, payments, documenten en auditlogregels.

## Veiligheid

Het script draait alleen wanneer alle voorwaarden kloppen:

- `APP_ENV=staging`
- `STAGING_SEED_CONFIRM=seed-den-haag`
- `DATABASE_URL` is aanwezig en lijkt niet production-gerelateerd

De dataset wordt gemarkeerd met `VEELE_STAGING_DEMO_DEN_HAAG`. Bij opnieuw draaien verwijdert het script alleen eerder gemaakte demo-rijen met die marker of met het domein `staging.veele.test`.

## GitHub Actions

Gebruik de workflow `Seed Staging Demo Data`.

Run workflow:

- branch: `staging`
- confirm: `seed-den-haag`
- dry_run: eerst `true`, daarna `false` als de dry-run groen is

## Niet Naar Productie

Deze seed is staging-only. De production promotion guard blokkeert pull requests naar `production` wanneer de staging seed workflow of het seedscript zelf in de diff zit.

Voor een production release moet staging dus eerst een cleanup commit krijgen die deze staging-only bestanden verwijdert, of de production PR moet op een releasebranch worden voorbereid zonder deze bestanden.
