const MIGRATION_DATABASE_FLAG = "--migration-database";

function usesMigrationDatabase(): boolean {
  return process.argv.includes(MIGRATION_DATABASE_FLAG);
}

async function main(): Promise<void> {
  if (usesMigrationDatabase()) {
    if (!process.env.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
      throw new Error(
        "FIELDGRID_MIGRATION_DATABASE_URL is required for migration-database readiness.",
      );
    }
    // The workflow keeps DATABASE_URL bound to the runtime principal. Set the
    // connection purpose before importing the DB service so this explicit
    // server-only check selects the migration-admin URL instead.
    process.env.FIELDGRID_DATABASE_CONNECTION_PURPOSE = "migration";
  }

  const { getPlatformEmailProviderSettings } = await import(
    "../lib/db/src/email-service.ts"
  );
  const providers = await getPlatformEmailProviderSettings();
  const activePlatformProvider = providers.find(
    (provider) =>
      provider.isActive &&
      provider.configured &&
      provider.lastTestStatus === "success",
  );
  if (!activePlatformProvider) {
    throw new Error(
      "Staging e-mailprovider is niet verzendklaar: configureer en test een actieve platformprovider in Platformbeheer.",
    );
  }

  console.log(
    JSON.stringify({
      status: "ready",
      providerType: activePlatformProvider.providerType,
      source: "platform_email_providers",
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Staging e-mailprovidercontrole mislukt.",
  );
  process.exitCode = 1;
});
