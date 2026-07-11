# Google Maps Platform Configuratie

Dit document hoort bij de centrale Fieldgrid Google Maps-module. De live dagkaart gebruikt de centrale Google Maps Platform-laag; legacy kaart- en routeproviders zijn vervangen of alleen nog als expliciete testfallback aanwezig.

## Variabelen

Verplicht zodra Google Maps in een omgeving actief is:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY=""
GOOGLE_MAPS_SERVER_API_KEY=""
GOOGLE_MAPS_MAP_ID=""
```

Standaardconfiguratie:

```env
GOOGLE_MAPS_ENABLED="true"
GOOGLE_MAPS_DEFAULT_COUNTRY="NL"
GOOGLE_MAPS_DEFAULT_LANGUAGE="nl"
GOOGLE_MAPS_DEFAULT_REGION="NL"
GOOGLE_PLACES_AUTOCOMPLETE_ENABLED="true"
GOOGLE_ROUTES_ENABLED="true"
GOOGLE_ROUTES_TRAFFIC_ENABLED="true"
```

Testfallback:

```env
FIELDGRID_ROUTE_PROVIDER="mock"
```

`FIELDGRID_ROUTE_PROVIDER=mock` is alleen bedoeld voor CI/lokaal zonder live Google-calls. Productie gebruikt `GOOGLE_MAPS_SERVER_API_KEY`; de oude routespecifieke keynaam wordt niet meer gelezen.

## Key-scheiding

- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` is alleen voor Maps JavaScript API.
- `GOOGLE_MAPS_SERVER_API_KEY` is alleen server-side voor Places API (New) en Routes API.
- Maak nooit een `NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY`.
- Gebruik nooit dezelfde key voor browser en server.
- Log geen key en stuur geen serverkey naar props, HTML, hydrationdata of publieke API-responses.

## Google Cloud APIs

Schakel alleen deze APIs in:

- Maps JavaScript API;
- Places API (New);
- Routes API.

Niet gebruiken in de nieuwe implementatie:

- Directions API Legacy;
- Distance Matrix API Legacy;
- Places API Legacy;
- route matrices;
- route optimization;
- fleet routing.

## Development

Voor lokaal ontwikkelen:

1. Zet `GOOGLE_MAPS_ENABLED=false` als je geen Google Cloud project gebruikt.
2. Zet bij live testen een browserkey met HTTP-referrer restrictie voor `localhost`.
3. Zet een serverkey alleen in lokale `.env`; commit deze nooit.
4. Gebruik mocktests standaard; live calls alleen via expliciete smoke tests.

Minimale lokale config zonder live Google:

```env
GOOGLE_MAPS_ENABLED="false"
GOOGLE_PLACES_AUTOCOMPLETE_ENABLED="false"
GOOGLE_ROUTES_ENABLED="false"
```

## Staging

GitHub Environment `staging` moet bevatten:

- secret: `GOOGLE_MAPS_SERVER_API_KEY`;
- variable or secret: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`;
- variable: `GOOGLE_MAPS_MAP_ID`;
- variables voor defaults zoals hierboven.

Keyrestricties:

- browserkey: HTTP-referrers voor `https://admin.fieldgrid.nl/*`, `https://staging.fieldgrid.nl/*` en tenant staging hosts;
- serverkey: server/VPS IP restrictie indien beschikbaar, plus API restrictie op Places API (New) en Routes API.

Gebruik staging voor beperkte live-smoke tests met lage quota.

## Production

GitHub Environment `production` moet bevatten:

- secret: `GOOGLE_MAPS_SERVER_API_KEY`;
- variable or secret: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`;
- variable: `GOOGLE_MAPS_MAP_ID`.

Keyrestricties:

- browserkey: production hosts en tenant/custom domains;
- serverkey: production server IP restrictie indien beschikbaar;
- API restrictie exact op Places API (New) en Routes API;
- quota en budgetalerts per Google Cloud project.

## Rollback

Bij incidenten:

```env
GOOGLE_MAPS_ENABLED="false"
GOOGLE_PLACES_AUTOCOMPLETE_ENABLED="false"
GOOGLE_ROUTES_ENABLED="false"
```

De app moet dan handmatige adresinvoer, tekstuele locatiegegevens en opdracht/objectlinks blijven tonen.
