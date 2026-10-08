import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hasForbiddenMailProvider } from "../lib/operations/mail-provider-contract";

// A Git/read/parse error must fail CI; only a complete clean scan can succeed.
const paths = execFileSync("git", ["ls-files", "-z", "--", "app", "components", "lib", "public", "scripts", "package.json", "pnpm-lock.yaml"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
const violations = paths.filter((path) => hasForbiddenMailProvider(path, readFileSync(path, "utf8")));
if (violations.length) {
  console.error("Forbidden mail provider integration:", violations.join(", "));
  process.exitCode = 1;
} else {
  console.log("Mail provider contract verified; invitation command names remain allowed.");
}
