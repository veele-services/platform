/**
 * Minimal configuration consumed by the isolated staging migration client.
 *
 * Do not copy the developer config into the release workdir: database push
 * needs only the migration switch, while unrelated local services and future
 * config keys widen the compatibility and secret-resolution surface. In
 * particular, this contract intentionally has no [db.vault] section.
 */
export const STAGING_MIGRATION_CONFIG = `project_id = "fieldgrid-staging-migrations"

[db.migrations]
enabled = true
schema_paths = []

[db.seed]
enabled = false
sql_paths = []
`;
