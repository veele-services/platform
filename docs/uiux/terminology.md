# Fieldgrid-terminologie

Deze woorden zijn leidend voor zichtbare producttekst. Technische namen blijven
alleen staan in code, auditdetails, exports of foutdiagnostiek waar vertalen de
betekenis minder precies maakt.

| Gebruik in de interface | Niet gebruiken als productterm | Betekenis |
| --- | --- | --- |
| Organisatie | tenant | klantorganisatie met een eigen afgeschermde omgeving |
| Opdracht | assignment, job | het administratieve en planbare werkdossier |
| Werkbon | assignment | de uitvoeringsweergave voor personeel en klant |
| Personeelslid | employee, staff | persoon die werk uitvoert |
| Klant | customer | opdrachtgever of klantorganisatie binnen een organisatie |
| Object | locatie, site | fysieke werklocatie of beheerd object |
| Eigenaar | owner | verantwoordelijke gebruiker of rol |
| Supporttoegang | grant | tijdelijke, gecontroleerde toegang door Fieldgrid-support |
| Verlenen | grant | supporttoegang activeren |
| Intrekken | revoke | supporttoegang beëindigen |
| Gereedheid | readiness | mate waarin een configuratie of release bruikbaar is |
| Opnieuw proberen | retry | een mislukte stap nogmaals uitvoeren |
| Controle | smoke | korte technische of functionele verificatie |
| Planning | schedule | planbord, agenda en geplande inzet samen |
| Beschikbaarheid | availability | periode waarin een personeelslid inzetbaar is |
| Bezetting | staffing | toegewezen personeelsleden en open plaatsen |

## Opdracht en werkbon

Gebruik **Opdracht** in backoffice, planning, offertes, facturen en het volledige
dossier. Gebruik **Werkbon** in de personeels- en klantcontext wanneer het om
uitvoering, rapportage, uren, bewijs en ondertekening gaat. Verander database- of
API-namen niet alleen om deze zichtbare terminologie af te dwingen.

## Statussen

| Technische waarde | Zichtbare Nederlandse tekst |
| --- | --- |
| `draft` | Concept |
| `open` | Open |
| `pending` | In afwachting |
| `accepted` | Geaccepteerd |
| `rejected` | Afgewezen |
| `planned`, `scheduled` | Ingepland |
| `assigned` | Toegewezen |
| `en_route` | Onderweg |
| `in_progress` | Bezig |
| `paused` | Gepauzeerd |
| `completed` | Afgerond |
| `cancelled` | Geannuleerd |
| `active` | Actief |
| `inactive` | Inactief |
| `blocked` | Geblokkeerd |
| `failed` | Mislukt |
| `ready` | Gereed |
| `provisioning` | Wordt ingericht |
| `past_due` | Betaling achterstallig |
| `trialing` | Proefperiode |

Een status wordt nooit alleen met kleur weergegeven. Toon altijd tekst en waar
nuttig een pictogram of korte uitleg.

## Schrijfstijl

- Schrijf direct en rustig: “Wijzigingen opslaan”, niet “Submit”.
- Benoem het gevolg van risicovolle acties: “Supporttoegang intrekken”.
- Gebruik zinnen in sentence case; vermijd hoofdletters als visueel hulpmiddel.
- Toon technische identificatoren pas in een detail- of auditcontext.
- Gebruik geen implementatiewoorden zoals API, worker, payload of retry in
  gewone productmeldingen.
- Foutmeldingen vertellen wat misging en welke veilige vervolgstap mogelijk is,
  zonder secrets, persoonsgegevens of interne infrastructuur te tonen.
