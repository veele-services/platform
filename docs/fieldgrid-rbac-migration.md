# FieldGrid RBAC migratie naar tenantrollen

Deze migratie introduceert tenant-scoped RBAC naast de bestaande globale RBAC-tabellen. Het doel is om de huidige rollen uit `roles` als templates te blijven gebruiken, maar daadwerkelijke tenanttoewijzingen vast te leggen in `tenant_roles` en `tenant_user_roles`.

## Scope

De migratie `lib/db/migrations/055_tenant_rbac_backfill.sql`:

1. Maakt tenant-RBAC-tabellen aan:
   - `tenant_roles`
   - `tenant_role_permissions`
   - `tenant_user_roles`
2. Zorgt dat de bestaande Veele/default tenant aanwezig is met id `00000000-0000-0000-0000-000000000010`.
3. Maakt voor iedere bestaande globale rol uit `roles` een gelijknamige tenantrol aan voor de default tenant.
4. Maakt de aanbevolen startset rollen aan:
   - Eigenaar
   - Management
   - Administratie
   - Planning
   - Teamlead
   - Medewerker
   - Alleen-lezen
   - Klantgebruiker
   - Personeelsgebruiker
5. Kopieert permissies vanuit `role_permissions` naar `tenant_role_permissions` via de gekoppelde template rol.
6. Zet bestaande `user_roles`-koppelingen om naar `tenant_user_roles` voor de default tenant.
7. Zorgt dat gebruikers uit `user_roles` ook een record in `tenant_users` hebben.

## Rol-template mapping

| Nieuwe tenantrol | Template uit `roles` | Opmerking |
| --- | --- | --- |
| Eigenaar | Management | Volledige tenantbeheerdersrol. |
| Management | Management | Behoudt bestaande managementrechten. |
| Administratie | Administration | Nederlandse naam voor administratieve backoffice-rol. |
| Planning | Planning | Behoudt bestaande planningsrechten. |
| Teamlead | Teamlead | Behoudt bestaande teamleadrechten. |
| Medewerker | Employee | Nederlandse naam voor operationele medewerker. |
| Alleen-lezen | Support | Read-only/support startpunt. |
| Klantgebruiker | Customer | Klantportalrechten. |
| Personeelsgebruiker | Flex Employee | Personeels-/veldportal startpunt. |

Daarnaast krijgt iedere bestaande rol uit `roles` een gelijknamige tenantrol. Daardoor blijven bestaande `user_roles` zonder naamvertaling migreerbaar naar de juiste tenantrol.

## Uitrolstappen

1. **Backup maken**
   - Maak een databasebackup of snapshot van de omgeving.
   - Noteer het aantal records in `roles`, `role_permissions`, `user_roles` en `tenant_users`.

2. **RBAC seed actualiseren**
   - Draai de bestaande RBAC seed als de omgeving mogelijk permissies mist:
     ```bash
     pnpm --filter @workspace/db run seed:rbac
     ```

3. **Migratie uitvoeren**
   - Pas de migratie toe via het bestaande database-migratieproces.
   - De SQL is idempotent: tabellen worden met `IF NOT EXISTS` aangemaakt en inserts gebruiken `ON CONFLICT`.

4. **Validatiequeries uitvoeren**
   ```sql
   select count(*) from tenant_roles where tenant_id = '00000000-0000-0000-0000-000000000010';
   select count(*) from tenant_role_permissions trp join tenant_roles tr on tr.id = trp.tenant_role_id where tr.tenant_id = '00000000-0000-0000-0000-000000000010';
   select count(*) from tenant_user_roles where tenant_id = '00000000-0000-0000-0000-000000000010';
   ```

5. **Applicatie omschakelen**
   - Leesrollen kunnen stapsgewijs naar `tenant_user_roles` worden omgezet.
   - Permission lookups kunnen `tenant_role_permissions` gebruiken met tenantcontext.
   - Laat `roles` en `role_permissions` voorlopig bestaan als template/catalogus en rollback-anker.

6. **Nazorg**
   - Controleer of iedere actieve gebruiker met legacy `user_roles` ook een tenantrol heeft.
   - Controleer of tenantbeheerders de rol `Eigenaar` of `Management` krijgen waar dat functioneel gewenst is.
   - Plan daarna pas het uitfaseren van directe writes naar `user_roles`.

## Rollback

De migratie verwijdert geen bestaande globale RBAC-data. Bij problemen kan de applicatie terugvallen op `roles`, `role_permissions` en `user_roles`. De nieuwe tabellen kunnen blijven staan voor analyse, of in een gecontroleerde rollback worden geleegd/verwijderd als ze nog niet door applicatiecode worden gebruikt.
