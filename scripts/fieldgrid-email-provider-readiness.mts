import { getPlatformEmailProviderSettings } from "@workspace/db/email-service";

async function main(): Promise<void> {
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
