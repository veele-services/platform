# Fieldgrid cross-tenant testmatrix

Deze matrix documenteert de testdata en verwachte autorisatie-uitkomsten voor de cross-tenant permissietests.

## Testidentiteiten

| Sleutel | Omschrijving |
| --- | --- |
| `user-x` | Backoffice/API-gebruiker die aan twee tenants gekoppeld is. |
| `tenant-a` | Tenant waarin `user-x` managementrechten heeft. |
| `tenant-b` | Tenant waarin `user-x` alleen-lezen rechten heeft. |

## Tenantrollen

| User | Tenant | Rol | Status | Verwachte permissies |
| --- | --- | --- | --- | --- |
| `user-x` | `tenant-a` | Management | active | Lezen, schrijven, verwijderen en beheeracties op de geteste backoffice resources. |
| `user-x` | `tenant-b` | Alleen-lezen | active | Alleen `read` op de geteste backoffice resources; geen `write`, `delete` of beheeracties. |

## Scenario's

| # | Scenario | Resource/action | Tenant | Verwachting |
| --- | --- | --- | --- | --- |
| 1 | User X heeft Management in tenant A | `customers:write` | `tenant-a` | Toegestaan. |
| 2 | User X heeft Alleen-lezen in tenant B | `customers:read` | `tenant-b` | Toegestaan. |
| 3 | In tenant A mag user X schrijven | `customers:write` | `tenant-a` | Toegestaan. |
| 4 | In tenant B mag user X niet schrijven | `customers:write` | `tenant-b` | Geweigerd. |
| 5 | API-permissies respecteren tenant | `customers:write` | `tenant-a` / `tenant-b` | `tenant-a` geeft HTTP 200, `tenant-b` geeft HTTP 403. |
| 6 | Backoffice server actions respecteren tenant | `customers:write` | `tenant-a` / `tenant-b` | `tenant-a` slaagt, `tenant-b` gooit `Forbidden`. |
| 7 | Tenant switcher verandert permissions correct | `customers:write`, `customers:read` | switch van `tenant-a` naar `tenant-b` | Schrijfrecht verdwijnt na switch naar `tenant-b`; leesrecht blijft aanwezig. |

## Belangrijke invariant

Permissies worden altijd bepaald uit de combinatie van `userId` én actieve `tenantId`. Een rol of permission uit een andere tenant mag nooit doorsijpelen naar de actieve tenantcontext.
