import { describe, expect, it } from "vitest";
import { hasForbiddenMailProvider } from "./mail-provider-contract";

// Assemble the forbidden examples as test data, rather than SDK integrations.
const sdk = ["re", "send"].join("");
describe("mail provider contract", () => {
  it.each([
    `command: '${sdk}'`,
    `input.command === '${sdk}'`,
    "import { sendMail } from './sendgrid'",
    "const result = await repeatInvitation()",
  ])("allows invitation operations: %s", (source) => {
    expect(hasForbiddenMailProvider("app/actions.ts", source)).toBe(false);
  });
  it.each([
    `import { Client } from '${sdk}'`,
    `export { Client } from '${sdk}/client'`,
    `import '${sdk}'`,
    `import'${sdk}'`,
    `import { Client } from'${sdk}'`,
    `await import(\n '${sdk}'\n)`,
    `require('${sdk}')`,
    `import Client from '@${sdk}/node'`,
    `new ${sdk[0].toUpperCase() + sdk.slice(1)}('key')`,
    `process.env.${sdk.toUpperCase()}_API_KEY`,
    `fetch('https://api.${sdk}.com/emails')`,
  ])("rejects provider code/configuration: %s", (source) => {
    expect(hasForbiddenMailProvider("lib/mail.ts", source)).toBe(true);
  });
  it.each(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])("rejects the SDK in %s", (section) => {
    expect(hasForbiddenMailProvider("package.json", JSON.stringify({ [section]: { [sdk]: "1.0.0" } }))).toBe(true);
    expect(hasForbiddenMailProvider("package.json", JSON.stringify({ [section]: { mail: `npm:${sdk}@1.0.0` } }))).toBe(true);
  });
  it("rejects SDK lockfile entries and allows ordinary dependency keys", () => {
    for (const source of [`  ${sdk}:\n    specifier: 1`, `  '${sdk}@1.0.0': {}`, `  '@${sdk}/node@1.0.0': {}`, `  version: npm:${sdk}@1`]) {
      expect(hasForbiddenMailProvider("pnpm-lock.yaml", source)).toBe(true);
    }
    expect(hasForbiddenMailProvider("pnpm-lock.yaml", "  sendgrid: {}\n  invitation-repeat: {}\n")).toBe(false);
  });
  it("fails closed on malformed dependency manifests", () => {
    expect(() => hasForbiddenMailProvider("package.json", "{")).toThrow();
  });
});
