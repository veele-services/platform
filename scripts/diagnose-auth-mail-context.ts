import { diagnoseAuthMailContext } from "../lib/operations/auth-mail-context-diagnostic";

diagnoseAuthMailContext(process.env, { fetch, log: line => console.log(line) })
  .then(ok => { if (!ok) process.exitCode = 1; })
  .catch(() => {
    console.error("Auth-mailcontextdiagnose mislukt; ruwe gegevens worden niet gelogd.");
    process.exitCode = 1;
  });
